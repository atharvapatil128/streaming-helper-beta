import { track } from '@vercel/analytics';
import { initializeGoogleAnalytics } from './googleAnalytics.ts';

type AnalyticsWindow = Window & {
  gtag?: (...args: unknown[]) => void;
};

export type AcquisitionEventName =
  | 'account_created'
  | 'extension_install_clicked'
  | 'extension_connection_observed'
  | 'friend_request_sent'
  | 'invitation_sent'
  | 'invitation_accepted'
  | 'friend_connected'
  | 'first_recommendation_sent'
  | 'activation_step_clicked';

type AnalyticsValue = string | number | boolean;

const allowedProperties: Record<AcquisitionEventName, ReadonlySet<string>> = {
  account_created: new Set(['method']),
  extension_install_clicked: new Set(['source']),
  extension_connection_observed: new Set(['source', 'state']),
  friend_request_sent: new Set(['method', 'source']),
  invitation_sent: new Set(['source']),
  invitation_accepted: new Set(['source']),
  friend_connected: new Set(['source']),
  first_recommendation_sent: new Set(['source']),
  activation_step_clicked: new Set(['action', 'state']),
};

export function sanitizeAcquisitionData(
  name: AcquisitionEventName,
  data: Record<string, AnalyticsValue>,
): Record<string, AnalyticsValue> {
  const allowed = allowedProperties[name];
  return Object.fromEntries(Object.entries(data).filter(([key]) => allowed.has(key)));
}

/**
 * Sends deliberately sparse acquisition milestones to the analytics providers.
 * Never attach titles, recommendation IDs, friend identifiers, usernames, or email addresses.
 */
export function trackAcquisitionEvent(
  name: AcquisitionEventName,
  data: Record<string, AnalyticsValue> = {},
) {
  if (typeof window === 'undefined') return;
  const safeData = sanitizeAcquisitionData(name, data);
  const analyticsWindow = window as AnalyticsWindow;

  // Dashboard milestones can run before React effects mount the private
  // analytics component. Queue GA synchronously so first-time events are not
  // lost before trackMilestoneOnce records their local deduplication marker.
  if (
    !analyticsWindow.gtag &&
    /^(?:www\.)?streaminghelper\.net$/i.test(window.location.hostname) &&
    window.location.pathname === '/app'
  ) {
    initializeGoogleAnalytics({ sendPageView: false });
  }

  analyticsWindow.gtag?.('event', name, safeData);
  track(name, safeData);
}

export function trackMilestoneOnce(
  userId: string,
  name: Extract<AcquisitionEventName, 'friend_connected' | 'first_recommendation_sent'>,
  data: Record<string, AnalyticsValue> = {},
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
