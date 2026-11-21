// Builds the site from data/products.src.json (the single file the owner's form fills):
//   data/products.js       what the page reads
//   css/theme.css          the accent colours
//   index.html             from index.template.html (tokens, scroll chapters, no-JavaScript product list)
// Run from the project folder:  node tools/build.mjs [https://site-url]
import fs from 'node:fs';

const src = JSON.parse(fs.readFileSync('data/products.src.json', 'utf8'));
const bl = JSON.parse(fs.readFileSync('data/baselines.json', 'utf8'));
const PARTIAL = process.argv.includes('--partial');   // products only (used by add-products.py while the form is still being filled)
const siteUrl = (process.argv.slice(2).find((a) => !a.startsWith('--')) || src.siteUrl || '').replace(/\/$/, '');
const site = src.site || {};

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fail = (m) => { console.error('BUILD FAIL: ' + m); process.exit(1); };

// keep each group's products together, in the order of the tabs
const rank = (p) => { const i = src.groups.indexOf(p.group); return i < 0 ? 999 : i; };
src.products = src.products.map((p, i) => ({ p, i })).sort((x, y) => rank(x.p) - rank(y.p) || x.i - y.i).map((x) => x.p);
for (const p of src.products) {
  if (!src.groups.includes(p.group)) fail(`product ${p.slug} has group "${p.group}" which is not in groups`);
  if (!(p.slug in bl)) fail('missing baseline for ' + p.slug);
  p.baseline = bl[p.slug];
  p.img3q = p.file || `img/products/${p.slug}.webp`;
  if (!p.single) p.imgFront = `img/products/${p.slug}-frente.webp`;
  for (const f of [p.img3q, p.imgFront].filter(Boolean)) if (!fs.existsSync(f)) fail('missing image ' + f);
}
const bySlug = Object.fromEntries(src.products.map((p) => [p.slug, p]));
fs.writeFileSync('data/products.js', 'window.KEEP=' + JSON.stringify(src) + ';\n');
if (PARTIAL) { console.log(`built data only: ${src.products.length} products`); process.exit(0); }

