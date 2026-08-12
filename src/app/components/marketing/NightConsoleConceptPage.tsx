import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  ArrowRight,
  Check,
  Chrome,
  Heart,
  Inbox,
  LayoutDashboard,
  LockKeyhole,
  MessageCircle,
  MonitorPlay,
  RotateCcw,
  Send,
  Star,
  UserRoundCheck,
} from 'lucide-react';
import logo from '../../../imports/image-0.png';
import {
  CHROME_EXTENSION_URL,
  DASHBOARD_PATH,
  HELP_PATH,
} from '../../../lib/productUrls';
import { trackAcquisitionEvent } from '../../../lib/acquisitionAnalytics';
import {
  getLandingDashboardLabel,
  type LandingIdentity,
} from '../../../lib/landingIdentity';
import { useLandingIdentity } from '../../hooks/useLandingIdentity';
import '../../../styles/night-console-concept.css';
import { PublicGuideMenu } from '../PublicGuideMenu';
import { StreamingProviderStrip } from '../StreamingProviderStrip';

/*
THESIS: A worthwhile show moves through a visible human relay; this refuses the generic split SaaS hero.
OWN-WORLD: One machined graphite body, convex controls, inset active states, soft white type, violet-to-blue status light.
STORY: See a title, choose a trusted friend, send it, and find it waiting later.
FIRST VIEWPORT: Compact nav, centered statement, then a full-width three-stage relay desk with conversion controls in its lower edge.
FORM: Relay Desk, the approved first composition; horizontal control chassis on desktop, vertical instrument stack on mobile.
*/

const CONCEPT_FRIENDS = [
  { name: 'Ava', initials: 'AV', color: '#9a7cff' },
  { name: 'Jordan', initials: 'JO', color: '#6fa8ff' },
  { name: 'Riley', initials: 'RI', color: '#ce75d8' },
] as const;

const TMDB_IMAGE = 'https://image.tmdb.org/t/p';
const SHOWS = {
  theBear: {
    title: 'The Bear',
    year: '2022',
    genre: 'Comedy · Drama',
    poster: `${TMDB_IMAGE}/w500/eKfVzzEazSIjJMrw9ADa2x8ksLz.jpg`,
    backdrop: `${TMDB_IMAGE}/w1280/aJtG4txtmiRHwAAqENQHZvBs6kY.jpg`,
  },
  abbott: {
    title: 'Abbott Elementary',
    poster: `${TMDB_IMAGE}/w500/nBe1e3JJEZ6veGrVXNF0fRoLu56.jpg`,
  },
  schittsCreek: {
    title: "Schitt's Creek",
    poster: `${TMDB_IMAGE}/w500/iRfSzrPS5VYWQv7KVSEg2BZZL6C.jpg`,
  },
  parks: {
    title: 'Parks and Recreation',
    poster: `${TMDB_IMAGE}/w500/5IOj62y2Eb2ngyYmEn1IJ7bFhzH.jpg`,
  },
} as const;

type RelayState = 'ready' | 'sending' | 'received';
type DiscoveryState = 'menu' | 'recommendations' | 'picked';

function ProductLogo() {
  return (
    <a className="night-logo" href="#night-top" aria-label="Streaming Helper home">
      <img src={logo} alt="" width="34" height="34" />
      <span>Streaming Helper</span>
    </a>
  );
}

function DashboardLink({
  identity,
  large = false,
}: {
  identity: LandingIdentity;
  large?: boolean;
}) {
  const label = getLandingDashboardLabel(identity);
  const isSignedIn = identity.status === 'signed-in';

  return (
    <a
      className={`night-key night-key--primary${large ? ' night-key--large' : ''}${isSignedIn ? ' night-key--account' : ''}`}
      href={DASHBOARD_PATH}
      aria-label={isSignedIn ? `Open dashboard for ${label}` : undefined}
      title={isSignedIn ? `Open dashboard for ${label}` : undefined}
    >
      <LayoutDashboard size={18} aria-hidden />
      <span>{label}</span>
    </a>
  );
}

function ExtensionLink({ large = false }: { large?: boolean }) {
  return (
    <a
      className={`night-key night-key--secondary${large ? ' night-key--large' : ''}`}
      href={CHROME_EXTENSION_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => trackAcquisitionEvent('extension_install_clicked', { source: 'homepage' })}
    >
      <Chrome size={18} aria-hidden />
      Add to Chrome
    </a>
  );
}

