import { shouldShowMarketingLanding } from "./appRoutes.ts";

const PRODUCTION_HOSTNAMES = new Set([
  "streaminghelper.net",
  "www.streaminghelper.net",
]);

export function isValidGoogleMeasurementId(
  measurementId: string | undefined,
): measurementId is string {
  return /^G-[A-Z0-9]+$/i.test(measurementId?.trim() ?? "");
}

export function shouldEnablePublicAnalytics(
  pathname: string,
  search: string,
  hostname: string,
) {
  return (
    PRODUCTION_HOSTNAMES.has(hostname.toLowerCase()) &&
    shouldShowMarketingLanding(pathname, search)
  );
}
