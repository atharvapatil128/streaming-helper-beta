import { Clock, Star, Trash2, X } from 'lucide-react';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { FriendAvatar } from './FriendAvatar';
import type { Recommendation } from '../../types';

interface SuggestionCardProps {
  suggestion: Recommendation;
  onRemove: (id: string) => void;
  onCardClick?: (suggestion: Recommendation) => void;
  viewMode?: 'grid' | 'list';
  cardVariant?: 'received' | 'sent';
  highlighted?: boolean;
}

export function SuggestionCard({
  suggestion,
  onRemove,
  onCardClick,
  viewMode = 'grid',
  cardVariant = 'received',
  highlighted = false,
}: SuggestionCardProps) {
  const rating = suggestion.rating != null ? suggestion.rating.toFixed(1) : null;
  const isSent = cardVariant === 'sent';
  const personLabel = isSent
    ? `Sent to ${suggestion.sourceName}`
    : `From ${suggestion.sourceName}`;

  return (
    <article
      data-recommendation-id={suggestion.id}
      data-highlighted={highlighted}
      data-view={viewMode}
      className="dashboard-card"
    >
      <button
        type="button"
        onClick={() => onRemove(suggestion.id)}
        className="dashboard-card-action"
        aria-label={`${isSent ? 'Delete' : 'Dismiss'} ${suggestion.title}`}
      >
        {isSent
          ? <Trash2 className="h-4 w-4" aria-hidden />
          : <X className="h-4 w-4" aria-hidden />}
      </button>

      <button
        type="button"
        className="dashboard-card-open"
        onClick={() => onCardClick?.(suggestion)}
        disabled={!onCardClick}
        aria-label={`Open details for ${suggestion.title}`}
      >
        <div className="dashboard-card-list-layout">
          <div className="dashboard-card-media">
            <ImageWithFallback
              src={suggestion.thumbnail}
              alt=""
              className="h-full w-full object-cover object-top"
            />
            <span className="dashboard-media-label">
              {suggestion.type}
            </span>
          </div>

          <div className="dashboard-card-body">
            <h3 className="dashboard-card-title">{suggestion.title}</h3>

            <div className="dashboard-card-meta" aria-label="Title details">
              {rating && (
                <span className="inline-flex items-center gap-1">
                  <Star className="h-3.5 w-3.5 fill-[#e7c46d] text-[#e7c46d]" aria-hidden />
                  {rating}
                </span>
              )}
              {suggestion.duration && (
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" aria-hidden />
                  {suggestion.duration}
                </span>
              )}
              {suggestion.year && <span>{suggestion.year}</span>}
              {suggestion.genres.slice(0, 2).map((genre) => (
                <span key={genre}>{genre}</span>
              ))}
            </div>

            <div className="dashboard-card-person">
              <div className="dashboard-card-person-copy">
                <FriendAvatar
                  name={suggestion.sourceName}
                  className="h-7 w-7 shrink-0"
                />
                <span className="truncate">{personLabel}</span>
              </div>

              {suggestion.platforms.length > 0 && (
                <div className="dashboard-platform-list" aria-label="Streaming platforms">
                  {suggestion.platforms.map((platform) => (
                    <span key={platform} className="dashboard-platform">
                      {platform}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </button>
    </article>
  );
}
