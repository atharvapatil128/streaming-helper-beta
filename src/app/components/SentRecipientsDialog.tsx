import { useEffect, useRef, useState } from 'react';
import { Trash2, UsersRound, X } from 'lucide-react';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { FriendAvatar } from './FriendAvatar';
import type { SentRecommendationGroup } from '../../lib/sentRecommendationGroups';

interface SentRecipientsDialogProps {
  group: SentRecommendationGroup;
  onClose: () => void;
  onRemoveRecipient: (recommendationId: string, groupSize: number) => void;
}

export function SentRecipientsDialog({
  group,
  onClose,
  onRemoveRecipient,
}: SentRecipientsDialogProps) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab') return;

      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  const recommendation = group.primary;

  return (
    <div
      className="dashboard-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="dashboard-recipients-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sent-recipients-title"
      >
        <header className="dashboard-recipients-header">
          <div className="dashboard-recipients-title-art">
            <ImageWithFallback src={recommendation.thumbnail} alt="" />
          </div>
          <div className="min-w-0">
            <span className="dashboard-recipients-kicker">Sent recommendation</span>
            <h2 id="sent-recipients-title">{recommendation.title}</h2>
            <p>
              {group.recommendations.length}{' '}
              {group.recommendations.length === 1 ? 'recipient' : 'recipients'}
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="dashboard-dialog-close"
            onClick={onClose}
            aria-label="Close recipient list"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </header>

        <div className="dashboard-recipients-body">
          <div className="dashboard-recipients-label">
            <UsersRound className="h-4 w-4" aria-hidden />
            Sent to
          </div>

          <ul className="dashboard-recipient-list">
            {group.recommendations.map((recipient) => {
              const confirming = confirmingId === recipient.id;

              return (
                <li key={recipient.id} className="dashboard-recipient-row">
                  <FriendAvatar
                    name={recipient.sourceName}
                    className="h-9 w-9 shrink-0"
                  />
                  <div className="dashboard-recipient-copy">
                    <strong>{recipient.sourceName}</strong>
                    <span>Recommendation available</span>
                  </div>

                  {confirming ? (
                    <div className="dashboard-recipient-confirm" role="group" aria-label={`Remove ${recipient.sourceName}`}>
                      <button
                        type="button"
                        onClick={() => setConfirmingId(null)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="dashboard-recipient-remove-confirm"
                        onClick={() => {
                          setConfirmingId(null);
                          onRemoveRecipient(
                            recipient.id,
                            group.recommendations.length,
                          );
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="dashboard-recipient-remove"
                      onClick={() => setConfirmingId(recipient.id)}
                      aria-label={`Remove recommendation sent to ${recipient.sourceName}`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        <footer className="dashboard-recipients-footer">
          Removing one recipient does not affect anyone else.
        </footer>
      </section>
    </div>
  );
}
