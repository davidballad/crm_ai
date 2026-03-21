# Keeping `docs/workflow.json` in sync with n8n

The file [`docs/workflow.json`](../workflow.json) should match the **live** workflow in n8n (workflow id `1XSblgQFyQKsEx5a` — *Clienta AI — WhatsApp CRM Agent*). Treat n8n as the editor of record; refresh the repo file after you change the workflow in the UI.

## Option A — Script (recommended)

From the repo root, with the same **Public API** URL and key you use for the n8n MCP:

```powershell
$env:N8N_API_URL="https://your-n8n-host"
$env:N8N_API_KEY="your-n8n-api-key"
node scripts/sync-n8n-workflow.mjs
```

Optional: `N8N_WORKFLOW_ID` if you use a different workflow.

## Option B — Manual export

In n8n: open the workflow → **⋯** → **Download** (or copy JSON) → replace `docs/workflow.json`.

## Option C — Cursor

Ask the assistant to pull the workflow via n8n MCP and save `docs/workflow.json` (same result as Option A).

---

**Note:** API responses may include fields like `shared` (project metadata). The script strips `shared` before writing; the file is still a valid workflow for import.
