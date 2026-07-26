import { Loader2 } from 'lucide-react';
import IconMusic from '../../imports/IconMusic';

type AuthHandoffMode = 'checking' | 'dashboard' | 'login';

interface AuthHandoffScreenProps {
  mode: AuthHandoffMode;
  displayName?: string | null;
}

export function AuthHandoffScreen({
  mode,
  displayName,
}: AuthHandoffScreenProps) {
  const title =
    mode === 'checking'
      ? 'Opening Streaming Helper'
      : mode === 'dashboard'
        ? `Logging you in${displayName ? ` as ${displayName}` : ''}`
        : 'Taking you to sign in';

  const description =
    mode === 'checking'
      ? 'Checking your saved session.'
      : mode === 'dashboard'
        ? 'Your recommendations and comfort titles are almost ready.'
        : 'You will be able to continue to your dashboard from there.';

  return (
    <main className="auth-handoff" aria-live="polite" aria-busy="true">
      <div className="auth-handoff-panel">
        <div className="auth-handoff-brand">
          <span className="auth-handoff-logo" aria-hidden>
            <IconMusic />
          </span>
          <span>Streaming Helper</span>
        </div>

        <div className="auth-handoff-copy">
          <Loader2 className="auth-handoff-spinner" aria-hidden />
          <h1>{title}</h1>
          <p>{description}</p>
        </div>

        <div className="auth-handoff-track" aria-hidden>
          <span />
        </div>
      </div>
    </main>
  );
}
