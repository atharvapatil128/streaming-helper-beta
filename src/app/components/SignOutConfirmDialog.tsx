import { useEffect, useRef } from 'react';
import { Loader2, LogOut, X } from 'lucide-react';

interface SignOutConfirmDialogProps {
  displayName?: string | null;
  pending: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export function SignOutConfirmDialog({
  displayName,
  pending,
  error,
  onCancel,
  onConfirm,
}: SignOutConfirmDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pending) onCancel();
      if (event.key !== 'Tab') return;

      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
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
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel, pending]);

  return (
    <div className="dashboard-dialog-backdrop">
      <section
        ref={dialogRef}
        className="dashboard-signout-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="signout-title"
        aria-describedby="signout-description"
      >
        <button
          type="button"
          className="dashboard-dialog-close"
          onClick={onCancel}
          disabled={pending}
          aria-label="Close sign-out confirmation"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>

        <div className="dashboard-signout-dialog-icon" aria-hidden>
          <LogOut className="h-5 w-5" />
        </div>
        <h2 id="signout-title">Sign out of Streaming Helper?</h2>
        <p id="signout-description">
          {displayName
            ? `${displayName}, you will need to sign in again to see your recommendations.`
            : 'You will need to sign in again to see your recommendations.'}
        </p>

        {error && (
          <p className="dashboard-signout-error" role="alert">
            {error}
          </p>
        )}

        <div className="dashboard-signout-dialog-actions">
          <button
            ref={cancelRef}
            type="button"
            className="dashboard-secondary-action"
            onClick={onCancel}
            disabled={pending}
          >
            Stay signed in
          </button>
          <button
            type="button"
            className="dashboard-danger-action"
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <LogOut className="h-4 w-4" aria-hidden />
            )}
            {pending ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </section>
    </div>
  );
}
