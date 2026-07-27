import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SUPPORT_ADDRESS,
  createForwardContent,
  getMissingEnvironment,
  getReplyAddress,
  hasSupportRecipient,
} from './supportEmail.js';

test('accepts only the public support address', () => {
  assert.equal(hasSupportRecipient([SUPPORT_ADDRESS]), true);
  assert.equal(hasSupportRecipient(['HELP@STREAMINGHELPER.NET']), true);
  assert.equal(hasSupportRecipient(['billing@streaminghelper.net']), false);
  assert.equal(hasSupportRecipient([]), false);
});

test('prefers an explicit reply-to address', () => {
  assert.equal(
    getReplyAddress(
      { reply_to: ['reply@example.com'] },
      { from: 'sender@example.com' },
    ),
    'reply@example.com',
  );
  assert.equal(
    getReplyAddress({ reply_to: [] }, { from: 'sender@example.com' }),
    'sender@example.com',
  );
});

test('reports missing server configuration without exposing values', () => {
  assert.deepEqual(
    getMissingEnvironment({
      RESEND_API_KEY: 'key',
      RESEND_WEBHOOK_SECRET: '',
      SUPPORT_FORWARD_TO: 'owner@example.com',
    }),
    ['RESEND_WEBHOOK_SECRET'],
  );
});

test('creates a safe forwarding header and attachment notice', () => {
  const content = createForwardContent(
    {
      from: '<script>alert(1)</script>',
      subject: 'Help needed',
      text: 'The extension is not loading.',
      html: '<p>The extension is not loading.</p>',
    },
    true,
  );

  assert.match(content.subject, /Help needed/);
  assert.doesNotMatch(
    content.html.split('<p>The extension')[0],
    /<script>alert/,
  );
  assert.match(content.html, /&lt;script&gt;/);
  assert.match(content.text, /Attachments were omitted/);
});
