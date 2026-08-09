import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getPublicPage,
  indexablePublicPaths,
  publicSearchPaths,
  SITE_ORIGIN,
} from '../src/content/publicPages.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const template = await readFile(join(dist, 'index.html'), 'utf8');
const GOOGLE_ANALYTICS_TAG = `
    <!-- Google tag (gtag.js) -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-WVTF1FR05D"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());

      gtag('config', 'G-WVTF1FR05D');
    </script>`;

const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

function removeTag(html, pattern) {
  return html.replace(pattern, '');
}

function withGoogleAnalytics(html) {
  return html.replace('<head>', `<head>${GOOGLE_ANALYTICS_TAG}`);
}

function withMetadata(html, page, robots = 'index, follow') {
  const canonical = `${SITE_ORIGIN}${page.path === '/' ? '/' : page.path}`;
  let next = html;
  next = removeTag(next, /<title>[\s\S]*?<\/title>/i);
  next = removeTag(next, /<meta\s+name=["']description["'][^>]*>/gi);
  next = removeTag(next, /<meta\s+name=["']robots["'][^>]*>/gi);
  next = removeTag(next, /<link\s+rel=["']canonical["'][^>]*>/gi);
  next = removeTag(next, /<meta\s+(?:property|name)=["'](?:og:[^"']+|twitter:[^"']+)["'][^>]*>/gi);

  const metadata = `
    <title>${escapeHtml(page.title)}</title>
    <meta name="description" content="${escapeHtml(page.description)}" />
    <meta name="robots" content="${robots}" />
    ${robots.startsWith('index') ? `<link rel="canonical" href="${canonical}" />` : ''}
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${escapeHtml(page.title)}" />
    <meta property="og:description" content="${escapeHtml(page.description)}" />
    <meta property="og:url" content="${canonical}" />
    <meta property="og:image" content="${page.image}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${escapeHtml(page.imageAlt)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(page.title)}" />
    <meta name="twitter:description" content="${escapeHtml(page.description)}" />
    <meta name="twitter:image" content="${page.image}" />`;
  return next.replace('</head>', `${metadata}\n  </head>`);
}

function searchSnapshot(page) {
  const sections = page.sections.map((section) => `
    <section>
      <h2>${escapeHtml(section.heading)}</h2>
      ${(section.paragraphs ?? []).map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')}
      ${section.bullets ? `<ul>${section.bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join('')}</ul>` : ''}
    </section>`).join('');
  return `<main class="seo-prerender"><p>${escapeHtml(page.eyebrow)}</p><h1>${escapeHtml(page.heading)}</h1><p>${escapeHtml(page.intro)}</p>${sections}<a href="/app">Get started free</a> <a href="https://chromewebstore.google.com/detail/streaming-helper/fnbhllmhjamdfnfjlmipkcefbjnfnhej">Add to Chrome</a></main>`;
}

function snapshotFor(pathname) {
  if (publicSearchPaths.includes(pathname)) return searchSnapshot(getPublicPage(pathname));
  if (pathname === '/help') {
    return '<main class="seo-prerender"><h1>How can we help?</h1><p>Get help with account sign-in, the Chrome extension, friends and recommendations, Comfort Picks, and opening titles.</p><h2>Popular questions</h2><p>Learn where to start, how to reconnect the extension, why a title may not match, and where recommendations appear.</p><a href="mailto:help@streaminghelper.net">Email support</a></main>';
  }
  if (pathname === '/privacy') {
    return '<main class="seo-prerender"><h1>Privacy Policy</h1><p>Streaming Helper stores the account, friend, recommendation, Comfort List, and extension-session data needed to provide the service.</p><h2>What we do not do</h2><p>Streaming Helper does not connect to streaming accounts, read watch history, automatically play titles, sell personal data, or use recommendation details for advertising.</p></main>';
  }
  return '<main class="seo-prerender"><p>FRIEND-POWERED WATCHING</p><h1>Good recommendations should not get lost in the group chat.</h1><p>Send a show while you watch. Streaming Helper keeps it ready for the night your friend needs a good pick.</p><h2>Three steps to your first friend-powered pick</h2><ol><li>Create a free account.</li><li>Add the Chrome desktop extension.</li><li>Connect with a friend and send your first recommendation.</li></ol><p>Free during beta. Supports Netflix, Prime Video, Disney+, Hulu, and Max. Both friends need Streaming Helper.</p><a href="/app">Get started free</a> <a href="https://chromewebstore.google.com/detail/streaming-helper/fnbhllmhjamdfnfjlmipkcefbjnfnhej">Add to Chrome</a></main>';
}

function withSnapshot(html, snapshot) {
  return html.replace(
    '<div id="root"></div>',
    `<div id="root">${snapshot}</div>`,
  ).replace(
    '</head>',
    '<style>.seo-prerender{max-width:1000px;margin:0 auto;padding:80px 24px;color:#f4f2f7;font:17px/1.7 system-ui,sans-serif}.seo-prerender h1{font-size:clamp(42px,7vw,76px);line-height:1}.seo-prerender h2{margin-top:48px}.seo-prerender a{color:#c3b8ff}</style></head>',
  );
}

for (const pathname of indexablePublicPaths) {
  const page = getPublicPage(pathname);
  const html = withSnapshot(
    withGoogleAnalytics(withMetadata(template, page)),
    snapshotFor(pathname),
  );
  const output = pathname === '/' ? join(dist, 'index.html') : join(dist, pathname.slice(1), 'index.html');
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, html);
}

const privatePage = {
  path: '/app',
  title: 'Streaming Helper',
  description: 'Streaming Helper account and dashboard.',
  image: `${SITE_ORIGIN}/streaming-helper-social.png`,
  imageAlt: 'Streaming Helper',
};
const privateTemplate = template.replace(
  /<script\s+type=["']application\/ld\+json["']>[\s\S]*?<\/script>/i,
  '',
);
await writeFile(
  join(dist, 'private.html'),
  withMetadata(privateTemplate, privatePage, 'noindex, nofollow').replace(
    '<div id="root"></div>',
    '<div id="root"></div>',
  ),
);

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${indexablePublicPaths.map((pathname) => `  <url><loc>${SITE_ORIGIN}${pathname === '/' ? '/' : pathname}</loc></url>`).join('\n')}
</urlset>\n`;
await writeFile(join(dist, 'sitemap.xml'), sitemap);

console.log(`Pre-rendered ${indexablePublicPaths.length} indexable public pages.`);
