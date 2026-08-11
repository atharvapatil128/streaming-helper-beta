import { useCallback, useEffect, useState } from 'react';
import { Check, CheckCircle2, Chrome, Circle, Send, Users, X } from 'lucide-react';
import { CHROME_EXTENSION_URL } from '../../lib/productUrls';
import type { ActivationState } from '../../lib/activationState';
import { detectExtensionConnection, type ExtensionConnectionState } from '../../lib/extensionConnection';
import { trackAcquisitionEvent } from '../../lib/acquisitionAnalytics';

interface OnboardingCardProps {
  activation: ActivationState;
  onAddFriend: () => void;
  onRecommend: () => void;
  onExtensionClick: () => void;
  onDismiss: () => void;
}

export function OnboardingCard({ activation, onAddFriend, onRecommend, onExtensionClick, onDismiss }: OnboardingCardProps) {
  const [extensionState, setExtensionState] = useState<ExtensionConnectionState>({ kind: 'unavailable' });
  const friendComplete = activation.status === 'needs_recommendation' || activation.status === 'activated';
  const recommendationComplete = activation.status === 'activated';
  const waiting = activation.status === 'waiting_for_friend';

  const checkExtension = useCallback(async () => {
    const next = await detectExtensionConnection();
    setExtensionState(next);
    if (next.kind === 'unavailable') return;
    const key = `streaming-helper:extension-observed:${next.kind}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
      trackAcquisitionEvent('extension_connection_observed', {
        source: 'activation_checklist',
        state: next.kind,
      });
      window.sessionStorage.setItem(key, '1');
    } catch {
      trackAcquisitionEvent('extension_connection_observed', {
        source: 'activation_checklist',
        state: next.kind,
      });
    }
  }, []);

  useEffect(() => {
    void checkExtension();
    const onFocus = () => { void checkExtension(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [checkExtension]);

  const steps = [
    { icon: Check, title: 'Account ready', description: 'Your Streaming Helper account is set up.', complete: true },
    {
      icon: Users,
      title: friendComplete ? 'Friend connected' : waiting ? 'Invitation sent' : 'Connect a friend',
      description: friendComplete ? 'You have someone to exchange recommendations with.' : waiting ? 'We will update this step when your friend joins.' : 'Add someone whose recommendations you trust.',
      complete: friendComplete,
    },
    {
      icon: Send,
      title: recommendationComplete ? 'First recommendation sent' : 'Send your first recommendation',
      description: recommendationComplete ? 'Your friend-powered watchlist is underway.' : 'Choose a title and send it to a connected friend.',
      complete: recommendationComplete,
    },
  ];

  return (
    <section id="getting-started-guide" className="dashboard-onboarding" aria-labelledby="getting-started-title" tabIndex={-1}>
      <button type="button" onClick={onDismiss} className="dashboard-icon-button absolute right-3 top-3" aria-label="Dismiss getting started guide">
        <X className="h-4 w-4" aria-hidden />
      </button>
      <div className="pr-12">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#a895ff]">{activation.completedSteps} of {activation.totalSteps} complete</p>
        <h2 id="getting-started-title" className="mt-2 text-base font-semibold text-[#f1f2f6]">Get to your first recommendation</h2>
        <p className="mt-1 text-sm text-[#858a9d]">Streaming Helper becomes useful once you and a friend can exchange a title.</p>
      </div>
      <div className="dashboard-onboarding-grid">
        {steps.map(({ icon: Icon, title, description, complete }) => (
          <div key={title} className="dashboard-onboarding-step">
            {complete ? <Icon className="h-5 w-5 text-[#8f7cf6]" aria-hidden /> : <Circle className="h-5 w-5 text-[#616679]" aria-hidden />}
            <h3 className="mt-3 text-sm font-semibold text-[#f1f2f6]">{title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-[#858a9d]">{description}</p>
          </div>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {!friendComplete && <button type="button" onClick={onAddFriend} className="dashboard-primary-action">{waiting ? 'Invite another friend' : 'Add a friend'}</button>}
        {friendComplete && !recommendationComplete && <button type="button" onClick={onRecommend} className="dashboard-primary-action">Recommend a title</button>}
        <a href={CHROME_EXTENSION_URL} target="_blank" rel="noopener noreferrer" onClick={onExtensionClick} className="dashboard-secondary-action">
          <Chrome className="h-4 w-4" aria-hidden /> {extensionState.kind === 'unavailable' ? 'Add Chrome extension' : 'View Chrome extension'}
        </a>
      </div>
      {extensionState.kind !== 'unavailable' && (
        <p className="dashboard-extension-status" role="status">
          <CheckCircle2 className="h-4 w-4" aria-hidden />
          {extensionState.kind === 'installed_signed_in'
            ? 'Chrome extension detected and signed in.'
            : 'Chrome extension detected. Sign in there to use it while streaming.'}
        </p>
      )}
    </section>
  );
}
