import { useEffect, useRef, useState } from 'react';
import {
  X, Search, Loader2, AlertCircle, Film, Tv, ChevronLeft, Check,
} from 'lucide-react';
import { searchMulti, TMDB_IMG_W500 } from '../../lib/tmdb';
import { FriendAvatar } from './FriendAvatar';
import type { TmdbResult } from '../../lib/tmdb';
import type { Friend } from '../../types';

const PLATFORMS = [
  'Netflix', 'Prime Video', 'Disney+', 'Hulu', 'HBO Max', 'Apple TV+', 'Other',
];

interface AddRecPayload {
  tmdbId: number;
  title: string;
  type: 'movie' | 'series';
  thumbnail: string;
  year: string | null;
  genres: string[];
  platform: string;
  /** Profile UUID of the friend receiving this recommendation. */
  recipientUserId: string;
}

interface AddRecommendationModalProps {
  friends: Friend[];
  /** Friend already selected in the sidebar; pre-fills the recipient picker. */
  preselectedFriend?: Friend | null;
  onAdd: (rec: AddRecPayload) => Promise<void>;
  onClose: () => void;
}

type Step = 'search' | 'details';

export function AddRecommendationModal({ friends, preselectedFriend, onAdd, onClose }: AddRecommendationModalProps) {
  const [step, setStep] = useState<Step>('search');

  // ── Search state ───────────────────────────────────────────
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TmdbResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // ── Details state ──────────────────────────────────────────
  const [selected, setSelected] = useState<TmdbResult | null>(null);
  // Initialise with preselectedFriend; falls back to first friend when step opens
  const [recipient, setRecipient] = useState<Friend | null>(preselectedFriend ?? null);
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  // ── TMDB debounce ──────────────────────────────────────────
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setSearchError(null);
      return;
    }

    setSearching(true);
    setSearchError(null);

    const timer = setTimeout(() => {
      searchMulti(query)
        .then(setResults)
        .catch((err: Error) => setSearchError(err.message))
        .finally(() => setSearching(false));
    }, 400);

    return () => clearTimeout(timer);
  }, [query]);

  // ── Keyboard ───────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (step === 'details') {
          handleBack();
        } else {
          onClose();
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [step, onClose]);

  // ── Handlers ──────────────────────────────────────────────
  const handleSelectResult = (result: TmdbResult) => {
    setSelected(result);
    // Keep the pre-selected friend if set; otherwise default to first friend in list
    setRecipient((prev) => prev ?? friends[0] ?? null);
    setSelectedPlatform(null);
    setSaveError(null);
    setStep('details');
  };

  const handleBack = () => {
    setStep('search');
    setSaveError(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleConfirm = async () => {
    if (!selected || !recipient || !selectedPlatform) return;

    setSaving(true);
    setSaveError(null);
    try {
      const thumbnailUrl =
        selected.posterPath   ? `${TMDB_IMG_W500}${selected.posterPath}`   :
        selected.backdropPath ? `${TMDB_IMG_W500}${selected.backdropPath}` :
        '';

      await onAdd({
        tmdbId:          selected.tmdbId,
        title:           selected.title,
        type:            selected.mediaType,
        thumbnail:       thumbnailUrl,
        year:            selected.year || null,
        genres:          [],
        platform:        selectedPlatform,
        recipientUserId: recipient.friendUserId,
      });
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#0f0f14] border border-[#1f1f28] rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[#1f1f28] flex-shrink-0">
          <div className="flex items-center gap-3">
            {step === 'details' && (
              <button
                onClick={handleBack}
                className="p-1.5 hover:bg-[#1f1f28] rounded-lg transition-colors"
              >
                <ChevronLeft className="w-5 h-5 text-[#8b8b9e]" />
              </button>
            )}
            <div>
              <h2 className="text-xl text-[#e4e4e7]">
                {step === 'search' ? 'Recommend a Title' : 'Details'}
              </h2>
              <p className="text-sm text-[#8b8b9e] mt-0.5">
                {step === 'search'
                  ? 'Search for a movie or TV show to recommend'
                  : recipient
                    ? `Recommending to ${recipient.name}`
                    : 'Choose who to send this to and where to watch'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[#1f1f28] rounded-lg transition-colors">
            <X className="w-5 h-5 text-[#8b8b9e]" />
          </button>
        </div>

        {/* ── Step 1: Search ─────────────────────────────────── */}
        {step === 'search' && (
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="p-4 border-b border-[#1f1f28] flex-shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b8b9e]" />
                <input
                  ref={inputRef}
                  autoFocus
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search movies and TV shows..."
                  className="w-full bg-[#1a1a22] border border-[#2a2a35] rounded-lg pl-10 pr-4 py-2.5 text-sm text-[#e4e4e7] placeholder:text-[#8b8b9e] focus:outline-none focus:border-[#5b5bd6] transition-colors"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {searching && (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="w-5 h-5 text-[#5b5bd6] animate-spin" />
                </div>
              )}

              {!searching && searchError && (
                <div className="flex items-start gap-2 text-xs text-[#ef4444] bg-[#ef4444]/10 border border-[#ef4444]/20 rounded-lg px-3 py-2">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  {searchError}
                </div>
              )}

              {!searching && !searchError && query && results.length === 0 && (
                <p className="text-center text-sm text-[#8b8b9e] py-10">
                  No results for "{query}"
                </p>
              )}

              {!searching && results.map((result) => (
                <button
                  key={result.tmdbId}
                  onClick={() => handleSelectResult(result)}
                  className="w-full flex gap-3 p-3 hover:bg-[#1f1f28] rounded-xl transition-colors text-left"
                >
                  {result.posterUrl ? (
                    <img
                      src={result.posterUrl}
                      alt={result.title}
                      className="w-12 rounded-lg object-cover flex-shrink-0"
                      style={{ height: '4.5rem' }}
                    />
                  ) : (
                    <div className="w-12 flex-shrink-0 flex items-center justify-center bg-[#1f1f28] rounded-lg" style={{ height: '4.5rem' }}>
                      {result.mediaType === 'movie'
                        ? <Film className="w-5 h-5 text-[#8b8b9e]" />
                        : <Tv className="w-5 h-5 text-[#8b8b9e]" />}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-[#e4e4e7] font-medium truncate">{result.title}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-[#5b5bd6] uppercase">
                        {result.mediaType === 'movie' ? 'Movie' : 'Series'}
                      </span>
                      {result.year && (
                        <span className="text-xs text-[#8b8b9e]">{result.year}</span>
                      )}
                    </div>
                    {result.overview && (
                      <p className="text-xs text-[#8b8b9e] mt-1 line-clamp-2">{result.overview}</p>
                    )}
                  </div>
                </button>
              ))}

              {!query && (
                <p className="text-center text-sm text-[#8b8b9e] py-10">
                  Start typing to search TMDB
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── Step 2: Details ────────────────────────────────── */}
        {step === 'details' && selected && (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Selected title summary */}
            <div className="flex gap-4 p-4 bg-[#1a1a22] rounded-xl border border-[#2a2a35]">
              {selected.posterUrl ? (
                <img
                  src={selected.posterUrl}
                  alt={selected.title}
                  className="w-14 rounded-lg object-cover flex-shrink-0"
                  style={{ height: '5.25rem' }}
                />
              ) : (
                <div className="w-14 flex-shrink-0 flex items-center justify-center bg-[#2a2a35] rounded-lg" style={{ height: '5.25rem' }}>
                  {selected.mediaType === 'movie'
                    ? <Film className="w-6 h-6 text-[#8b8b9e]" />
                    : <Tv className="w-6 h-6 text-[#8b8b9e]" />}
                </div>
              )}
              <div>
                <div className="text-[#e4e4e7] font-medium">{selected.title}</div>
                <div className="flex items-center gap-2 mt-0.5 text-xs text-[#8b8b9e]">
                  <span className="text-[#5b5bd6] uppercase">
                    {selected.mediaType === 'movie' ? 'Movie' : 'Series'}
                  </span>
                  {selected.year && <span>{selected.year}</span>}
                </div>
              </div>
            </div>

            {/* Recipient picker */}
            <div>
              <p className="text-sm text-[#8b8b9e] mb-3">
                Recommend to <span className="text-[#e4e4e7]">*</span>
              </p>
              {friends.length === 0 ? (
                <p className="text-xs text-[#8b8b9e] italic">
                  No friends yet — add a friend first to send recommendations
                </p>
              ) : (
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {friends.map((friend) => (
                    <button
                      key={friend.id}
                      onClick={() => setRecipient(friend)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-left ${
                        recipient?.id === friend.id
                          ? 'bg-[#5b5bd6]/20 border border-[#5b5bd6]/40'
                          : 'hover:bg-[#1f1f28] border border-transparent'
                      }`}
                    >
                      <FriendAvatar name={friend.name} avatar={friend.avatar} className="w-8 h-8" />
                      <span className="text-sm text-[#e4e4e7]">{friend.name}</span>
                      {recipient?.id === friend.id && (
                        <Check className="w-4 h-4 text-[#5b5bd6] ml-auto" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Platform picker */}
            <div>
              <p className="text-sm text-[#8b8b9e] mb-3">
                Available on <span className="text-[#e4e4e7]">*</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {PLATFORMS.map((p) => (
                  <button
                    key={p}
                    onClick={() => setSelectedPlatform(p)}
                    className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                      selectedPlatform === p
                        ? 'bg-[#5b5bd6] text-white'
                        : 'bg-[#1f1f28] text-[#8b8b9e] hover:bg-[#2a2a35] hover:text-[#e4e4e7]'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Error */}
            {saveError && (
              <div className="flex items-start gap-2 text-xs text-[#ef4444] bg-[#ef4444]/10 border border-[#ef4444]/20 rounded-lg px-3 py-2">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                {saveError}
              </div>
            )}
          </div>
        )}

        {/* Footer (details step only) */}
        {step === 'details' && (
          <div className="p-6 border-t border-[#1f1f28] flex gap-3 flex-shrink-0">
            <button
              onClick={handleBack}
              className="flex-1 px-4 py-2.5 bg-[#1f1f28] hover:bg-[#2a2a35] rounded-lg text-sm text-[#e4e4e7] transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleConfirm}
              disabled={saving || !recipient || !selectedPlatform}
              className="flex-1 px-4 py-2.5 bg-[#5b5bd6] hover:bg-[#7c7ce8] disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-sm text-white transition-colors flex items-center justify-center gap-2"
            >
              {saving
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
                : recipient
                  ? `Recommend to ${recipient.name}`
                  : 'Select a friend first'
              }
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
