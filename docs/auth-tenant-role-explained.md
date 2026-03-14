# Tenant, Role, and JWT — Plain Explanation

## What is a **tenant**?

A **tenant** is one customer company (or organization) using your CRM.

- **One tenant** = one business (e.g. "Acme Coffee Shop").
- **All data is scoped by tenant:** contacts, products, transactions, messages live under `TENANT#<tenant_id>` in DynamoDB. User A from Tenant 1 never sees Tenant 2’s data.
- When you sign up, you create a **new tenant** and become its **owner**. Every subsequent user you invite belongs to that same tenant.

So: **tenant = which business; every request is tied to one tenant.**

---

## What is a **role**?

A **role** is that user’s permission level **inside that tenant**.

| Role     | Meaning | Can invite? | Can change roles? | Can be deactivated? |
|----------|---------|-------------|--------------------|----------------------|
| **owner**  | Created the tenant; full control | Yes (manager, staff) | Yes | No (permanent) |
| **manager** | Can manage team and day-to-day | Yes (staff only) | Staff only | Yes |
| **staff**   | Regular user | No | No | Yes |

So: **role = what this person is allowed to do in this tenant.**

---

## The **one** JWT and how it’s used

There is **one** kind of token that matters for your API: the **Cognito ID token** (a JWT).

### What’s in it (claims)

After login, Cognito issues a JWT that contains:

| Claim | Example | Used for |
|-------|--------|----------|
| `sub` | `"a1b2c3..."` | Unique user id (Cognito) |
| `email` | `"you@example.com"` | Who is logged in |
| `custom:tenant_id` | `"01ABC..."` | **Which tenant** — used for every DB query |
| `custom:role` | `"owner"` / `"manager"` / `"staff"` | **Permission checks** (e.g. invite, deactivate) |

So the JWT answers: **who** (`sub`, `email`), **which tenant** (`custom:tenant_id`), and **what they’re allowed to do** (`custom:role`).

### How it flows (simple)

```
1. User logs in (email + password or social) → Cognito
2. Cognito returns an ID token (JWT) with sub, email, custom:tenant_id, custom:role
3. Frontend stores the token and sends it on every API call: Authorization: Bearer <JWT>
4. API Gateway validates the JWT (signature, expiry, issuer) and forwards the request to Lambda
5. Lambda reads tenant_id and role from the same JWT (in event.requestContext.authorizer.jwt.claims)
6. Lambda uses tenant_id for DynamoDB (e.g. pk = TENANT#<tenant_id>) and role for permission checks
```

So: **one token, one place to get identity + tenant + role.** No separate “tenant token” or “role token.”

---

## Simpler alternatives (without making it overly complex)

Your current design (one JWT with tenant + role) is already the standard way to do multi-tenant + RBAC. If you want to simplify, the levers are:

### Option A — Keep JWT + tenant + role (what you have)

- **Complexity:** One token, one authorizer, claims in one place.
- **Good when:** Multiple businesses (tenants) and multiple permission levels (owner/manager/staff). This is what you have and it’s appropriate.

### Option B — Single-tenant (drop tenant_id)

- **Change:** Only one “company”; no `custom:tenant_id`, no tenant scoping.
- **Simpler:** No tenant in JWT, no tenant in DB keys, no multi-tenant logic.
- **Trade-off:** You can’t host multiple businesses in one app. Only consider if you’re building for one organization.

### Option C — Single role (drop owner/manager/staff)

- **Change:** Everyone has the same permissions; remove `custom:role` and role checks.
- **Simpler:** No role hierarchy, no “only owner/manager can invite,” no role sync to Cognito.
- **Trade-off:** No way to restrict who can invite or deactivate users. Fine for a tiny team, risky as you grow.

### Option D — API key per tenant (no user-level JWT)

- **Change:** Each tenant has one API key; no per-user login, no Cognito JWT.
- **Simpler:** No Cognito, no JWT authorizer; validate a key and get tenant from a table.
- **Trade-off:** No “user” identity, no per-user roles, no invite/deactivate flow. Good for server-to-server or internal tools, not for a multi-user CRM UI.

---

## Recommendation

- **Keep** the single JWT with `custom:tenant_id` and `custom:role` — it’s the usual, clean way to do multi-tenant + roles.
- **Don’t** add more token types (e.g. separate “tenant token” or “role token”); that would add complexity without benefit.
- **Simplify** only if your product actually becomes single-tenant (Option B) or single-role (Option C); otherwise the current design is already the simple, correct one.

Summary: **Tenant = which business. Role = what this user can do in that business. One JWT carries both; your Lambdas use that one token for every request.** No need to change it unless you’re dropping multi-tenant or roles entirely.
