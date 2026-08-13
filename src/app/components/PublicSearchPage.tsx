import { ArrowRight, Chrome, Heart, LayoutDashboard, ShieldCheck, Star } from 'lucide-react';
import logo from '../../imports/image-0.png';
import comfortDashboard from '../../assets/public-guides/comfort-list-dashboard.png';
import helperMenu from '../../assets/public-guides/helper-menu.jpg';
import recommendationsDashboard from '../../assets/public-guides/recommendations-dashboard.jpg';
import recommendationSelection from '../../assets/public-guides/recommendation-selection.jpg';
import recommendationSuccess from '../../assets/public-guides/recommendation-success.jpg';
import { getPublicPage } from '../../content/publicPages.mjs';
import {
  CHROME_EXTENSION_URL,
  DASHBOARD_PATH,
  HELP_PATH,
  MARKETING_PATH,
} from '../../lib/productUrls';
import { getLandingDashboardLabel } from '../../lib/landingIdentity';
import { PublicFooter } from './PublicFooter';
import { PublicGuideMenu } from './PublicGuideMenu';
import { MarketingClosingHeading } from './MarketingClosingHeading';
import { StreamingProviderStrip } from './StreamingProviderStrip';
import { useLandingIdentity } from '../hooks/useLandingIdentity';
import { trackAcquisitionEvent } from '../../lib/acquisitionAnalytics';
import '../../styles/public-search.css';
import '../../styles/public-search-polish.css';

const LINK_LABELS: Record<string, string> = {
  '/how-it-works': 'How Streaming Helper works',
  '/extension-permissions': 'Extension permissions',
  '/supported-streaming-services': 'Supported streaming services',
  '/share-show-recommendations': 'Sharing recommendations with friends',
  '/save-tv-show-recommendations': 'Saving recommendations',
  '/chrome-extension-show-recommendations': 'Chrome extension for recommendations',
  '/privacy': 'Privacy policy',
};

type EvidenceItem = { src: string; alt: string; caption: string };
type EvidenceStory = {
  eyebrow: string;
  heading: string;
  description: string;
  items: EvidenceItem[];
};

const DEFAULT_EVIDENCE: EvidenceStory = {
  eyebrow: 'THE HELPER IN CONTEXT',
  heading: 'A small interface with clear boundaries',
  description: 'The regular helper stays out of the way until you open it. Choose whether to browse friend recommendations or ask for a familiar Comfort Pick.',
  items: [{
    src: helperMenu,
    alt: 'Streaming Helper menu open on a supported Netflix browsing page',
    caption: 'Open the helper without leaving the streaming page.',
  }],
};

