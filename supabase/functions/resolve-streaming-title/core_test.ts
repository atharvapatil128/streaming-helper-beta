import {
  allowedCorsOrigin,
  chooseCandidate,
  normalizeTitle,
  parseAllowedOrigins,
  parseResolveInput,
  resolutionResult,
  TmdbCandidate,
} from "./core.ts";

Deno.test("strictly validates and normalizes resolution input", () => {
  const parsed = parseResolveInput({
    detectedTitle: "  The Bear  ",
    platform: " Hulu ",
    mediaTypeHint: "tv",
  });
  if (
    parsed.detectedTitle !== "The Bear" || parsed.platform !== "Hulu" ||
    parsed.mediaTypeHint !== "series"
  ) throw new Error("input was not normalized");

  for (
    const invalid of [
      { detectedTitle: "" },
      { detectedTitle: "Title", extra: true },
      { detectedTitle: "Title", mediaTypeHint: "documentary" },
      { detectedTitle: "Bad\nTitle" },
    ]
  ) {
    let rejected = false;
    try {
      parseResolveInput(invalid);
    } catch {
      rejected = true;
    }
    if (!rejected) throw new Error("invalid input accepted");
  }
});

Deno.test("origin allowlist never reflects arbitrary web origins", () => {
  const origins = parseAllowedOrigins("chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  if (
    allowedCorsOrigin("chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", origins) === null
  ) throw new Error("configured extension rejected");
  if (allowedCorsOrigin("https://attacker.example", origins) !== null) {
    throw new Error("arbitrary origin allowed");
  }
});

Deno.test("title normalization handles punctuation, accents, ampersands, and years", () => {
  if (normalizeTitle("Amélie (2001)") !== "amelie") throw new Error("accent/year mismatch");
  if (normalizeTitle("Dungeons & Dragons") !== "dungeons and dragons") {
    throw new Error("ampersand mismatch");
  }
});

Deno.test("chooses an exact candidate using type and year hints", () => {
  const candidates: TmdbCandidate[] = [
    {
      id: 1,
      media_type: "movie",
      title: "The Bear",
      release_date: "1988-01-01",
      vote_count: 500,
    },
    {
      id: 2,
      media_type: "tv",
      name: "The Bear",
      first_air_date: "2022-06-23",
      poster_path: "/safe.jpg",
      vote_count: 1000,
    },
  ];
  const result = chooseCandidate(
    { detectedTitle: "The Bear (2022)", platform: "Hulu", mediaTypeHint: "series" },
    candidates,
  );
  if (result?.tmdbId !== 2 || result.mediaType !== "series" || result.year !== "2022") {
    throw new Error("wrong candidate selected");
  }
});

Deno.test("returns no match for ambiguous duplicate candidates", () => {
  const candidates: TmdbCandidate[] = [
    { id: 10, media_type: "movie", title: "Crash", release_date: "1996-01-01", vote_count: 500 },
    { id: 11, media_type: "movie", title: "Crash", release_date: "2005-01-01", vote_count: 550 },
  ];
  const result = chooseCandidate(
    { detectedTitle: "Crash", platform: null, mediaTypeHint: "movie" },
    candidates,
  );
  if (result !== null) throw new Error("ambiguous title should not resolve");
});

Deno.test("rejects weak fuzzy matches and strips unsafe image paths", () => {
  const weak = chooseCandidate(
    { detectedTitle: "A Completely Different Show", platform: null, mediaTypeHint: null },
    [{ id: 20, media_type: "tv", name: "Different", first_air_date: "2020-01-01" }],
  );
  if (weak !== null) throw new Error("weak match accepted");

  const safe = chooseCandidate(
    { detectedTitle: "Arrival 2016", platform: null, mediaTypeHint: "movie" },
    [{
      id: 21,
      media_type: "movie",
      title: "Arrival",
      release_date: "2016-11-11",
      poster_path: "https://attacker.example/image",
    }],
  );
  if (!safe || safe.posterPath !== null) throw new Error("unsafe path escaped");
});

Deno.test("unresolved titles use the documented 404 contract", () => {
  const result = resolutionResult(null);
  if (
    result.status !== 404 ||
    result.body.error !== "TITLE_NOT_RESOLVED"
  ) throw new Error("unresolved contract changed");
});

Deno.test("resolved title payload uses only bounded canonical output", () => {
  const result = resolutionResult({
    tmdbId: 21,
    mediaType: "movie",
    title: "Arrival",
    year: "2016",
    posterPath: "/arrival.jpg",
    backdropPath: null,
  });
  if (
    result.status !== 200 ||
    result.body.thumbnailUrl !== "https://image.tmdb.org/t/p/w500/arrival.jpg"
  ) throw new Error("resolved output contract changed");
});
