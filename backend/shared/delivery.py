from decimal import Decimal


def get_delivery_fee(zones: list | None, zone_name: str) -> Decimal | None:
    if not zones:
        return None
    for zone in zones:
        if zone.get("name") == zone_name:
            try:
                return Decimal(str(zone["price"]))
            except Exception:
                return None
    return None


def validate_delivery_zones(zones: list) -> str | None:
    """Returns an error message string if invalid, None if valid."""
    seen_names: set[str] = set()
    for zone in zones:
        name = zone.get("name")
        if not isinstance(name, str) or not name.strip():
            return "Cada zona debe tener un nombre no vacío"
        if name in seen_names:
            return f"Nombre de zona duplicado: '{name}'"
        seen_names.add(name)
        price = zone.get("price")
        if price is None:
            return f"La zona '{name}' no tiene precio"
        try:
            if Decimal(str(price)) < 0:
                return f"El precio de la zona '{name}' no puede ser negativo"
        except (TypeError, ValueError):
            return f"El precio de la zona '{name}' no es un número válido"
    return None
