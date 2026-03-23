# Human vs bot handoff (WhatsApp + n8n)

CRM stores **`conversation_mode`** on each **contact**: `bot` (default) or `human`. When `human`, your n8n flow should **not** run the AI agent for that customer until staff sets the lead back to `bot` (in **Leads → lead profile**) or the workflow sets it via API.

## API (service key + tenant)

| Action | Request |
|--------|---------|
| Read mode | `GET /contacts?phone=<E.164>` — response `contacts[0].conversation_mode` (empty `contacts` if unknown) |
| Set mode | `PATCH /contacts/{contact_id}` body: `{ "conversation_mode": "human" }` or `"bot"` |

Headers: `X-Service-Key`, `X-Tenant-Id` (same as other n8n tools).

**Note:** `GET /contacts?phone=` now **paginates** until a matching phone is found (not only the first page).

## Suggested n8n shape

1. After **Resolve Tenant**, compute **customer phone** (same logic as today).
2. **HTTP Request** `GET {{api_url}}/contacts?phone={{customer_phone}}` with service key + tenant id.
3. **Code** `const mode = ($json.contacts && $json.contacts[0]) ? $json.contacts[0].conversation_mode : 'bot'`
4. **IF** or **Switch**:
   - `human` → **do not** connect to AI Agent / tools; optionally send a short WhatsApp text (“A teammate will reply”) and **stop** the bot branch.
   - `bot` → existing flow (AI, buttons, etc.).
5. **Optional — “talk to a human”** intent: if inbound text matches keywords (`human`, `agent`, `person`, `operador`, …), **PATCH** `contacts/{id}` with `conversation_mode: human` (you need `contact_id` from step 2 or from create contact).

## Staff UI

**Leads → open a lead → WhatsApp** dropdown: **AI & automation** vs **Human only**. That maps to `conversation_mode` `bot` / `human`.

## Product catalog (Meta)

See [meta-product-catalog.md](./meta-product-catalog.md) — Meta allows catalogs; sync is separate from this CRM field.
