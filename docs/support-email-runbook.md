# Streaming Helper support email runbook

## Public support promise

- Address: `help@streaminghelper.net`
- Expected response time: 24–48 hours
- Receiving provider: Resend
- Working inbox: the Gmail address stored in Vercel as `SUPPORT_FORWARD_TO`

## Required production environment variables

Configure these only as server-side Vercel environment variables:

- `RESEND_API_KEY`
- `RESEND_WEBHOOK_SECRET`
- `SUPPORT_FORWARD_TO`

Never expose these values through a `VITE_`-prefixed variable.

## Resend webhook

After the endpoint is deployed:

1. Open Resend → Webhooks.
2. Add `https://streaminghelper.net/api/resend-inbound`.
3. Select only `email.received`.
4. Copy the webhook signing secret.
5. Add it to Vercel as `RESEND_WEBHOOK_SECRET` for Production.
6. Redeploy so the new secret is available to the function.

The endpoint:

- verifies the raw webhook signature;
- ignores events other than `email.received`;
- ignores messages not addressed to `help@streaminghelper.net`;
- forwards accepted messages to `SUPPORT_FORWARD_TO`;
- preserves a usable reply address;
- forwards attachments up to 10 MB in total;
- uses a Resend idempotency key to prevent duplicate forwarding during retries.

## Acceptance test

1. Send a plain-text message from a non-owner address to
   `help@streaminghelper.net`.
2. Confirm it appears under Resend → Emails → Receiving.
3. Confirm one forwarded copy arrives in Gmail.
4. In Gmail, click Reply and verify the recipient is the original sender.
5. Repeat with one small image attachment.
6. Replay the webhook in Resend and confirm Gmail does not receive a duplicate.

## Gmail sender setup

After forwarding passes:

1. Create a dedicated sending-only API key in Resend.
2. In Gmail, open Settings → Accounts and Import → Send mail as.
3. Add `help@streaminghelper.net`.
4. Use Resend SMTP:
   - server: `smtp.resend.com`
   - port: `465`
   - username: `resend`
   - password: the dedicated sending-only API key
   - security: SSL
5. Complete Gmail’s verification message.

Do not reuse a full-access production API key as Gmail’s SMTP password.
