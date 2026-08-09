import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { indexablePublicPaths, publicPages, SITE_ORIGIN } from '../content/publicPages.mjs';

test('public pages have unique metadata and self-referential canonical inputs', () => {
  const titles = new Set();
  const descriptions = new Set();
  for (const pathname of indexablePublicPaths) {
    const page = publicPages[pathname];
    assert.equal(page.path, pathname);
    assert.ok(page.title.length > 20);
    assert.ok(page.description.length > 70);
    assert.equal(titles.has(page.title), false, `duplicate title: ${page.title}`);
    assert.equal(descriptions.has(page.description), false, `duplicate description: ${page.description}`);
    titles.add(page.title);
    descriptions.add(page.description);
  }
});

test('robots and sitemap expose only canonical public pages', async () => {
  const robots = await readFile(new URL('../../public/robots.txt', import.meta.url), 'utf8');
  const sitemap = await readFile(new URL('../../public/sitemap.xml', import.meta.url), 'utf8');
  assert.match(robots, /Sitemap: https:\/\/streaminghelper\.net\/sitemap\.xml/);
  assert.match(robots, /Disallow: \/app/);
  for (const pathname of indexablePublicPaths) {
    const url = `${SITE_ORIGIN}${pathname === '/' ? '/' : pathname}`;
    assert.match(sitemap, new RegExp(`<loc>${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</loc>`));
  }
  assert.doesNotMatch(sitemap, /<loc>[^<]*\/app/);
  assert.doesNotMatch(sitemap, /<loc>[^<]*\/invite/);
});

test('Vercel has explicit private rewrites and no catch-all homepage rewrite', async () => {
  const config = JSON.parse(await readFile(new URL('../../vercel.json', import.meta.url), 'utf8'));
  assert.equal(config.rewrites.some((rewrite) => rewrite.source === '/(.*)'), false);
  assert.equal(config.rewrites.some((rewrite) => rewrite.source === '/app' && rewrite.destination === '/private.html'), true);
  for (const key of ['auth', 'highlight', 'action']) {
    assert.equal(
      config.headers.some((rule) =>
        rule.source === '/' && rule.has?.some((condition) => condition.type === 'query' && condition.key === key),
      ),
      true,
      `missing noindex response header for root query: ${key}`,
    );
  }
});
