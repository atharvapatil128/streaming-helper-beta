import { isValidGoogleMeasurementId } from './publicAnalytics.ts';

type AnalyticsWindow = Window & {
  dataLayer?: unknown[][];
  gtag?: (...args: unknown[]) => void;
};

const GOOGLE_ANALYTICS_SCRIPT_ID = 'streaming-helper-google-analytics';
export const DEFAULT_GOOGLE_MEASUREMENT_ID = 'G-WVTF1FR05D';

export function resolveGoogleMeasurementId(configuredId?: string) {
  return isValidGoogleMeasurementId(configuredId)
    ? configuredId.trim()
    : DEFAULT_GOOGLE_MEASUREMENT_ID;
}

export function initializeGoogleAnalytics({
  measurementId,
  sendPageView,
}: {
  measurementId?: string;
  sendPageView: boolean;
}) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const resolvedMeasurementId = resolveGoogleMeasurementId(measurementId);
  const analyticsWindow = window as AnalyticsWindow;
  analyticsWindow.dataLayer = analyticsWindow.dataLayer ?? [];
  analyticsWindow.gtag = analyticsWindow.gtag ?? ((...args: unknown[]) => {
    analyticsWindow.dataLayer?.push(args);
  });

  analyticsWindow.gtag('js', new Date());
  analyticsWindow.gtag('config', resolvedMeasurementId, {
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    send_page_view: sendPageView,
    ...(sendPageView
      ? {
          page_location: `${window.location.origin}${window.location.pathname}`,
          page_path: window.location.pathname,
          page_title: document.title,
        }
      : {}),
  });

  if (document.getElementById(GOOGLE_ANALYTICS_SCRIPT_ID)) return;

  const script = document.createElement('script');
  script.id = GOOGLE_ANALYTICS_SCRIPT_ID;
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(
    resolvedMeasurementId,
  )}`;
  document.head.appendChild(script);
}
