# Meta / WhatsApp product catalog

**Yes — Meta allows product catalogs** for WhatsApp Business (Cloud API). It is not blocked; you configure it in Meta’s ecosystem and send catalog-style messages from the API.

## How it works

1. **Commerce catalog** — Products are managed in **Meta Business Suite** / **Commerce Manager** and linked to your **WhatsApp Business Account**.
2. **Cloud API message types** — You can send **single product**, **multi-product**, and **product list** messages (and related interactive flows) when your catalog is connected and compliant with [WhatsApp Commerce policies](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/sell-products-and-services).
3. **Requirements** — Business verification, catalog approval, and correct **WABA** + **catalog** linkage. Some regions or account types have extra rules.

## vs Clienta inventory today

Your CRM stores products in **DynamoDB** (`/inventory`). That is **separate** from Meta’s catalog unless you **sync** products to Meta (via Catalog API or manual upload). Many teams:

- Keep **CRM as source of truth** and periodically sync to Meta, or  
- Use **custom messages** (text, buttons, carousels built from your API) without Meta’s native catalog UI.

So: **catalog is allowed**; **implementation** is either native Meta catalog + sync, or **bot-built** product lists from your existing inventory API (what your n8n flow already approximates with product/carousel nodes).
