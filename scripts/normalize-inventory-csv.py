#!/usr/bin/env python3
"""Normalize external product CSV files to Clienta AI inventory import format.

Usage:
  python scripts/normalize-inventory-csv.py --input products.csv --output normalized.csv

Notes:
- Uses only stdlib (csv), so ask businesses to export Excel sheets as CSV first.
- Output header always matches backend inventory template exactly:
  name,category,tags,quantity,unit_cost,reorder_threshold,unit,sku,image_url,notes
"""

from __future__ import annotations

import argparse
import csv
import re
import sys
import unicodedata
from pathlib import Path

OUTPUT_COLUMNS = [
    "name",
    "category",
    "tags",
    "quantity",
    "unit_cost",
    "reorder_threshold",
    "unit",
    "sku",
    "image_url",
    "notes",
]

# Candidate source headers for each output field.
HEADER_ALIASES: dict[str, list[str]] = {
    "name": ["name", "product", "product name", "item", "item name", "descripcion", "description", "nombre"],
    "category": ["category", "categoria", "department", "dept", "group", "type", "tipo"],
    "tags": ["tags", "keywords", "keywords/tags", "etiquetas", "labels"],
    "quantity": ["quantity", "qty", "stock", "inventory", "existence", "existencias", "cantidad", "on hand", "onhand"],
    "unit_cost": ["unit_cost", "unit cost", "cost", "purchase price", "precio compra", "costo", "coste"],
    "reorder_threshold": [
        "reorder_threshold",
        "reorder threshold",
        "min stock",
        "minimum stock",
        "stock minimo",
        "stock_minimo",
        "threshold",
        "punto de pedido",
    ],
    "unit": ["unit", "uom", "measure", "unidad", "measure unit"],
    "sku": ["sku", "code", "codigo", "item code", "product code", "barcode"],
    "image_url": ["image_url", "image", "image url", "photo", "foto", "url imagen", "img"],
    "notes": ["notes", "note", "observaciones", "obs", "comments", "comentarios", "details"],
}


def _norm(s: str) -> str:
    base = unicodedata.normalize("NFD", s or "")
    no_accents = "".join(ch for ch in base if unicodedata.category(ch) != "Mn")
    lowered = no_accents.strip().lower()
    return re.sub(r"[^a-z0-9]+", " ", lowered).strip()


def _sniff_dialect(sample: str) -> csv.Dialect:
    try:
        return csv.Sniffer().sniff(sample, delimiters=",;\t|")
    except csv.Error:
        return csv.excel


def _pick_source_headers(fieldnames: list[str]) -> dict[str, str | None]:
    normalized_to_original = {_norm(h): h for h in fieldnames if h}
    picked: dict[str, str | None] = {}
    for out_col in OUTPUT_COLUMNS:
        picked[out_col] = None
        for alias in HEADER_ALIASES.get(out_col, []):
            candidate = normalized_to_original.get(_norm(alias))
            if candidate:
                picked[out_col] = candidate
                break
    return picked


def _to_int_string(value: str, default: int) -> str:
    raw = (value or "").strip()
    if not raw:
        return str(default)
    try:
        # Allow "10.0" from spreadsheets.
        return str(int(float(raw.replace(",", "."))))
    except ValueError:
        return str(default)


def _to_decimal_string(value: str) -> str:
    raw = (value or "").strip()
    if not raw:
        return ""
    cleaned = raw.replace("$", "").replace(" ", "")
    # If comma is decimal separator and no dot exists, convert to dot.
    if "," in cleaned and "." not in cleaned:
        cleaned = cleaned.replace(",", ".")
    # If both exist, assume comma is thousand separator.
    elif "," in cleaned and "." in cleaned:
        cleaned = cleaned.replace(",", "")
    try:
        num = float(cleaned)
    except ValueError:
        return ""
    # Keep simple decimal representation expected by importer.
    return f"{num:.2f}".rstrip("0").rstrip(".")


def _clean_tags(value: str) -> str:
    raw = (value or "").strip()
    if not raw:
        return ""
    # Accept separators comma/semicolon/pipe.
    parts = re.split(r"[,;|]+", raw)
    tags: list[str] = []
    seen: set[str] = set()
    for part in parts:
        tag = _norm(part).replace(" ", "_")
        if len(tag) < 2:
            continue
        if tag in seen:
            continue
        seen.add(tag)
        tags.append(tag)
    return ",".join(tags)


def normalize_csv(input_path: Path, output_path: Path) -> tuple[int, int]:
    content = input_path.read_text(encoding="utf-8-sig", errors="replace")
    dialect = _sniff_dialect(content[:4096])
    reader = csv.DictReader(content.splitlines(), dialect=dialect)
    if not reader.fieldnames:
        raise ValueError("Input file has no header row")

    selected = _pick_source_headers(reader.fieldnames)
    if not selected.get("name"):
        raise ValueError("Could not map product name column. Expected something like: name/product/item")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    written = 0
    skipped = 0
    with output_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=OUTPUT_COLUMNS)
        writer.writeheader()

        for row in reader:
            name_src = selected["name"]
            assert name_src is not None
            name = (row.get(name_src) or "").strip()
            if not name:
                skipped += 1
                continue

            out = {
                "name": name,
                "category": (row.get(selected["category"] or "") or "").strip(),
                "tags": _clean_tags(row.get(selected["tags"] or "") or ""),
                "quantity": _to_int_string(row.get(selected["quantity"] or "") or "", default=0),
                "unit_cost": _to_decimal_string(row.get(selected["unit_cost"] or "") or ""),
                "reorder_threshold": _to_int_string(row.get(selected["reorder_threshold"] or "") or "", default=10),
                "unit": ((row.get(selected["unit"] or "") or "").strip() or "each"),
                "sku": (row.get(selected["sku"] or "") or "").strip(),
                "image_url": (row.get(selected["image_url"] or "") or "").strip(),
                "notes": (row.get(selected["notes"] or "") or "").strip(),
            }
            writer.writerow(out)
            written += 1

    return written, skipped


def main() -> int:
    parser = argparse.ArgumentParser(description="Normalize supplier CSV to Clienta AI inventory template")
    parser.add_argument("--input", required=True, help="Path to supplier CSV file")
    parser.add_argument("--output", required=True, help="Path for normalized CSV output")
    args = parser.parse_args()

    input_path = Path(args.input)
    output_path = Path(args.output)
    if not input_path.exists():
        print(f"Input file not found: {input_path}", file=sys.stderr)
        return 2

    try:
        written, skipped = normalize_csv(input_path, output_path)
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    print(f"Done. Wrote {written} row(s) to: {output_path}")
    if skipped:
        print(f"Skipped {skipped} row(s) with empty product name.")
    print("You can now import this file from Inventory -> Import CSV.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
