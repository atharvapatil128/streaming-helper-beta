import { useEffect, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  Chrome,
  ExternalLink,
  Film,
  Heart,
  Inbox,
  Menu,
  MessageCircle,
  MonitorPlay,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import logo from '../../../imports/image-0.png';
import decisionFatigueImage from '../../../assets/marketing/decision-fatigue-night.webp';
import longshoreArtwork from '../../../assets/marketing/the-longshore.webp';
import comfortArtwork from '../../../assets/marketing/rainy-night-comfort.webp';
import { CHROME_EXTENSION_URL, DASHBOARD_PATH } from '../../../lib/productUrls';
import { replaceableProductMedia } from './marketingMedia';

const FRIENDS = [
  { name: 'Ava', initials: 'AV', color: '#8b7cf6' },
  { name: 'Jordan', initials: 'JO', color: '#5b88d6' },
  { name: 'Riley', initials: 'RI', color: '#b45fd0' },
] as const;

const RECOMMENDATIONS = [
  { title: 'The Longshore', type: 'Drama', sender: 'Maya', time: '2d ago' },
  { title: 'Echoes of Tomorrow', type: 'Sci-fi', sender: 'Jordan', time: '3d ago' },
  { title: 'Small Places, Big Skies', type: 'Comedy', sender: 'Riley', time: '4d ago' },
] as const;

function LogoLockup() {
  return (
    <a className="marketing-logo" href="#top" aria-label="Streaming Helper home">
      <img src={logo} alt="" width="40" height="40" />
      <span>Streaming Helper</span>
    </a>
  );
}

function AddToChromeLink({ compact = false }: { compact?: boolean }) {
  return (
    <a
      className={`marketing-button marketing-button--primary${compact ? ' marketing-button--compact' : ''}`}
      href={CHROME_EXTENSION_URL}
      target="_blank"
      rel="noopener noreferrer"
    >
      <Chrome size={18} aria-hidden />
      Add to Chrome
    </a>
  );
}

function FriendAvatar({
  initials,
  color,
  size = 'medium',
}: {
  initials: string;
  color: string;
  size?: 'small' | 'medium';
}) {
  return (
    <span
      className={`marketing-avatar marketing-avatar--${size}`}
      style={{ backgroundColor: color }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

function RecommendationsDemo({ compact = false }: { compact?: boolean }) {
  const [tab, setTab] = useState<'received' | 'sent'>('received');

  if (replaceableProductMedia.heroDashboard && !compact) {
    const media = replaceableProductMedia.heroDashboard;
    return (
      <img
        className="marketing-product-capture"
        src={media.src}
        alt={media.alt}
        width={media.width}
        height={media.height}
      />
    );
  }

  return (
    <div className={`product-window${compact ? ' product-window--compact' : ''}`}>
      <div className="product-sidebar">
        <img src={logo} alt="" width="28" height="28" />
        <div className="product-sidebar__items" aria-hidden>
          <span className="is-active"><Sparkles size={15} /> Recommendations</span>
          <span><Heart size={15} /> Comfort Picks</span>
          <span><Users size={15} /> Friends</span>
        </div>
      </div>

      <div className="product-main">
        <div className="product-topbar">
          <div>
            <span className="product-eyebrow">YOUR WATCHSPACE</span>
            <h3>Recommendations</h3>
          </div>
          <FriendAvatar initials="AV" color="#8b7cf6" size="small" />
        </div>

        <div className="product-tabs" role="tablist" aria-label="Recommendation preview">
          <button
            className={tab === 'received' ? 'is-active' : ''}
            type="button"
            role="tab"
            aria-selected={tab === 'received'}
            onClick={() => setTab('received')}
          >
            Received
          </button>
          <button
            className={tab === 'sent' ? 'is-active' : ''}
            type="button"
            role="tab"
            aria-selected={tab === 'sent'}
            onClick={() => setTab('sent')}
          >
            Sent
          </button>
        </div>

        <p className="product-section-label">
          {tab === 'received' ? 'Recommended by friends' : 'Recommendations you sent'}
        </p>

        <div className="recommendation-list">
          {RECOMMENDATIONS.slice(0, compact ? 1 : 3).map((item, index) => (
            <article className="recommendation-row" key={item.title}>
              <img src={longshoreArtwork} alt="" width="120" height="68" />
              <div className="recommendation-row__copy">
                <strong>{item.title}</strong>
                <span>{item.type} · {tab === 'received' ? `From ${item.sender}` : `To ${item.sender}`}</span>
                {!compact && <small>{item.time}</small>}
              </div>
              <button type="button" aria-label={`Open ${item.title}`}>
                Open <ExternalLink size={12} />
              </button>
            </article>
          ))}
        </div>

        {!compact && (
          <div className="comfort-preview">
            <div>
              <span className="product-section-label">Comfort Pick</span>
              <strong>Rainy Night Comfort</strong>
              <small>Something familiar, whenever you need it.</small>
            </div>
            <img src={comfortArtwork} alt="" width="124" height="70" />
          </div>
        )}
      </div>
    </div>
  );
}

function FriendPickerDemo() {
  const [selected, setSelected] = useState('Ava');
  const [sent, setSent] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);

  if (replaceableProductMedia.extensionPicker) {
    const media = replaceableProductMedia.extensionPicker;
    return (
      <img
        className="marketing-product-capture"
        src={media.src}
        alt={media.alt}
        width={media.width}
        height={media.height}
      />
    );
  }

  return (
    <div className="friend-picker-demo">
      <button
        className="friend-picker-heart"
        type="button"
        aria-label={panelOpen ? 'Recommendation picker is open' : 'Open recommendation picker'}
        aria-expanded={panelOpen}
        onClick={() => setPanelOpen(true)}
      >
        <Heart size={26} fill="currentColor" aria-hidden />
      </button>
      {panelOpen && <div className="friend-picker-panel">
        <div className="friend-picker-panel__top">
          <div>
            <span>RECOMMEND</span>
            <strong>The Longshore</strong>
          </div>
          <button
            type="button"
            aria-label="Close recommendation preview"
            onClick={() => setPanelOpen(false)}
          >
            <X size={17} />
          </button>
        </div>
        <p>Who would enjoy this?</p>
        <div className="friend-picker-list">
          {FRIENDS.map((friend) => (
            <button
              className={selected === friend.name ? 'is-selected' : ''}
              key={friend.name}
              type="button"
              onClick={() => {
                setSelected(friend.name);
                setSent(false);
              }}
            >
              <FriendAvatar initials={friend.initials} color={friend.color} size="small" />
              <span>{friend.name}</span>
              <span className="friend-picker-radio" aria-hidden>
                {selected === friend.name && <Check size={12} />}
              </span>
            </button>
          ))}
        </div>
        <button
          className={`friend-picker-send${sent ? ' is-sent' : ''}`}
          type="button"
          aria-live="polite"
          onClick={() => setSent(true)}
        >
          {sent ? <><Check size={16} /> Sent to {selected}</> : <><Send size={16} /> Send recommendation</>}
        </button>
      </div>}
    </div>
  );
}

function LandingHeader() {
  const [open, setOpen] = useState(false);

  const closeMenu = () => setOpen(false);

  useEffect(() => {
    if (!open) return undefined;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [open]);

  return (
    <header className="marketing-header">
      <div className="marketing-shell marketing-header__inner">
        <LogoLockup />
        <button
          className="marketing-menu-button"
          type="button"
          aria-label={open ? 'Close navigation' : 'Open navigation'}
          aria-expanded={open}
          aria-controls="marketing-primary-navigation"
          onClick={() => setOpen((current) => !current)}
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
        <nav
          className={`marketing-nav${open ? ' is-open' : ''}`}
          id="marketing-primary-navigation"
          aria-label="Primary navigation"
        >
          <a href="#how-it-works" onClick={closeMenu}>How it works</a>
          <a href="#extension" onClick={closeMenu}>Extension</a>
          <a href="#friends" onClick={closeMenu}>Friends</a>
          <a href="/help" onClick={closeMenu}>Help</a>
          <a className="marketing-nav__signin" href={DASHBOARD_PATH} onClick={closeMenu}>Sign in</a>
          <AddToChromeLink compact />
        </nav>
      </div>
    </header>
  );
}

function HowItWorks() {
  const [activeStep, setActiveStep] = useState(0);
  const steps = [
    {
      icon: BookOpen,
      title: 'Bring your watch world together',
      copy: 'Keep recommendations and comfort titles organized in one place. No more digging through group chats.',
      visual: <RecommendationsDemo compact />,
    },
    {
      icon: MonitorPlay,
      title: 'Get help where you already watch',
      copy: 'Streaming Helper appears on supported streaming services right when you need it.',
      visual: (
        <div className="figma-watch-preview">
          <img src={longshoreArtwork} alt="" />
          <span><Heart size={20} fill="currentColor" aria-hidden /></span>
          <strong>The Longshore</strong>
          <small>Detected on a supported watch page</small>
        </div>
      ),
    },
    {
      icon: Send,
      title: 'Share a better pick',
      copy: 'Choose a friend, send the title, and get back to watching. They will find it waiting later.',
      visual: <FriendPickerDemo />,
    },
  ];

  return (
    <section className="marketing-section how-section" id="how-it-works">
      <div className="marketing-shell">
        <div className="figma-section-heading figma-section-heading--center">
          <span className="marketing-kicker">SIMPLE BY DESIGN</span>
          <h2>Three simple steps to your <em>best watch yet.</em></h2>
        </div>
        <div className="figma-how-layout">
          <div className="figma-how-steps">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
                <button
                  className={`figma-how-step${activeStep === index ? ' is-active' : ''}`}
                  key={step.title}
                  type="button"
                  onClick={() => setActiveStep(index)}
                  aria-pressed={activeStep === index}
                >
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <div>
                    <strong><Icon size={18} aria-hidden /> {step.title}</strong>
                    <p>{step.copy}</p>
                  </div>
                </button>
            );
          })}
          </div>
          <div className="figma-how-visual" aria-live="polite">
            {steps[activeStep].visual}
          </div>
        </div>
      </div>
    </section>
  );
}

