import { Resend } from 'resend';
import {
  MAX_FORWARDED_ATTACHMENT_BYTES,
  SUPPORT_ADDRESS,
  createForwardContent,
  getMissingEnvironment,
  getReplyAddress,
  hasSupportRecipient,
  readRawBody,
} from '../server/supportEmail.js';

function respond(response, statusCode, body) {
  response.statusCode = statusCode;
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(body));
}

async function loadAttachments(resend, emailId) {
  const { data, error } = await resend.emails.receiving.attachments.list({
    emailId,
  });

  if (error) {
    throw new Error(`Unable to list inbound attachments: ${error.message}`);
  }

  const metadata = data?.data || [];
  const totalBytes = metadata.reduce(
    (sum, attachment) => sum + (attachment.size || 0),
    0,
  );

  if (totalBytes > MAX_FORWARDED_ATTACHMENT_BYTES) {
    return { attachments: [], omitted: true };
  }

  const attachments = await Promise.all(
    metadata.map(async (attachment) => {
      const download = await fetch(attachment.download_url);

      if (!download.ok) {
        throw new Error('Unable to download an inbound attachment');
      }

      return {
        content: Buffer.from(await download.arrayBuffer()),
        filename: attachment.filename,
        contentType: attachment.content_type,
        contentId: attachment.content_id || undefined,
      };
    }),
  );

  return { attachments, omitted: false };
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return respond(response, 405, { error: 'Method not allowed' });
  }

  const missingEnvironment = getMissingEnvironment();
  if (missingEnvironment.length > 0) {
    console.error('Support forwarding is missing required server configuration.');
    return respond(response, 503, { error: 'Support forwarding is unavailable' });
  }

  let rawPayload;
  try {
    rawPayload = await readRawBody(request);
  } catch (error) {
    const statusCode = error?.code === 'PAYLOAD_TOO_LARGE' ? 413 : 400;
    return respond(response, statusCode, { error: 'Invalid webhook payload' });
  }

  const id = request.headers['svix-id'];
  const timestamp = request.headers['svix-timestamp'];
  const signature = request.headers['svix-signature'];

  if (!id || !timestamp || !signature) {
    return respond(response, 400, { error: 'Missing webhook signature' });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  let event;

  try {
    event = resend.webhooks.verify({
      payload: rawPayload,
      headers: { id, timestamp, signature },
      webhookSecret: process.env.RESEND_WEBHOOK_SECRET,
    });
  } catch {
    return respond(response, 400, { error: 'Invalid webhook signature' });
  }

  if (event.type !== 'email.received') {
    return respond(response, 200, { status: 'ignored' });
  }

  if (!hasSupportRecipient(event.data.to)) {
    return respond(response, 200, { status: 'ignored' });
  }

  try {
    const { data: email, error: emailError } =
      await resend.emails.receiving.get(event.data.email_id);

    if (emailError || !email) {
      throw new Error(`Unable to retrieve inbound email: ${emailError?.message}`);
    }

    const replyTo = getReplyAddress(email, event.data);
    if (!replyTo) {
      throw new Error('Inbound email does not contain a reply address');
    }

    const { attachments, omitted } = await loadAttachments(
      resend,
      event.data.email_id,
    );
    const content = createForwardContent(email, omitted);

    const { error: forwardError } = await resend.emails.send(
      {
        from: `Streaming Helper Support <${SUPPORT_ADDRESS}>`,
        to: [process.env.SUPPORT_FORWARD_TO],
        replyTo,
        subject: content.subject,
        text: content.text,
        html: content.html,
        attachments,
      },
      {
        idempotencyKey: `support-forward/${event.data.email_id}`,
      },
    );

    if (forwardError) {
      throw new Error(`Unable to forward inbound email: ${forwardError.message}`);
    }

    return respond(response, 200, { status: 'forwarded' });
  } catch (error) {
    console.error('Support email forwarding failed.', {
      eventId: id,
      reason: error instanceof Error ? error.message : 'Unknown error',
    });
    return respond(response, 500, { error: 'Unable to forward support email' });
  }
}
