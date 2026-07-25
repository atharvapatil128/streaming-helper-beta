import { useState } from 'react';
import { AlertCircle, Loader2, Plus, Trash2 } from 'lucide-react';
import type { ComfortTitle } from '../../types';
import { AddComfortTitleModal } from './AddComfortTitleModal';
import { useComfortTitles } from '../hooks/useComfortTitles';

function TitleCard({
  title,
  onRemove,
  isRemoving = false,
  disabled = false,
}: {
  title: ComfortTitle;
  onRemove?: (id: string) => void;
  isRemoving?: boolean;
  disabled?: boolean;
}) {
  return (
    <article className={`dashboard-comfort-card ${disabled ? 'opacity-55' : ''}`}>
      <div className="dashboard-comfort-poster">
        {title.thumbnail ? (
          <img src={title.thumbnail} alt="" />
        ) : (
          <div className="grid h-full w-full place-items-center px-2 text-center text-[10px] text-[#858a9d]">
            No artwork
          </div>
        )}
      </div>

      <div className="min-w-0">
        <h3 className="dashboard-comfort-name">{title.title}</h3>
        <div className="dashboard-comfort-meta">
          <span className="capitalize">{title.type}</span>
          {title.year && <span>{title.year}</span>}
          {title.duration && <span>{title.duration}</span>}
          {title.platform && <span className="dashboard-platform">{title.platform}</span>}
        </div>
        {title.overview && (
          <p className="dashboard-comfort-overview">{title.overview}</p>
        )}
      </div>

      {!disabled && onRemove && (
        <div className="dashboard-comfort-actions">
          <button
            type="button"
            onClick={() => onRemove(title.id)}
            disabled={isRemoving}
            className="dashboard-secondary-action disabled:cursor-not-allowed disabled:opacity-45"
            aria-label={`Remove ${title.title} from Comfort List`}
          >
            {isRemoving
              ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              : <Trash2 className="h-4 w-4" aria-hidden />}
            Remove
          </button>
        </div>
      )}
    </article>
  );
}

export function ComfortList() {
  const { titles, loading, error, add, remove } = useComfortTitles();
  const [showAddModal, setShowAddModal] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const handleRemove = async (id: string) => {
    setRemovingId(id);
    try {
      await remove(id);
    } catch {
      // The hook owns the visible error state.
    } finally {
      setRemovingId(null);
    }
  };

  const pinnedTitles = titles.filter((title) => title.isPinned);
  const unpinnedTitles = titles.filter((title) => !title.isPinned);

  if (loading) {
    return (
      <div className="dashboard-state" role="status">
        <Loader2 className="h-6 w-6 animate-spin text-[#8f7cf6]" aria-hidden />
        <span className="sr-only">Loading Comfort List</span>
      </div>
    );
  }

  return (
    <section className="dashboard-comfort" aria-labelledby="comfort-list-title">
      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-[#ff7d86]/20 bg-[#ff7d86]/10 px-4 py-3 text-sm text-[#ff9aa1]" role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {error}
        </div>
      )}

      <div className="dashboard-page-header">
        <div>
          <h2 id="comfort-list-title" className="dashboard-page-title">Comfort List</h2>
          <p className="dashboard-page-copy">
            Familiar shows and movies for nights when choosing feels like work.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="dashboard-primary-action"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Add comfort title
        </button>
      </div>

      <div className="dashboard-comfort-section">
        <div className="dashboard-comfort-section-head">
          <div>
            <h3 className="dashboard-comfort-title">Ready for Comfort Pick</h3>
            <p className="dashboard-comfort-copy">
              These titles are prioritized when you ask the extension for something familiar.
            </p>
          </div>
          <span className="text-xs text-[#858a9d]">
            {pinnedTitles.length} {pinnedTitles.length === 1 ? 'title' : 'titles'}
          </span>
        </div>

        {pinnedTitles.length > 0 ? (
          <div className="dashboard-comfort-list">
            {pinnedTitles.map((title) => (
              <TitleCard
                key={title.id}
                title={title}
                onRemove={handleRemove}
                isRemoving={removingId === title.id}
              />
            ))}
          </div>
        ) : (
          <div className="dashboard-empty">
            <h3>Your familiar picks will live here</h3>
            <p>Add shows or movies you are always happy to return to.</p>
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="dashboard-secondary-action mt-4"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Add your first title
            </button>
          </div>
        )}
      </div>

      <div className="dashboard-comfort-section opacity-60" aria-disabled="true">
        <div className="dashboard-comfort-section-head">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="dashboard-comfort-title">Watch-history suggestions</h3>
              <span className="dashboard-platform">Planned</span>
            </div>
            <p className="dashboard-comfort-copy">
              Streaming Helper does not currently connect to streaming accounts or read watch history.
            </p>
          </div>
        </div>

        {unpinnedTitles.length > 0 ? (
          <div className="dashboard-comfort-list">
            {unpinnedTitles.map((title) => (
              <TitleCard key={title.id} title={title} disabled />
            ))}
          </div>
        ) : (
          <div className="dashboard-state text-sm">
            Suggestions will appear here only if this capability is introduced in a future release.
          </div>
        )}
      </div>

      {showAddModal && (
        <AddComfortTitleModal
          onAdd={add}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </section>
  );
}
