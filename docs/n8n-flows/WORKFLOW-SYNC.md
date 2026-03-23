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

## Option C — Cursor / n8n MCP

Use the **n8n MCP** tool `n8n_get_workflow` with `id` = `1XSblgQFyQKsEx5a` and `mode` = `full`. The response is `{ success, data }` — use **`data`** as the workflow JSON (strip `shared` if present), same as Option A.

**Secrets:** If Code nodes contain a real `SERVICE_API_KEY`, replace it with `<YOUR_SERVICE_API_KEY>` (or your env-based pattern) before committing — do not commit live API keys.

## Option D — Push `docs/workflow.json` → n8n

Overwrite the live workflow from the repo (n8n Public API **PUT**):

```powershell
$env:N8N_API_URL="https://your-n8n-host"
$env:N8N_API_KEY="your-n8n-api-key"
node scripts/push-workflow-to-n8n.mjs
```

- **`--merge-from=export.json`** — after pulling with Option A/C, merge the real `SERVICE_API_KEY` from that export into Code nodes that use `<YOUR_SERVICE_API_KEY>` in `docs/workflow.json`.
- **`--body=merged.json`** — PUT a pre-built payload (e.g. from `scripts/merge-workflow-docs-with-live.mjs live-export.json out.json`).
- **`N8N_CREDENTIALS_FILE`** — optional path to a local JSON file with `N8N_API_URL` / `N8N_API_KEY` (or `mcpServers["n8n-mcp"].env`) if you prefer not to set env vars in the shell.

The push script sends only API-safe **`settings`** (e.g. `executionOrder`); extra UI-only keys are stripped so PUT succeeds.

---

**Note:** API responses may include fields like `shared` (project metadata). The script strips `shared` before writing; the file is still a valid workflow for import.
