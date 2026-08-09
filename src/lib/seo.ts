import { getPublicPage, SITE_ORIGIN } from '../content/publicPages.mjs';

function upsertMeta(selector: string, attributes: Record<string, string>) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement('meta');
    document.head.appendChild(element);
  }
  Object.entries(attributes).forEach(([name, value]) => element?.setAttribute(name, value));
}

function upsertCanonical(href: string) {
  let element = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!element) {
    element = document.createElement('link');
    element.rel = 'canonical';
    document.head.appendChild(element);
  }
  element.href = href;
}

export function applyPublicMetadata(pathname: string) {
  const page = getPublicPage(pathname);
  if (!page) return false;

  const canonical = `${SITE_ORIGIN}${page.path === '/' ? '/' : page.path}`;
  document.title = page.title;
  upsertMeta('meta[name="description"]', { name: 'description', content: page.description });
  upsertMeta('meta[name="robots"]', { name: 'robots', content: 'index, follow' });
  upsertCanonical(canonical);
  upsertMeta('meta[property="og:type"]', { property: 'og:type', content: 'website' });
  upsertMeta('meta[property="og:title"]', { property: 'og:title', content: page.title });
  upsertMeta('meta[property="og:description"]', { property: 'og:description', content: page.description });
  upsertMeta('meta[property="og:url"]', { property: 'og:url', content: canonical });
  upsertMeta('meta[property="og:image"]', { property: 'og:image', content: page.image });
  upsertMeta('meta[property="og:image:width"]', { property: 'og:image:width', content: '1200' });
  upsertMeta('meta[property="og:image:height"]', { property: 'og:image:height', content: '630' });
  upsertMeta('meta[property="og:image:alt"]', { property: 'og:image:alt', content: page.imageAlt });
  upsertMeta('meta[name="twitter:card"]', { name: 'twitter:card', content: 'summary_large_image' });
  upsertMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: page.title });
  upsertMeta('meta[name="twitter:description"]', { name: 'twitter:description', content: page.description });
  upsertMeta('meta[name="twitter:image"]', { name: 'twitter:image', content: page.image });
  return true;
}

export function applyNoIndexMetadata({ follow = false }: { follow?: boolean } = {}) {
  upsertMeta('meta[name="robots"]', {
    name: 'robots',
    content: `noindex, ${follow ? 'follow' : 'nofollow'}`,
  });
  document.head.querySelector('link[rel="canonical"]')?.remove();
}