const th = Object.assign({ accent: '#0071e3', accentHover: '#0077ed', accentDeep: '#0066cc' }, site.theme || {});
for (const [k, v] of Object.entries(th)) if (!/^#[0-9a-fA-F]{6}$/.test(v)) fail(`theme.${k} must be a #rrggbb colour`);
fs.writeFileSync('css/theme.css', `:root{--blue:${th.accent};--blue-hover:${th.accentHover};--blue-deep:${th.accentDeep}}\n`);

const wa = () => `tel:${(src.phone || '').replace(/\s/g, '')}`;
const noscript = src.products.map((p) =>
  `<li><img src="${p.img3q}" alt="${esc(p.name)}" width="300" height="240" loading="lazy"><div><strong>${esc(p.group)} · ${esc(p.name)}</strong><span>${p.color === 'NOT SET' ? '' : esc(p.color)}</span><a href="${wa()}">Ligar para a loja</a></div></li>`).join('\n');

const chapters = (site.chapters || []).map((c, i) => {
  const prod = bySlug[c.product]; if (!prod) fail(`chapter "${c.id}" uses product "${c.product}" which does not exist`);
  if (!src.groups.includes(c.group)) fail(`chapter "${c.id}" uses group "${c.group}" which is not in groups`);
  const head = (c.head || []).map(esc).join('<br>');
  return `  <section class="chapter${i % 2 ? ' ch-mist' : ''}" id="ch-${esc(c.id)}" aria-labelledby="ch${i}T">
    <div class="ch-stick">
      <div class="ch-text">
        <p class="ch-kicker">${esc(c.kicker)}</p>
        <h2 class="ch-head" id="ch${i}T">${head}</h2>
        <p class="ch-body">${esc(c.body)} <strong>${esc(c.strong)}</strong></p>
        <p><a class="link-blue" href="#colecao" data-go-group="${esc(c.group)}">${esc(c.linkText)} <span aria-hidden="true">›</span></a></p>
      </div>
      <div class="ch-art"><img src="${prod.img3q}" alt="${esc(prod.name)}" width="1200" height="960" loading="lazy" decoding="async"></div>
    </div>
  </section>`;
}).join('\n\n');

const hero = site.hero || {};
const [heroL, heroC, heroR] = hero.art || [];
for (const s of [heroL, heroC, heroR]) if (!bySlug[s]) fail(`hero.art product "${s}" does not exist`);
const facts = (site.about && site.about.facts || []).map(([k, v]) => `          <li><strong>${esc(k)}</strong><span>${esc(v)}</span></li>`).join('\n');

const show = (v) => String(v ?? '') === 'NOT SET' ? '' : esc(v);
const locationsHtml = (src.store.locations || []).map((l) => `<article class="location-card"><h3>${show(l.name)}</h3><p>${show(l.address)}</p><p class="location-hours">Seg–Sex ${show(l.hours.mon[0])} às ${show(l.hours.mon[1])}<br>Sáb ${show(l.hours.sat[0])} às ${show(l.hours.sat[1])}<br>Domingo: Fechado</p><p>${show(l.payments)}</p><p>${l.delivery === 'NOT SET' ? '' : 'Entrega: ' + show(l.delivery)}</p></article>`).join('');
const faqHtml = (site.faq || []).map((x) => `<details><summary>${esc(x.q)}</summary><p>${esc(x.a)}</p></details>`).join('');
const T = {
  lang: src.lang || 'pt-AO', title: site.title, description: site.description, siteUrl, name: src.name,
  searchHint: site.searchHint || 'Nome ou serviço', h1: site.h1 || `${src.name}: ${site.description || ''}`,
  heroKicker: hero.kicker, heroTitleHtml: (hero.titleLines || []).map(esc).join('<br>'), heroSub: hero.sub,
  ctaPrimary: hero.ctaPrimary || 'Ver a coleção', ctaSecondary: hero.ctaSecondary || 'Falar com a loja',
  heroL: heroL, heroC: heroC, heroR: heroR,
  introKicker: (site.intro || {}).kicker || 'A coleção', introTitle: (site.intro || {}).title, introSub: (site.intro || {}).sub,
  servicesTitle: (site.services || {}).title, servicesSub: (site.services || {}).sub,
  aboutTitle: (site.about || {}).title, aboutLead: (site.about || {}).lead,
  followTitle: (site.follow || {}).title, followSub: (site.follow || {}).sub,
  igHandle: src.instagramHandle, address: (src.store || {}).address, footNote: site.footNote, locationsHtml, faqHtml,
};
const RAW = new Set(['heroTitleHtml', 'aboutFacts', 'locationsHtml', 'faqHtml']);
let html = fs.readFileSync('index.template.html', 'utf8');
html = html.replace('<!--CHAPTERS-->', chapters);
html = html.replace(/<!--NOSCRIPT:START-->[\s\S]*?<!--NOSCRIPT:END-->/, `<!--NOSCRIPT:START-->\n<noscript><section class="ns"><h2>Os nossos produtos</h2><ul>\n${noscript}\n</ul></section></noscript>\n<!--NOSCRIPT:END-->`);
html = html.replace('{{aboutFacts}}', facts);
html = html.replace(/\{\{(\w+)\}\}/g, (m, k) => {
  if (k === 'siteUrl') return esc(T[k] || '');   // empty until the first deploy; check-form --shipping insists on it
  if (!(k in T) || T[k] === undefined || T[k] === '') fail(`the form leaves "${k}" empty (needed by the page)`);
  return RAW.has(k) ? T[k] : esc(T[k]);
});
fs.writeFileSync('index.html', html);
console.log(`built ${src.products.length} products, ${src.groups.length} groups, ${(site.chapters || []).length} chapters` + (siteUrl ? `, site url ${siteUrl}` : ', no site url yet'));
