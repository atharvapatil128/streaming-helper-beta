export const MAX_REQUEST_BODY_BYTES = 2_048;
export const MAX_TMDB_BODY_BYTES = 1_000_000;

export type MediaType = "movie" | "series";

export type ResolveInput = {
  detectedTitle: string;
  platform: string | null;
  mediaTypeHint: MediaType | null;
};

export type TmdbCandidate = {
  id?: unknown;
  media_type?: unknown;
  title?: unknown;
  name?: unknown;
  original_title?: unknown;
  original_name?: unknown;
  release_date?: unknown;
  first_air_date?: unknown;
  poster_path?: unknown;
  backdrop_path?: unknown;
  popularity?: unknown;
  vote_count?: unknown;
  adult?: unknown;
};

export type CanonicalTitle = {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  year: string | null;
  posterPath: string | null;
  backdropPath: string | null;
};

export type ResolutionResult =
  | {
    status: 200;
    body: CanonicalTitle & { thumbnailUrl: string | null };
  }
  | {
    status: 404;
    body: { error: "TITLE_NOT_RESOLVED" };
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
  return new Set(
    raw.split(",").map((value) => value.trim()).filter((origin) => {
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
    }),
  );
}

export function allowedCorsOrigin(
  requestOrigin: string | null,
  allowedOrigins: ReadonlySet<string>,
): string | null {
  return requestOrigin && allowedOrigins.has(requestOrigin) ? requestOrigin : null;
}

export function isJsonContentType(value: string | null): boolean {
  return !!value && /^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(value.trim());
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
}

function validBoundedText(value: unknown, min: number, max: number): value is string {
  return typeof value === "string" &&
    value.trim().length >= min &&
    value.trim().length <= max &&
    !hasControlCharacter(value);
}

export function parseResolveInput(value: unknown): ResolveInput {
  if (!isPlainObject(value)) throw new RequestValidationError("INVALID_REQUEST");
  const allowedKeys = new Set(["detectedTitle", "platform", "mediaTypeHint"]);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
    throw new RequestValidationError("INVALID_REQUEST");
  }
  if (!validBoundedText(value.detectedTitle, 1, 200)) {
    throw new RequestValidationError("INVALID_REQUEST");
  }
  if (
    value.platform !== undefined && value.platform !== null &&
    !validBoundedText(value.platform, 1, 80)
  ) {
    throw new RequestValidationError("INVALID_REQUEST");
  }
  if (
    value.mediaTypeHint !== undefined && value.mediaTypeHint !== null &&
    value.mediaTypeHint !== "movie" && value.mediaTypeHint !== "series" &&
    value.mediaTypeHint !== "tv"
  ) {
    throw new RequestValidationError("INVALID_REQUEST");
  }
  return {
    detectedTitle: value.detectedTitle.trim(),
    platform: typeof value.platform === "string" ? value.platform.trim() : null,
    mediaTypeHint: value.mediaTypeHint === "tv"
      ? "series"
      : value.mediaTypeHint === "movie" || value.mediaTypeHint === "series"
      ? value.mediaTypeHint
      : null,
  };
}

