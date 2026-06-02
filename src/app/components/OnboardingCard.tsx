import { X, Users, Heart, Chrome } from 'lucide-react';

const STORAGE_KEY = 'sh_beta1_onboarding_dismissed';

interface OnboardingCardProps {
  onAddFriend: () => void;
  onOpenComfort: () => void;
  onDismiss: () => void;
}

const steps = [
  {
    icon: Users,
    title: 'Add friends',
    body: 'Invite people whose taste you trust. They can send you recommendations and you can do the same.',
  },
  {
    icon: Heart,
    title: 'Add comfort titles',
    body: 'Save familiar shows and films for low-effort rewatch nights. The extension can pick one at random.',
  },
  {
    icon: Chrome,
    title: 'Use the extension',
    body: 'Install the Streaming Helper Chrome extension. It surfaces friend recommendations while you browse Netflix, Prime Video, and more.',
  },
];

export function OnboardingCard({ onAddFriend, onOpenComfort, onDismiss }: OnboardingCardProps) {
  function handleDismiss() {
    localStorage.setItem(STORAGE_KEY, '1');
    onDismiss();
  }

  return (
    <div className="relative bg-gradient-to-br from-[#16162a] to-[#0f0f1e] border border-[#2a2a4a] rounded-2xl p-6 mb-6">
      {/* Dismiss */}
      <button
        onClick={handleDismiss}
        className="absolute top-4 right-4 p-1.5 text-[#5b5b6e] hover:text-[#e4e4e7] hover:bg-[#1f1f28] rounded-lg transition-colors"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>

      {/* Header */}
      <div className="mb-5 pr-8">
        <h2 className="text-lg font-semibold text-[#e4e4e7] mb-1">Welcome to Streaming Helper</h2>
        <p className="text-sm text-[#8b8b9e]">A friend-powered layer for deciding what to watch.</p>
      </div>

      {/* Steps */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
        {steps.map(({ icon: Icon, title, body }, i) => (
          <div key={title} className="flex gap-3">
            <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-[#5b5bd6]/20 border border-[#5b5bd6]/30 flex items-center justify-center mt-0.5">
              <Icon className="w-3.5 h-3.5 text-[#7c7ce8]" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[11px] font-semibold text-[#5b5b6e] tabular-nums">{i + 1}</span>
                <span className="text-sm font-medium text-[#e4e4e7]">{title}</span>
              </div>
              <p className="text-xs text-[#8b8b9e] leading-relaxed">{body}</p>
            </div>
          </div>
        ))}
      </div>

      {/* CTAs */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={onAddFriend}
          className="px-4 py-2 bg-[#5b5bd6] hover:bg-[#7c7ce8] rounded-lg text-sm text-white transition-colors"
        >
          Add a friend
        </button>
        <button
          onClick={onOpenComfort}
          className="px-4 py-2 bg-[#1f1f28] hover:bg-[#2a2a35] border border-[#2a2a35] rounded-lg text-sm text-[#c4c4cf] transition-colors"
        >
          Add comfort title
        </button>
        <a
          href="https://chrome.google.com/webstore"
          target="_blank"
          rel="noopener noreferrer"
          className="px-4 py-2 bg-[#1f1f28] hover:bg-[#2a2a35] border border-[#2a2a35] rounded-lg text-sm text-[#c4c4cf] transition-colors"
        >
          Get the extension
        </a>
        <button
          onClick={handleDismiss}
          className="ml-auto text-xs text-[#5b5b6e] hover:text-[#8b8b9e] transition-colors"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

/** Returns true if the user has already dismissed the onboarding card. */
export function isOnboardingDismissed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}
