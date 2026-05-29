import { useState, useEffect, useRef } from 'react';
import { Search, X, ArrowLeft, Loader2, Film, Tv, Check, AlertCircle } from 'lucide-react';
import { searchMulti } from '../../lib/tmdb';
import type { TmdbResult } from '../../lib/tmdb';
import type { ComfortTitle } from '../../types';

const PLATFORMS = [
  { name: 'Netflix',     bg: 'bg-[#e50914]', text: 'text-white' },
  { name: 'Prime Video', bg: 'bg-[#00a8e1]', text: 'text-white' },
  { name: 'Disney+',     bg: 'bg-[#0063e5]', text: 'text-white' },
  { name: 'Hulu',        bg: 'bg-[#1ce783]', text: 'text-black' },
  { name: 'HBO Max',     bg: 'bg-[#7851a9]', text: 'text-white' },
  { name: 'Apple TV+',   bg: 'bg-[#f5f5f7]', text: 'text-black' },
  { name: 'Other',       bg: 'bg-[#2a2a35]', text: 'text-[#e4e4e7]' },
] as const;

interface Props {
  onAdd: (title: Omit<ComfortTitle, 'id' | 'isPinned'>) => Promise<void>;
  onClose: () => void;
}

export function AddComfortTitleModal({ onAdd, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TmdbResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Step 2 state
  const [selected, setSelected] = useState<TmdbResult | null>(null);
  const [platform, setPlatform] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selected) {
          setSelected(null);
          setPlatform('');
        } else {
          onClose();
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [selected, onClose]);

  // Debounced TMDB search — fires 400 ms after the user stops typing
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setSearchError(null);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      setSearchError(null);
      try {
        const data = await searchMulti(query.trim());
        setResults(data);
      } catch (err) {
        setSearchError(err instanceof Error ? err.message : 'Search failed.');
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = (result: TmdbResult) => {
    setSelected(result);
    setPlatform('');
  };

  const handleConfirm = async () => {
    if (!selected || !platform || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onAdd({
        tmdbId: selected.tmdbId,
        title: selected.title,
        type: selected.mediaType,
        thumbnail: selected.posterUrl ?? '',
        year: selected.year,
        duration: '',
        platform,
        overview: selected.overview,
      });
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleBackToSearch = () => {
    setSelected(null);
    setPlatform('');
    setSaveError(null);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  // ─── Step 2: Platform selection ────────────────────────────
  if (selected) {
    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-[#0f0f14] border border-[#1f1f28] rounded-2xl w-full max-w-lg shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-[#1f1f28]">
            <button
              onClick={handleBackToSearch}
              className="flex items-center gap-2 text-sm text-[#8b8b9e] hover:text-[#e4e4e7] transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to search
            </button>
            <button
              onClick={onClose}
              className="p-2 text-[#8b8b9e] hover:text-[#e4e4e7] hover:bg-[#1f1f28] rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-6">
            {/* Selected title summary */}
            <div className="flex gap-4">
              <div className="w-16 h-24 rounded-lg overflow-hidden bg-[#1f1f28] flex-shrink-0">
                {selected.posterUrl ? (
                  <img
                    src={selected.posterUrl}
                    alt={selected.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    {selected.mediaType === 'movie'
                      ? <Film className="w-6 h-6 text-[#8b8b9e]" />
                      : <Tv className="w-6 h-6 text-[#8b8b9e]" />}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-[#e4e4e7] font-medium mb-1 truncate">{selected.title}</h3>
                <div className="flex items-center gap-2 text-xs text-[#8b8b9e] mb-2">
                  <span className="capitalize">{selected.mediaType}</span>
                  {selected.year && (
                    <>
                      <span>•</span>
                      <span>{selected.year}</span>
                    </>
                  )}
                </div>
                {selected.overview && (
                  <p className="text-xs text-[#8b8b9e] line-clamp-3 leading-relaxed">
                    {selected.overview}
                  </p>
                )}
              </div>
            </div>

            {/* Platform picker */}
            <div>
              <p className="text-sm text-[#e4e4e7] mb-3">Where do you watch this?</p>
              <div className="grid grid-cols-2 gap-2">
                {PLATFORMS.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => setPlatform(p.name)}
                    className={`flex items-center justify-between px-4 py-3 rounded-lg border text-sm transition-all ${
                      platform === p.name
                        ? 'border-[#5b5bd6] bg-[#5b5bd6]/10'
                        : 'border-[#2a2a35] bg-[#1a1a22] hover:border-[#3a3a45]'
                    }`}
                  >
                    <span className={platform === p.name ? 'text-[#e4e4e7]' : 'text-[#8b8b9e]'}>
                      {p.name}
                    </span>
                    {platform === p.name && (
                      <Check className="w-4 h-4 text-[#5b5bd6]" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Save error */}
            {saveError && (
              <div className="flex items-start gap-2 text-xs text-[#ef4444] bg-[#ef4444]/10 border border-[#ef4444]/20 rounded-lg px-3 py-2">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                {saveError}
              </div>
            )}

            {/* Confirm */}
            <button
              onClick={handleConfirm}
              disabled={!platform || saving}
              className="w-full py-3 bg-[#5b5bd6] hover:bg-[#7c7ce8] disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-sm text-white transition-colors flex items-center justify-center gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? 'Saving…' : 'Add to Comfort List'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Step 1: Search ────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#0f0f14] border border-[#1f1f28] rounded-2xl w-full max-w-2xl max-h-[80vh] shadow-2xl flex flex-col">
        {/* Search header */}
        <div className="p-6 border-b border-[#1f1f28]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl text-[#e4e4e7]">Add Comfort Title</h3>
            <button
              onClick={onClose}
              className="p-2 text-[#8b8b9e] hover:text-[#e4e4e7] hover:bg-[#1f1f28] rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="relative">
            {searching
              ? <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#8b8b9e] animate-spin" />
              : <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#8b8b9e]" />
            }
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search movies and TV shows…"
              autoFocus
              className="w-full pl-11 pr-4 py-3 bg-[#1f1f28] border border-[#2a2a35] rounded-lg text-[#e4e4e7] placeholder:text-[#8b8b9e] focus:outline-none focus:border-[#5b5bd6] transition-colors"
            />
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto p-4">
          {searchError && (
            <p className="text-xs text-[#ef4444] bg-[#ef4444]/10 border border-[#ef4444]/20 rounded-lg px-3 py-2 mb-4">
              {searchError}
            </p>
          )}

          {results.length > 0 && (
            <div className="space-y-2">
              {results.map((result) => (
                <button
                  key={result.tmdbId}
                  type="button"
                  onClick={() => handleSelect(result)}
                  className="w-full flex gap-4 p-3 bg-[#1a1a22] border border-[#2a2a35] hover:border-[#5b5bd6]/50 hover:bg-[#1f1f28] rounded-xl transition-all text-left group"
                >
                  {/* Poster */}
                  <div className="w-12 h-18 rounded-lg overflow-hidden bg-[#0f0f14] flex-shrink-0 flex items-center justify-center"
                    style={{ height: '72px' }}>
                    {result.posterUrl ? (
                      <img
                        src={result.posterUrl}
                        alt={result.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        {result.mediaType === 'movie'
                          ? <Film className="w-5 h-5 text-[#8b8b9e]" />
                          : <Tv className="w-5 h-5 text-[#8b8b9e]" />}
                      </div>
                    )}
                  </div>

                  {/* Meta */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2 mb-1">
                      <span className="text-sm text-[#e4e4e7] group-hover:text-white font-medium truncate">
                        {result.title}
                      </span>
                      <span className={`flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium uppercase ${
                        result.mediaType === 'movie'
                          ? 'bg-[#5b5bd6]/20 text-[#a5a5ff]'
                          : 'bg-[#4ade80]/20 text-[#4ade80]'
                      }`}>
                        {result.mediaType === 'movie' ? 'Movie' : 'Series'}
                      </span>
                    </div>
                    {result.year && (
                      <p className="text-xs text-[#8b8b9e] mb-1">{result.year}</p>
                    )}
                    {result.overview && (
                      <p className="text-xs text-[#8b8b9e] line-clamp-2 leading-relaxed">
                        {result.overview}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Empty states */}
          {!searching && !searchError && query.trim().length >= 2 && results.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-14 h-14 bg-[#1f1f28] rounded-2xl flex items-center justify-center mb-3">
                <Search className="w-7 h-7 text-[#8b8b9e]" />
              </div>
              <p className="text-sm text-[#e4e4e7] mb-1">No results found</p>
              <p className="text-xs text-[#8b8b9e]">Try a different title or spelling</p>
            </div>
          )}

          {!searching && !searchError && query.trim().length < 2 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-14 h-14 bg-[#1f1f28] rounded-2xl flex items-center justify-center mb-3">
                <Search className="w-7 h-7 text-[#8b8b9e]" />
              </div>
              <p className="text-sm text-[#e4e4e7] mb-1">Search for a title</p>
              <p className="text-xs text-[#8b8b9e]">Movies and TV shows from TMDB</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
