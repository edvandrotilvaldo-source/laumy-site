#!/usr/bin/env node
// Static check of a showcase store project: the filled form (data/products.src.json), the photos, the built page.
// Usage (from the project folder): node SKILL_DIR/scripts/check-form.mjs [--shipping]
// Every line is RUN-PASS, RUN-FAIL or NOT RUN. Exit code 1 if anything failed. --shipping also requires the site url and the share image.
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const shipping = process.argv.includes('--shipping');
let fails = 0;
const out = (st, msg) => { if (st === 'RUN-FAIL') fails++; console.log(`${st} ${msg}`); };
const ok = (c, msg, detail = '') => out(c ? 'RUN-PASS' : 'RUN-FAIL', msg + (c || !detail ? '' : `: ${detail}`));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const has = (p) => fs.existsSync(path.join(root, p));

let d;
try { d = JSON.parse(read('data/products.src.json')); } catch (e) { out('RUN-FAIL', 'data/products.src.json is missing or not valid JSON: ' + e.message); process.exit(1); }
const site = d.site || {};
const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0 && !/^(todo|tbd|xxx|lorem|not set)$/i.test(v.trim());

// --- identity
ok(/^[a-z0-9]+(-[a-z0-9]+)*$/.test(d.id || ''), 'id is a lowercase slug (used for the cart key)', String(d.id));
ok(nonEmpty(d.name), 'name is filled');
ok(['pt-AO', 'pt-PT', 'pt-BR', 'en', 'fr'].includes(d.lang), 'lang is one of the supported codes (the fixed UI text is Portuguese)', String(d.lang));
ok(/^https:\/\/www\.instagram\.com\/[A-Za-z0-9._]+\/?$/.test(d.instagram || ''), 'instagram is the profile link', String(d.instagram));
ok(/^@[A-Za-z0-9._]+$/.test(d.instagramHandle || '') && (d.instagram || '').includes(String(d.instagramHandle).slice(1)), 'instagramHandle matches the profile link', String(d.instagramHandle));
ok(d.whatsapp === '' || /^\d{9,15}$/.test(d.whatsapp), 'whatsapp is empty (NOT SET) or digits with the country code, no + or spaces', String(d.whatsapp));
if (d.whatsapp) ok(nonEmpty(d.whatsappDisplay), 'whatsappDisplay is filled when whatsapp is set');
ok(nonEmpty(d.priceLabel), 'priceLabel is filled (use "Preço sob consulta" when prices are not set)');

// --- groups and products
const groups = d.groups || [], prods = d.products || [];
ok(groups.length >= 2 && groups.length <= 10 && new Set(groups).size === groups.length, 'groups: 2 to 10, no duplicates', groups.join(','));
ok(prods.length >= 6 && prods.length <= 60, 'products: 6 to 60', String(prods.length));
ok(new Set(prods.map((p) => p.slug)).size === prods.length, 'product slugs are unique');
const bl = has('data/baselines.json') ? JSON.parse(read('data/baselines.json')) : {};
function webpSize(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') return null;
  const t = buf.toString('ascii', 12, 16);
  if (t === 'VP8 ') return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
  if (t === 'VP8L') { const b = buf.readUInt32LE(21); return [(b & 0x3fff) + 1, ((b >> 14) & 0x3fff) + 1]; }
  if (t === 'VP8X') return [buf.readUIntLE(24, 3) + 1, buf.readUIntLE(27, 3) + 1];
  return null;
}
const badProd = [];
for (const p of prods) {
  const probs = [];
  if (!nonEmpty(p.name)) probs.push('name empty');
  if (!groups.includes(p.group)) probs.push(`group "${p.group}" not in groups`);
  if (!(p.slug in bl)) probs.push('no baseline (add it with tools/add-products.py)');
  const f = p.file || `img/products/${p.slug}.webp`;
  if (!has(f)) probs.push('missing ' + f); else { const s = webpSize(fs.readFileSync(path.join(root, f))); if (!s) probs.push(`${f} is not a WebP`); }
  if (!p.single && !has(`img/products/${p.slug}-frente.webp`)) probs.push('missing front view');
  if (probs.length) badProd.push(`${p.slug}: ${probs.join('; ')}`);
}
ok(!badProd.length, 'every product has its photo(s), unchanged WebP, a baseline, a name and a colour', badProd.join(' | '));
const empty = groups.filter((g) => !prods.some((p) => p.group === g));
ok(!empty.length, 'every group has at least one product', empty.join(','));

