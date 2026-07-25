import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldShowMarketingLanding } from './appRoutes.ts';

test('shows the public landing page only at the root path', () => {
  assert.equal(shouldShowMarketingLanding('/', ''), true);
  assert.equal(shouldShowMarketingLanding('/app', ''), false);
  assert.equal(shouldShowMarketingLanding('/privacy', ''), false);
  assert.equal(shouldShowMarketingLanding('/update-password', ''), false);
  assert.equal(shouldShowMarketingLanding('/invite/example', ''), false);
});

test('preserves the legacy root forgot-password entry point', () => {
  assert.equal(shouldShowMarketingLanding('/', '?auth=forgot'), false);
  assert.equal(shouldShowMarketingLanding('/', '?utm_source=extension&auth=forgot'), false);
});

test('preserves existing email deep links at the root path', () => {
  assert.equal(shouldShowMarketingLanding('/', '?highlight=rec:example'), false);
  assert.equal(shouldShowMarketingLanding('/', '?action=friend-requests'), false);
  assert.equal(shouldShowMarketingLanding('/', '?action=notification-settings'), false);
  assert.equal(shouldShowMarketingLanding('/', '?utm_source=launch'), true);
});
