import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveActivationState } from './activationState.ts';

test('derives acquisition state from backend-confirmed counts', () => {
  assert.equal(deriveActivationState({ isLoading: true, friendCount: 0, pendingInvitationCount: 0, sentRecommendationCount: 0 }).status, 'loading');
  assert.equal(deriveActivationState({ isLoading: false, friendCount: 0, pendingInvitationCount: 0, sentRecommendationCount: 0 }).status, 'needs_friend');
  assert.equal(deriveActivationState({ isLoading: false, friendCount: 0, pendingInvitationCount: 1, sentRecommendationCount: 0 }).status, 'waiting_for_friend');
  assert.equal(deriveActivationState({ isLoading: false, friendCount: 1, pendingInvitationCount: 0, sentRecommendationCount: 0 }).status, 'needs_recommendation');
  assert.equal(deriveActivationState({ isLoading: false, friendCount: 1, pendingInvitationCount: 0, sentRecommendationCount: 1 }).status, 'activated');
});

test('a sent recommendation is the terminal activation signal', () => {
  assert.deepEqual(
    deriveActivationState({ isLoading: false, friendCount: 0, pendingInvitationCount: 0, sentRecommendationCount: 2 }),
    { status: 'activated', completedSteps: 3, totalSteps: 3 },
  );
});
