import { useEffect } from "react";
import { Analytics } from "@vercel/analytics/react";
import { shouldEnablePublicAnalytics } from "../../lib/publicAnalytics.ts";
import { initializeGoogleAnalytics } from "../../lib/googleAnalytics.ts";

function GoogleAnalytics({
  measurementId,
  sendPageView,
}: {
  measurementId?: string;
  sendPageView: boolean;
}) {
  useEffect(() => {
    initializeGoogleAnalytics({ measurementId, sendPageView });
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

  // GA4 is installed directly in the pre-rendered public document head so
  // Google can detect it before the React application starts.
  return <Analytics />;
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
