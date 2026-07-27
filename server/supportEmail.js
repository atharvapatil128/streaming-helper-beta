export const SUPPORT_ADDRESS = 'help@streaminghelper.net';
export const MAX_WEBHOOK_BYTES = 1_000_000;
export const MAX_FORWARDED_ATTACHMENT_BYTES = 10_000_000;

export function hasSupportRecipient(recipients = []) {
  return recipients.some(
    (recipient) => String(recipient).trim().toLowerCase() === SUPPORT_ADDRESS,
  );
}

export function getReplyAddress(email, eventData) {
  const explicitReplyTo = email?.reply_to?.find(Boolean);
  return explicitReplyTo || eventData?.from || null;
}

export function getMissingEnvironment(env = process.env) {
  return ['RESEND_API_KEY', 'RESEND_WEBHOOK_SECRET', 'SUPPORT_FORWARD_TO'].filter(
    (name) => !env[name]?.trim(),
  );
}

export function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function createForwardContent(email, attachmentsOmitted = false) {
  const sender = email?.from || 'Unknown sender';
  const subject = email?.subject || '(no subject)';
  const attachmentNotice = attachmentsOmitted
    ? '\n\n[Attachments were omitted because their combined size exceeded the 10 MB support limit.]'
    : '';
  const textBody =
    email?.text || 'This message contained HTML content. View the HTML version in Gmail.';

  return {
    subject: `[Streaming Helper support] ${subject}`,
    text: [
      `Support request from: ${sender}`,
      `Original subject: ${subject}`,
      '',
      textBody,
      attachmentNotice,
    ].join('\n'),
    html: `
      <div style="font-family:Arial,sans-serif;color:#17151f">
        <div style="padding:12px 16px;margin-bottom:20px;border:1px solid #ded9eb;border-radius:10px;background:#f7f5fb">
          <strong>Streaming Helper support request</strong><br />
          <span>From: ${escapeHtml(sender)}</span><br />
          <span>Subject: ${escapeHtml(subject)}</span>
        </div>
        ${email?.html || `<p>${escapeHtml(textBody).replaceAll('\n', '<br />')}</p>`}
        ${
          attachmentsOmitted
            ? '<p><em>Attachments were omitted because their combined size exceeded the 10 MB support limit.</em></p>'
            : ''
        }
      </div>
    `.trim(),
  };
}

export async function readRawBody(request, limit = MAX_WEBHOOK_BYTES) {
  const chunks = [];
  let length = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;

    if (length > limit) {
      const error = new Error('Webhook payload is too large');
      error.code = 'PAYLOAD_TOO_LARGE';
      throw error;
    }

    chunks.push(buffer);
  }

  return Buffer.concat(chunks).toString('utf8');
}
