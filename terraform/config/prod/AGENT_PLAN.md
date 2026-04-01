# Clienta AI — Agent Plan (from Claude.ai session)

## Product
Multi-tenant CRM + WhatsApp automation for small businesses.
Modules: Inventory, Transactions, Campaigns, WhatsApp automation.
Stack: React + Vite, Python Lambda, DynamoDB, API Gateway, Cognito, Gemini 2.0 Flash.

## Payment Decision
- Keep bank transfer as primary (already works)
- Add Datafast card payment as optional per tenant (they paste their own API key)
- Move transfer proof + delivery address from WhatsApp into the checkout UI
- Auto-send WhatsApp confirmation on order submit

## Agents as a Service
- 5 agents inside Campaigns module
- Gated by Cognito user group (Free / Pro / Growth)
- Priced: Free = 0, Pro = $49/mo 50 runs, Growth = $99/mo unlimited
- Each run costs fractions of a cent via Gemini 2.0 Flash — very high margin

## Shareable Store
- Unique URL already exists per tenant
- Needs Open Graph tags for social sharing previews
- Active campaign should show promo banner
- Order flow moves into UI (no more WhatsApp back-and-forth for checkout)