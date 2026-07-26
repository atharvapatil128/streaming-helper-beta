import { Clock, Star, UsersRound } from 'lucide-react';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { FriendAvatar } from './FriendAvatar';
import {
  sentRecipientSummary,
  type SentRecommendationGroup,
} from '../../lib/sentRecommendationGroups';

interface SentRecommendationCardProps {
  group: SentRecommendationGroup;
  onOpen: (groupKey: string) => void;
  viewMode?: 'grid' | 'list';
}

export function SentRecommendationCard({
  group,
  onOpen,
  viewMode = 'grid',
}: SentRecommendationCardProps) {
  const recommendation = group.primary;
  const rating =
    recommendation.rating != null ? recommendation.rating.toFixed(1) : null;
  const visibleRecipients = group.recommendations.slice(0, 3);

  return (
    <article className="dashboard-card" data-view={viewMode}>
      <button
        type="button"
        className="dashboard-card-open"
        onClick={() => onOpen(group.key)}
        aria-label={`Open recipients for ${recommendation.title}`}
      >
        <div className="dashboard-card-list-layout">
          <div className="dashboard-card-media">
            <ImageWithFallback
              src={recommendation.thumbnail}
              alt=""
              className="h-full w-full object-cover object-top"
            />
            <span className="dashboard-media-label">{recommendation.type}</span>
          </div>

          <div className="dashboard-card-body">
            <h3 className="dashboard-card-title">{recommendation.title}</h3>

            <div className="dashboard-card-meta" aria-label="Title details">
              {rating && (
                <span className="inline-flex items-center gap-1">
                  <Star
                    className="h-3.5 w-3.5 fill-[#e7c46d] text-[#e7c46d]"
                    aria-hidden
                  />
                  {rating}
                </span>
              )}
              {recommendation.duration && (
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" aria-hidden />
                  {recommendation.duration}
                </span>
              )}
              {recommendation.year && <span>{recommendation.year}</span>}
              {recommendation.genres.slice(0, 2).map((genre) => (
                <span key={genre}>{genre}</span>
              ))}
            </div>

            <div className="dashboard-card-person">
              <div className="dashboard-card-person-copy dashboard-sent-summary">
                <span className="dashboard-avatar-stack" aria-hidden>
                  {visibleRecipients.map((recipient) => (
                    <FriendAvatar
                      key={recipient.id}
                      name={recipient.sourceName}
                      className="h-7 w-7 shrink-0"
                    />
                  ))}
                </span>
                <span className="truncate">
                  {sentRecipientSummary(group.recommendations)}
                </span>
              </div>

              <span className="dashboard-recipient-count">
                <UsersRound className="h-3.5 w-3.5" aria-hidden />
                {group.recommendations.length}
              </span>
            </div>
          </div>
        </div>
      </button>
    </article>
  );
}
