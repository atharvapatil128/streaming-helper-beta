import { track } from '@vercel/analytics';

type AnalyticsWindow = Window & {
  gtag?: (...args: unknown[]) => void;
};

export type AcquisitionEventName =
  | 'account_created'
  | 'extension_install_clicked'
  | 'friend_connected'
  | 'first_recommendation_sent';

/**
 * Sends deliberately sparse acquisition milestones to the analytics providers.
 * Never attach titles, recommendation IDs, friend identifiers, usernames, or email addresses.
 */
export function trackAcquisitionEvent(
  name: AcquisitionEventName,
  data: Record<string, string | number | boolean> = {},
) {
  if (typeof window === 'undefined') return;
  const analyticsWindow = window as AnalyticsWindow;
  analyticsWindow.gtag?.('event', name, data);
  track(name, data);
}

export function trackMilestoneOnce(
  userId: string,
  name: Extract<AcquisitionEventName, 'friend_connected' | 'first_recommendation_sent'>,
  data: Record<string, string | number | boolean> = {},
) {
  const key = `streaming-helper:${name}:${userId}`;
  try {
    if (window.localStorage.getItem(key)) return;
    trackAcquisitionEvent(name, data);
    window.localStorage.setItem(key, '1');
  } catch {
    trackAcquisitionEvent(name, data);
  }
}
