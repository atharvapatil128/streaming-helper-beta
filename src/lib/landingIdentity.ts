export type LandingIdentity =
  | { status: 'checking' | 'signed-out' }
  | {
      status: 'signed-in';
      displayName: string | null;
      username: string | null;
    };

export const DEFAULT_LANDING_CTA_LABEL = 'Get started free';

function cleanLabel(value: string | null): string | null {
  const cleaned = value?.trim();
  return cleaned || null;
}

/**
 * Resolve a safe, user-facing dashboard CTA. Email is deliberately excluded:
 * the public landing page should never surface an account email as identity UI.
 */
export function getLandingDashboardLabel(identity: LandingIdentity): string {
  if (identity.status !== 'signed-in') return DEFAULT_LANDING_CTA_LABEL;

  const displayName = cleanLabel(identity.displayName);
  if (displayName) return displayName;

  const username = cleanLabel(identity.username)?.replace(/^@+/, '');
  return username ? `@${username}` : 'Open dashboard';
}

