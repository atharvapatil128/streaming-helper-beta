import { useState } from 'react';
import { Pin, X, Plus, Loader2, AlertCircle, Trash2 } from 'lucide-react';
import type { ComfortTitle } from '../../types';
import { AddComfortTitleModal } from './AddComfortTitleModal';
import { useComfortTitles } from '../hooks/useComfortTitles';

const PLATFORM_COLORS: Record<string, { bg: string; text: string }> = {
  'Netflix':     { bg: 'bg-[#e50914]', text: 'text-white' },
  'Prime Video': { bg: 'bg-[#00a8e1]', text: 'text-white' },
  'Disney+':     { bg: 'bg-[#0063e5]', text: 'text-white' },
  'HBO Max':     { bg: 'bg-[#7851a9]', text: 'text-white' },
  'Hulu':        { bg: 'bg-[#1ce783]', text: 'text-black' },
  'Apple TV+':   { bg: 'bg-[#f5f5f7]', text: 'text-black' },
};

function TitleCard({
  title,
  onPin,
  onRemove,
  showRemoveLabel = false,
  isRemoving = false,
  disabled = false,
}: {
  title: ComfortTitle;
  onPin?: (id: string) => void;
  onRemove?: (id: string) => void;
  /** Pinned section shows a labeled Remove button instead of an icon-only X. */
  showRemoveLabel?: boolean;
  isRemoving?: boolean;
  /** Dims the card and hides action buttons — used for the Coming Soon section. */
  disabled?: boolean;
}) {
  const platformStyle = PLATFORM_COLORS[title.platform ?? ''];

  return (
    <div className={`bg-[#0f0f14] border border-[#1f1f28] rounded-lg p-4 transition-colors ${disabled ? 'opacity-50' : 'hover:border-[#2a2a35]'}`}>
      <div className="flex gap-4">
        <div className="w-20 h-28 rounded-lg overflow-hidden bg-[#1f1f28] flex-shrink-0">
          {title.thumbnail ? (
            <img
              src={title.thumbnail}
              alt={title.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[#8b8b9e] text-xs">
              No image
            </div>
          )}
        </div>
        <div className="flex-1 flex items-center justify-between min-w-0">
          <div className="min-w-0">
            <h4 className="text-[#e4e4e7] font-medium mb-1 truncate">{title.title}</h4>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[#8b8b9e]">
              <span className="capitalize">{title.type}</span>
              <span>•</span>
              <span>{title.year}</span>
              {title.duration && (
                <>
                  <span>•</span>
                  <span>{title.duration}</span>
                </>
              )}
              <span>•</span>
              <span
                className={`px-2 py-0.5 rounded text-xs ${
                  platformStyle ? `${platformStyle.bg} ${platformStyle.text}` : 'bg-[#2a2a35] text-white'
                }`}
              >
                {title.platform}
              </span>
            </div>
            {title.overview && (
              <p className="text-xs text-[#8b8b9e] mt-2 line-clamp-2 leading-relaxed">
                {title.overview}
              </p>
            )}
          </div>
          {!disabled && (
            <div className="flex items-center gap-2 flex-shrink-0 ml-4">
              {onPin && (
                <button
                  onClick={() => onPin(title.id)}
                  className="px-3 py-2 text-sm text-[#8b8b9e] hover:text-[#5b5bd6] hover:bg-[#1f1f28] rounded-lg transition-colors border border-[#2a2a35] hover:border-[#5b5bd6] flex items-center gap-1.5"
                  title="Pin to Comfort List"
                >
                  <Pin className="w-3.5 h-3.5" />
                  Pin
                </button>
              )}
              {onRemove && (showRemoveLabel ? (
                <button
                  onClick={() => onRemove(title.id)}
                  disabled={isRemoving}
                  className="px-3 py-2 text-sm text-[#8b8b9e] hover:text-[#ef4444] hover:bg-[#1f1f28] rounded-lg transition-colors border border-[#2a2a35] hover:border-[#ef4444]/40 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                  title="Remove from Comfort List"
                >
                  {isRemoving
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Trash2 className="w-3.5 h-3.5" />
                  }
                  Remove
                </button>
              ) : (
                <button
                  onClick={() => onRemove(title.id)}
                  disabled={isRemoving}
                  className="p-2 text-[#8b8b9e] hover:text-[#ef4444] hover:bg-[#1f1f28] rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Remove"
                >
                  {isRemoving
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <X className="w-4 h-4" />
                  }
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ComfortList() {
  const { titles, loading, error, add, remove, pin } = useComfortTitles();
  const [showAddModal, setShowAddModal] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const handleRemove = async (id: string) => {
    setRemovingId(id);
    try {
      await remove(id);
    } catch {
      // Error is already surfaced in the hook's error state
    } finally {
      setRemovingId(null);
    }
  };

  const pinnedTitles = titles.filter((t) => t.isPinned);
  const unpinnedTitles = titles.filter((t) => !t.isPinned);

  // ── Loading state ──────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 text-[#5b5bd6] animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-2 text-sm text-[#ef4444] bg-[#ef4444]/10 border border-[#ef4444]/20 rounded-lg px-4 py-3">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl text-[#e4e4e7] mb-2">Comfort List</h2>
          <p className="text-[#8b8b9e] text-sm max-w-2xl">
            A personal list of familiar shows and movies the Helper can use when you don't want to decide.
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 bg-[#5b5bd6] hover:bg-[#7c7ce8] rounded-lg flex items-center gap-2 transition-colors flex-shrink-0"
        >
          <Plus className="w-4 h-4" />
          Add Comfort Title
        </button>
      </div>

      <div className="space-y-6">
        {/* Pinned section */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg text-[#e4e4e7]">Pinned by You</h3>
            <span className="text-sm text-[#8b8b9e]">{pinnedTitles.length} titles</span>
          </div>
          <p className="text-xs text-[#8b8b9e] mb-4">
            These titles are prioritized for Comfort Pick
          </p>
          {pinnedTitles.length > 0 ? (
            <div className="space-y-3">
              {pinnedTitles.map((title) => (
                <TitleCard
                  key={title.id}
                  title={title}
                  onRemove={handleRemove}
                  showRemoveLabel
                  isRemoving={removingId === title.id}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-[#8b8b9e] text-sm border border-dashed border-[#2a2a35] rounded-lg">
              Add comfort titles for one-click rewatch picks — use the button above to get started.
            </div>
          )}
        </div>

        {/* Auto-detected section — always visible, Coming Soon for Beta 1 */}
        <div className="opacity-60">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg text-[#e4e4e7]">Auto-detected from Watch History</h3>
                <span className="px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide bg-[#1f1f28] text-[#8b8b9e] border border-[#2a2a35] rounded">
                  Coming soon
                </span>
              </div>
              <p className="text-xs text-[#8b8b9e] mt-1">
                Once watch history is connected, titles you rewatch often will appear here as suggestions
              </p>
            </div>
          </div>
          {unpinnedTitles.length > 0 ? (
            <div className="space-y-3 mt-4">
              {unpinnedTitles.map((title) => (
                <TitleCard
                  key={title.id}
                  title={title}
                  disabled
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-[#8b8b9e] text-xs border border-dashed border-[#1f1f28] rounded-lg mt-4">
              Watch history integration is not yet active — suggestions will appear here in a future update
            </div>
          )}
        </div>
      </div>

      {showAddModal && (
        <AddComfortTitleModal
          onAdd={add}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
}
