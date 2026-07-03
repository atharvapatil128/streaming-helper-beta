import { useEffect, useRef, useState } from 'react';
import { X, AtSign, Loader2, Check, AlertCircle, Info } from 'lucide-react';
import {
  validateUsername,
  normalizeUsernameInput,
  checkUsernameAvailable,
  UsernameRpcError,
} from '../../lib/usernames';

type AvailabilityState =
  | 'idle'        // blank input
  | 'invalid'     // fails client validation
  | 'unchanged'   // change mode: same as current username
  | 'checking'
  | 'available'
  | 'unavailable'
  | 'unknown';    // advisory check failed — claim/change stays authoritative

interface UsernameClaimModalProps {
  /** 'claim' uses claim_username(); 'change' uses change_username() via onSubmit. */
  mode: 'claim' | 'change';
  /** Prefill (e.g. a pending signup username that became unavailable). */
  initialValue?: string;
  /** Optional friendly context line shown above the form. */
  notice?: string | null;
  /** Change mode: the user's current username (submitting it unchanged is blocked). */
  currentUsername?: string | null;
  /** True while the parent's claim/change RPC is in flight. */
  saving: boolean;
  /** Performs the authoritative claim/change. Should throw UsernameRpcError on failure. */
  onSubmit: (username: string) => Promise<void>;
  /** Dismiss without claiming (always allowed — no hard lockout). */
  onClose: () => void;
}

const AVAILABILITY_DEBOUNCE_MS = 600;

