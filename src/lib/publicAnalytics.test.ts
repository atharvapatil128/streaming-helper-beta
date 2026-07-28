import assert from "node:assert/strict";
import test from "node:test";

import {
  isValidGoogleMeasurementId,
  shouldEnablePublicAnalytics,
} from "./publicAnalytics.ts";

test("accepts GA4 measurement IDs and rejects unrelated values", () => {
  assert.equal(isValidGoogleMeasurementId("G-ABC123XYZ"), true);
  assert.equal(isValidGoogleMeasurementId("UA-123456-1"), false);
  assert.equal(isValidGoogleMeasurementId(undefined), false);
});

test("enables analytics only on production public pages", () => {
  assert.equal(
    shouldEnablePublicAnalytics("/", "", "streaminghelper.net"),
    true,
  );
  assert.equal(
    shouldEnablePublicAnalytics("/", "", "www.streaminghelper.net"),
    true,
  );
  assert.equal(shouldEnablePublicAnalytics("/", "", "localhost"), false);
  assert.equal(
    shouldEnablePublicAnalytics("/app", "", "streaminghelper.net"),
    false,
  );
  assert.equal(
    shouldEnablePublicAnalytics("/help", "", "streaminghelper.net"),
    true,
  );
});

test("excludes sensitive root query flows from analytics", () => {
  assert.equal(
    shouldEnablePublicAnalytics(
      "/",
      "?auth=forgot",
      "streaminghelper.net",
    ),
    false,
  );
  assert.equal(
    shouldEnablePublicAnalytics(
      "/",
      "?highlight=recommendation-id",
      "streaminghelper.net",
    ),
    false,
  );
  assert.equal(
    shouldEnablePublicAnalytics(
      "/",
      "?action=accept-invite",
      "streaminghelper.net",
    ),
    false,
  );
});