const EVIDENCE_BY_PATH: Record<string, EvidenceStory> = {
  '/how-it-works': {
    eyebrow: 'ONE CONNECTED FLOW',
    heading: 'From the watch page to a list that waits',
    description: 'The extension handles the moment of discovery. The dashboard gives every recommendation and comfort title a dependable place to return to.',
    items: [
      { src: helperMenu, alt: 'Streaming Helper menu open on a supported streaming browse page', caption: '1. Open Streaming Helper where you already browse.' },
      { src: recommendationSelection, alt: 'Streaming Helper recommendation panel with fictional friend Ava selected', caption: '2. Choose a connected friend and send the detected title.' },
      { src: recommendationsDashboard, alt: 'Streaming Helper dashboard showing sent recommendations', caption: '3. Find sent and received recommendations in the dashboard.' },
    ],
  },
  '/share-show-recommendations': {
    eyebrow: 'REAL RECOMMENDATION FLOW',
    heading: 'A deliberate choice, followed by clear confirmation',
    description: 'Streaming Helper identifies the title on a supported watch screen. You choose the recipient and explicitly send it; the extension confirms when it reaches their list.',
    items: [
      { src: recommendationSelection, alt: 'Streaming Helper recommendation panel with fictional friend Ava selected', caption: 'Choose a connected friend and review the detected title.' },
      { src: recommendationSuccess, alt: 'Streaming Helper confirmation that 72 Hours was recommended to fictional friend Ava', caption: 'Get a clear confirmation when the recommendation is sent.' },
    ],
  },
  '/save-tv-show-recommendations': {
    eyebrow: 'READY WHEN YOU NEED IT',
    heading: 'One place for trusted picks and familiar returns',
    description: 'Friend recommendations remain searchable in the dashboard, while Comfort Picks stay separate as titles you have chosen for yourself.',
    items: [
      { src: recommendationsDashboard, alt: 'Streaming Helper dashboard showing recommendations organized as title cards', caption: 'Search and manage recommendations without returning to the original chat.' },
      { src: comfortDashboard, alt: 'Streaming Helper dashboard Comfort List with saved familiar titles', caption: 'Keep personal Comfort Picks ready for low-effort nights.' },
      { src: helperMenu, alt: 'Streaming Helper menu with Friend Recommendations and Comfort Pick options', caption: 'Reach both lists from the helper on supported streaming pages.' },
    ],
  },
  '/chrome-extension-show-recommendations': {
    eyebrow: 'TWO USEFUL MODES',
    heading: 'The helper changes with the page you are on',
    description: 'The regular helper opens recommendation and comfort options while browsing. On a supported watch screen, the heart opens the send flow for the current title.',
    items: [
      { src: helperMenu, alt: 'Streaming Helper normal menu on a supported streaming browse page', caption: 'Browse recommendations or choose something familiar.' },
      { src: recommendationSelection, alt: 'Streaming Helper heart recommendation flow on a supported watch screen', caption: 'Send the title when a watch screen is confidently detected.' },
    ],
  },
};
export function PublicSearchPage({ pathname }: { pathname: string }) {
  const page = getPublicPage(pathname);
  const landingIdentity = useLandingIdentity();
  if (!page?.sections) return null;

  const evidence = EVIDENCE_BY_PATH[page.path] ?? DEFAULT_EVIDENCE;
  const dashboardLabel = getLandingDashboardLabel(landingIdentity);
  return (
    <div className="public-search-page">
      <header className="public-search-header">
        <div className="public-search-shell public-search-header__inner">
          <a href={MARKETING_PATH} className="public-search-brand" aria-label="Streaming Helper home">
            <img src={logo} alt="" width="38" height="38" />
            <span>Streaming Helper</span>
          </a>
          <nav aria-label="Public page navigation">
            <a href={MARKETING_PATH} className="public-search-home-link">Home</a>
            <PublicGuideMenu currentPath={page.path} />
            <a href={HELP_PATH} className="public-search-nav-link">Help</a>
            {landingIdentity.status !== 'signed-in' && <a href={DASHBOARD_PATH}>Sign in</a>}
            <a href={DASHBOARD_PATH} className="public-search-header__cta">
              <LayoutDashboard size={16} aria-hidden />
              <span>{dashboardLabel}</span>
            </a>
          </nav>
        </div>
      </header>

      <main>
        <section className="public-search-hero">
          <div className="public-search-shell public-search-hero__inner">
            <div className="public-search-hero__copy">
              <p>{page.eyebrow}</p>
              <h1>{page.heading}</h1>
              <span>{page.intro}</span>
              <div className="public-search-actions">
                <a href={DASHBOARD_PATH} className="is-primary">
                  <LayoutDashboard size={18} aria-hidden /> {dashboardLabel}
                </a>
                <a
                  href={CHROME_EXTENSION_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => trackAcquisitionEvent('extension_install_clicked', { source: page.path })}
                >
                  <Chrome size={18} aria-hidden /> Add to Chrome
                </a>
              </div>
              <small>Free <i aria-hidden>&middot;</i> Chrome on desktop <i aria-hidden>&middot;</i> Both friends need an account</small>
            </div>
            <div className="public-search-helper-preview" role="img" aria-label="Streaming Helper connected menu with Friend Recommendations and Comfort Pick ready">
              <div className="public-search-helper-preview__brand">
                <img src={logo} alt="" width="40" height="40" />
                <div><strong>Streaming Helper</strong><span>Connected</span></div>
              </div>
              <div className="public-search-helper-preview__actions">
                <div>
                  <span><Star size={19} aria-hidden /></span>
                  <div><strong>Friend Recommendations</strong><small>See what your friends recommend.</small></div>
                  <i>READY</i>
                </div>
                <div>
                  <span><Heart size={19} aria-hidden /></span>
                  <div><strong>Comfort Pick</strong><small>Let Helper choose something familiar.</small></div>
                  <i>READY</i>
                </div>
              </div>
            </div>
          </div>
        </section>

        {page.path === '/supported-streaming-services' && (
          <div className="public-search-shell">
            <StreamingProviderStrip heading="Five supported services, one consistent helper" />
          </div>
        )}

        <section className="public-search-body public-search-shell">
          <div className={`public-search-article${page.path === '/how-it-works' ? ' public-search-article--steps' : ''}`}>
            {page.path === '/how-it-works' && (
              <header className="public-search-article__intro">
                <p>START HERE</p>
                <h2>Three steps from setup to your first recommendation</h2>
              </header>
            )}
            {page.sections.map((section: { heading: string; paragraphs?: string[]; bullets?: string[] }, index: number) => (
              <section key={section.heading}>
                <span className="public-search-article__number" aria-hidden>{String(index + 1).padStart(2, '0')}</span>
                <div>
                  <h2>{section.heading.replace(/^\d+\.\s*/, '')}</h2>
                  {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                  {section.bullets && (
                    <ul>
                      {section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
                    </ul>
                  )}
                </div>
              </section>
            ))}
          </div>

          <aside className="public-search-aside">
            <ShieldCheck size={23} aria-hidden />
            <p className="public-search-aside__eyebrow">PRODUCT BOUNDARIES</p>
            <h2>Useful without reading your viewing activity</h2>
            <p>
              Streaming Helper does not connect to streaming accounts, read watch
              history, or start playback automatically.
            </p>
            <a href="/extension-permissions">Read the permission explanation <ArrowRight size={15} aria-hidden /></a>
          </aside>
        </section>

        <section className={`public-search-evidence public-search-shell public-search-evidence--${evidence.items.length}`}>
          <div className="public-search-evidence__intro">
            <p>{evidence.eyebrow}</p>
            <h2>{evidence.heading}</h2>
            <span>{evidence.description}</span>
          </div>
          <div className="public-search-evidence__images">
            {evidence.items.map((item) => (
              <figure key={item.caption}>
                <div className="public-search-evidence__frame">
                  <img src={item.src} alt={item.alt} loading="lazy" />
                </div>
                <figcaption>{item.caption}</figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section className="public-search-related public-search-shell">
          <p>KEEP EXPLORING</p>
          <h2>Follow the rest of the product flow</h2>
          <div>
            {page.related.map((path: string) => (
              <a href={path} key={path}>
                {LINK_LABELS[path] ?? path}
                <ArrowRight size={15} aria-hidden />
              </a>
            ))}
          </div>
        </section>

        <section className="public-search-cta">
          <div className="public-search-shell">
            <p>START WITH ONE FRIEND</p>
            <MarketingClosingHeading />
            <span>Create your free account, add the extension, and connect with someone you trust.</span>
            <div className="public-search-actions">
              <a href={DASHBOARD_PATH} className="is-primary">{dashboardLabel}</a>
              <a
                href={CHROME_EXTENSION_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackAcquisitionEvent('extension_install_clicked', { source: `${page.path}_cta` })}
              >
                Add to Chrome
              </a>
            </div>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
