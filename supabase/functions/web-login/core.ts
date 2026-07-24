export function parseAppOrigin(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw.trim());
    const isLoopbackHttp =
      url.protocol === "http:" &&
      (url.hostname === "localhost" ||
        url.hostname === "127.0.0.1" ||
        url.hostname === "[::1]");
    if (
      (url.protocol !== "https:" && !isLoopbackHttp) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export function allowedAppOrigin(
  requestOrigin: string | null,
  configuredOrigin: string | null,
): string | null {
  return requestOrigin && requestOrigin === configuredOrigin ? requestOrigin : null;
}
