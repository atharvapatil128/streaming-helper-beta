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
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 bg-[#2a2a35] border border-[#3a3a45] rounded-xl shadow-2xl"
    >
      <span className="text-sm text-[#e4e4e7] whitespace-nowrap">{message}</span>
      <button
        onClick={onUndo}
        className="text-sm font-medium text-[#5b5bd6] hover:text-[#7c7ce8] transition-colors whitespace-nowrap"
      >
        Undo
      </button>
      <div className="w-px h-4 bg-[#3a3a45]" />
      <button
        onClick={onClose}
        className="p-0.5 text-[#8b8b9e] hover:text-[#e4e4e7] transition-colors"
        aria-label="Close"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