export async function readJsonBody(
  req: Request,
  maxBytes: number,
  requireJsonContentType = true,
): Promise<unknown> {
  if (requireJsonContentType && !isJsonContentType(req.headers.get("content-type"))) {
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

export function normalizeTitle(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(?:19|20)\d{2}\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function tokens(value: string): Set<string> {
  return new Set(value.split(" ").filter(Boolean));
}

function titleSimilarity(query: string, candidate: string): number {
  if (!query || !candidate) return 0;
  if (query === candidate) return 1;
  const left = tokens(query);
  const right = tokens(candidate);
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  const union = new Set([...left, ...right]).size;
  const jaccard = union ? intersection / union : 0;
  const containment = intersection / Math.max(1, Math.min(left.size, right.size));
  const lengthBalance = Math.min(left.size, right.size) / Math.max(left.size, right.size);
  return lengthBalance >= 0.66 ? Math.max(jaccard, containment * 0.92) : jaccard;
}

function safePath(value: unknown): string | null {
  return typeof value === "string" && /^\/[A-Za-z0-9._-]{1,200}$/.test(value) ? value : null;
}

function safeDateYear(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value.match(/^((?:19|20)\d{2})-\d{2}-\d{2}$/);
  return match?.[1] ?? null;
}

function detectedYear(value: string): string | null {
  return value.match(/\b((?:19|20)\d{2})\b/)?.[1] ?? null;
}

type Ranked = {
  canonical: CanonicalTitle;
  score: number;
  textScore: number;
  exact: boolean;
};

function rankCandidate(
  raw: TmdbCandidate,
  input: ResolveInput,
  normalizedQuery: string,
): Ranked | null {
  if (
    !Number.isSafeInteger(raw.id) || (raw.id as number) <= 0 ||
    (raw.media_type !== "movie" && raw.media_type !== "tv") ||
    raw.adult === true
  ) return null;

  const mediaType: MediaType = raw.media_type === "tv" ? "series" : "movie";
  const canonicalTitle = raw.media_type === "tv" ? raw.name : raw.title;
  if (!validBoundedText(canonicalTitle, 1, 200)) return null;

  const aliases = [
    canonicalTitle,
    raw.media_type === "tv" ? raw.original_name : raw.original_title,
  ].filter((value): value is string => validBoundedText(value, 1, 200));
  const similarities = aliases.map((alias) =>
    titleSimilarity(normalizedQuery, normalizeTitle(alias))
  );
  const textScore = Math.max(0, ...similarities);
  const exact = similarities.some((score) => score === 1);
  const queryTokenCount = tokens(normalizedQuery).size;
  if (!exact && (queryTokenCount < 2 || textScore < 0.82)) return null;

  const year = safeDateYear(raw.media_type === "tv" ? raw.first_air_date : raw.release_date);
  const queryYear = detectedYear(input.detectedTitle);
  let score = textScore * 100;
  if (input.mediaTypeHint) score += input.mediaTypeHint === mediaType ? 10 : -18;
  if (queryYear) score += queryYear === year ? 9 : -14;

  const votes = typeof raw.vote_count === "number" && Number.isFinite(raw.vote_count)
    ? Math.max(0, raw.vote_count)
    : 0;
  const popularity = typeof raw.popularity === "number" && Number.isFinite(raw.popularity)
    ? Math.max(0, raw.popularity)
    : 0;
  score += Math.min(4, Math.log10(votes + 1)) + Math.min(2, Math.log10(popularity + 1));

  return {
    canonical: {
      tmdbId: raw.id as number,
      mediaType,
      title: canonicalTitle.trim(),
      year,
      posterPath: safePath(raw.poster_path),
      backdropPath: safePath(raw.backdrop_path),
    },
    score,
    textScore,
    exact,
  };
}

export function chooseCandidate(
  input: ResolveInput,
  candidates: TmdbCandidate[],
): CanonicalTitle | null {
  const normalizedQuery = normalizeTitle(input.detectedTitle);
  if (!normalizedQuery) return null;

  const ranked = candidates
    .slice(0, 20)
    .map((candidate) => rankCandidate(candidate, input, normalizedQuery))
    .filter((candidate): candidate is Ranked => candidate !== null)
    .sort((a, b) => b.score - a.score || a.canonical.tmdbId - b.canonical.tmdbId);
  const best = ranked[0];
  if (!best || best.score < 82) return null;

  const second = ranked[1];
  if (
    second &&
    best.score - second.score < 7 &&
    Math.abs(best.textScore - second.textScore) < 0.06
  ) return null;

  return best.canonical;
}

export function resolutionResult(match: CanonicalTitle | null): ResolutionResult {
  if (!match) return { status: 404, body: { error: "TITLE_NOT_RESOLVED" } };
  return {
    status: 200,
    body: {
      ...match,
      thumbnailUrl: match.posterPath ? `https://image.tmdb.org/t/p/w500${match.posterPath}` : null,
    },
  };
}