export function UsernameClaimModal({
  mode,
  initialValue,
  notice,
  currentUsername,
  saving,
  onSubmit,
  onClose,
}: UsernameClaimModalProps) {
  const [value, setValue] = useState(initialValue ?? '');
  const [availability, setAvailability] = useState<AvailabilityState>('idle');
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const checkGenRef = useRef(0);
  const submittingRef = useRef(false);
  const previousFocusRef = useRef<Element | null>(null);

  // Focus the username field on open; restore focus on close.
  useEffect(() => {
    previousFocusRef.current = document.activeElement;
    inputRef.current?.focus();
    return () => {
      const prev = previousFocusRef.current;
      if (prev instanceof HTMLElement) prev.focus();
    };
  }, []);

  // Escape dismisses (soft prompt must never lock the user in).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Debounced advisory availability check for client-valid input only.
  useEffect(() => {
    // Effect-local disposal flag: an in-flight availability promise must not
    // set state after this effect instance is cleaned up (including unmount,
    // where the generation ref alone would still match).
    let disposed = false;
    const raw = value;
    checkGenRef.current += 1;
    const gen = checkGenRef.current;

    if (!raw.trim()) {
      setAvailability('idle');
      setValidationMessage(null);
      return;
    }

    const validated = validateUsername(raw);
    if (!validated.valid) {
      setAvailability('invalid');
      setValidationMessage(validated.message);
      return;
    }
    setValidationMessage(null);

    if (
      mode === 'change' &&
      currentUsername &&
      validated.username === normalizeUsernameInput(currentUsername)
    ) {
      setAvailability('unchanged');
      return;
    }

    setAvailability('checking');
    const timer = setTimeout(() => {
      checkUsernameAvailable(validated.username).then((result) => {
        if (disposed || gen !== checkGenRef.current) return; // stale/unmounted
        if (result === 'available') setAvailability('available');
        else if (result === 'unavailable') setAvailability('unavailable');
        else setAvailability('unknown');
      });
    }, AVAILABILITY_DEBOUNCE_MS);

    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [value, mode, currentUsername]);

  const normalized = normalizeUsernameInput(value);

  const submitDisabled =
    saving ||
    availability === 'idle' ||
    availability === 'invalid' ||
    availability === 'unchanged' ||
    availability === 'checking' ||
    availability === 'unavailable';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitDisabled || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitError(null);
    try {
      await onSubmit(normalized);
      onClose();
    } catch (err) {
      if (err instanceof UsernameRpcError) {
        // Authoritative failure — submitError carries the definitive message
        // (e.g. "That username isn't available."); do not reuse advisory copy.
        setSubmitError(err.message);
      } else {
        setSubmitError("We couldn't save your username. Please try again.");
      }
    } finally {
      submittingRef.current = false;
    }
  };

  // Availability feedback — text + icon, never color alone.
  const availabilityFeedback = (() => {
    switch (availability) {
      case 'checking':
        return {
          icon: <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />,
          text: 'Checking availability…',
          className: 'text-[#8b8b9e]',
        };
      case 'available':
        return {
          icon: <Check className="w-3.5 h-3.5 flex-shrink-0" />,
          text: `@${normalized} looks available.`,
          className: 'text-[#4ade80]',
        };
      case 'unavailable':
        return {
          icon: <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />,
          text: 'That username may be unavailable. Try another or check again shortly.',
          className: 'text-[#ef4444]',
        };
      case 'unknown':
        return {
          icon: <Info className="w-3.5 h-3.5 flex-shrink-0" />,
          text: "We couldn't check availability — you can still try to save it.",
          className: 'text-[#8b8b9e]',
        };
      case 'unchanged':
        return {
          icon: <Info className="w-3.5 h-3.5 flex-shrink-0" />,
          text: 'This is already your username.',
          className: 'text-[#8b8b9e]',
        };
      case 'invalid':
        return validationMessage
          ? {
              icon: <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />,
              text: validationMessage,
              className: 'text-[#ef4444]',
            }
          : null;
      default:
        return null;
    }
  })();

  const title = mode === 'claim' ? 'Choose your username' : 'Change your username';
  const submitLabel = mode === 'claim' ? 'Claim username' : 'Change username';
  const savingLabel = mode === 'claim' ? 'Claiming…' : 'Saving…';

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[70] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="username-modal-title"
    >
      <div className="bg-[#0f0f14] border border-[#1f1f28] rounded-2xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-[#1f1f28]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#5b5bd6]/20 rounded-xl flex items-center justify-center flex-shrink-0">
              <AtSign className="w-5 h-5 text-[#5b5bd6]" />
            </div>
            <div>
              <h3 id="username-modal-title" className="text-[#e4e4e7]">{title}</h3>
              <p className="text-sm text-[#8b8b9e] mt-0.5">
                Your public handle for connecting with friends
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-[#1f1f28] rounded-lg transition-colors flex-shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-[#8b8b9e]" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {notice && (
            <div className="flex items-start gap-2 text-sm text-[#c4c4e8] bg-[#5b5bd6]/10 border border-[#5b5bd6]/25 rounded-lg px-3 py-2.5">
              <Info className="w-4 h-4 mt-0.5 flex-shrink-0 text-[#7c7ce8]" />
              <span>{notice}</span>
            </div>
          )}

          {mode === 'change' && currentUsername && (
            <p className="text-sm text-[#8b8b9e]">
              Current username:{' '}
              <span className="text-[#e4e4e7]">@{currentUsername}</span>
            </p>
          )}

          <div>
            <label htmlFor="username-claim-input" className="block text-xs text-[#8b8b9e] mb-1.5">
              Username <span className="text-[#ef4444]">*</span>
            </label>
            <div className="relative">
              <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b8b9e]" />
              <input
                id="username-claim-input"
                ref={inputRef}
                type="text"
                autoComplete="off"
                spellCheck={false}
                maxLength={30}
                value={value}
                onChange={(e) => {
                  setValue(e.target.value.toLowerCase());
                  setSubmitError(null);
                }}
                placeholder="your_username"
                aria-describedby="username-claim-status"
                className="w-full bg-[#0a0a0f] border border-[#2a2a35] rounded-lg pl-10 pr-4 py-3 text-sm text-[#e4e4e7] placeholder:text-[#5b5b6e] focus:outline-none focus:border-[#5b5bd6] transition-colors"
              />
            </div>
            <p className="text-xs text-[#5b5b6e] mt-1.5">
              3–30 characters — lowercase letters, numbers, and underscores.
            </p>

            {/* Availability status — aria-live so screen readers hear updates. */}
            <div
              id="username-claim-status"
              aria-live="polite"
              className="min-h-[20px] mt-1.5"
            >
              {availabilityFeedback && (
                <span className={`flex items-center gap-1.5 text-xs ${availabilityFeedback.className}`}>
                  {availabilityFeedback.icon}
                  {availabilityFeedback.text}
                </span>
              )}
            </div>
          </div>

          {submitError && (
            <p className="text-xs text-[#ef4444] bg-[#ef4444]/10 border border-[#ef4444]/20 rounded-lg px-3 py-2 flex items-start gap-2">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              {submitError}
            </p>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="submit"
              disabled={submitDisabled}
              className="flex-1 py-2.5 rounded-lg text-sm text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all"
              style={{
                background: 'linear-gradient(135deg, #5b5bd6 0%, #7c7ce8 100%)',
                boxShadow: '0 4px 16px rgba(91,91,214,0.4)',
              }}
            >
              {saving
                ? <><Loader2 className="w-4 h-4 animate-spin" /> {savingLabel}</>
                : submitLabel}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2.5 bg-[#1f1f28] hover:bg-[#2a2a35] disabled:opacity-50 rounded-lg text-sm text-[#e4e4e7] transition-colors"
            >
              {mode === 'claim' ? 'Not now' : 'Cancel'}
            </button>
          </div>

          {mode === 'claim' && (
            <p className="text-xs text-[#5b5b6e] text-center">
              You can also do this later from Settings → Account.
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
