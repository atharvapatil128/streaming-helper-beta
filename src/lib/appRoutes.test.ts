import assert from 'node:assert/strict';
import test from 'node:test';
import {
  shouldShowEditorialMotionPreview,
  shouldShowHelpPage,
  shouldShowPrivacyPage,
  shouldShowPublicSearchPage,
  isKnownApplicationRoute,
  isPrivateAppRoute,
  shouldShowMarketingLanding,
  shouldShowNightConsoleConcept,
} from './appRoutes.ts';

test('shows the public landing page only at the root path', () => {
  assert.equal(shouldShowMarketingLanding('/', ''), true);
  assert.equal(shouldShowMarketingLanding('/app', ''), false);
  assert.equal(shouldShowMarketingLanding('/privacy', ''), false);
  assert.equal(shouldShowMarketingLanding('/help', ''), false);
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

test('routes the public help page independently from the app', () => {
  assert.equal(shouldShowHelpPage('/help'), true);
  assert.equal(shouldShowHelpPage('/'), false);
  assert.equal(shouldShowHelpPage('/app'), false);
});

test('routes privacy and substantive public search pages independently', () => {
  assert.equal(shouldShowPrivacyPage('/privacy'), true);
  assert.equal(shouldShowPublicSearchPage('/how-it-works'), true);
  assert.equal(shouldShowPublicSearchPage('/extension-permissions/'), true);
  assert.equal(shouldShowPublicSearchPage('/made-up-page'), false);
});

test('identifies private and unknown routes without treating unknown routes as the app', () => {
  assert.equal(isPrivateAppRoute('/app', ''), true);
  assert.equal(isPrivateAppRoute('/invite/token', ''), true);
  assert.equal(isPrivateAppRoute('/update-password', ''), true);
  assert.equal(isPrivateAppRoute('/', '?auth=forgot'), true);
  assert.equal(isKnownApplicationRoute('/not-a-real-route', ''), false);
});
