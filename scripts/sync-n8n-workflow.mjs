#!/usr/bin/env node
/**
 * Overwrites docs/workflow.json with the current workflow from n8n (Public API).
 *
 * Usage (PowerShell):
 *   $env:N8N_API_URL="https://your-n8n.example.com"
 *   $env:N8N_API_KEY="your-api-key"
 *   node scripts/sync-n8n-workflow.mjs
 *
 * Optional: N8N_WORKFLOW_ID (default: Clienta AI WhatsApp workflow id)
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outFile = path.join(root, "docs", "workflow.json");

const base = process.env.N8N_API_URL?.replace(/\/$/, "");
const key = process.env.N8N_API_KEY;
const id = process.env.N8N_WORKFLOW_ID || "1XSblgQFyQKsEx5a";

if (!base || !key) {
  console.error("Set N8N_API_URL and N8N_API_KEY (n8n Public API).");
  process.exit(1);
}

const url = `${base}/api/v1/workflows/${id}`;
const res = await fetch(url, {
  headers: { "X-N8N-API-KEY": key, Accept: "application/json" },
});

if (!res.ok) {
  console.error(await res.text());
  process.exit(1);
}

const data = await res.json();
delete data.shared;

fs.writeFileSync(outFile, JSON.stringify(data, null, 2), "utf8");
console.log(`Wrote ${outFile} (${data.nodes?.length ?? 0} nodes)`);
