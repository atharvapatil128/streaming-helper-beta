import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_LANDING_CTA_LABEL,
  getLandingDashboardLabel,
} from './landingIdentity.ts';

test('keeps the acquisition CTA while auth is unresolved or signed out', () => {
  assert.equal(
    getLandingDashboardLabel({ status: 'checking' }),
    DEFAULT_LANDING_CTA_LABEL,
  );
  assert.equal(
    getLandingDashboardLabel({ status: 'signed-out' }),
    DEFAULT_LANDING_CTA_LABEL,
  );
});

test('prefers a trimmed display name for a signed-in user', () => {
  assert.equal(
    getLandingDashboardLabel({
      status: 'signed-in',
      displayName: '  Atharva Patil  ',
      username: 'atharva_patil',
    }),
    'Atharva Patil',
  );
});

test('falls back to username without exposing email', () => {
  assert.equal(
    getLandingDashboardLabel({
      status: 'signed-in',
      displayName: null,
      username: '@atharva_patil',
    }),
    '@atharva_patil',
  );
  assert.equal(
    getLandingDashboardLabel({
      status: 'signed-in',
      displayName: ' ',
      username: null,
    }),
    'Open dashboard',
  );
});

