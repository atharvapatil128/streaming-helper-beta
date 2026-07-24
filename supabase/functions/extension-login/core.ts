export const MAX_LOGIN_BODY_BYTES = 4_096;
export const MAX_IDENTIFIER_LENGTH = 254;
export const MAX_PASSWORD_LENGTH = 1_024;

export type LoginInput = {
  identifier: string;
  normalizedIdentifier: string;
  kind: "email" | "username";
  password: string;
};

export class RequestValidationError extends Error {
  constructor(
    readonly code:
      | "INVALID_CONTENT_TYPE"
      | "PAYLOAD_TOO_LARGE"
      | "INVALID_JSON"
      | "INVALID_REQUEST",
  ) {
    super(code);
  }
}

export function parseAllowedOrigins(raw: string | undefined): ReadonlySet<string> {
  if (!raw) return new Set();

  const origins = raw.split(",").map((value) => value.trim()).filter(Boolean);
  const valid = origins.filter((origin) => {
    try {
      const url = new URL(origin);
      return (
        url.protocol === "chrome-extension:" &&
        /^[a-p]{32}$/.test(url.hostname) &&
        url.pathname === "" &&
        url.search === "" &&
        url.hash === ""
      );
    } catch {
      return false;
    }
  });
  return new Set(valid);
}

export function allowedCorsOrigin(
  requestOrigin: string | null,
  allowedOrigins: ReadonlySet<string>,
): string | null {
  return requestOrigin && allowedOrigins.has(requestOrigin) ? requestOrigin : null;
}

export function isJsonContentType(value: string | null): boolean {
  if (!value) return false;
  return /^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(value.trim());
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalizeUsername(value: string): string | null {
  const normalized = value.trim().replace(/^@/, "").toLowerCase();
  if (
    normalized.length < 3 ||
    normalized.length > 30 ||
    !/^[a-z0-9_]+$/.test(normalized) ||
    normalized.startsWith("_") ||
    normalized.endsWith("_") ||
    normalized.includes("__") ||
    /^[0-9]+$/.test(normalized)
  ) {
    return null;
  }
  return normalized;
}

function normalizeEmail(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  if (
    normalized.length === 0 ||
    normalized.length > MAX_IDENTIFIER_LENGTH ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
  ) {
    return null;
  }
  return normalized;
}

export function parseLoginInput(value: unknown): LoginInput {
  if (!isPlainObject(value)) throw new RequestValidationError("INVALID_REQUEST");
  const keys = Object.keys(value);
  if (keys.length !== 2 || !keys.includes("identifier") || !keys.includes("password")) {
    throw new RequestValidationError("INVALID_REQUEST");
  }
  if (typeof value.identifier !== "string" || typeof value.password !== "string") {
    throw new RequestValidationError("INVALID_REQUEST");
  }
  if (
    value.identifier.length === 0 ||
    value.identifier.length > MAX_IDENTIFIER_LENGTH ||
    value.password.length === 0 ||
    value.password.length > MAX_PASSWORD_LENGTH
  ) {
    throw new RequestValidationError("INVALID_REQUEST");
  }

  const email = value.identifier.includes("@") && !value.identifier.trim().startsWith("@")
    ? normalizeEmail(value.identifier)
    : null;
  if (email) {
    return {
      identifier: value.identifier,
      normalizedIdentifier: email,
      kind: "email",
      password: value.password,
    };
  }

  const username = normalizeUsername(value.identifier);
  if (!username) throw new RequestValidationError("INVALID_REQUEST");
  return {
    identifier: value.identifier,
    normalizedIdentifier: username,
    kind: "username",
    password: value.password,
  };
}

export async function readJsonBody(req: Request, maxBytes: number): Promise<unknown> {
  if (!isJsonContentType(req.headers.get("content-type"))) {
    throw new RequestValidationError("INVALID_CONTENT_TYPE");
  }

  const declaredLength = req.headers.get("content-length");
  if (declaredLength) {
    const parsedLength = Number(declaredLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0 || parsedLength > maxBytes) {
      throw new RequestValidationError("PAYLOAD_TOO_LARGE");
    }
  }

  const reader = req.body?.getReader();
  if (!reader) throw new RequestValidationError("INVALID_JSON");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new RequestValidationError("PAYLOAD_TOO_LARGE");
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new RequestValidationError("INVALID_JSON");
  }
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim();
  return forwarded || req.headers.get("cf-connecting-ip")?.trim() ||
    req.headers.get("x-real-ip")?.trim() || "unknown";
}

export function rateLimitStatus(value: unknown): "ALLOWED" | "RATE_LIMITED" | null {
  const first = Array.isArray(value) ? value[0] : value;
  if (first === "ALLOWED" || first === "RATE_LIMITED") return first;
  if (
    first && typeof first === "object" && "status" in first &&
    ((first as { status?: unknown }).status === "ALLOWED" ||
      (first as { status?: unknown }).status === "RATE_LIMITED")
  ) {
    return (first as { status: "ALLOWED" | "RATE_LIMITED" }).status;
  }
  return null;
}

export function isConfirmedPasswordUser(user: unknown): boolean {
  if (!isPlainObject(user) || typeof user.id !== "string" || !user.id) return false;
  if (
    typeof user.email !== "string" || !user.email || typeof user.email_confirmed_at !== "string"
  ) {
    return false;
  }

  const appMetadata = isPlainObject(user.app_metadata) ? user.app_metadata : {};
  const providers = Array.isArray(appMetadata.providers) ? appMetadata.providers : [];
  const identities = Array.isArray(user.identities) ? user.identities : [];
  return providers.includes("email") ||
    identities.some((identity) =>
      isPlainObject(identity) && (identity.provider === "email" || identity.provider === "password")
    );
}

export function publicSession(payload: unknown): Record<string, unknown> | null {
  if (!isPlainObject(payload) || !isConfirmedPasswordUser(payload.user)) return null;
  if (
    typeof payload.access_token !== "string" ||
    typeof payload.refresh_token !== "string" ||
    typeof payload.expires_in !== "number" ||
    typeof payload.expires_at !== "number"
  ) {
    return null;
  }
  return {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    expires_in: payload.expires_in,
    expires_at: payload.expires_at,
    user: { id: (payload.user as { id: string }).id },
  };
}
