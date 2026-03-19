# Verify AWS SES for the Contact Form

The contact form sends email via **Amazon SES**. You must verify the **sender address** (and in sandbox, the recipient too) in the **same region** as your Lambda (e.g. `us-east-1`).

---

## 1. Open SES in the correct region

1. Log in to the [AWS Console](https://console.aws.amazon.com/).
2. Switch region (top-right) to the one you use for the app (e.g. **US East (N. Virginia) / us-east-1**).
3. Open **Amazon Simple Email Service** (search for “SES” or go to **Services → Application Integration → Simple Email Service**).

---

## 2. Verify an email address (e.g. info@clientaai.com)

1. In the left menu, go to **Verified identities** (or **Identities** in older UI).
2. Click **Create identity**.
3. Choose **Email address**.
4. Enter the address you use as sender (e.g. `info@clientaai.com` — must match `contact_from_email` in Terraform).
5. Click **Create identity**.

AWS sends a **verification email** to that address.

6. Open that inbox, find the email from **Amazon Web Services**, and click the **verification link**.
7. Back in the console, the identity status should change to **Verified** (refresh the list if needed).

---

## 3. Sandbox vs production

- **Sandbox**: You can only send **to** verified addresses. So if you want to receive form submissions at `info@clientaai.com`, that address must be verified (which you did above).
- **Production**: You can send to any address. To move out of sandbox, in SES go to **Account dashboard** → **Request production access** and complete the form.

---

## 4. Optional: verify a domain

If you prefer to verify the whole domain (so any `@clientaai.com` address can send):

1. **Create identity** → choose **Domain**.
2. Enter `clientaai.com`.
3. AWS shows **DKIM** (and optionally **MAIL FROM**) DNS records. Add the suggested CNAME (or TXT) records in your DNS (e.g. Route 53 or your registrar).
4. After DNS propagates (minutes to hours), SES marks the domain as **Verified**.

Then you can use `info@clientaai.com` (or any address at that domain) as the sender without verifying each address.

---

## 5. Check your Terraform variables

Ensure these match the address you verified:

- `contact_from_email` — must be a verified identity (email or address on a verified domain).
- `contact_recipient_email` — in sandbox, must also be verified if it’s different from the sender.

If you use `info@clientaai.com` for both, verifying that one address is enough for sandbox.
