import { useEffect, useState } from 'react';
import { X, UserPlus, Mail, Loader2, AlertCircle, Check } from 'lucide-react';

interface AddFriendModalProps {
  /** Called with the email entered by the user. Should send the friend request. */
  onSend: (email: string) => Promise<void>;
  onClose: () => void;
}

export function AddFriendModal({ onSend, onClose }: AddFriendModalProps) {
  const [email, setEmail]     = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [sentTo, setSentTo]   = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) { setError('Email is required.'); return; }

    setError(null);
    setSending(true);
    try {
      await onSend(trimmed);
      setSentTo(trimmed);
      setEmail('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send request.');
    } finally {
      setSending(false);
    }
  };

  const handleSendAnother = () => {
    setSentTo(null);
    setError(null);
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#0f0f14] border border-[#1f1f28] rounded-2xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[#1f1f28]">
          <div>
            <h2 className="text-xl text-[#e4e4e7]">Add Friend</h2>
            <p className="text-sm text-[#8b8b9e] mt-1">
              {sentTo
                ? 'Request sent!'
                : 'Enter their email to send a friend request'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[#1f1f28] rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-[#8b8b9e]" />
          </button>
        </div>

        {/* Content */}
        {sentTo ? (
          /* Success state */
          <div className="p-6 text-center space-y-4">
            <div className="w-16 h-16 bg-[#5b5bd6]/20 rounded-full flex items-center justify-center mx-auto">
              <Check className="w-8 h-8 text-[#5b5bd6]" />
            </div>
            <div>
              <p className="text-[#e4e4e7] mb-1">Request sent to</p>
              <p className="text-sm text-[#5b5bd6] font-medium">{sentTo}</p>
            </div>
            <p className="text-sm text-[#8b8b9e]">
              {`If they have an account they'll see the request in their notifications. If not, they'll be able to accept it when they sign up.`}
            </p>
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleSendAnother}
                className="flex-1 px-4 py-2.5 bg-[#1f1f28] hover:bg-[#2a2a35] rounded-lg text-sm text-[#e4e4e7] transition-colors"
              >
                Send another
              </button>
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2.5 bg-[#5b5bd6] hover:bg-[#7c7ce8] rounded-lg text-sm text-white transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          /* Email form */
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div>
              <label className="block text-xs text-[#8b8b9e] mb-1.5">
                Email address <span className="text-[#ef4444]">*</span>
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b8b9e]" />
                <input
                  type="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="friend@example.com"
                  className="w-full bg-[#1a1a22] border border-[#2a2a35] rounded-lg pl-10 pr-4 py-2.5 text-sm text-[#e4e4e7] placeholder:text-[#8b8b9e] focus:outline-none focus:border-[#5b5bd6] transition-colors"
                />
              </div>
              <p className="text-xs text-[#8b8b9e] mt-1.5">
                We'll look up their account, or queue a request for when they join.
              </p>
            </div>

            {error && (
              <div className="flex items-start gap-2 text-xs text-[#ef4444] bg-[#ef4444]/10 border border-[#ef4444]/20 rounded-lg px-3 py-2">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2.5 bg-[#1f1f28] hover:bg-[#2a2a35] rounded-lg text-sm text-[#e4e4e7] transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={sending || !email.trim()}
                className="flex-1 px-4 py-2.5 bg-[#5b5bd6] hover:bg-[#7c7ce8] disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-sm text-white transition-colors flex items-center justify-center gap-2"
              >
                {sending
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
                  : <><UserPlus className="w-4 h-4" /> Send Request</>
                }
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