export function StableMarketingLandingPage({
  editorialMotionPreview = false,
}: {
  editorialMotionPreview?: boolean;
}) {
  const [selectedFriend, setSelectedFriend] = useState('Ava');
  const [relayState, setRelayState] = useState<RelayState>('ready');
  const [extensionPickerOpen, setExtensionPickerOpen] = useState(false);
  const [extensionFriend, setExtensionFriend] = useState('Ava');
  const [extensionSent, setExtensionSent] = useState(false);
  const [discoveryState, setDiscoveryState] = useState<DiscoveryState>('menu');
  const [discoveryPick, setDiscoveryPick] = useState(0);
  const friendPanelRef = useRef<HTMLDivElement>(null);
  const landingIdentity = useLandingIdentity();

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Streaming Helper — Friend-powered recommendations';
    return () => {
      document.title = previousTitle;
    };
  }, []);

  useEffect(() => {
    if (relayState !== 'sending') return undefined;
    const timer = window.setTimeout(() => setRelayState('received'), 850);
    return () => window.clearTimeout(timer);
  }, [relayState]);

  const sendRecommendation = () => {
    if (relayState === 'sending') return;
    setRelayState('sending');
  };

  const beginRecommendation = () => {
    setRelayState('ready');
    friendPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.requestAnimationFrame(() => {
      friendPanelRef.current
        ?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')
        ?.focus();
    });
  };

  const resetRelay = () => setRelayState('ready');

  const moveEditorialField = (event: ReactPointerEvent<HTMLElement>) => {
    if (
      !editorialMotionPreview ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width - 0.5) * 12;
    const y = ((event.clientY - rect.top) / rect.height - 0.5) * 8;
    event.currentTarget.style.setProperty('--editorial-x', `${x.toFixed(2)}px`);
    event.currentTarget.style.setProperty('--editorial-y', `${y.toFixed(2)}px`);
  };

  const resetEditorialField = (event: ReactPointerEvent<HTMLElement>) => {
    event.currentTarget.style.setProperty('--editorial-x', '0px');
    event.currentTarget.style.setProperty('--editorial-y', '0px');
  };

  return (
    <div
      className={`night-page${editorialMotionPreview ? ' night-page--editorial-preview' : ''}`}
      id="night-top"
    >
      <header className="night-header">
        <div className="night-shell night-header__inner">
          <ProductLogo />
          <nav aria-label="Primary navigation">
            <PublicGuideMenu />
            <a href="#night-discovery">Extension</a>
            <a href="#night-dashboard">Dashboard</a>
            <a href="#night-comfort">Comfort Picks</a>
            <a href={HELP_PATH}>Help</a>
            {landingIdentity.status !== 'signed-in' && <a href={DASHBOARD_PATH}>Sign in</a>}
            <DashboardLink identity={landingIdentity} />
          </nav>
        </div>
      </header>

      <main>
        <section
          className="night-hero night-shell"
          onPointerMove={editorialMotionPreview ? moveEditorialField : undefined}
          onPointerLeave={editorialMotionPreview ? resetEditorialField : undefined}
        >
          {editorialMotionPreview && (
            <div className="night-editorial-field" aria-hidden>
              <svg viewBox="0 0 1320 720" preserveAspectRatio="none">
                <path d="M-70 120C120 22 220 202 390 110S675 1 842 108s280 82 560-30" />
                <path d="M-120 250C70 170 198 314 370 236s300-146 476-32 325 84 560-38" />
                <path d="M-90 392C104 304 232 442 414 366s315-128 488-10 312 94 514-18" />
                <path d="M-110 542C82 444 250 594 438 510s322-100 486 14 278 88 492 12" />
                <path d="M118 744C40 602 216 536 172 384S74 124 228-28" />
                <path d="M1050 760C978 612 1138 528 1092 370S982 112 1154-40" />
              </svg>
            </div>
          )}
          <div className="night-hero__copy">
            <p className="night-inscription">FRIEND-POWERED WATCHING</p>
            <h1>
              Good recommendations shouldn’t get lost in the{' '}
              {editorialMotionPreview ? <em>group chat</em> : 'group chat.'}
            </h1>
            <p>
              Send a show while you watch. Streaming Helper keeps it ready for the
              night your friend needs a good pick.
            </p>
          </div>

          <div className="night-console" id="night-relay">
            <div className="night-console__topline">
              <span>STREAMING HELPER / RECOMMENDATION RELAY</span>
              <span
                className={`night-status night-status--${relayState}`}
                role="status"
                aria-live="polite"
              >
                <i aria-hidden />
                {relayState === 'ready' && 'Ready'}
                {relayState === 'sending' && 'Relaying'}
                {relayState === 'received' && 'Delivered'}
              </span>
            </div>

            <div className={`night-relay night-relay--${relayState}`}>
              <article className="night-module night-module--watch">
                <div className="night-module__label">
                  <span>1</span>
                  <p>YOU’RE WATCHING</p>
                </div>
                <div className="night-watch-card">
                  <img
                    src={SHOWS.theBear.poster}
                    alt="The Bear poster"
                    width="500"
                    height="750"
                    decoding="async"
                  />
                  <div>
                    <small>{SHOWS.theBear.genre.toUpperCase()} · {SHOWS.theBear.year}</small>
                    <strong>{SHOWS.theBear.title}</strong>
                    <p>A high-pressure kitchen story you are ready to pass to a friend.</p>
                  </div>
                </div>
                <button className="night-heart-key" type="button" onClick={beginRecommendation}>
                  <Heart size={20} fill="currentColor" aria-hidden />
                  Recommend this
                </button>
              </article>

              <div className="night-relay-link" aria-hidden>
                <span />
              </div>

              <article className="night-module night-module--friends">
                <div className="night-module__label">
                  <span>2</span>
                  <p>SEND TO A FRIEND</p>
                </div>
                <div ref={friendPanelRef} className="night-friend-list" aria-label="Choose a friend">
                  {CONCEPT_FRIENDS.map((friend) => (
                    <button
                      className={selectedFriend === friend.name ? 'is-selected' : ''}
                      key={friend.name}
                      type="button"
                      aria-pressed={selectedFriend === friend.name}
                      onClick={() => {
                        setSelectedFriend(friend.name);
                        setRelayState('ready');
                      }}
                    >
                      <span style={{ background: friend.color }}>{friend.initials}</span>
                      <strong>{friend.name}</strong>
                      <i aria-hidden>{selectedFriend === friend.name && <Check size={12} />}</i>
                    </button>
                  ))}
                </div>
                <button
                  className="night-send-key"
                  type="button"
                  disabled={relayState === 'sending'}
                  onClick={sendRecommendation}
                >
                  {relayState === 'sending' ? (
                    <>Sending…</>
                  ) : (
                    <><Send size={16} aria-hidden /> Send to {selectedFriend}</>
                  )}
                </button>
              </article>

              <div className="night-relay-link" aria-hidden>
                <span />
              </div>

              <article className="night-module night-module--received" aria-live="polite">
                <div className="night-module__label">
                  <span>3</span>
                  <p>RECEIVED</p>
                </div>
                <div className={`night-receipt${relayState === 'received' ? ' is-received' : ''}`}>
                  <Inbox size={23} aria-hidden />
                  {relayState === 'received' ? (
                    <>
                      <small>FROM MAYA · JUST NOW</small>
                      <strong>{SHOWS.theBear.title}</strong>
                      <p>Waiting in {selectedFriend}’s recommendations.</p>
                      <span><Check size={13} aria-hidden /> Recommendation received</span>
                    </>
                  ) : (
                    <>
                      <small>{relayState === 'sending' ? 'IN TRANSIT' : 'WAITING'}</small>
                      <strong>{relayState === 'sending' ? 'Passing it along…' : 'Ready for a good pick'}</strong>
                      <p>The recommendation will stay here until your friend is ready.</p>
                    </>
                  )}
                </div>
              </article>
            </div>

            <div className="night-console__controls">
              <button
                className="night-reset"
                type="button"
                onClick={resetRelay}
                disabled={relayState === 'ready'}
              >
                <RotateCcw size={15} aria-hidden /> Reset demo
              </button>
              <div className="night-progress" aria-hidden>
                <span>RELAY</span>
                <i><b /></i>
                <span>{relayState === 'received' ? 'COMPLETE' : 'IN PROGRESS'}</span>
              </div>
              <div className="night-console__actions">
                <DashboardLink identity={landingIdentity} large />
                <ExtensionLink large />
              </div>
            </div>
          </div>
        </section>

        <section className="night-start" id="night-start">
          <div className="night-shell">
            <div className="night-start__heading">
              <div>
                <p className="night-inscription">START HERE</p>
                <h2>Three steps to your first friend-powered pick</h2>
              </div>
              <p>
                Set up the dashboard first, bring the helper to Chrome, then add
                someone you trust. Your recommendations will stay connected
                across both places.
              </p>
            </div>

            <ol className="night-start__rail">
              <li>
                <div className="night-start__number">01</div>
                <div className="night-start__icon">
                  <LayoutDashboard size={21} aria-hidden />
                </div>
                <div>
                  <small>YOUR HOME BASE</small>
                  <h3>Create your watchspace</h3>
                  <p>
                    Make an account to keep friends, recommendations, and
                    comfort titles together.
                  </p>
                  <a href={DASHBOARD_PATH}>
                    Create an account <ArrowRight size={15} aria-hidden />
                  </a>
                </div>
              </li>
              <li>
                <div className="night-start__number">02</div>
                <div className="night-start__icon">
                  <Chrome size={21} aria-hidden />
                </div>
                <div>
                  <small>WHERE YOU WATCH</small>
                  <h3>Add the Chrome extension</h3>
                  <p>
                    Install the helper and connect it using the same username
                    or email and password.
                  </p>
                  <a
                    href={CHROME_EXTENSION_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => trackAcquisitionEvent('extension_install_clicked', { source: 'start_here' })}
                  >
                    Add to Chrome <ArrowRight size={15} aria-hidden />
                  </a>
                </div>
              </li>
              <li>
                <div className="night-start__number">03</div>
                <div className="night-start__icon">
                  <UserRoundCheck size={21} aria-hidden />
                </div>
                <div>
                  <small>MAKE IT SOCIAL</small>
                  <h3>Add a friend and start watching</h3>
                  <p>
                    Connect with a friend, then send a title while you watch or
                    open one they saved for you.
                  </p>
                  <a href={`${DASHBOARD_PATH}?action=friend-requests`}>
                    Find your friends <ArrowRight size={15} aria-hidden />
                  </a>
                </div>
              </li>
            </ol>
            <div className="night-start__requirements" role="note">
              <strong>What you need</strong>
              <span>Free</span>
              <span>Chrome on desktop</span>
              <span>Netflix, Prime Video, Disney+, Hulu, or Max</span>
              <span>Both friends need Streaming Helper</span>
            </div>
            <nav className="night-start__guides" aria-label="Explore Streaming Helper guides">
              <div>
                <p className="night-inscription">GO DEEPER</p>
                <strong>Clear answers when you need more detail</strong>
              </div>
              <a href="/how-it-works">
                <span>Complete walkthrough</span>
                <ArrowRight size={15} aria-hidden />
              </a>
              <a href="/share-show-recommendations">
                <span>Share a recommendation</span>
                <ArrowRight size={15} aria-hidden />
              </a>
              <a href="/save-tv-show-recommendations">
                <span>Keep recommendations organized</span>
                <ArrowRight size={15} aria-hidden />
              </a>
            </nav>
          </div>
        </section>

        <div className="night-shell">
          <StreamingProviderStrip mode="marquee" heading="Streaming Helper meets you where you already watch" />
        </div>

        <section className="night-problem">
          <div className="night-shell night-problem__grid">
            <div>
              <p className="night-inscription">THE PROBLEM</p>
              <h2>Great recommendations get lost in conversation</h2>
            </div>
            <div className="night-problem__support">
              <p>
                Someone tells you about a show. You mean to remember it. Later,
                the title is buried in a thread and you are back to scrolling.
                Streaming Helper gives that recommendation a place to wait.
              </p>
              <div className="night-problem__signals">
                <span><MessageCircle size={18} aria-hidden /> Told, not saved</span>
                <span><RotateCcw size={18} aria-hidden /> Forgotten later</span>
                <span><Inbox size={18} aria-hidden /> Hard to find</span>
              </div>
            </div>
          </div>
        </section>

        <section className="night-discovery" id="night-discovery">
          <div className="night-shell">
            <div className="night-discovery__heading">
              <div>
                <p className="night-inscription">WHEN YOU NEED A PICK</p>
                <h2>Open the helper. See what your friends sent.</h2>
              </div>
              <p>
                Away from a watch screen, the regular Streaming Helper icon
                opens Friend Recommendations and Comfort Pick. Choose Friend
                Recommendations to see the titles waiting for you—without
                returning to the dashboard.
              </p>
            </div>

            <div className="night-discovery__demo">
              <div className="night-discovery__bar">
                <i /><i /><i />
                <span>Supported Streaming Page</span>
                <button
                  className={`night-discovery__passive-icon${discoveryState !== 'menu' ? ' is-active' : ''}`}
                  type="button"
                  aria-label="Open Streaming Helper"
                  aria-pressed={discoveryState !== 'menu'}
                  onClick={() => setDiscoveryState('menu')}
                >
                  <img src={logo} alt="" width="32" height="32" />
                </button>
              </div>

              <div className="night-discovery__stages">
                <div className={`night-discovery__launcher${discoveryState === 'menu' ? ' is-current' : ''}`}>
                  <div className="night-discovery__launcher-brand">
                    <img src={logo} alt="" width="34" height="34" />
                    <div>
                      <strong>Streaming Helper</strong>
                      <span>Connected</span>
                    </div>
                  </div>
                  <div className="night-discovery__launcher-actions">
                    <button
                      className={discoveryState !== 'menu' ? 'is-active' : ''}
                      type="button"
                      aria-pressed={discoveryState !== 'menu'}
                      onClick={() => setDiscoveryState('recommendations')}
                    >
                      <span><Star size={17} aria-hidden /></span>
                      <div>
                        <strong>Friend Recommendations</strong>
                        <small>See what your friends recommend.</small>
                      </div>
                      <i>READY</i>
                    </button>
                    <a href="#night-comfort">
                      <span><Heart size={17} aria-hidden /></span>
                      <div>
                        <strong>Comfort Pick</strong>
                        <small>Let Helper choose something familiar.</small>
                      </div>
                      <i>READY</i>
                    </a>
                  </div>
                </div>

                <div className={`night-discovery__handoff${discoveryState !== 'menu' ? ' is-active' : ''}`} aria-hidden>
                  <span />
                  <ArrowRight size={18} />
                </div>

                <div
                  className={`night-discovery__shelf${discoveryState !== 'menu' ? ' is-active' : ''}`}
                  aria-live="polite"
                >
                  <div className="night-discovery__shelf-heading">
                    <div>
                      <small>RECOMMENDED BY YOUR FRIENDS</small>
                      <strong>
                        {discoveryState === 'menu'
                          ? 'Choose Friend Recommendations'
                          : discoveryState === 'picked'
                            ? `${[SHOWS.theBear, SHOWS.abbott, SHOWS.parks][discoveryPick].title} is ready`
                            : 'Three good places to start'}
                      </strong>
                    </div>
                    <span>3 titles waiting</span>
                  </div>
                  <div className="night-discovery__titles">
                    <article className={discoveryState === 'picked' && discoveryPick === 0 ? 'is-picked' : ''}>
                      <img src={SHOWS.theBear.poster} alt="The Bear poster" width="500" height="750" loading="lazy" decoding="async" />
                      <div><strong>{SHOWS.theBear.title}</strong><span>From Maya</span></div>
                    </article>
                    <article className={discoveryState === 'picked' && discoveryPick === 1 ? 'is-picked' : ''}>
                      <img src={SHOWS.abbott.poster} alt="Abbott Elementary poster" width="500" height="750" loading="lazy" decoding="async" />
                      <div><strong>{SHOWS.abbott.title}</strong><span>From Jordan</span></div>
                    </article>
                    <article className={discoveryState === 'picked' && discoveryPick === 2 ? 'is-picked' : ''}>
                      <img src={SHOWS.parks.poster} alt="Parks and Recreation poster" width="500" height="750" loading="lazy" decoding="async" />
                      <div><strong>{SHOWS.parks.title}</strong><span>From Riley</span></div>
                    </article>
                  </div>
                  <button
                    className="night-discovery__pick"
                    type="button"
                    disabled={discoveryState === 'menu'}
                    onClick={() => {
                      setDiscoveryPick((current) => (
                        discoveryState === 'picked' ? (current + 1) % 3 : current
                      ));
                      setDiscoveryState('picked');
                    }}
                  >
                    {discoveryState === 'menu'
                      ? 'Open friend recommendations'
                      : discoveryState === 'picked'
                        ? 'Pick another'
                        : 'Pick for me'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="night-extension night-shell" id="night-extension">
          <div className="night-section-copy">
            <p className="night-inscription">RIGHT WHERE YOU WATCH</p>
            <h2>A tiny extension. A useful handoff.</h2>
            <p>
              On supported watch pages, the heart opens a compact friend picker.
              You choose who receives the title and explicitly send it.
            </p>
            <a href="#night-dashboard">See where it arrives <ArrowRight size={15} aria-hidden /></a>
          </div>
          <div className="night-browser">
            <div className="night-browser__bar">
              <i /><i /><i />
              <span>Supported Streaming Watch Page</span>
            </div>
            <div className="night-browser__screen">
              <img
                src={SHOWS.theBear.backdrop}
                alt="The Bear"
                width="1280"
                height="720"
                loading="lazy"
                decoding="async"
              />
              <div className="night-browser__title">
                <small>NOW WATCHING</small>
                <strong>{SHOWS.theBear.title}</strong>
                <p>Think Ava would like it? Send it without leaving the moment.</p>
              </div>
              <button
                className="night-browser__heart"
                type="button"
                aria-label={extensionPickerOpen ? 'Close recommendation picker' : `Recommend ${SHOWS.theBear.title}`}
                aria-expanded={extensionPickerOpen}
                onClick={() => {
                  setExtensionPickerOpen((open) => !open);
                  setExtensionSent(false);
                }}
              >
                <Heart size={21} fill="currentColor" aria-hidden />
              </button>
              {extensionPickerOpen && (
                <div className="night-browser__picker is-open">
                  <small>RECOMMEND</small>
                  <strong>{SHOWS.theBear.title}</strong>
                  <div aria-label="Choose a friend">
                    {CONCEPT_FRIENDS.map((friend) => (
                      <button
                        key={friend.name}
                        type="button"
                        aria-pressed={extensionFriend === friend.name}
                        onClick={() => {
                          setExtensionFriend(friend.name);
                          setExtensionSent(false);
                        }}
                      >
                        <span style={{ background: friend.color }}>{friend.initials}</span>
                        {friend.name}
                        {extensionFriend === friend.name && <Check size={13} aria-hidden />}
                      </button>
                    ))}
                  </div>
                  <button
                    className="night-browser__send"
                    type="button"
                    aria-live="polite"
                    onClick={() => setExtensionSent(true)}
                  >
                    {extensionSent ? (
                      <><Check size={14} aria-hidden /> Sent to {extensionFriend}</>
                    ) : (
                      <><Send size={14} aria-hidden /> Send to {extensionFriend}</>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="night-dashboard" id="night-dashboard">
          <div className="night-shell night-dashboard__grid">
            <div className="night-section-copy">
              <p className="night-inscription">WAITING WHEN YOU NEED IT</p>
              <h2>The extension sends it. The dashboard keeps it</h2>
              <p>
                Recommendations from friends land in one organized place alongside
                the comfort titles you save for later.
              </p>
              <DashboardLink identity={landingIdentity} large />
            </div>
            <div className="night-dashboard__frame" aria-label="Streaming Helper dashboard preview">
              <aside>
                <div className="night-dashboard__brand">
                  <img src={logo} alt="" width="30" height="30" />
                  <strong>Streaming Helper</strong>
                </div>
                <span className="is-active"><Inbox size={15} aria-hidden /> Recommendations</span>
                <span><Heart size={15} aria-hidden /> Comfort List</span>
                <span><UserRoundCheck size={15} aria-hidden /> Friends</span>
              </aside>
              <div className="night-dashboard__content">
                <header>
                  <div>
                    <small>RECEIVED</small>
                    <strong>Recommendations from friends</strong>
                  </div>
                  <span>3 titles to explore</span>
                </header>
                <article>
                  <img
                    src={SHOWS.theBear.poster}
                    alt="The Bear poster"
                    width="500"
                    height="750"
                    loading="lazy"
                    decoding="async"
                  />
                  <div>
                    <small>FROM MAYA · JUST NOW</small>
                    <strong>{SHOWS.theBear.title}</strong>
                    <p>{SHOWS.theBear.genre} · {SHOWS.theBear.year}</p>
                    <span>Ready when you are</span>
                  </div>
                </article>
                <div className="night-dashboard__queue" aria-hidden>
                  <i /><i />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="night-comfort" id="night-comfort">
          <div className="night-shell">
            <div className="night-comfort__heading">
              <div>
                <p className="night-inscription">COMFORT PICKS</p>
                <h2>Not every night needs a new discovery</h2>
              </div>
              <p>Keep familiar titles ready for the nights when choosing feels like work.</p>
            </div>
            <div className="night-title-tray">
              <article>
                <img
                  src={SHOWS.abbott.poster}
                  alt="Abbott Elementary poster"
                  width="500"
                  height="750"
                  loading="lazy"
                  decoding="async"
                />
                <div><strong>{SHOWS.abbott.title}</strong><span>Warm and familiar</span></div>
              </article>
              <article>
                <img
                  src={SHOWS.schittsCreek.poster}
                  alt="Schitt's Creek poster"
                  width="500"
                  height="750"
                  loading="lazy"
                  decoding="async"
                />
                <div><strong>{SHOWS.schittsCreek.title}</strong><span>A dependable favorite</span></div>
              </article>
              <article>
                <img
                  src={SHOWS.parks.poster}
                  alt="Parks and Recreation poster"
                  width="500"
                  height="750"
                  loading="lazy"
                  decoding="async"
                />
                <div><strong>{SHOWS.parks.title}</strong><span>Easy to return to</span></div>
              </article>
            </div>
          </div>
        </section>

        <section className="night-trust night-shell">
          <div className="night-trust__item">
            <UserRoundCheck size={23} aria-hidden />
            <div><strong>People you chose</strong><span>Recommendations come from accepted friends.</span></div>
          </div>
          <div className="night-trust__item">
            <LockKeyhole size={23} aria-hidden />
            <div><strong>Clear extension permissions</strong><span>Site access places the helper and matches visible titles. No streaming-account connection or watch-history reading.</span></div>
          </div>
          <div className="night-trust__item">
            <MonitorPlay size={23} aria-hidden />
            <div><strong>You stay in control</strong><span>Streaming Helper opens destinations; playback never starts automatically.</span></div>
          </div>
        </section>

        <section
          className="night-final"
          onPointerMove={editorialMotionPreview ? moveEditorialField : undefined}
          onPointerLeave={editorialMotionPreview ? resetEditorialField : undefined}
        >
          {editorialMotionPreview && (
            <div className="night-editorial-field night-editorial-field--final" aria-hidden="true">
              <svg viewBox="0 0 1320 720" preserveAspectRatio="none">
                <path d="M-90 106C92 30 232 66 292 176C356 294 260 390 104 376C-22 364-74 278-4 216C64 156 172 188 176 266" />
                <path d="M46 676C124 536 274 498 402 566C514 626 538 750 482 830" />
                <path d="M1012-80C916 36 924 162 1048 216C1178 272 1330 198 1404 68" />
                <path d="M1198 736C1092 650 1058 544 1126 456C1192 372 1320 354 1410 414" />
                <path d="M360-30C448 78 542 126 650 94C754 64 806-22 850-104" />
              </svg>
            </div>
          )}
          <div className="night-final__artifact night-final__artifact--sent" aria-hidden>
            <span className="night-final__avatar">M</span>
            <div>
              <small>MAYA RECOMMENDED</small>
              <strong>The Bear</strong>
            </div>
          </div>
          <div className="night-final__artifact night-final__artifact--saved" aria-hidden>
            <Inbox size={18} />
            <div>
              <small>WAITING IN YOUR DASHBOARD</small>
              <strong>Ready when you are</strong>
            </div>
          </div>
          <div className="night-shell night-final__inner">
            <div className="night-final__mark">
              <img src={logo} alt="" width="34" height="34" />
              <span>Streaming Helper</span>
            </div>
            <h2>Keep every good recommendation within reach</h2>
            <p>
              Use the dashboard to manage recommendations and comfort titles,
              then bring Streaming Helper with you through the Chrome extension.
            </p>
            <div className="night-final__actions">
              <DashboardLink identity={landingIdentity} large />
              <ExtensionLink large />
            </div>
          </div>
        </section>
      </main>

      <footer className="night-footer">
        <div className="night-shell">
          <ProductLogo />
          <span>
            Show data and imagery from{' '}
            <a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer">TMDB</a>.
            Streaming Helper is not endorsed or certified by TMDB.
          </span>
          <div>
            <a href="/how-it-works">How it works</a>
            <a href="/extension-permissions">Extension permissions</a>
            <a href="/supported-streaming-services">Supported services</a>
            <a href={HELP_PATH}>Help</a>
            <a href="/privacy">Privacy</a>
            <a href={DASHBOARD_PATH}>Try dashboard</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
