# Plan: Messages (Conversation Lifecycle) & Leads (AI + Manual Move)

This document plans the **Messages tab** (conversation lifecycle, follow-ups, closed-chat rules) and **Leads tab** (AI-assisted accuracy, manual status move) without breaking existing backend behavior.

---

## Current state (already implemented)

### Messages (backend)

- **Message model** (`shared/models.py`): `category` = `"active"` | `"incomplete"` | `"closed"`; `from_number`, `to_number`, `text`, `contact_id`, `created_ts`, etc.
- **GET /messages**: Optional filters `contact_id`, `channel`, `category`. Returns list; no “conversation” entity.
- **POST /messages**: Create message; `category` defaults to `"active"` if not sent.
- **PATCH /messages/{id}/flags**: Update `category` and/or `processed_flags` for a **single message**.
- **POST /messages/send**: Send WhatsApp text from UI (JWT); stores outbound with `category: "active"`.
- **VALID_CATEGORIES** = `{"active", "incomplete", "closed"}`.

### Messages (frontend)

- **MessagesInbox.jsx**: Groups messages by `from_number` (one card per customer). Conversation **category** = category of the **latest message** in that thread. Columns: Active, Incomplete, Closed. User can open a thread and send a reply (no check for closed).
- **LeadProfile.jsx**: Shows contact and conversation history; messages show `category` badge.

### Messages (n8n)

- **Store Inbound**: POST /messages with `category: 'active'` when saving inbound messages.
- **Store Outbound**: POST /messages with `category: 'active'` for AI replies.
- No step today that sets a conversation to `closed` on checkout.

### Leads / Contacts (backend)

- **Contact model**: `lead_status` ∈ `{"prospect", "interested", "closed_won", "abandoned"}`, `tier` ∈ `{"bronze", "silver", "gold"}`, `total_spent`, `last_activity_ts`, `phone`, `name`, etc.
- **PATCH /contacts/{id}**: Allowed fields include `lead_status`, `tier`, `total_spent`, etc. Business owner can already change status via API.
- **Checkout flow**: On cart_checkout we find or create contact by phone and update `total_spent` and `last_activity_ts`.

### Leads (frontend)

- **LeadsList.jsx**: Kanban by `lead_status` (Prospect, Interested, Closed Won, Abandoned). Cards link to `/leads/:id`. **No drag-and-drop or in-place status change**; user must open profile.
- **LeadProfile.jsx**: Shows details + conversation history. **No UI to change lead_status or tier** (only display). `total_spent` is not shown yet (API returns it).

---

## Gap summary

| Requirement | Current | Gap |
|-------------|---------|-----|
| Checkout → mark chat closed | Not implemented | Need to set “conversation” to closed when order is checked out |
| New message after closed/incomplete → back to Active | New inbound has `category: 'active'` | **Already satisfied** (latest message drives column) |
| 20h no reply → follow-up + Incomplete; 24h → Closed | Not implemented | New: scheduled logic + optional follow-up send |
| Closed → cannot send from UI | Send allowed for all | Block send when conversation is closed |
| AI for lead accuracy (messages, spend, time) | Not implemented | New: scoring or suggested status |
| Move leads in UI | Only via API; no UI | Add status/tier change in UI (Leads list and/or profile) |

---

## Phase 1: Messages – Checkout marks conversation closed

**Goal:** When a customer completes checkout, the **conversation** (that customer’s chat) is marked **closed**.

**Approach:** Conversation state is derived from the **latest message** per `from_number`. So “mark conversation closed” = set `category` to `"closed"` on the **latest message** for that customer phone.

