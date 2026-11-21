#!/usr/bin/env node
// Browser QA for a showcase store, at 1440 and 390 px. Every line is RUN-PASS or RUN-FAIL.
// Usage (from the project folder):   NODE_PATH=$(npm root -g) node SKILL_DIR/scripts/qa.cjs          # serves the folder locally
//        BASE=https://the-live-url/ OUT=./qa-shots NODE_PATH=$(npm root -g) node SKILL_DIR/scripts/qa.cjs   # tests the live site
// Needs Playwright. Expectations come from the site's own data, so it works for any filled form. Screenshots go to OUT (default ./qa-shots): LOOK AT THEM.
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const { chromium } = require('playwright');
const root = process.cwd(), OUT = process.env.OUT || path.join(root, 'qa-shots');
fs.mkdirSync(OUT, { recursive: true });
let fails = 0;
const log = (ok, m) => { if (!ok) fails++; console.log((ok ? 'RUN-PASS ' : 'RUN-FAIL ') + m); };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

(async () => {
  let server = null, base = process.env.BASE;
  if (!base) {
    server = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html')); if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
    await new Promise((res) => server.listen(0, res)); base = `http://localhost:${server.address().port}/`;
  }
  const b = await chromium.launch(); const errs = [];
  for (const [n, vw, vh, mob] of [['d', 1440, 900, false], ['m', 390, 844, true]]) {
    const ctx = await b.newContext({ viewport: { width: vw, height: vh }, hasTouch: mob, isMobile: mob }); const pg = await ctx.newPage();
    pg.on('pageerror', (e) => { if (!/requireLazy/.test(e.message)) errs.push(`${n} pageerror ${e.message}`); });
    pg.on('console', (x) => { if (x.type() === 'error' && !/ERR_|Permissions-Policy|frame|X-Frame|upgrade-insecure-requests/i.test(x.text())) errs.push(`${n} ${x.text().slice(0, 140)}`); });
    await pg.addInitScript(() => { window.__open = []; window.open = (u) => { window.__open.push(u); return {}; }; window.__clip = ''; document.addEventListener('DOMContentLoaded', () => { document.documentElement.style.scrollBehavior = 'auto'; }); try { Object.defineProperty(navigator, 'clipboard', { value: { writeText: (t) => { window.__clip = t; return Promise.resolve(); } }, configurable: true }); } catch (e) {} });
    await pg.goto(base, { waitUntil: 'load' }); await pg.waitForTimeout(1600);
    const K = await pg.evaluate(() => window.KEEP); const N = K.products.length, pad = (x) => String(x).padStart(2, '0');
    const idx = () => pg.evaluate(() => document.querySelector('#count').textContent.trim());
    const firstOf = (g) => K.products.findIndex((p) => p.group === g) + 1;
    log((await idx()) === `01 / ${pad(N)}`, `${n} counter shows 01 / ${pad(N)}`);
    log((await pg.locator('.tab').count()) === K.groups.length, `${n} one tab per group (${K.groups.length})`);
    await pg.screenshot({ path: path.join(OUT, `${n}-1-hero.png`) });
    const gap = await pg.evaluate(() => { const a = document.querySelector('.hero-art').getBoundingClientRect(), t = document.querySelector('.intro-title').getBoundingClientRect(); return Math.round(t.top - a.bottom); });
    log(gap >= 100, `${n} room between the hero and the next section: ${gap}px`);
    await pg.evaluate(() => document.querySelector('#colecao').scrollIntoView()); await pg.waitForTimeout(1500);
    await pg.screenshot({ path: path.join(OUT, `${n}-2-orbit.png`) });
    for (const g of [...K.groups].reverse()) { await pg.locator('.tab', { hasText: new RegExp('^' + g.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }).click(); await pg.waitForTimeout(1500); log((await idx()) === `${pad(firstOf(g))} / ${pad(N)}`, `${n} tab "${g}" -> ${await idx()}`); }
    const wb = await pg.locator('#wheel').boundingBox(); await pg.mouse.move(wb.x + wb.width / 2, wb.y + 10); await pg.mouse.down(); await pg.mouse.move(wb.x + wb.width / 2 - 150, wb.y + 10, { steps: 8 }); await pg.mouse.up(); await pg.waitForTimeout(1500);
    log((await idx()) !== `${pad(firstOf(K.groups[0]))} / ${pad(N)}` || N < 3 || mob, `${n} dragging the wheel moves the orbit (${await idx()})`);
    await pg.keyboard.press('ArrowLeft'); await pg.waitForTimeout(900);
    // cart + order
    const needSize = (K.sizes || []).length > 0;
    if (needSize) await pg.locator('#sizes .size').first().click();
    await pg.locator('#addBtn').click(); await pg.waitForTimeout(500);
    log((await pg.textContent('#bagCount')) === '1', `${n} add to cart, badge = 1`);
    await pg.locator('#toastOpen').click({ force: true }); await pg.waitForTimeout(700); await pg.screenshot({ path: path.join(OUT, `${n}-3-cart.png`) });
    await pg.locator('#toCheckout').click({ force: true }); await pg.waitForTimeout(300); await pg.locator('#sendWa').click({ force: true }); await pg.waitForTimeout(200);
    log(await pg.locator('#errName').isVisible() && (await pg.evaluate(() => window.__open.length)) === 0, `${n} an empty name is refused and nothing opens`);
    await pg.fill('#fName', 'Maria Teste'); await pg.fill('#fMail', 'maria@gmail.com'); await pg.locator('#sendWa').click({ force: true }); await pg.waitForTimeout(400);
    const op = await pg.evaluate(() => window.__open), clip = await pg.evaluate(() => window.__clip);
    if (K.whatsapp) log(op.length === 1 && op[0].startsWith(`https://wa.me/${K.whatsapp}?text=`) && decodeURIComponent(op[0]).includes('Maria Teste'), `${n} the order opens the phone link with the text already written`);
    else log(op.length === 1 && op[0] === 'tel:+244934157570', `${n} no online order number: the order opens the store phone link`);
    await pg.screenshot({ path: path.join(OUT, `${n}-4-order.png`) }); await pg.keyboard.press('Escape'); await pg.waitForTimeout(500);
    // catalogue
    await pg.evaluate(() => document.querySelector('#catalogo').scrollIntoView()); await pg.waitForTimeout(400);
    log((await pg.locator('.cat-card').count()) === N && (await pg.locator('.cat-group').count()) === K.groups.length, `${n} collection grid: ${N} cards in ${K.groups.length} groups`);
    const y1 = await pg.evaluate(() => { const c = document.querySelectorAll('.cat-card')[Math.floor(document.querySelectorAll('.cat-card').length / 2)]; c.scrollIntoView({ block: 'center' }); return Math.round(scrollY); }); await pg.waitForTimeout(300);
    await pg.locator('.cat-card').nth(Math.floor(N / 2)).click(); await pg.waitForTimeout(800);
    log((await pg.evaluate(() => document.querySelector('#sheet').open)) && Math.abs((await pg.evaluate(() => Math.round(scrollY))) - y1) < 10, `${n} tapping a product opens its details where you are`);
    await pg.screenshot({ path: path.join(OUT, `${n}-5-details.png`) }); await pg.keyboard.press('Escape'); await pg.waitForTimeout(400);
    // chapters
    for (const c of (K.site.chapters || [])) {
      const id = `ch-${c.id}`;
      const at = async (f) => { await pg.evaluate(([i, f]) => { const e = document.getElementById(i); window.scrollTo(0, e.getBoundingClientRect().top + scrollY + (e.offsetHeight - innerHeight) * f); }, [id, f]); await pg.waitForTimeout(1200); return pg.evaluate((i) => ({ p: +getComputedStyle(document.getElementById(i)).getPropertyValue('--p'), col: getComputedStyle(document.querySelector(`#${i} .ch-head`)).color }), id); };
      const a = await at(0.05), z = await at(0.13), back = await at(0.05);
      log(z.p > a.p && a.col !== z.col && Math.abs(back.p - a.p) < 0.01, `${n} chapter "${c.id}" follows the scroll and reverses (p ${a.p.toFixed(2)} -> ${z.p.toFixed(2)} -> ${back.p.toFixed(2)})`);
      await at(0.5); await pg.screenshot({ path: path.join(OUT, `${n}-6-chapter-${c.id}.png`) });
      await pg.locator(`#${id} [data-go-group]`).click(); await pg.waitForTimeout(1700);
      log((await idx()) === `${pad(firstOf(c.group))} / ${pad(N)}`, `${n} the "${c.id}" link flies the orbit to "${c.group}"`);
    }
    // highlights
    await pg.evaluate(() => document.querySelector('#servicos').scrollIntoView()); await pg.waitForTimeout(400);
    await pg.locator('#hlNext').click(); await pg.waitForTimeout(700);
    log((await pg.evaluate(() => document.querySelector('#hlTrack').scrollLeft)) > 50 && (await pg.locator('.hl-card').count()) === K.groups.length, `${n} services band: one card per group, the arrow scrolls`);
    await pg.screenshot({ path: path.join(OUT, `${n}-7-services.png`) });
    // embeds
    const E = (K.reels || []).length + (K.posts || []).length;
    if (E) {
      await pg.evaluate(() => document.querySelector('#acompanhe').scrollIntoView()); await pg.waitForTimeout(5000);
      const fr = await pg.evaluate(() => [...document.querySelectorAll('.reel-frame iframe')].map((f) => f.src));
      log(fr.length === E && fr.every((s) => /^https:\/\/www\.instagram\.com\/(reel|p)\/[\w-]+\/embed\/$/.test(s)), `${n} ${E} Instagram embeds (${(K.reels || []).length} reels, ${(K.posts || []).length} posts)`);
      const geo = await pg.evaluate(() => { const f = document.querySelector('.reel-frame'), r = f.getBoundingClientRect(), cl = f.querySelector('.clip').getBoundingClientRect(), i = f.querySelector('iframe').getBoundingClientRect(); return { ratio: +(r.height / r.width).toFixed(3), top: i.top - cl.top, s: +getComputedStyle(f).getPropertyValue('--s') }; });
      log(Math.abs(geo.ratio - 1.25) < 0.01 && Math.abs(geo.top + 54 * geo.s) < 2, `${n} each embed shows only the media (4:5 card, the 54 px header slid out)`);
      await pg.evaluate(() => document.querySelector('#reels').scrollIntoView({ block: 'center' })); await pg.waitForTimeout(3000); await pg.screenshot({ path: path.join(OUT, `${n}-8-embeds.png`) });
    }
    await pg.evaluate(() => scrollTo(0, document.body.scrollHeight)); await pg.waitForTimeout(500); await pg.screenshot({ path: path.join(OUT, `${n}-9-footer.png`) });
    log(await pg.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `${n} no horizontal overflow`);
    await ctx.close();
  }
  log(!errs.length, errs.length ? 'console errors: ' + errs.join(' | ') : 'console is clean');
  await b.close(); if (server) server.close();
  console.log(fails ? `\n${fails} check(s) FAILED. Screenshots: ${OUT}` : `\nAll RUN-PASS. Now open the screenshots in ${OUT} and judge each one.`);
  process.exit(fails ? 1 : 0);
})();