// --- site text
const need = { 'site.title': site.title, 'site.description': site.description, 'hero.kicker': (site.hero || {}).kicker, 'hero.sub': (site.hero || {}).sub, 'intro.title': (site.intro || {}).title, 'intro.sub': (site.intro || {}).sub, 'services.title': (site.services || {}).title, 'services.sub': (site.services || {}).sub, 'about.title': (site.about || {}).title, 'about.lead': (site.about || {}).lead, 'follow.title': (site.follow || {}).title, 'follow.sub': (site.follow || {}).sub, 'footNote': site.footNote, 'store.address': (d.store || {}).address, 'store.payments': (d.store || {}).payments, 'store.delivery': (d.store || {}).delivery };
const missing = Object.entries(need).filter(([k, v]) => k !== 'store.delivery' && !nonEmpty(v)).map(([k]) => k);
ok(!missing.length, 'all page texts are filled', missing.join(', '));
const tl = (site.hero || {}).titleLines || [];
ok(tl.length >= 1 && tl.length <= 2 && tl.every(nonEmpty), 'hero title has 1 or 2 lines', JSON.stringify(tl));
const art = (site.hero || {}).art || [];
ok(art.length === 3 && art.every((s) => prods.some((p) => p.slug === s)), 'hero.art names 3 existing product slugs (left, centre, right)', JSON.stringify(art));
const ch = site.chapters || [];
ok(ch.length <= 6, 'chapters: at most 6 (each one is a pinned screen)', String(ch.length));
const badCh = ch.filter((c) => !/^[a-z0-9-]+$/.test(c.id || '') || !(c.head || []).length || c.head.length > 2 || ![c.kicker, c.body, c.strong, c.linkText].every(nonEmpty) || !groups.includes(c.group) || !prods.some((p) => p.slug === c.product));
ok(!badCh.length, 'each chapter has an id, a 1-2 line head, text, an existing group and an existing product', badCh.map((c) => c.id).join(','));
ok(Array.isArray((site.about || {}).facts) && site.about.facts.length >= 3 && site.about.facts.every((f) => Array.isArray(f) && f.length === 2 && nonEmpty(f[0]) && nonEmpty(f[1])), 'about.facts has at least 3 [label, value] pairs');
const th = site.theme || {};
ok(['accent', 'accentHover', 'accentDeep'].every((k) => /^#[0-9a-fA-F]{6}$/.test(th[k] || '')), 'theme has accent, accentHover and accentDeep as #rrggbb');
ok(/Click Start/.test(site.footNote || ''), 'footNote says the site was made by Click Start and is a proposal/demo when it is one');
ok(!/\p{Extended_Pictographic}/u.test(JSON.stringify(d)), 'no emoji in the data (the owner\'s rule: no emoji on sites)');

// --- embeds
const idRe = /^[A-Za-z0-9_-]{8,16}$/;
ok((d.reels || []).length <= 8 && (d.reels || []).every((x) => idRe.test(x)), 'reels are Instagram ids (the part after /reel/), at most 8');
ok((d.posts || []).length <= 6 && (d.posts || []).every((x) => idRe.test(x)), 'posts are Instagram ids (the part after /p/), at most 6');

// --- built files
const html = has('index.html') ? read('index.html') : '';
ok(!!html, 'index.html is built (node tools/build.mjs)');
if (html) {
  ok(!/\{\{|__SITE_URL__|<!--CHAPTERS-->/.test(html), 'no template token is left in index.html');
  ok(/data-credit href="https:\/\/clickstartangola\.com"/.test(html) && has('img/brand/click-start-credit.svg'), 'footer credit "Feito por" + Click Start logo, as the last element');
  ok((html.match(/class="chapter/g) || []).length === ch.length, 'the page has one section per chapter');
}
for (const f of ['css/style.css', 'css/theme.css', 'js/main.js', 'data/products.js', 'fonts/inter-latin-wght-normal.woff2', 'img/brand/favicon.png', 'img/brand/site-touch-icon.png']) ok(has(f), `${f} exists`);
const vj = has('vercel.json') ? read('vercel.json') : '';
ok(/frame-src https:\/\/www\.instagram\.com/.test(vj) && /X-Robots-Tag/.test(vj), 'vercel.json allows only the Instagram frame and sets the headers');
if (shipping) {
  const url = d.siteUrl || ((html.match(/og:url" content="([^"]+)\//) || [])[1] || '');
  ok(/^https:\/\/[a-z0-9.-]+$/.test(url), 'the site url is in the page (og:url)', url);
  let s = null; if (has('img/og-share.png')) { const b = fs.readFileSync(path.join(root, 'img/og-share.png')); s = b.toString('ascii', 1, 4) === 'PNG' ? [b.readUInt32BE(16), b.readUInt32BE(20), b.length] : null; }
  ok(s && s[0] === 1200 && s[1] === 630 && s[2] < 300 * 1024, 'img/og-share.png is a 1200x630 PNG under 300 KB', JSON.stringify(s));
} else out('NOT RUN', 'site url and share image (run with --shipping before the deploy)');
console.log(fails ? `\n${fails} check(s) FAILED` : '\nAll checks RUN-PASS');
process.exit(fails ? 1 : 0);
