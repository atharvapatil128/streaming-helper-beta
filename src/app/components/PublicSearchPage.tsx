import { ArrowRight, Chrome, LayoutDashboard, ShieldCheck } from 'lucide-react';
import logo from '../../imports/image-0.png';
import extensionPicker from '../../../docs/audit/beta2-extension-recommendation-flow/03-friend-picker.png';
import extensionSuccess from '../../../docs/audit/beta2-extension-recommendation-flow/04-success-feedback.png';
import { getPublicPage } from '../../content/publicPages.mjs';
import {
  CHROME_EXTENSION_URL,
  DASHBOARD_PATH,
  HELP_PATH,
  MARKETING_PATH,
} from '../../lib/productUrls';
import { PublicFooter } from './PublicFooter';
import { trackAcquisitionEvent } from '../../lib/acquisitionAnalytics';
import '../../styles/public-search.css';

const LINK_LABELS: Record<string, string> = {
  '/how-it-works': 'How Streaming Helper works',
  '/extension-permissions': 'Extension permissions',
  '/supported-streaming-services': 'Supported streaming services',
  '/share-show-recommendations': 'Sharing recommendations with friends',
  '/save-tv-show-recommendations': 'Saving recommendations',
  '/chrome-extension-show-recommendations': 'Chrome extension for recommendations',
  '/privacy': 'Privacy policy',
};

export function PublicSearchPage({ pathname }: { pathname: string }) {
  const page = getPublicPage(pathname);
  if (!page?.sections) return null;

  return (
    <div className="public-search-page">
      <header className="public-search-header">
        <div className="public-search-shell public-search-header__inner">
          <a href={MARKETING_PATH} className="public-search-brand" aria-label="Streaming Helper home">
            <img src={logo} alt="" width="36" height="36" />
            <span>Streaming Helper</span>
          </a>
          <nav aria-label="Public page navigation">
            <a href="/how-it-works">How it works</a>
            <a href={HELP_PATH}>Help</a>
            <a href={DASHBOARD_PATH}>Sign in</a>
          </nav>
        </div>
      </header>

      <main>
        <section className="public-search-hero public-search-shell">
          <p>{page.eyebrow}</p>
          <h1>{page.heading}</h1>
          <span>{page.intro}</span>
          <div className="public-search-actions">
            <a href={DASHBOARD_PATH} className="is-primary">
              <LayoutDashboard size={18} aria-hidden /> Get started free
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
          <small>Free during beta | Chrome desktop extension | Both friends need an account</small>
        </section>

        <section className="public-search-body public-search-shell">
          <div className="public-search-article">
            {page.sections.map((section: { heading: string; paragraphs?: string[]; bullets?: string[] }) => (
              <section key={section.heading}>
                <h2>{section.heading}</h2>
                {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                {section.bullets && (
                  <ul>
                    {section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
                  </ul>
                )}
              </section>
            ))}
          </div>

          <aside className="public-search-aside">
            <ShieldCheck size={24} aria-hidden />
            <h2>Clear product boundaries</h2>
            <p>
              Streaming Helper does not connect to streaming accounts, read watch
              history, or start playback automatically.
            </p>
            <a href="/extension-permissions">Read the permission explanation <ArrowRight size={15} aria-hidden /></a>
          </aside>
        </section>

        <section className="public-search-evidence public-search-shell">
            <div>
              <p>REAL EXTENSION FLOW</p>
              <h2>A compact choice, followed by clear confirmation</h2>
              <span>
                The extension identifies the current title, lets you select a connected
                friend, and confirms when the recommendation is sent.
              </span>
            </div>
            <div className="public-search-evidence__images">
              <figure>
                <img src={extensionPicker} alt="Streaming Helper friend picker open over a supported watch page" loading="lazy" />
                <figcaption>Choose a connected friend.</figcaption>
              </figure>
              <figure>
                <img src={extensionSuccess} alt="Streaming Helper recommendation sent confirmation" loading="lazy" />
                <figcaption>See a clear sent confirmation.</figcaption>
              </figure>
            </div>
        </section>

        <section className="public-search-related public-search-shell">
          <p>KEEP EXPLORING</p>
          <h2>Understand the full recommendation flow</h2>
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
            <h2>Keep the next good recommendation out of the group chat.</h2>
            <p>Create your free account, add the extension, and connect with a friend.</p>
            <div className="public-search-actions">
              <a href={DASHBOARD_PATH} className="is-primary">Get started free</a>
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
