import { useEffect, useState } from 'react';
import {
  ArrowRight,
  Check,
  ChevronRight,
  Chrome,
  ExternalLink,
  Heart,
  Menu,
  Search,
  Send,
  Sparkles,
  UserPlus,
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
          <a href="#product" onClick={closeMenu}>Product</a>
          <a href="#how-it-works" onClick={closeMenu}>How it works</a>
          <a href="#friends" onClick={closeMenu}>Friends</a>
          <a className="marketing-nav__signin" href={DASHBOARD_PATH} onClick={closeMenu}>Sign in</a>
          <AddToChromeLink compact />
        </nav>
      </div>
    </header>
  );
}

function HowItWorks() {
  const steps = [
    {
      icon: UserPlus,
      title: 'Add friends you trust',
      copy: 'Connect with friends in the companion dashboard.',
      visual: (
        <div className="add-friends-demo">
          <div className="add-friends-demo__search"><Search size={14} /> Search by username</div>
          {FRIENDS.slice(0, 2).map((friend) => (
            <div className="add-friends-demo__row" key={friend.name}>
              <FriendAvatar initials={friend.initials} color={friend.color} size="small" />
              <span>{friend.name}</span>
              <button type="button">Add</button>
            </div>
          ))}
        </div>
      ),
    },
    {
      icon: Heart,
      title: 'Recommend while watching',
      copy: 'Click the heart, choose a friend, and send the title.',
      visual: <FriendPickerDemo />,
    },
    {
      icon: Sparkles,
      title: 'Find it when you need it',
      copy: 'Open Received recommendations later and choose where to watch.',
      visual: <RecommendationsDemo compact />,
    },
  ];

  return (
    <section className="marketing-section how-section" id="how-it-works">
      <div className="marketing-shell">
        <div className="section-intro">
          <span className="marketing-kicker">HOW IT WORKS</span>
          <h2>Three simple steps from<br />“you’d love this” to watch night.</h2>
        </div>
        <div className="how-grid">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <article className="how-step" key={step.title}>
                <div className="how-step__number">{index + 1}</div>
                <div className="how-step__title">
                  <Icon size={19} aria-hidden />
                  <h3>{step.title}</h3>
                </div>
                <p>{step.copy}</p>
                <div className="how-step__visual">{step.visual}</div>
              </article>
            );
          })}
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
            <span className="marketing-kicker">FRIEND-POWERED RECOMMENDATIONS</span>
            <h1>
              Good shows are better when
              <span> a friend sends them.</span>
            </h1>
            <p>
              Recommend what you’re watching in one click. Find trusted picks later,
              and keep comfort titles close for nights when choosing feels impossible.
            </p>
            <div className="marketing-actions">
              <AddToChromeLink />
              <a className="marketing-button marketing-button--secondary" href={DASHBOARD_PATH}>
                Open the dashboard <ArrowRight size={18} aria-hidden />
              </a>
            </div>
            <div className="marketing-trust">
              <div className="marketing-avatar-stack" aria-hidden>
                {FRIENDS.map((friend) => (
                  <FriendAvatar
                    key={friend.name}
                    initials={friend.initials}
                    color={friend.color}
                    size="small"
                  />
                ))}
              </div>
              <span>Recommendations stay between you and the friends you choose.</span>
            </div>
          </div>

          <div className="marketing-hero__visual">
            <div className="marketing-glow marketing-glow--hero" aria-hidden />
            <RecommendationsDemo />
          </div>
        </section>

        <HowItWorks />

        <section className="marketing-section problem-section" id="friends">
          <div className="marketing-shell problem-grid">
            <div className="problem-copy">
              <span className="marketing-kicker">STOP LOSING GOOD PICKS</span>
              <h2>Stop losing good recommendations in old chats.</h2>
              <p>
                Streaming Helper keeps trusted friends’ picks and familiar comfort
                titles ready when you can’t decide what to watch.
              </p>
              <ul className="marketing-check-list">
                <li><Check size={16} /> Friends’ picks in one place</li>
                <li><Check size={16} /> Received and Sent lists</li>
                <li><Check size={16} /> Comfort Pick when familiar feels better</li>
                <li><Check size={16} /> Open titles on supported streaming platforms</li>
              </ul>
            </div>
            <div className="problem-visual">
              <img
                src={decisionFatigueImage}
                alt="A person deciding what to watch on a quiet evening"
                width="1600"
                height="900"
                loading="lazy"
              />
              <div className="problem-messages" aria-label="Example conversation">
                <span>Nothing sounds good.</span>
                <span>Should we watch something new?</span>
                <span>I’ll pick… no, you pick.</span>
                <strong><img src={logo} alt="" /> Maya recommended The Longshore.</strong>
              </div>
            </div>
          </div>
        </section>

        <section className="marketing-section capabilities-section">
          <div className="marketing-shell capabilities-grid">
            <div className="capabilities-copy">
              <span className="marketing-kicker">BUILT FOR WHAT MATTERS</span>
              <h2>Everything you need.<br />Nothing you don’t.</h2>
              <div className="capability-list">
                <article>
                  <Sparkles size={21} />
                  <div><h3>Friend recommendations</h3><p>Keep trusted picks in one clear Received list.</p></div>
                </article>
                <article>
                  <Heart size={21} />
                  <div><h3>Comfort Picks</h3><p>Save familiar titles for nights when you want something easy.</p></div>
                </article>
                <article>
                  <Users size={21} />
                  <div><h3>Manage friends</h3><p>Choose whose recommendations are part of your watchspace.</p></div>
                </article>
                <article>
                  <ExternalLink size={21} />
                  <div><h3>Open where you stream</h3><p>Continue to supported title pages or platform searches.</p></div>
                </article>
              </div>
            </div>
            <div className="capabilities-visual">
              <RecommendationsDemo />
              <div className="capabilities-heart-card" aria-hidden>
                <Heart size={24} fill="currentColor" />
                <span>Send this to a friend</span>
                <div className="marketing-avatar-stack">
                  {FRIENDS.map((friend) => (
                    <FriendAvatar
                      key={friend.name}
                      initials={friend.initials}
                      color={friend.color}
                      size="small"
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="marketing-final-cta">
          <div className="marketing-glow marketing-glow--cta" aria-hidden />
          <span className="marketing-kicker">READY WHEN YOU ARE</span>
          <h2>Less scrolling.<br /><span>More good things to watch.</span></h2>
          <AddToChromeLink />
          <p>Already have an account? <a href={DASHBOARD_PATH}>Sign in</a></p>
        </section>
      </main>

      <footer className="marketing-footer">
        <div className="marketing-shell marketing-footer__inner">
          <LogoLockup />
          <span>Streaming Helper Beta</span>
          <div>
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
