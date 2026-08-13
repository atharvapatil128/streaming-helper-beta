import assert from 'node:assert/strict';
import test from 'node:test';
import { OFFICIAL_EXTENSION_ID, parseExtensionConnectionResponse } from './extensionConnection.ts';

test('uses the published Chrome Web Store extension ID', () => {
  assert.equal(OFFICIAL_EXTENSION_ID, 'fnbhllmhjamdfnfjlmipkcefbjnfnhej');
});

test('accepts only a successful installed response', () => {
  assert.deepEqual(parseExtensionConnectionResponse(null), { kind: 'unavailable' });
  assert.deepEqual(parseExtensionConnectionResponse({ success: true, installed: false }), { kind: 'unavailable' });
  assert.deepEqual(
    parseExtensionConnectionResponse({ success: true, installed: true, authenticated: false, version: '0.5.2' }),
    { kind: 'installed', version: '0.5.2' },
  );
  assert.deepEqual(
    parseExtensionConnectionResponse({ success: true, installed: true, authenticated: true, version: '0.5.2' }),
    { kind: 'installed_signed_in', version: '0.5.2' },
  );
});

test('drops malformed or oversized version values', () => {
  assert.deepEqual(
    parseExtensionConnectionResponse({ success: true, installed: true, version: 'x'.repeat(41) }),
    { kind: 'installed', version: null },
  );
});
