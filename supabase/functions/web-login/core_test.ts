import { allowedAppOrigin, parseAppOrigin } from "./core.ts";

Deno.test("accepts only an exact HTTPS app origin", () => {
  const configured = parseAppOrigin("https://streaminghelper.net/");
  if (configured !== "https://streaminghelper.net") {
    throw new Error("production app origin was not normalized");
  }
  if (allowedAppOrigin("https://streaminghelper.net", configured) === null) {
    throw new Error("configured app origin was rejected");
  }
  for (const origin of [
    "https://www.streaminghelper.net",
    "https://streaminghelper.net.evil.example",
    "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  ]) {
    if (allowedAppOrigin(origin, configured) !== null) {
      throw new Error(`unexpected origin accepted: ${origin}`);
    }
  }
});

Deno.test("permits loopback HTTP for local testing but rejects unsafe URLs", () => {
  if (parseAppOrigin("http://localhost:5173") !== "http://localhost:5173") {
    throw new Error("localhost origin rejected");
  }
  for (const value of [
    "http://streaminghelper.net",
    "https://user:pass@streaminghelper.net",
    "https://streaminghelper.net/path",
    "https://streaminghelper.net?query=1",
  ]) {
    if (parseAppOrigin(value) !== null) {
      throw new Error(`unsafe app URL accepted: ${value}`);
    }
  }
});
