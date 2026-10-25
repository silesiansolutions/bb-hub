import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { pl } from '../i18n/pl.ts';

const OUT = new URL('../../out/', import.meta.url);

const escapeHtml = (text: string) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#x27;');

const routes: [string, keyof typeof pl.meta][] = [
  ['index.html', 'dashboard'],
  ['parkings.html', 'parkings'],
  ['parking.html', 'parking'],
  ['air.html', 'air'],
  ['air-sensor.html', 'airSensor'],
  ['stats.html', 'stats'],
  ['404.html', 'notFound'],
];

for (const [file, page] of routes) {
  test(`${file} carries the shell, metadata and noscript notice without JavaScript`, async () => {
    const html = await readFile(new URL(file, OUT), 'utf8');
    const meta = pl.meta[page];

    assert.match(html, /<html lang="pl"/);
    assert.ok(html.includes(`<title>${escapeHtml(`${meta.title} | ${pl.site.name}`)}</title>`), 'page title');
    assert.ok(html.includes(`name="description" content="${escapeHtml(meta.description)}"`), 'meta description');
    assert.ok(html.includes('<header'), 'header element');
    assert.ok(html.includes(escapeHtml(pl.site.name)), 'site name');

    for (const [href, label] of [
      ['/', pl.nav.dashboard],
      ['/parkings', pl.nav.parkings],
      ['/air', pl.nav.air],
      ['/stats', pl.nav.stats],
    ] as const) {
      assert.ok(html.includes(`href="${href}"`) && html.includes(`>${escapeHtml(label)}</a>`), `nav link ${href}`);
    }

    assert.ok(html.includes('<footer'), 'footer element');
    assert.ok(html.includes(escapeHtml(pl.site.sources)), 'footer sources text');
    assert.match(html, /<noscript[^>]*>[\s\S]*?<\/noscript>/);
    assert.ok(html.includes(escapeHtml(pl.status.noscript)), 'noscript notice');
  });
}
