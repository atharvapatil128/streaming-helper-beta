import { Star, Clock, X, Trash2 } from 'lucide-react';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { FriendAvatar } from './FriendAvatar';
import type { Recommendation } from '../../types';

interface SuggestionCardProps {
  suggestion: Recommendation;
  onRemove: (id: string) => void;
  /** Called when the card body is clicked (not the dismiss/delete button). */
  onCardClick?: (suggestion: Recommendation) => void;
  viewMode?: 'grid' | 'list';
  /** 'received' shows "Recommended by …"; 'sent' shows "Sent to …" with a delete action */
  cardVariant?: 'received' | 'sent';
  /** Temporary visual emphasis (e.g. email deep-link highlight). */
  highlighted?: boolean;
}

const platformColors: Record<string, { bg: string; text: string }> = {
  'Netflix':     { bg: 'bg-[#e50914]', text: 'text-white' },
  'Prime Video': { bg: 'bg-[#00a8e1]', text: 'text-white' },
  'Disney+':     { bg: 'bg-[#0063e5]', text: 'text-white' },
  'HBO Max':     { bg: 'bg-[#7851a9]', text: 'text-white' },
  'Apple TV+':   { bg: 'bg-[#555555]', text: 'text-white' },
  'Hulu':        { bg: 'bg-[#1ce783]', text: 'text-black' },
};

function cardShellClass(highlighted: boolean, clickable: boolean): string {
  const base =
    'bg-[#1a1a22] border rounded-xl overflow-hidden motion-safe:transition-all group';
  const interactive = clickable ? 'cursor-pointer' : '';
  if (highlighted) {
    return `${base} border-[#5b5bd6] ring-2 ring-[#5b5bd6]/60 shadow-[0_0_20px_rgba(91,91,214,0.2)] motion-safe:duration-300 ${interactive}`;
  }
  return `${base} border-[#2a2a35] hover:border-[#5b5bd6]/30 ${interactive}`;
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
  const duration = suggestion.duration ?? null;
  const isSent = cardVariant === 'sent';
  const personLabel = isSent
    ? `Sent to ${suggestion.sourceName}`
    : `Recommended by ${suggestion.sourceName}`;
  const shellClass = cardShellClass(highlighted, !!onCardClick);

  if (viewMode === 'list') {
    return (
      <div
        data-recommendation-id={suggestion.id}
        className={shellClass}
        onClick={() => onCardClick?.(suggestion)}
      >
        <div className="flex gap-4 p-4">
          <div className="relative w-48 h-28 overflow-hidden bg-[#0f0f14] rounded-lg flex-shrink-0">
            <ImageWithFallback
              src={suggestion.thumbnail}
              alt={suggestion.title}
              className="w-full h-full object-cover object-top group-hover:scale-105 motion-safe:transition-transform motion-safe:duration-300"
            />
            <div className="absolute top-2 left-2">
              <span className="px-2 py-1 bg-[#0f0f14]/80 backdrop-blur-sm rounded text-xs text-[#e4e4e7] uppercase">
                {suggestion.type}
              </span>
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <h4 className="text-[#e4e4e7] mb-2">{suggestion.title}</h4>

            <div className="flex items-center gap-4 mb-3 text-xs text-[#8b8b9e]">
              {rating && (
                <div className="flex items-center gap-1">
                  <Star className="w-3 h-3 text-[#fbbf24] fill-[#fbbf24]" />
                  <span>{rating}</span>
                </div>
              )}
              {duration && (
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>{duration}</span>
                </div>
              )}
              {suggestion.year && <span>{suggestion.year}</span>}
            </div>

            <div className="flex flex-wrap gap-2 mb-3">
              {suggestion.genres.map((genre) => (
                <span key={genre} className="px-2 py-1 bg-[#2a2a35] rounded text-xs text-[#8b8b9e]">
                  {genre}
                </span>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <FriendAvatar
                  name={suggestion.sourceName}
                  className="w-6 h-6"
                />
                <span className="text-xs text-[#8b8b9e]">{personLabel}</span>
              </div>
              {suggestion.platforms.length > 0 && (
                <>
                  <div className="h-4 w-px bg-[#2a2a35]" />
                  <div className="flex items-center gap-2">
                    {suggestion.platforms.map((platform) => {
                      const colors = platformColors[platform] ?? { bg: 'bg-[#5b5bd6]', text: 'text-white' };
                      return (
                        <span key={platform} className={`px-2 py-1 ${colors.bg} ${colors.text} rounded text-xs font-medium`}>
                          {platform}
                        </span>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2 items-end justify-start">
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(suggestion.id); }}
              className="p-2 hover:bg-[#2a2a35] rounded-lg transition-colors"
              aria-label={isSent ? 'Delete' : 'Dismiss'}
            >
              {isSent
                ? <Trash2 className="w-4 h-4 text-[#8b8b9e] hover:text-[#ef4444]" />
                : <X className="w-4 h-4 text-[#8b8b9e] hover:text-[#ef4444]" />
              }
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      data-recommendation-id={suggestion.id}
      className={shellClass}
      onClick={() => onCardClick?.(suggestion)}
    >
      <div className="relative aspect-video overflow-hidden bg-[#0f0f14]">
        <ImageWithFallback
          src={suggestion.thumbnail}
          alt={suggestion.title}
          className="w-full h-full object-cover object-top group-hover:scale-105 motion-safe:transition-transform motion-safe:duration-300"
        />
        <div className="absolute top-3 right-3 flex gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(suggestion.id); }}
            className="p-2 bg-[#0f0f14]/80 backdrop-blur-sm rounded-lg hover:bg-[#ef4444] transition-colors"
            aria-label={isSent ? 'Delete' : 'Dismiss'}
          >
            {isSent
              ? <Trash2 className="w-4 h-4 text-white" />
              : <X className="w-4 h-4 text-white" />
            }
          </button>
        </div>
        <div className="absolute bottom-3 left-3">
          <span className="px-2 py-1 bg-[#0f0f14]/80 backdrop-blur-sm rounded text-xs text-[#e4e4e7] uppercase">
            {suggestion.type}
          </span>
        </div>
      </div>

      <div className="p-4">
        <h4 className="text-[#e4e4e7] mb-2">{suggestion.title}</h4>

        <div className="flex items-center gap-4 mb-3 text-xs text-[#8b8b9e]">
          {rating && (
            <div className="flex items-center gap-1">
              <Star className="w-3 h-3 text-[#fbbf24] fill-[#fbbf24]" />
              <span>{rating}</span>
            </div>
          )}
          {duration && (
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span>{duration}</span>
            </div>
          )}
          {suggestion.year && <span>{suggestion.year}</span>}
        </div>

        <div className="flex flex-wrap gap-2 mb-3">
          {suggestion.genres.map((genre) => (
            <span key={genre} className="px-2 py-1 bg-[#2a2a35] rounded text-xs text-[#8b8b9e]">
              {genre}
            </span>
          ))}
        </div>

        <div className="space-y-3 pt-3 border-t border-[#2a2a35]">
          <div className="flex items-center gap-2">
            <FriendAvatar
              name={suggestion.sourceName}
              className="w-6 h-6"
            />
            <span className="text-xs text-[#8b8b9e]">{personLabel}</span>
          </div>

          {suggestion.platforms.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              {suggestion.platforms.map((platform) => {
                const colors = platformColors[platform] ?? { bg: 'bg-[#5b5bd6]', text: 'text-white' };
                return (
                  <span key={platform} className={`px-2 py-1 ${colors.bg} ${colors.text} rounded text-xs font-medium`}>
                    {platform}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
