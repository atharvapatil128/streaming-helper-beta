import { useEffect } from "react";
import { Analytics } from "@vercel/analytics/react";
import {
  isValidGoogleMeasurementId,
  shouldEnablePublicAnalytics,
} from "../../lib/publicAnalytics.ts";

type AnalyticsWindow = Window & {
  dataLayer?: unknown[][];
  gtag?: (...args: unknown[]) => void;
};

const GOOGLE_ANALYTICS_SCRIPT_ID = "streaming-helper-google-analytics";

function GoogleAnalytics({
  measurementId,
  sendPageView,
}: {
  measurementId?: string;
  sendPageView: boolean;
}) {
  useEffect(() => {
    if (!isValidGoogleMeasurementId(measurementId)) return;

    const analyticsWindow = window as AnalyticsWindow;
    analyticsWindow.dataLayer = analyticsWindow.dataLayer ?? [];
    analyticsWindow.gtag = (...args: unknown[]) => {
      analyticsWindow.dataLayer?.push(args);
    };

    analyticsWindow.gtag("js", new Date());
    analyticsWindow.gtag("config", measurementId, {
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

    if (!document.getElementById(GOOGLE_ANALYTICS_SCRIPT_ID)) {
      const script = document.createElement("script");
      script.id = GOOGLE_ANALYTICS_SCRIPT_ID;
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(
        measurementId,
      )}`;
      document.head.appendChild(script);
    }
  }, [measurementId, sendPageView]);

  return null;
}

export function PublicAnalytics() {
  const analyticsEnabled = shouldEnablePublicAnalytics(
    window.location.pathname,
    window.location.search,
    window.location.hostname,
  );

  if (!analyticsEnabled) return null;

  return (
    <>
      <Analytics />
      <GoogleAnalytics
        measurementId={import.meta.env.VITE_GA_MEASUREMENT_ID}
        sendPageView
      />
    </>
  );
}

/** Loads GA for milestone events inside private routes without recording a page view. */
export function PrivateAcquisitionAnalytics() {
  return (
    <>
      <Analytics />
      <GoogleAnalytics
        measurementId={import.meta.env.VITE_GA_MEASUREMENT_ID}
        sendPageView={false}
      />
    </>
  );
}
