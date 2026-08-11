import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizeAcquisitionData } from './acquisitionAnalytics.ts';

test('keeps only event-specific acquisition properties', () => {
  assert.deepEqual(
    sanitizeAcquisitionData('friend_request_sent', {
      method: 'username',
      source: 'activation_checklist',
      email: 'private@example.com',
      title: 'Private title',
      friend_id: 'private-id',
    }),
    { method: 'username', source: 'activation_checklist' },
  );
});

test('drops identifiers and recommendation details', () => {
  assert.deepEqual(
    sanitizeAcquisitionData('first_recommendation_sent', {
      recommendation_id: 'private-id',
      recipient: 'private-user',
    }),
    {},
  );
});

test('allows only coarse extension connection properties', () => {
  assert.deepEqual(
    sanitizeAcquisitionData('extension_connection_observed', {
      source: 'activation_checklist',
      state: 'installed_signed_in',
      extension_id: 'private-extension-id',
      username: 'private-user',
    }),
    { source: 'activation_checklist', state: 'installed_signed_in' },
  );
});
