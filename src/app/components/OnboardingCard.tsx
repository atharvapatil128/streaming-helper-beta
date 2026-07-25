import { Chrome, Heart, Users, X } from 'lucide-react';
import { CHROME_EXTENSION_URL } from '../../lib/productUrls';

interface OnboardingCardProps {
  onAddFriend: () => void;
  onOpenComfort: () => void;
  onDismiss: () => void;
}

const steps = [
  {
    icon: Users,
    title: 'Connect with friends',
    description: 'Add people whose taste you trust.',
  },
  {
    icon: Heart,
    title: 'Keep comfort picks',
    description: 'Save familiar titles for low-effort nights.',
  },
  {
    icon: Chrome,
    title: 'Bring it streaming',
    description: 'Use the extension on supported platforms.',
  },
];

export function OnboardingCard({
  onAddFriend,
  onOpenComfort,
  onDismiss,
}: OnboardingCardProps) {
  return (
    <section className="dashboard-onboarding" aria-labelledby="getting-started-title">
      <button
        type="button"
        onClick={onDismiss}
        className="dashboard-icon-button absolute right-3 top-3"
        aria-label="Dismiss getting started guide"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>

      <div className="pr-12">
        <h2 id="getting-started-title" className="text-base font-semibold text-[#f1f2f6]">
          Set up your watch circle
        </h2>
        <p className="mt-1 text-sm text-[#858a9d]">
          Three short steps make recommendations useful wherever you watch.
        </p>
      </div>

      <div className="dashboard-onboarding-grid">
        {steps.map(({ icon: Icon, title, description }) => (
          <div key={title} className="dashboard-onboarding-step">
            <Icon className="h-5 w-5 text-[#a895ff]" aria-hidden />
            <h3 className="mt-3 text-sm font-semibold text-[#f1f2f6]">{title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-[#858a9d]">{description}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button type="button" onClick={onAddFriend} className="dashboard-primary-action">
          Add a friend
        </button>
        <button type="button" onClick={onOpenComfort} className="dashboard-secondary-action">
          Add comfort title
        </button>
        <a
          href={CHROME_EXTENSION_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="dashboard-secondary-action"
        >
          Get the extension
        </a>
      </div>
    </section>
  );
}
