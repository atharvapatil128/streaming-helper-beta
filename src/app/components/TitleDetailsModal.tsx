import { useEffect, useState } from 'react';
import { X, Star, Clock, ExternalLink, Play } from 'lucide-react';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { FriendAvatar } from './FriendAvatar';
import { fetchTmdbOverview } from '../../lib/tmdb';
import type { Recommendation } from '../../types';

interface TitleDetailsModalProps {
  recommendation: Recommendation;
  /** 'received' — shows "Recommended by …"; 'sent' — shows "Sent to …" */
  cardVariant?: 'received' | 'sent';
  onClose: () => void;
}

const platformColors: Record<string, { bg: string; text: string }> = {
  'Netflix':     { bg: 'bg-[#e50914]', text: 'text-white' },
  'Prime Video': { bg: 'bg-[#00a8e1]', text: 'text-white' },
  'Disney+':     { bg: 'bg-[#0063e5]', text: 'text-white' },
  'HBO Max':     { bg: 'bg-[#7851a9]', text: 'text-white' },
  'Apple TV+':   { bg: 'bg-[#555555]', text: 'text-white' },
  'Hulu':        { bg: 'bg-[#1ce783]', text: 'text-black' },
};

function buildTmdbUrl(
  tmdbId: number | null | undefined,
  type: 'movie' | 'series' | null | undefined,
): string | null {
  if (!tmdbId || !type) return null;
  return `https://www.themoviedb.org/${type === 'series' ? 'tv' : 'movie'}/${tmdbId}`;
}

export function TitleDetailsModal({
  recommendation: rec,
  cardVariant = 'received',
  onClose,
}: TitleDetailsModalProps) {
  const [overview, setOverview] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchTmdbOverview(rec.tmdbId, rec.type).then((ov) => {
      if (!cancelled) setOverview(ov);
    });
    return () => { cancelled = true; };
  }, [rec.tmdbId, rec.type]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const rating      = rec.rating != null ? rec.rating.toFixed(1) : null;
  const tmdbUrl     = buildTmdbUrl(rec.tmdbId, rec.type);
  const personLabel = cardVariant === 'sent'
    ? `Sent to ${rec.sourceName}`
    : `Recommended by ${rec.sourceName}`;

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      {/*
        Modal shell
        ─ max-w-[860px]: wide enough for two columns without being full-screen
        ─ max-h-[85vh]: caps total height; content column scrolls internally
        ─ flex flex-col: header / body / footer stack vertically
      */}
      <div
        className="bg-[#0f0f14] border border-[#1f1f28] rounded-2xl w-full max-w-[860px] max-h-[85vh] shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >

        {/* ── Header — title + meta + close ─────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-[#1f1f28] flex-shrink-0">
          <div className="min-w-0">
            <h2 className="text-lg text-[#e4e4e7] leading-snug truncate">{rec.title}</h2>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
              {/* Media type badge */}
              <span className="px-1.5 py-0.5 bg-[#1f1f28] border border-[#2a2a35] rounded text-[11px] uppercase tracking-wide text-[#8b8b9e]">
                {rec.type}
              </span>
              {rec.year && (
                <span className="text-sm text-[#8b8b9e]">{rec.year}</span>
              )}
              {rating && (
                <span className="flex items-center gap-1 text-sm text-[#8b8b9e]">
                  <Star className="w-3 h-3 text-[#fbbf24] fill-[#fbbf24]" />
                  {rating}
                </span>
              )}
              {rec.duration && (
                <span className="flex items-center gap-1 text-sm text-[#8b8b9e]">
                  <Clock className="w-3 h-3" />
                  {rec.duration}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-[#8b8b9e] hover:text-[#e4e4e7] hover:bg-[#1f1f28] rounded-lg transition-colors flex-shrink-0 -mt-0.5"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/*
          ── Body — poster + scrollable details ──────────────────────────
          flex-1 min-h-0: critical — allows the row to shrink inside the
          max-h constraint so the details column can scroll independently.
        */}
        <div className="flex flex-col sm:flex-row flex-1 min-h-0 overflow-hidden">

          {/*
            Poster column
            ─ Mobile: full width, fixed height (landscape crop)
            ─ Desktop (sm+): fixed width ~200px, stretches to full body height
            ─ object-contain preserves the poster's aspect ratio without
              distortion; dark background fills any letterbox gaps
          */}
          <div className="w-full h-44 sm:w-52 sm:h-auto flex-shrink-0 bg-[#0a0a0f]">
            <ImageWithFallback
              src={rec.thumbnail}
              alt={rec.title}
              className="w-full h-full object-contain"
            />
          </div>

          {/* Details — scrolls only when content overflows */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 min-h-0">

            {/* Overview */}
            {overview && (
              <p className="text-sm text-[#8b8b9e] leading-relaxed">{overview}</p>
            )}

            {/* Genres */}
            {rec.genres.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {rec.genres.map((genre) => (
                  <span
                    key={genre}
                    className="px-2.5 py-1 bg-[#1f1f28] border border-[#2a2a35] rounded-lg text-xs text-[#8b8b9e]"
                  >
                    {genre}
                  </span>
                ))}
              </div>
            )}

            {/* Platforms */}
            {rec.platforms.length > 0 && (
              <div>
                <p className="text-xs text-[#8b8b9e] mb-2">Available on</p>
                <div className="flex flex-wrap gap-2">
                  {rec.platforms.map((platform) => {
                    const colors = platformColors[platform] ?? { bg: 'bg-[#5b5bd6]', text: 'text-white' };
                    return (
                      <span
                        key={platform}
                        className={`px-2.5 py-1 ${colors.bg} ${colors.text} rounded text-xs font-medium`}
                      >
                        {platform}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Person label */}
            <div className="flex items-center gap-2 pt-1 border-t border-[#1f1f28]">
              <FriendAvatar name={rec.sourceName} className="w-6 h-6 flex-shrink-0" />
              <span className="text-xs text-[#8b8b9e]">{personLabel}</span>
            </div>
          </div>
        </div>

        {/* ── Actions — always visible, never scrolled away ──────────── */}
        <div className="flex items-center gap-3 px-5 py-4 border-t border-[#1f1f28] flex-shrink-0">
          {tmdbUrl ? (
            <a
              href={tmdbUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[#5b5bd6] hover:bg-[#7c7ce8] rounded-lg text-sm text-white transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              View on TMDB
            </a>
          ) : (
            <button
              disabled
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[#1f1f28] rounded-lg text-sm text-[#8b8b9e] opacity-50 cursor-not-allowed"
            >
              <ExternalLink className="w-4 h-4" />
              View on TMDB
            </button>
          )}

          {/* Play — disabled, coming soon */}
          <button
            disabled
            title="Platform playback — coming in a future update"
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[#1f1f28] border border-[#2a2a35] rounded-lg text-sm text-[#8b8b9e] opacity-50 cursor-not-allowed"
          >
            <Play className="w-4 h-4" />
            Play
            <span className="text-[10px] px-1.5 py-0.5 bg-[#2a2a35] rounded ml-0.5">
              Soon
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
