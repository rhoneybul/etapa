# Sending marketing emails from Etapa

Every marketing / promotional / lifecycle email we send must honour opt-outs. This doc is the one-pager reference for how to do that without reinventing the wheel.

## The rule

**Never send a marketing email to an address that is in `email_unsubscribes`.** Also: every marketing email must contain a working unsubscribe link, and for email clients that support it (Gmail, Apple Mail), the proper `List-Unsubscribe` headers.

This applies to: beta announcements, launch news, product updates, newsletters, onboarding drips, win-back campaigns — anything that isn't a direct operational/transactional response to something the user just did (receipts, password resets, appointment confirmations).

Transactional emails are exempt from unsubscribe requirements but still should not go to `email_unsubscribes`-listed addresses if the content strays anywhere near marketing ("btw, new feature!" piggybacking on a receipt = marketing).

## The building blocks (all in `server/src/lib/unsubscribe.js`)

```js
const {
  signEmail,           // email → HMAC token string
  verifyToken,         // token → email (or null)
  unsubscribeUrl,      // email → friendly https://getetapa.com/unsubscribe?t=... URL
  listUnsubscribeHeaders, // email → { List-Unsubscribe, List-Unsubscribe-Post }
  isOptedOut,          // (supabase, email) → bool — fail-closed (true on error)
  recordUnsubscribe,   // manual record (e.g. admin flow)
  recordResubscribe,
} = require('./lib/unsubscribe');
```

## Sending a marketing email — the minimum flow

Whatever transport you're using (Resend, SES, Mailgun, Gmail API, or just a manual send later), the checklist is:

1. **Filter before sending.** Look up `email_unsubscribes` in one batch query and remove matches from your recipient list. Cheaper than calling `isOptedOut` per email.
2. **Include the footer link.** Every email body must contain the unsubscribe URL at the bottom. The user-facing URL is `unsubscribeUrl(email)`.
3. **Include `List-Unsubscribe` headers.** Gmail, Apple Mail, and Yahoo render a native "Unsubscribe" button when these are set correctly. Without them, Gmail will also be more aggressive about marking you as spam. Use `listUnsubscribeHeaders(email)`.
4. **Handle bounces.** Persistent hard bounces should also result in an entry in `email_unsubscribes` with `source: 'bounce'` so we don't keep trying.

### Example (Node — transport-agnostic)

```js
const { createClient } = require('@supabase/supabase-js');
const {
  unsubscribeUrl,
  listUnsubscribeHeaders,
} = require('../lib/unsubscribe');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// 1. Fetch the list you want to send to
const { data: signups } = await supabase
  .from('interest_signups')
  .select('email');

const emails = (signups || []).map(s => s.email);

// 2. Remove opt-outs in one query
const { data: unsubs } = await supabase
  .from('email_unsubscribes')
  .select('email');
const blocked = new Set((unsubs || []).map(u => u.email.toLowerCase()));
const recipients = emails.filter(e => !blocked.has(e.toLowerCase()));

// 3. For each recipient, render + send
for (const email of recipients) {
  const headers = listUnsubscribeHeaders(email);

  // Whatever your transport is:
  await sendEmail({
    to: email,
    from: 'Etapa <hello@getetapa.com>',
    subject: '🎉 Etapa beta is live',
    headers: {
      ...headers,
      // Any other headers you want
    },
    html: `
      <h1>Etapa is live!</h1>
      <p>We shipped the beta. Here's how to install it…</p>
      <!-- … -->
      <hr>
      <p style="font-size:12px;color:#888">
        You're receiving this because you signed up for Etapa updates.
        <a href="${unsubscribeUrl(email)}">Unsubscribe</a>.
      </p>
    `,
  });
}
```

## Required env vars

| Variable | What it is |
|---|---|
| `UNSUBSCRIBE_SECRET` | Random secret (>= 32 bytes) used to sign tokens. Set once, never rotate unless compromised. |
| `PUBLIC_WEBSITE_URL` | e.g. `https://getetapa.com` — used to build the friendly footer link. |
| `PUBLIC_API_URL` | e.g. `https://etapa-production.up.railway.app` — used in `List-Unsubscribe` headers so mail clients can hit it directly. |

Generate the secret once:

```bash
openssl rand -base64 48
```

Store it in Railway's env vars. **Do not put it in git.** If it leaks, rotating it invalidates every outstanding unsubscribe link, which is annoying but not catastrophic (users who have already unsubscribed stay unsubscribed — the row is in the DB).

## Sending via MailerLite (or similar ESP)

MailerLite handles its own unsubscribe flow. Put the merge tag `{$unsubscribe}` in your template's footer — MailerLite replaces it with a tracked URL and handles the opt-out on their side. They'll reject a campaign that doesn't have one.

To keep our own `email_unsubscribes` table in sync (so future sends from our own server / a different provider still honour the opt-out), configure a webhook:

- MailerLite → Integrations → Webhooks → Create webhook
- URL: `https://etapa-production.up.railway.app/api/public/mailerlite/webhook`
- Events: `subscriber.unsubscribed`, `subscriber.bounced`, `subscriber.marked_as_spam`, `subscriber.complained`
- Signature: generate a random 32-byte token, paste it into MailerLite, and set the same value as `MAILERLITE_WEBHOOK_SECRET` in Railway env.

The webhook mirrors every opt-out / bounce / spam complaint into our DB with an appropriate `source` label.

## What the user sees

1. User clicks the footer link → lands on `https://getetapa.com/unsubscribe?t=<token>`
2. The page calls `GET /api/public/unsubscribe-status` to check state
3. If not unsubscribed, it auto-unsubscribes via `POST /api/public/unsubscribe`
4. Shows "You're unsubscribed" with a one-tap re-subscribe button

For Gmail users: the native unsubscribe button in the email list view hits `POST /api/public/unsubscribe` directly (RFC 8058 one-click). No browser page involved — the server just records the opt-out and returns 200. Gmail will no longer show the sender as capable of being unsubscribed once it sees a 200.

## Admin view

The admin dashboard at `/dashboard/signups` shows every interest signup with an **Unsubscribed** badge next to opt-outs. The "Copy emails" button copies only opt-in addresses — unsubscribed emails are excluded automatically. The CSV export includes an `unsubscribed_at` column so you can see opt-out state at a glance.

## Legal notes (not legal advice)

- **CAN-SPAM (US)** requires a functional unsubscribe in every marketing email, honoured within 10 business days. Our setup is one-click and immediate.
- **GDPR / PECR (EU/UK)** requires opt-in consent to start sending, and a one-click opt-out at any time. "Register interest" on the website counts as consent for launch-related emails about Etapa; it doesn't cover third-party messages.
- **RFC 8058** defines the `List-Unsubscribe-Post` header that makes native "Unsubscribe" buttons one-click. Gmail's bulk-sender requirements (Feb 2024) make this effectively mandatory above ~5k emails/day.

## Things I deliberately did *not* build

- **Per-category preferences** (e.g. "only send me launch emails, not blog roundups"). One opt-out for everything is simpler and covers the legal minimum. If we later run multiple distinct campaigns, we can add a `category` column to `email_unsubscribes` without a migration hassle.
- **Double opt-in confirmation on registration.** The register-interest flow is single-opt-in — one click on the website and you're on the list. Legal in the US, grey in the UK/EU. If we go big in Europe, consider adding a confirmation email before we treat a signup as marketing-sendable.
- **Automatic suppression list sync with a provider.** Whatever ESP we plug in (Resend, Loops, etc.) should be configured to **read from** our `email_unsubscribes` table, not maintain its own list. One source of truth.
