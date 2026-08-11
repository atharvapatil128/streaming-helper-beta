export type ActivationStatus =
  | 'loading'
  | 'needs_friend'
  | 'waiting_for_friend'
  | 'needs_recommendation'
  | 'activated';

export interface ActivationInputs {
  isLoading: boolean;
  friendCount: number;
  pendingInvitationCount: number;
  sentRecommendationCount: number;
}

export interface ActivationState {
  status: ActivationStatus;
  completedSteps: number;
  totalSteps: 3;
}

/** Derives onboarding progress only from data already confirmed by the backend. */
export function deriveActivationState({
  isLoading,
  friendCount,
  pendingInvitationCount,
  sentRecommendationCount,
}: ActivationInputs): ActivationState {
  if (isLoading) return { status: 'loading', completedSteps: 1, totalSteps: 3 };
  if (sentRecommendationCount > 0) {
    return { status: 'activated', completedSteps: 3, totalSteps: 3 };
  }
  if (friendCount > 0) {
    return { status: 'needs_recommendation', completedSteps: 2, totalSteps: 3 };
  }
  if (pendingInvitationCount > 0) {
    return { status: 'waiting_for_friend', completedSteps: 1, totalSteps: 3 };
  }
  return { status: 'needs_friend', completedSteps: 1, totalSteps: 3 };
}
