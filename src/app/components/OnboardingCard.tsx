import { X, Users, Heart, Chrome } from 'lucide-react';

// ── Replace "#" with the real Chrome Web Store / setup guide URL when ready ──
// Keep in sync with CHROME_EXTENSION_URL in AuthScreen.tsx
const CHROME_EXTENSION_URL = '#';

interface OnboardingCardProps {
  onAddFriend: () => void;
  onOpenComfort: () => void;
  onDismiss: () => void;
}

const columns = [
  {
    icon: Users,
    title: 'Add friends',
    desc: 'Invite people whose taste you trust and exchange picks.',
  },
  {
    icon: Heart,
    title: 'Add comfort titles',
    desc: 'Save familiar shows for low-effort rewatch nights.',
  },
  {
    icon: Chrome,
    title: 'Use the extension',
    desc: 'Surface friend picks while you browse Netflix, Prime Video, and more.',
  },
];

export function OnboardingCard({ onAddFriend, onOpenComfort, onDismiss }: OnboardingCardProps) {
  return (
    <div
      className="relative rounded-2xl border border-[#2a2a4a] overflow-hidden mb-6"
      style={{
        background: 'linear-gradient(135deg, #13132a 0%, #0f0f1e 60%, #15102b 100%)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.45), inset 0 1px 0 rgba(91,91,214,0.18)',
      }}
    >
      {/* Ambient purple glow — decorative only */}
      <div
        className="pointer-events-none absolute"
        style={{
          top: -80, left: -60,
          width: 300, height: 300,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(91,91,214,0.13) 0%, transparent 70%)',
          filter: 'blur(40px)',
        }}
      />

      <div className="relative p-7">
        {/* Close */}
        <button
          onClick={onDismiss}
          className="absolute top-4 right-4 p-1.5 text-[#5b5b6e] hover:text-[#e4e4e7] hover:bg-white/5 rounded-lg transition-colors"
          aria-label="Dismiss onboarding"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="mb-7 pr-8">
          <h2
            className="font-bold text-[#e4e4e7] mb-1.5 tracking-tight"
            style={{ fontSize: 18 }}
          >
            Welcome to Streaming Helper
          </h2>
          <p className="text-[14px] text-[#8b8b9e]">
            A friend-powered layer for deciding what to watch.
          </p>
        </div>

        {/* Three-column steps */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-7">
          {columns.map(({ icon: Icon, title, desc }, i) => (
            <div
              key={title}
              className="flex flex-col gap-3 rounded-xl p-4"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(91,91,214,0.12)',
              }}
            >
              {/* Icon block */}
              <div
                className="flex items-center justify-center"
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: 'linear-gradient(135deg, rgba(91,91,214,0.22) 0%, rgba(124,124,232,0.12) 100%)',
                  border: '1px solid rgba(91,91,214,0.28)',
                  flexShrink: 0,
                }}
              >
                <Icon className="w-5 h-5 text-[#7c7ce8]" />
              </div>

              {/* Text */}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-bold text-[#5b5bd6] tabular-nums">
                    {i + 1}
                  </span>
                  <span className="text-[14px] font-semibold text-[#e4e4e7]">{title}</span>
                </div>
                <p className="text-[13px] text-[#8b8b9e] leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* CTAs */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={onAddFriend}
            className="px-4 py-2 text-sm font-medium text-white rounded-lg transition-all"
            style={{
              background: 'linear-gradient(135deg, #5b5bd6, #7c7ce8)',
              boxShadow: '0 4px 12px rgba(91,91,214,0.35)',
            }}
          >
            Add a friend
          </button>

          <button
            onClick={onOpenComfort}
            className="px-4 py-2 text-sm font-medium text-[#c4c4cf] rounded-lg transition-colors hover:bg-white/5"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(91,91,214,0.2)',
            }}
          >
            Add comfort title
          </button>

          <a
            href={CHROME_EXTENSION_URL}
            target={CHROME_EXTENSION_URL === '#' ? undefined : '_blank'}
            rel="noopener noreferrer"
            onClick={CHROME_EXTENSION_URL === '#' ? (e) => e.preventDefault() : undefined}
            className="px-4 py-2 text-sm font-medium text-[#7c7ce8] rounded-lg inline-flex items-center gap-1.5 transition-colors hover:bg-[#5b5bd6]/10"
            style={{
              background: 'rgba(91,91,214,0.08)',
              border: '1px solid rgba(91,91,214,0.22)',
              cursor: CHROME_EXTENSION_URL === '#' ? 'default' : 'pointer',
              textDecoration: 'none',
            }}
          >
            Get the extension →
          </a>

          <button
            onClick={onDismiss}
            className="ml-auto text-xs text-[#4a4a5e] hover:text-[#8b8b9e] transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
