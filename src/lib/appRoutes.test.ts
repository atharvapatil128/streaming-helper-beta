import assert from 'node:assert/strict';
import test from 'node:test';
import {
  shouldShowEditorialMotionPreview,
  shouldShowDashboardPreview,
  shouldShowMarketingLanding,
  shouldShowNightConsoleConcept,
} from './appRoutes.ts';

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

test('isolates the Night Console concept from production routes', () => {
  assert.equal(shouldShowNightConsoleConcept('/concept/night-console'), true);
  assert.equal(shouldShowNightConsoleConcept('/'), false);
  assert.equal(shouldShowNightConsoleConcept('/app'), false);
});

test('isolates the editorial motion preview from production routes', () => {
  assert.equal(shouldShowEditorialMotionPreview('/preview/editorial-motion'), true);
  assert.equal(shouldShowEditorialMotionPreview('/'), false);
  assert.equal(shouldShowEditorialMotionPreview('/app'), false);
});

test('allows the dashboard demo only on local and Vercel preview hosts', () => {
  assert.equal(
    shouldShowDashboardPreview('/preview/dashboard', 'localhost'),
    true,
  );
  assert.equal(
    shouldShowDashboardPreview(
      '/preview/dashboard',
      'streaming-helper-example.vercel.app',
    ),
    true,
  );
  assert.equal(
    shouldShowDashboardPreview('/preview/dashboard', 'streaminghelper.net'),
    false,
  );
  assert.equal(
    shouldShowDashboardPreview('/app', 'streaming-helper-example.vercel.app'),
    false,
  );
});
