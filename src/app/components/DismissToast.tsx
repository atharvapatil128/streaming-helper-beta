import { X } from 'lucide-react';

interface DismissToastProps {
  /** Text shown on the left side of the snackbar. */
  message: string;
  /** Called when the user clicks "Undo". */
  onUndo: () => void;
  /** Called when the user clicks the X or the snackbar auto-closes. */
  onClose: () => void;
}

/**
 * A minimal snackbar that sits fixed at the bottom-center of the viewport.
 * Lifetime (auto-dismiss timer) is managed by the parent; this component is
 * purely presentational and renders only when mounted.
 */
export function DismissToast({ message, onUndo, onClose }: DismissToastProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="dashboard-toast"
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={onUndo}
        className="dashboard-toast-undo"
      >
        Undo
      </button>
      <div className="dashboard-toast-divider" />
      <button
        type="button"
        onClick={onClose}
        className="dashboard-toast-close"
        aria-label="Close"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
