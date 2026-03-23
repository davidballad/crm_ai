# WhatsApp product templates and cart management

## Product display: two options

### 1. Interactive media carousel (recommended for CRM inventory)

- **No WhatsApp Catalog required.** Products come from your CRM (inventory API).
- Send an **interactive media carousel** (2–10 cards). Each card has:
  - **Image** (public URL; use `product.image_url` from inventory or a placeholder)
  - **Body text** (name, description, price)
  - **Quick-reply button** e.g. “Add to cart” with `id` = `add_<product_id>`
- When the user taps the button, the webhook receives `interactive.button_reply.id`; you use that to add the product to your cart.
- [Interactive media carousel](https://developers.facebook.com/docs/whatsapp/cloud-api/messages/interactive-media-carousel-messages/)

### 2. WhatsApp Catalog (product carousel)

- Requires a **Meta WhatsApp Catalog** (Facebook Commerce). Products must be uploaded and kept in sync with Meta.
- You send a **product carousel** with `product_retailer_id` and `catalog_id`. Image, name, and price come from the catalog.
- Best if you already use Meta’s catalog; otherwise the media carousel is simpler.

---

## Cart: WhatsApp does not provide it

WhatsApp has **no built-in cart**. You must:

1. **Store the cart yourself** (e.g. DynamoDB per tenant + customer).
2. **Add to cart**: when the user taps “Add to cart”, call your API to add the item; then send a confirmation and e.g. “View cart” / “Keep browsing” buttons.
3. **View cart**: when they tap “View cart”, call your API to get the cart, then send a message with the list and a “Checkout” button.
4. **Checkout**: when they tap “Checkout”, create the order (e.g. `POST /transactions`), send the payment link, and clear the cart.

This project implements cart in the **transactions** Lambda: `GET /cart`, `POST /cart/items`, `POST /cart/checkout`. Cart is keyed by tenant and customer (e.g. WhatsApp `from` number).

---

## Flow summary (flower store example)

1. User taps **Order** → send **media carousel** with products (image, description, “Add to cart” per product).
2. User taps **Add to cart** on a product → API adds item to cart → reply “Added! [View cart] [Keep browsing]”.
3. User taps **View cart** → API returns cart → send summary + “Checkout” button.
4. User taps **Checkout** → API creates transaction, returns payment link → send link and clear cart.

Product images must be **public URLs** (e.g. S3 public read or your CDN). Set `image_url` on products in inventory for the carousel.
