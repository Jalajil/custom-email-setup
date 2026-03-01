# Custom Email Setup

Use a custom email address (e.g. `anything@yourdomain.com`) to both receive and send emails through your Gmail inbox — without SPF/DKIM failures, spam issues, or "Unverified" labels.

# Part 1 — Receiving Emails (Cloudflare Worker)

Receive emails sent to your custom email address(es) from any email provider (Gmail, Outlook, etc.) directly in your Gmail inbox. This uses my custom **cloudflare-email-relay** Worker included in this repo.

Cloudflare's built-in email forwarding often fails, Gmail and other providers reject forwarded emails because the original sender's domain doesn't authorize Cloudflare to send on its behalf (SPF/DKIM checks fail). The emails either bounce or land in spam.

**Real world example:** I tried to send an email from an outlook email to my custom email and it got rejected and never reached my Gmail, and this fixed it.

The Worker solves that by rewriting the **From** field to your custom domain address (which Cloudflare *is* authorized to send from) and setting **Reply-To** to the original sender. This way:

- The email passes SPF/DKIM checks and lands in your inbox
- Hitting Reply in Gmail still goes to the original sender
- Works with multiple custom email addresses and domains with no code changes needed

 Prerequisites

- A Cloudflare account
- A domain added to Cloudflare
- Node.js installed (for `npm` and `npx wrangler`)
- A Gmail address to receive emails forwarded from your custom domain

## 1.1 — Cloudflare DNS Setup

1. **Add your domain to Cloudflare** (if not already there)
   - Cloudflare Dashboard → Add a site → enter your domain → Free plan → follow the nameserver instructions from your registrar
2. **Enable Email Routing**
   - Go to your domain → Email Routing → Enable Email Routing
   - Cloudflare will auto-add the required MX records
3. **Verify your destination address**
   - Email Routing → Destination addresses → add your Gmail address and verify it
   - Note: there won't be a confirmation link from Cloudflare — it verifies automatically

## 1.2 — Set Up the Worker

### Step 1 — Clone the repo

```bash
git clone https://github.com/Jalajil/custom-email-setup.git
cd custom-email-setup
```

### Step 2 — Install dependencies

```bash
npm install
```

### Step 3 — Configure the forwarding addresses

Open `src/email-routes.ts` and set your email configuration:

```typescript
export const DEFAULT_FORWARD_TO = "your-email@gmail.com";

export const EMAIL_MAP: Record<string, string> = {
    "mohammed@yourdomain.com": "your-email@gmail.com",
    "bader@yourdomain.com": "bader-gmail@gmail.com",
};
```

- `DEFAULT_FORWARD_TO` — the fallback Gmail for any address not in `EMAIL_MAP`
- `EMAIL_MAP` — maps each custom email to a specific Gmail, one per line

### Step 4 — Authenticate with Cloudflare

```bash
npx wrangler login
```

This opens a browser window to authorize Wrangler with your Cloudflare account.

## 1.3 — Deploy the Worker

The Worker must be deployed before you can select it in the Email Routing rules dropdown.

```bash
npx wrangler deploy
```

## 1.4 — Add a Custom Address

1. Go to your domain → Email → Email Routing → **Routing rules** tab
2. Under **Custom address**, click **Create address**
3. Set your custom address (e.g. `hello@yourdomain.com`)
4. Set the action to **Send to a Worker**
5. Select the **cloudflare-email-relay** Worker as the destination
6. Click **Save**

## 1.5 — Configure the Catch-All Route (Optional)

1. Go to your domain → Email → Email Routing → **Routing rules** tab
2. Under **Catch-all address**, click **Edit**
3. Set the action to **Send to a Worker**
4. Select the **cloudflare-email-relay** Worker from the dropdown
5. Click **Save**

This ensures every address at your domain (e.g. `anything@yourdomain.com`) is handled by your Worker.

## 1.6 — Avoid Spam Folder

Send an email to your custom address from another account. If it goes to spam, open it and click **Report not spam**. Future emails from your custom email will arrive in your inbox.

If the setup above didn't work you can also create a Gmail filter to prevent this:

1. Open Gmail → click the search bar → click **Show search options** (the slider icon on the right)
2. In the **To** field, enter your custom domain: `@yourdomain.com`
3. Click **Create filter**
4. Check **Never send it to Spam**
5. Click **Create filter**

# Part 2 — Sending Emails (Resend)

Send emails from your custom email address to any recipient (Gmail, Outlook, etc.) without getting an "Unverified" label. This part does not use the Worker, it uses [Resend](https://resend.com) as an SMTP relay through Gmail's "Send As" feature.

## Prerequisites

- Part 1 completed (the Worker must be running to receive Gmail's confirmation email)
- A [Resend](https://resend.com) account

## 2.1 — Resend Account & Domain Setup

1. Sign up at [resend.com](https://resend.com)
2. Go to **Domains** → enter your domain → **Add Domain**
3. In DNS Records, choose **Auto configure** (Cloudflare logo) → **Authorize**
4. Go back to Resend and click **Verify**, DNS propagation may take a few minutes

## 2.2 — Get Your API Key

1. In Resend, go to **API Keys** → **Create API Key**
2. Give it a name, select **Sending access** and your domain
3. Copy the key — you'll only see it once

## 2.3 — Add Custom Email to Gmail (Send As)

1. Go to **Gmail Settings** → **See all settings** → **Accounts and Import** → **Send mail as** → **Add another email address**
2. Enter your name and your custom email address (e.g. `you@yourdomain.com`), uncheck **Treat as alias**
3. For SMTP settings:
   - **SMTP Server:** `smtp.resend.com`
   - **Port:** `587`
   - **Username:** `resend`
   - **Password:** your Resend API key
   - **Secured connection:** TLS
4. Click **Add Account**, Gmail will send a confirmation email to that address (which will be forwarded to your Gmail inbox by your Worker)

Now you can compose emails in Gmail and choose your custom domain address in the **From** dropdown.

# Part 3 — Adding Extra Custom Email Addresses

**Same domain, same Gmail:**

1. Repeat section **1.4** to create the new address and route it to the Worker (no code changes needed)
2. Repeat section **2.3** to add the new address as a "Send As" in Gmail

**Same domain, different Gmail:**

1. Add the new Gmail as a verified destination address in Cloudflare (Email Routing → Destination addresses)
2. Add an entry to `EMAIL_MAP` in `src/email-routes.ts` and redeploy (`npx wrangler deploy`)
3. Repeat section **1.4** to route the new address to the Worker
4. Repeat section **2.3** to add the new address as a "Send As" in Gmail

**New domain:**

1. Repeat sections **1.1**, **1.4**, and **1.6** for the new domain
2. If the new address should go to a different Gmail, also add it to `EMAIL_MAP` in `src/email-routes.ts`
3. Repeat sections **2.1**, **2.2**, and **2.3** to set up Resend and Gmail "Send As" for the new domain
   - Resend only provides 1 free domain per account — you can create a new Resend account for each additional domain
   - If using a second Resend account, the **Auto configure** step will link to your existing Cloudflare account

## Credits

- [@tokifyi](https://x.com/tokifyi) for the original guide on setting up a free custom email
- [@keithluuid](https://x.com/keithluuid) for the spam filtering tip
