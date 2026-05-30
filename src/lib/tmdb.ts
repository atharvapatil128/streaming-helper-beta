const TMDB_BASE = 'https://api.themoviedb.org/3';

// w185 — small thumbnail, used only for inline search-result previews
export const TMDB_POSTER_BASE = 'https://image.tmdb.org/t/p/w185';

// w500 — the size saved to Supabase and displayed on recommendation cards
export const TMDB_IMG_W500 = 'https://image.tmdb.org/t/p/w500';

export interface TmdbResult {
  tmdbId: number;
  mediaType: 'movie' | 'series';
  title: string;
  year: string;
  /** Full w185 URL — used only for inline search thumbnails. */
  posterUrl: string | null;
  /** Raw poster path (e.g. "/abc123.jpg"). Combine with TMDB_IMG_W500 to build card URLs. */
  posterPath: string | null;
  /** Raw backdrop path. Used as fallback when posterPath is absent. */
  backdropPath: string | null;
  overview: string;
}

/**
 * Fetch just the overview text for a single title.
 * Returns null if the API key is missing, the request fails, or tmdbId is falsy.
 * All failures are non-fatal — callers should treat null as "no overview available".
 */
export async function fetchTmdbOverview(
  tmdbId: number | null | undefined,
  type: 'movie' | 'series' | null | undefined,
): Promise<string | null> {
  const key = import.meta.env.VITE_TMDB_API_KEY as string | undefined;
  if (!key || !tmdbId || !type) return null;

  const segment = type === 'series' ? 'tv' : 'movie';
  try {
    const res = await fetch(
      `${TMDB_BASE}/${segment}/${tmdbId}?api_key=${encodeURIComponent(key)}&language=en-US`
    );
    if (!res.ok) return null;
    const data: { overview?: string } = await res.json();
    return data.overview?.trim() || null;
  } catch {
    return null;
  }
}

export async function searchMulti(query: string): Promise<TmdbResult[]> {
  const key = import.meta.env.VITE_TMDB_API_KEY as string | undefined;
  if (!key) throw new Error('VITE_TMDB_API_KEY is not set in .env.local');

  const url =
    `${TMDB_BASE}/search/multi` +
    `?api_key=${encodeURIComponent(key)}` +
    `&query=${encodeURIComponent(query)}` +
    `&include_adult=false` +
    `&language=en-US` +
    `&page=1`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`TMDB search failed (${res.status}): ${res.statusText}`);
  }

  const data: {
    results: Array<{
      id: number;
      media_type: string;
      title?: string;
      name?: string;
      release_date?: string;
      first_air_date?: string;
      poster_path?: string | null;
      backdrop_path?: string | null;
      overview?: string;
    }>;
  } = await res.json();

  return data.results
    .filter((r) => r.media_type === 'movie' || r.media_type === 'tv')
    .slice(0, 12)
    .map((r) => ({
      tmdbId:       r.id,
      mediaType:    r.media_type === 'tv' ? 'series' : 'movie',
      title:        (r.media_type === 'tv' ? r.name : r.title) ?? 'Untitled',
      year:         ((r.media_type === 'tv' ? r.first_air_date : r.release_date) ?? '').slice(0, 4),
      posterUrl:    r.poster_path ? `${TMDB_POSTER_BASE}${r.poster_path}` : null,
      posterPath:   r.poster_path ?? null,
      backdropPath: r.backdrop_path ?? null,
      overview:     r.overview ?? '',
    }));
}