function ProblemSection() {
  const problems = [
    { icon: MonitorPlay, label: 'Too many streaming apps, not enough time' },
    { icon: MessageCircle, label: 'Recommendations disappear into messages' },
    { icon: Users, label: 'Nobody remembers what everyone wanted' },
    { icon: Film, label: 'Great titles get lost in the shuffle' },
  ];

  return (
    <section className="marketing-section figma-problem-section">
      <div className="marketing-shell figma-problem-layout">
        <div className="figma-problem-image" aria-hidden>
          <img src={decisionFatigueImage} alt="" loading="lazy" />
        </div>
        <div className="figma-problem-copy">
          <span className="marketing-kicker">TIRED OF ENDLESS SCROLLING?</span>
          <h2>You spend more time <em>choosing</em> than watching.</h2>
          <div className="figma-problem-list">
            {problems.map(({ icon: Icon, label }) => (
              <div key={label}><Icon size={19} aria-hidden /><span>{label}</span></div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function ExtensionStory() {
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <section className="marketing-section figma-extension-section" id="extension">
      <div className="marketing-shell">
        <div className="figma-section-heading figma-section-heading--center">
          <span className="marketing-kicker">RIGHT WHERE YOU WATCH</span>
          <h2>The extension that <em>knows what you’re watching.</em></h2>
        </div>
        <div className="figma-extension-stage">
          <img src={longshoreArtwork} alt="A fictional drama titled The Longshore" loading="lazy" />
          <div className="figma-extension-stage__shade" aria-hidden />
          <div className="figma-extension-title">
            <span>DRAMA · 2026</span>
            <strong>The Longshore</strong>
            <p>A quiet drama about distance, memory, and return.</p>
          </div>
          <button
            className="figma-extension-heart"
            type="button"
            aria-label={pickerOpen ? 'Close recommendation picker' : 'Recommend The Longshore'}
            aria-expanded={pickerOpen}
            onClick={() => setPickerOpen((value) => !value)}
          >
            <Heart size={23} fill={pickerOpen ? 'currentColor' : 'none'} aria-hidden />
          </button>
          {pickerOpen && <div className="figma-extension-picker"><FriendPickerDemo /></div>}
        </div>
        <p className="figma-demo-hint">Click the heart to try the recommendation flow.</p>
      </div>
    </section>
  );
}

function HandoffStory() {
  const [view, setView] = useState<'extension' | 'dashboard'>('extension');

  return (
    <section className="marketing-section figma-handoff-section">
      <div className="marketing-shell">
        <div className="figma-section-heading figma-section-heading--center">
          <span className="marketing-kicker">SEAMLESS HANDOFF</span>
          <h2>Recommend it <em>there.</em> Find it <em>here.</em></h2>
          <p>A title sent through the extension appears in the recipient’s dashboard.</p>
        </div>
        <div className="figma-toggle" role="tablist" aria-label="Extension to dashboard preview">
          <button type="button" role="tab" aria-selected={view === 'extension'} className={view === 'extension' ? 'is-active' : ''} onClick={() => setView('extension')}>Extension</button>
          <button type="button" role="tab" aria-selected={view === 'dashboard'} className={view === 'dashboard' ? 'is-active' : ''} onClick={() => setView('dashboard')}>Dashboard</button>
        </div>
        <div className="figma-handoff-visual" aria-live="polite">
          {view === 'extension' ? <FriendPickerDemo /> : <RecommendationsDemo />}
        </div>
      </div>
    </section>
  );
}

function FriendsStory() {
  return (
    <section className="marketing-section figma-friends-section" id="friends">
      <div className="marketing-shell figma-friends-layout">
        <div>
          <span className="marketing-kicker">FOR YOUR CIRCLE</span>
          <h2>Great shows are better <em>together.</em></h2>
          <p>Share the titles worth talking about, see what your friends recommend, and keep everyone’s best picks from disappearing into the group chat.</p>
        </div>
        <div className="figma-friend-feed">
          <div className="figma-friend-feed__people">
            {FRIENDS.map((friend) => (
              <span key={friend.name}><FriendAvatar initials={friend.initials} color={friend.color} /><small>{friend.name}</small></span>
            ))}
          </div>
          <article>
            <div><FriendAvatar initials="AV" color="#8b7cf6" /><span><strong>Ava recommended this</strong><small>Just now</small></span></div>
            <img src={longshoreArtwork} alt="" loading="lazy" />
            <div className="figma-friend-title"><strong>The Longshore</strong><span>Drama · 2026 · From Ava</span></div>
            <a href={DASHBOARD_PATH}>Open recommendation <ArrowRight size={14} aria-hidden /></a>
          </article>
        </div>
      </div>
    </section>
  );
}

const COMFORT_GROUPS = {
  Familiar: [
    { title: 'Rainy Night Comfort', image: comfortArtwork, detail: 'Warm, familiar, easy to return to.' },
    { title: 'The Longshore', image: longshoreArtwork, detail: 'A favorite with room to breathe.' },
    { title: 'Quiet Evenings', image: decisionFatigueImage, detail: 'Low stakes for a slower night.' },
  ],
  'Easy watching': [
    { title: 'Small Places, Big Skies', image: longshoreArtwork, detail: 'Light, calm, and uncomplicated.' },
    { title: 'Rainy Night Comfort', image: comfortArtwork, detail: 'Ready whenever choosing feels hard.' },
    { title: 'The Longshore', image: decisionFatigueImage, detail: 'A dependable evening pick.' },
  ],
  'Watch with friends': [
    { title: 'The Longshore', image: longshoreArtwork, detail: 'A title worth talking about.' },
    { title: 'Quiet Evenings', image: decisionFatigueImage, detail: 'An easy shared watch.' },
    { title: 'Rainy Night Comfort', image: comfortArtwork, detail: 'Familiar company for the whole group.' },
  ],
} as const;

function ComfortStory() {
  const [group, setGroup] = useState<keyof typeof COMFORT_GROUPS>('Familiar');

  return (
    <section className="marketing-section figma-comfort-section">
      <div className="marketing-shell">
        <div className="figma-section-heading figma-section-heading--center">
          <span className="marketing-kicker">NOT EVERY NIGHT NEEDS A NEW DISCOVERY</span>
          <h2>Keep your favorites <em>close.</em></h2>
          <p>Comfort titles give you a quick route back to the films and shows you love—no searching required.</p>
        </div>
        <div className="figma-toggle" role="tablist" aria-label="Comfort title groups">
          {Object.keys(COMFORT_GROUPS).map((label) => (
            <button key={label} type="button" role="tab" aria-selected={group === label} className={group === label ? 'is-active' : ''} onClick={() => setGroup(label as keyof typeof COMFORT_GROUPS)}>{label}</button>
          ))}
        </div>
        <div className="figma-comfort-grid">
          {COMFORT_GROUPS[group].map((item) => (
            <article key={item.title}>
              <img src={item.image} alt="" loading="lazy" />
              <div><Heart size={16} fill="currentColor" aria-hidden /><span><strong>{item.title}</strong><small>{item.detail}</small></span></div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function TrustSection() {
  const items = [
    { icon: Users, title: 'Recommendations from people you know', copy: 'Your picks come only from friends you have connected with.' },
    { icon: ShieldCheck, title: 'Private account information stays private', copy: 'Sensitive account data is not exposed inside streaming pages.' },
    { icon: BookOpen, title: 'Your lists, your control', copy: 'You decide what to keep and who belongs in your watchspace.' },
    { icon: RefreshCw, title: 'Clear, reversible actions', copy: 'Important actions provide confirmation and recovery where available.' },
  ];

  return (
    <section className="marketing-section figma-trust-section">
      <div className="marketing-shell">
        <div className="figma-section-heading figma-section-heading--center">
          <h2>Designed around <em>your watch life.</em></h2>
        </div>
        <div className="figma-trust-grid">
          {items.map(({ icon: Icon, title, copy }) => (
            <article key={title}><Icon size={21} aria-hidden /><strong>{title}</strong><p>{copy}</p></article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function MarketingLandingPage() {
  return (
    <div className="marketing-page" id="top">
      <LandingHeader />

      <main>
        <section className="marketing-hero marketing-shell" id="product">
          <div className="marketing-hero__copy">
            <span className="marketing-kicker">YOUR PERSONAL WATCHSPACE</span>
            <h1>
              Your shows, your friends, and your next great pick
              <span> together.</span>
            </h1>
            <p>
              Streaming Helper keeps recommendations, comfort titles, and shared discoveries
              in one calm place—so you spend less time choosing and more time watching.
            </p>
            <div className="marketing-actions">
              <AddToChromeLink />
              <a className="marketing-button marketing-button--secondary" href="#how-it-works">
                See how it works <ChevronRight size={18} aria-hidden />
              </a>
            </div>
          </div>

          <div className="marketing-hero__visual">
            <div className="marketing-glow marketing-glow--hero" aria-hidden />
            <div className="figma-product-pills" aria-hidden>
              <span className="is-active"><Inbox size={13} /> Recommendations</span>
              <span><Heart size={13} /> Comfort List</span>
              <span><Users size={13} /> Friends</span>
            </div>
            <RecommendationsDemo />
          </div>
        </section>

        <ProblemSection />
        <HowItWorks />
        <ExtensionStory />
        <HandoffStory />
        <FriendsStory />
        <ComfortStory />
        <TrustSection />

        <section className="marketing-final-cta">
          <div className="marketing-glow marketing-glow--cta" aria-hidden />
          <img src={logo} alt="" width="48" height="48" />
          <h2>Your next favorite is waiting.<br /><span>Let’s find it.</span></h2>
          <p className="figma-final-copy">Keep the things you want to watch, share the ones worth recommending, and make tonight’s decision easier.</p>
          <div className="marketing-actions">
            <AddToChromeLink />
            <a className="marketing-button marketing-button--secondary" href={DASHBOARD_PATH}>Open dashboard</a>
          </div>
          <p>Already have an account? <a href={DASHBOARD_PATH}>Sign in</a></p>
        </section>
      </main>

      <footer className="marketing-footer">
        <div className="marketing-shell marketing-footer__inner">
          <LogoLockup />
          <span>Streaming Helper</span>
          <div>
            <a href="/help">Help</a>
            <a href="/privacy">Privacy</a>
            <a href={CHROME_EXTENSION_URL} target="_blank" rel="noopener noreferrer">
              Chrome Web Store <ChevronRight size={13} aria-hidden />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