- **Backend (no breaking changes)**
  - Add **POST /messages/mark-conversation-closed** (or **POST /messages/mark-closed**).
  - Body: `{ "from_number": "<customer_phone>" }` (e.g. WhatsApp id used in checkout).
  - Auth: same as rest of messages API (JWT or service key).
  - Logic:
    1. Query messages for tenant (e.g. `query_items` with `MESSAGE#` prefix, limit sufficient to find recent).
    2. Filter items where `from_number` or `to_number` equals normalized `from_number` (conversation thread).
    3. Sort by `created_ts` desc; take the latest.
    4. If found: `update_item` that message’s `category` to `"closed"`.
    5. Return 200 with e.g. `{ "message_id", "category": "closed" }` or 204. If no message found, return 200 anyway (idempotent).
  - **Existing endpoints unchanged:** GET /messages, POST /messages, PATCH /messages/{id}/flags, POST /messages/send.

- **n8n**
  - After **Send Order Placed** (checkout success), add an **HTTP Request** node:  
    **POST** `{{ api_url }}/messages/mark-conversation-closed`  
    Body: `{ "from_number": "{{ $('Extract & Filter').item.json.from_number }}" }`  
    Headers: X-Service-Key, X-Tenant-Id.
  - No change to Store Inbound / Store Outbound (they keep sending `category: 'active'` where applicable).

**Result:** After checkout, that conversation’s latest message is closed, so the Messages inbox shows it in the Closed column. When the customer messages again, the new message has `category: 'active'` and becomes the latest, so the conversation moves back to Active (already correct).

---

## Phase 2: Messages – Closed chats cannot send from UI

**Goal:** In the Messages tab, if the **selected conversation** is **Closed**, the business owner cannot send a message from the UI (to reduce Meta policy risk).

- **Frontend only**
  - In **MessagesInbox.jsx**, when building the selected conversation object, the conversation’s `category` is already available (from the latest message).
  - Before calling `sendMessage`:
    - If `selectedConv.category === 'closed'`:
      - Disable the send input and send button.
      - Show a short message, e.g.: “This conversation is closed. Sending is disabled to comply with WhatsApp policies. If the customer messages again, it will reopen as Active.”
  - Do **not** change the backend: **POST /messages/send** can remain callable (e.g. for future “reopen and send” flows or other tools). The product rule is enforced in the UI only.

**Result:** Closed conversations show the thread but sending is disabled with a clear explanation.

---

## Phase 3: Messages – 20h / 24h follow-up and auto-close (future)

**Goal:**  
- If no customer reply for **20 hours** → send optional follow-up and move conversation to **Incomplete**.  
- If still no reply by **24 hours** → mark **Closed**.

**Approach (high level):**

- **Data:** We already have per-message `created_ts` and `category`. “Conversation” = latest message per customer number; “last activity” = latest `created_ts` in that thread. No schema change required.
- **Scheduler:** A scheduled job (e.g. EventBridge rule every hour + Lambda, or an n8n scheduled workflow) that:
  1. For each tenant (or for tenants with WhatsApp enabled), list or derive “conversations” that are currently **active** and have last message older than 20h.
  2. Optional: trigger follow-up (e.g. call an internal “send template” or a single WhatsApp message via existing infra; template must be Meta-approved if outside 24h window).
  3. Update the **latest message** of that conversation to `category: "incomplete"` (20h) or `category: "closed"` (24h) via existing PATCH /messages/{id}/flags or the new mark-conversation endpoint (if extended to support `incomplete`).
- **Backend:** Either reuse **PATCH /messages/{id}/flags** (job must resolve message id from conversation), or add **POST /messages/mark-conversation** body `{ "from_number", "category": "incomplete" | "closed" }` so the job doesn’t need to know message ids. Prefer one endpoint that can set any valid category for the latest message of a conversation.
- **n8n:** Optional: scheduled workflow that calls the new endpoint(s) or the messages API after computing “conversations older than 20h / 24h” (e.g. from GET /messages and in-memory grouping). Alternatively, a small Lambda that runs on schedule and calls the same APIs.

**Not in Phase 1/2:** This is a separate, scheduled-automation feature. Plan it after Phase 1 and 2 are live.

---

## Phase 4: Leads – Show total_spent and allow moving status in UI

**Goal:** Business owner sees value per lead and can move leads between statuses (and optionally tiers) in the UI.

**Already done in backend:**

- Contact has `total_spent` and `last_activity_ts`; checkout updates them.
- **PATCH /contacts/{id}** accepts `lead_status` and `tier`.

**Frontend (non-breaking):**

- **LeadProfile.jsx**
  - Add a row for **Total spent** (e.g. `contact.total_spent` formatted as currency).
  - Add a **Status** dropdown (or buttons) for `lead_status`: Prospect, Interested, Closed Won, Abandoned. On change → **PATCH /contacts/{id}** with `{ lead_status }`, then invalidate contact query.
  - Optionally add **Tier** dropdown (Bronze, Silver, Gold) and PATCH `tier` the same way.
- **LeadsList.jsx** (optional)
  - Allow changing status **from the card** (e.g. dropdown on each card) so the owner can move leads without opening the profile. Same PATCH call.

**Result:** Leads show spending; owner can move leads between statuses (and tiers) in profile and optionally from the list. No backend change.

---

## Phase 5: Leads – AI-assisted lead accuracy (future)

**Goal:** Use AI to make lead status/tier more accurate using number of messages, spending, time, etc.

**Possible approaches:**

1. **Suggested status / score API**
   - New endpoint, e.g. **GET /contacts/{id}/suggested-status** or **POST /leads/suggest** (batch), that:
     - Takes contact id(s), loads contact + message count (from messages or a stored aggregate), `total_spent`, `last_activity_ts`, etc.
     - Calls an AI (e.g. Gemini/Bedrock) with a prompt: “Given messages count N, total_spent X, last_activity Y, suggest lead_status and optionally tier.”
     - Returns e.g. `{ "suggested_lead_status", "suggested_tier", "reason" }` without writing to DB.
   - Frontend can show “Suggested: Interested” and “Apply” so the owner keeps final say.

2. **Background job that suggests only**
   - Scheduled job that computes suggestions and stores them in a new field, e.g. `suggested_lead_status`, `suggested_tier`, `suggested_at`. UI shows suggestion and “Apply” still does PATCH.

3. **Fully automatic updates**
   - AI updates `lead_status` / `tier` automatically. Higher risk (overwrites manual moves); not recommended without an “AI suggestions only” mode first.

**Recommendation:** Start with (1) – an optional “suggested status” API and an “Apply” button in the UI. No automatic overwrite of owner-set status. Backend stays backward compatible; only new endpoint(s) and optional fields if we store suggestions.

**Data needed for AI:** Already available per contact: `total_spent`, `last_activity_ts`, `lead_status`, `tier`. Message count per contact would require either counting GET /contacts/{id}/messages or storing a denormalized `message_count` / `last_message_ts` on the contact (updated when messages are created). Denormalization can be added later without breaking existing APIs.

---

## Implementation order (recommended)

1. **Phase 1** – Backend: add **POST /messages/mark-conversation-closed** (and optionally **mark-conversation** with `category` param for reuse in Phase 3). n8n: call it after checkout.
2. **Phase 2** – Frontend: disable send and show notice when `selectedConv.category === 'closed'`.
3. **Phase 4** – Frontend: show `total_spent` on Lead profile; add status (and optionally tier) change in Lead profile (and optionally on Leads list).
4. **Phase 3** – Design and implement 20h/24h scheduler + optional follow-up and mark-conversation to incomplete/closed.
5. **Phase 5** – Add suggested-status API and UI (and optional denormalized message count if needed).

---

## What we do not change (avoid breaking)

- **GET /messages**, **POST /messages**, **PATCH /messages/{id}/flags**: behavior and request/response shape unchanged. New endpoint is additive.
- **POST /messages/send**: no backend restriction for closed; only UI hides send for closed conversations.
- **Contact/Lead model and PATCH /contacts/{id}**: already support `lead_status`, `tier`, `total_spent`. Only frontend and optional new “suggest” endpoint added.
- **n8n Store Inbound / Store Outbound**: keep sending `category: 'active'` so that new messages automatically “reopen” the conversation in the UI.

This keeps the backend backward compatible and confines new behavior to new endpoints and UI logic.
