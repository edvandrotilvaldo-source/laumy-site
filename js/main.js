/* Relojoaria LauMY showcase — the orbit showcase, the scroll chapters, the cart and the order message.
   One number, `p` (the position along the orbit), drives every product. No libraries. */
(() => {
  'use strict';
  const K = window.KEEP;
  if (!K || !K.products || !K.products.length) return;
  const P = K.products, N = P.length, SIZES = K.sizes || [];

  const $ = (s, r = document) => r.querySelector(s);
  const el = {
    nav: $('#nav'), stage: $('#stage') || $('#colecao'), orbit: $('#orbit'), tabs: $('#tabs'),
    info: $('#info'), count: $('#count'), title: $('#title'), color: $('#color'), price: $('#price'), detailsBtn: $('#detailsBtn'),
    sizes: $('#sizes'), addBtn: $('#addBtn'), wheel: $('#wheel'), wheelWrap: $('#wheelWrap'), wheelEnd: $('#wheelEnd'), live: $('#live'),
    bagBtn: $('#bagBtn'), bagCount: $('#bagCount'), drawer: $('#drawer'), scrim: $('#scrim'), drawerClose: $('#drawerClose'),
    cartList: $('#cartList'), cartEmpty: $('#cartEmpty'), toCheckout: $('#toCheckout'),
    sheet: $('#sheet'), sheetClose: $('#sheetClose'), sheetImg: $('#sheetImg'), sheetBrand: $('#sheetBrand'), sheetTitle: $('#sheetTitle'),
    sheetColor: $('#sheetColor'), sheetPrice: $('#sheetPrice'), sheetSizes: $('#sheetSizes'), sheetAdd: $('#sheetAdd'),
    viewSide: $('#viewSide'), viewFront: $('#viewFront'),
    searchBtn: $('#searchBtn'), searchPanel: $('#searchPanel'), searchInput: $('#searchInput'), searchList: $('#searchList'),
    toast: $('#toast'), toastText: $('#toastText'), toastOpen: $('#toastOpen'),
  };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pad = (n) => String(n).padStart(2, '0');
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const NEED_SIZE = SIZES.length > 0;
  const CONTACT = `tel:${(K.phone || "+244 934 157 570").replace(/\s/g, '')}`;
  const CHANNEL = 'telefone';
  const contactUrl = () => CONTACT;
  const label = (pr) => pr.name;

  /* ---------- static bits filled from data ---------- */
  $('#phoneTop').href = CONTACT;
  $('#phoneTop').setAttribute('aria-label', 'Ligar para a loja');
  $('#phoneFoot').href = CONTACT;
  document.querySelectorAll('[data-channel]').forEach((n) => { n.textContent = CHANNEL; });
  $('#igFoot').href = K.instagram;
  $('#heroChat').href = CONTACT; if ($('#factIg')) $('#factIg').textContent = K.instagramHandle;
  if ($('#igFootHandle')) $('#igFootHandle').textContent = K.instagramHandle;
  el.wheel.setAttribute('aria-valuemax', N);
  el.wheelEnd.textContent = pad(N);

  /* ---------- state ---------- */
  let p = 0, target = 0, active = -1, W = 0, H = 0, G = null, dragging = false, raf = 0, last = 0;
  const chosen = {};            // product id -> size (only when the shop sells sizes)
  let cart = [];                // [{id,size,qty}]
  const shoes = [];

  /* ---------- build the orbit ---------- */
  P.forEach((pr, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'shoe' + (pr.imgFront ? ' has-front' : '') + (pr.shadow === 'baked' ? ' no-sh' : '');
    b.setAttribute('aria-label', pr.name);
    b.dataset.i = i;
    b.style.setProperty('--bl', pr.baseline);
    b.style.visibility = 'hidden';
    b.innerHTML = `<span class="sh"></span><span class="bob"><img class="s3" data-src="${pr.img3q}" alt="" width="1200" height="960" decoding="async">${pr.imgFront ? `<img class="sf" data-src="${pr.imgFront}" alt="" width="1200" height="960" decoding="async">` : ''}</span><span class="hit"></span>`;
    b._vis = false; b._hit = b.querySelector('.hit');
    el.orbit.appendChild(b);
    shoes.push(b);
  });

  /* only the shoes near the one in view load their photos; a long catalogue stays light */
  function ensureImages(i) {
    for (let k = Math.max(0, i - 3); k <= Math.min(N - 1, i + 5); k++) {
      shoes[k].querySelectorAll('img[data-src]').forEach((im) => { im.src = im.dataset.src; im.removeAttribute('data-src'); });
    }
  }

  /* ---------- brand tabs ---------- */
  K.groups.forEach((brand) => {
    const t = document.createElement('button');
    t.type = 'button'; t.className = 'tab'; t.textContent = brand; t.dataset.brand = brand;
    t.addEventListener('click', () => goTo(P.findIndex((x) => x.group === brand)));
    el.tabs.appendChild(t);
  });

  /* ---------- size pills (hero + sheet) ---------- */
  function buildSizes(container, onPick) {
    container.innerHTML = '';
    SIZES.forEach((s) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'size'; b.textContent = s; b.dataset.size = s;
      b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', 'false'); b.setAttribute('aria-label', `Tamanho ${s}`);
      b.addEventListener('click', () => onPick(s));
      container.appendChild(b);
    });
  }
  function paintSizes(container, current) {
    container.querySelectorAll('.size').forEach((b) => b.setAttribute('aria-checked', String(Number(b.dataset.size) === current)));
  }
  function pickSize(s) { chosen[P[active].id] = s; refreshBuy(); }
  buildSizes(el.sizes, pickSize);
  buildSizes(el.sheetSizes, (s) => { chosen[P[sheetIndex].id] = s; refreshBuy(); });

  const picked = (pr) => (NEED_SIZE ? chosen[pr.id] : 1);
  const addLabel = (s) => (NEED_SIZE ? (s ? `Adicionar ao carrinho · ${s}` : 'Escolha o tamanho') : 'Adicionar ao carrinho');
  function refreshBuy() {
    const pr = P[active]; const s = picked(pr);
    if (NEED_SIZE) paintSizes(el.sizes, s);
    el.addBtn.disabled = !s;
    el.addBtn.textContent = addLabel(s);
    if (el.sheet.open) {
      const sp = P[sheetIndex]; const ss = picked(sp);
      if (NEED_SIZE) paintSizes(el.sheetSizes, ss);
      el.sheetAdd.disabled = !ss;
      el.sheetAdd.textContent = addLabel(ss);
    }
  }

  /* ---------- geometry ---------- */
  function measure() {
    const r = el.stage.getBoundingClientRect(); W = r.width; H = r.height;
    if (W >= 900) G = { cx: .866 * W, cy: .96 * H, a: .655 * W, b: .78 * H, sw: Math.min(.29 * W, 560), th0: 229, dth: 22 };
    else if (W >= 600) G = { cx: .95 * W, cy: .96 * H, a: .88 * W, b: .62 * H, sw: .48 * W, th0: 229, dth: 22 };
    else G = { cx: .96 * W, cy: .84 * H, a: .93 * W, b: .42 * H, sw: .7 * W, th0: 229, dth: 22, fadeBack: 1.5 };
    el.orbit.style.setProperty('--sw', G.sw + 'px');
  }

  function render() {
    const hb = G.sw * .8;
    for (let i = 0; i < N; i++) {
      const d = i - p, ad = Math.abs(d), s = shoes[i];
      if (d < -3.1 || d > 3.5) { if (s._vis) { s.style.visibility = 'hidden'; s._vis = false; } continue; }
      if (!s._vis) { s.style.visibility = 'visible'; s._vis = true; }
      const th = (G.th0 + d * G.dth) * Math.PI / 180;
      const x = G.cx + G.a * Math.cos(th), y = G.cy + G.b * Math.sin(th);
      const sc = d >= 0 ? 1 / (1 + .28 * d * d) : 1 / (1 + .8 * d * d);
      const op = d < 0 && G.fadeBack ? 1 - smooth(G.fadeBack, G.fadeBack + .8, ad) : 1 - smooth(2.3, 3.3, ad);
      const rot = clamp(d, -3, 3) * -2.2;
      s.style.transform = `translate3d(${(x - G.sw / 2).toFixed(1)}px,${(y - hb / 2).toFixed(1)}px,0) rotate(${rot.toFixed(2)}deg) scale(${sc.toFixed(4)})`;
      s.style.opacity = op.toFixed(3);
      s.style.zIndex = String(1000 - Math.round(ad * 100));
      s._hit.style.pointerEvents = op < .35 ? 'none' : 'auto';
    }
    el.wheel.style.setProperty('--wp', p.toFixed(4));
  }

  /* ---------- animation loop (runs only while something moves) ---------- */
  function tick(t) {
    const dt = Math.min(.05, (t - last) / 1000 || .016); last = t;
    const k = reduce ? 1 : 1 - Math.exp(-dt / .12);
    p += (target - p) * k;
    if (Math.abs(target - p) < .0005) p = target;
    render();
    const idx = clamp(Math.round(p), 0, N - 1);
    if (idx !== active) setActive(idx);
    raf = (p !== target || dragging) ? requestAnimationFrame(tick) : 0;
  }
  function kick() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); } }
  function goTo(i) { if (i < 0) return; target = clamp(i, 0, N - 1); ensureImages(target); kick(); }

  /* ---------- the info block ---------- */
  let swapTimer = 0;
  function fillInfo(i) {
    const pr = P[i];
    el.count.textContent = `${pad(i + 1)} / ${pad(N)}`;
    el.title.textContent = pr.name; el.color.textContent = pr.color === 'NOT SET' ? '' : pr.color; el.price.textContent = K.priceLabel;
    el.live.textContent = `${pr.name}. ${i + 1} de ${N}.`;
  }
  function setActive(i) {
    const first = active === -1;
    active = i; ensureImages(i);
    shoes.forEach((s, j) => s.classList.toggle('is-active', j === i));
    shoes.forEach((s, j) => { s.tabIndex = j === i ? 0 : -1; });
    el.tabs.querySelectorAll('.tab').forEach((t) => { if (t.dataset.brand === P[i].group) t.setAttribute('aria-current', 'true'); else t.removeAttribute('aria-current'); });
    const bt = el.tabs.querySelector('[aria-current]'); if (bt && el.tabs.scrollWidth > el.tabs.clientWidth) bt.scrollIntoView({ inline: 'center', block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
    el.wheel.setAttribute('aria-valuenow', i + 1); el.wheel.setAttribute('aria-valuetext', `Produto ${i + 1} de ${N}`);
    refreshBuy();
    if (first) { fillInfo(i); return; }
    clearTimeout(swapTimer); el.info.classList.add('is-out');
    swapTimer = setTimeout(() => { fillInfo(active); el.info.classList.remove('is-out'); }, reduce ? 0 : 220);
  }

  /* ---------- input: drag the stage ---------- */
  let drag = null, suppressClick = false;
  const pxPerItem = () => (W < 900 ? Math.max(96, W * .32) : Math.max(86, W * .13));
  el.stage.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest('.buy,.wheel-wrap,.info,.nav')) return;
    drag = { id: e.pointerId, x: e.clientX, t: target, moved: false, lx: e.clientX, lt: e.timeStamp, v: 0 };
  });
  window.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) > 7) { drag.moved = true; dragging = true; el.stage.classList.add('is-dragging'); try { el.stage.setPointerCapture(e.pointerId); } catch (_) {} }
    if (!drag.moved) return;
    const dtm = Math.max(1, e.timeStamp - drag.lt);
    drag.v = .8 * drag.v + .2 * ((-(e.clientX - drag.lx) / pxPerItem()) / dtm * 1000);
    drag.lx = e.clientX; drag.lt = e.timeStamp;
    target = clamp(drag.t - dx / pxPerItem(), -.4, N - .6);
    kick();
  });
  function endDrag(e) {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    if (drag.moved) { suppressClick = true; setTimeout(() => { suppressClick = false; }, 0); settle(drag.v); }
    el.stage.classList.remove('is-dragging'); dragging = false; drag = null;
  }
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);
  function settle(vel) { target = clamp(Math.round(target + clamp(vel * .2, -1, 1)), 0, N - 1); kick(); }
  el.orbit.addEventListener('click', (e) => {
    if (suppressClick) { e.stopPropagation(); e.preventDefault(); return; }
    const s = e.target.closest('.shoe'); if (!s) return;
    const i = Number(s.dataset.i);
    if (i === active) openSheet(i); else goTo(i);
  }, true);

  /* trackpad / horizontal wheel, without stealing normal page scroll */
  let wheelTimer = 0;
  el.stage.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) || Math.abs(e.deltaX) < 2) return;
    e.preventDefault();
    target = clamp(target + e.deltaX / 320, -.3, N - .7); kick();
    clearTimeout(wheelTimer); wheelTimer = setTimeout(() => { target = clamp(Math.round(target), 0, N - 1); kick(); }, 140);
  }, { passive: false });

  /* ---------- input: the wheel ---------- */
  let wd = null;
  el.wheel.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    wd = { id: e.pointerId, x: e.clientX, t: target, lx: e.clientX, lt: e.timeStamp, v: 0 };
    dragging = true; el.wheel.setPointerCapture(e.pointerId); e.preventDefault();
  });
  el.wheel.addEventListener('pointermove', (e) => {
    if (!wd || e.pointerId !== wd.id) return;
    const per = 60, dx = e.clientX - wd.x, dtm = Math.max(1, e.timeStamp - wd.lt);
    wd.v = .8 * wd.v + .2 * ((-(e.clientX - wd.lx) / per) / dtm * 1000); wd.lx = e.clientX; wd.lt = e.timeStamp;
    target = clamp(wd.t - dx / per, -.4, N - .6); kick();
  });
  const endWheel = (e) => { if (!wd || (e && e.pointerId !== wd.id)) return; const v = wd.v; wd = null; dragging = false; settle(v); };
  el.wheel.addEventListener('pointerup', endWheel);
  el.wheel.addEventListener('pointercancel', endWheel);
  el.wheel.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { goTo(active + 1); e.preventDefault(); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { goTo(active - 1); e.preventDefault(); }
    if (e.key === 'Home') { goTo(0); e.preventDefault(); }
    if (e.key === 'End') { goTo(N - 1); e.preventDefault(); }
  });
  /* arrow keys anywhere on the page (when no panel is open) */
  window.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    if (el.sheet.open || el.drawer.classList.contains('is-open')) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || ''))) return;
    if (e.target.closest && e.target.closest('#wheel')) return;
    if (e.key === 'ArrowRight') goTo(active + 1);
    if (e.key === 'ArrowLeft') goTo(active - 1);
  });

  /* ---------- details sheet ---------- */
  let sheetIndex = 0, sheetView = 'side', sheetOpener = null;
  function setSheetView(v) {
    sheetView = v; const pr = P[sheetIndex];
    el.sheetImg.src = v === 'side' ? pr.img3q : pr.imgFront;
    el.sheetImg.alt = `${label(pr)}, vista ${v === 'side' ? 'de lado' : 'de frente'}`;
    el.viewSide.setAttribute('aria-selected', String(v === 'side')); el.viewFront.setAttribute('aria-selected', String(v === 'front'));
  }
  function openSheet(i) {
    sheetIndex = i; const pr = P[i]; sheetOpener = document.activeElement;
    el.sheetBrand.textContent = pr.group; el.sheetTitle.textContent = pr.name; el.sheetColor.textContent = pr.color === 'NOT SET' ? '' : pr.color; el.sheetPrice.textContent = K.priceLabel;
    document.querySelector('.sheet-views').hidden = !pr.imgFront;
    setSheetView('side');
    if (!el.sheet.open) el.sheet.showModal();
    refreshBuy();
  }
  el.detailsBtn.addEventListener('click', () => openSheet(active));
  el.viewSide.addEventListener('click', () => setSheetView('side'));
  el.viewFront.addEventListener('click', () => setSheetView('front'));
  el.sheetClose.addEventListener('click', () => el.sheet.close());
  el.sheet.addEventListener('click', (e) => { if (e.target === el.sheet) el.sheet.close(); });
  el.sheet.addEventListener('close', () => { if (sheetOpener && sheetOpener.focus) sheetOpener.focus(); });

  /* ---------- cart ---------- */
  const STORE = 'laumy-cart-v1';
  function loadCart() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE) || '[]');
      cart = (Array.isArray(raw) ? raw : []).filter((c) => c && P.some((x) => x.id === c.id) && (!NEED_SIZE || SIZES.includes(Number(c.size))))
        .map((c) => ({ id: c.id, size: NEED_SIZE ? Number(c.size) : 0, qty: clamp(parseInt(c.qty, 10) || 1, 1, 9) }));
    } catch (_) { cart = []; }
  }
  function saveCart() { try { localStorage.setItem(STORE, JSON.stringify(cart)); } catch (_) {} }
  const cartCount = () => cart.reduce((n, c) => n + c.qty, 0);
  function paintCart() {
    const n = cartCount();
    el.bagCount.hidden = n === 0; el.bagCount.textContent = String(n);
    el.bagBtn.setAttribute('aria-label', n ? `Abrir o carrinho, ${n} ${n === 1 ? 'artigo' : 'artigos'}` : 'Abrir o carrinho');
    el.cartList.innerHTML = '';
    cart.forEach((c, idx) => {
      const pr = P.find((x) => x.id === c.id);
      const li = document.createElement('li'); li.className = 'cart-item';
      const img = document.createElement('img'); img.src = pr.img3q; img.alt = ''; img.width = 92; img.height = 74;
      const mid = document.createElement('div');
      const h = document.createElement('h3'); h.textContent = pr.name;
      const sub = document.createElement('p'); sub.textContent = c.size ? `tamanho ${c.size}` : '';
      const q = document.createElement('div'); q.className = 'qty';
      const minus = document.createElement('button'); minus.type = 'button'; minus.textContent = '−'; minus.setAttribute('aria-label', `Menos um, ${label(pr)}`);
      const num = document.createElement('span'); num.textContent = String(c.qty);
      const plus = document.createElement('button'); plus.type = 'button'; plus.textContent = '+'; plus.setAttribute('aria-label', `Mais um, ${label(pr)}`);
      minus.addEventListener('click', () => { c.qty = Math.max(1, c.qty - 1); saveCart(); paintCart(); });
      plus.addEventListener('click', () => { c.qty = Math.min(9, c.qty + 1); saveCart(); paintCart(); });
      q.append(minus, num, plus); mid.append(h, sub, q);
      const rm = document.createElement('button'); rm.type = 'button'; rm.className = 'rm'; rm.textContent = 'Remover'; rm.setAttribute('aria-label', `Remover ${label(pr)}`);
      rm.addEventListener('click', () => { cart.splice(idx, 1); saveCart(); paintCart(); });
      li.append(img, mid, rm); el.cartList.appendChild(li);
    });
    el.cartEmpty.hidden = cart.length > 0; el.toCheckout.hidden = cart.length === 0;
  }
  function addToCart(id, size) {
    const hit = cart.find((c) => c.id === id && c.size === size);
    if (hit) hit.qty = Math.min(9, hit.qty + 1); else cart.push({ id, size, qty: 1 });
    saveCart(); paintCart();
    el.bagCount.classList.remove('bump'); void el.bagCount.offsetWidth; el.bagCount.classList.add('bump');
    const pr = P.find((x) => x.id === id);
    showToast(size ? `${pr.name}, tamanho ${size}, no carrinho` : `${pr.name} no carrinho`);
  }
  el.addBtn.addEventListener('click', () => { const s = picked(P[active]); if (s) addToCart(P[active].id, NEED_SIZE ? s : 0); });
  el.sheetAdd.addEventListener('click', () => { const s = picked(P[sheetIndex]); if (s) { addToCart(P[sheetIndex].id, NEED_SIZE ? s : 0); el.sheet.close(); } });

  let toastTimer = 0;
  function showToast(text) {
    el.toastText.textContent = text; el.toast.hidden = false;
    requestAnimationFrame(() => el.toast.classList.add('is-on'));
    clearTimeout(toastTimer); toastTimer = setTimeout(hideToast, 3800);
  }
  function hideToast() { el.toast.classList.remove('is-on'); setTimeout(() => { if (!el.toast.classList.contains('is-on')) el.toast.hidden = true; }, 320); }
  el.toastOpen.addEventListener('click', () => { hideToast(); openDrawer(); });

  /* ---------- drawer ---------- */
  let drawerOpener = null;
  function openDrawer() {
    drawerOpener = document.activeElement; paintCart();
    el.drawer.removeAttribute('inert'); el.drawer.setAttribute('aria-hidden', 'false');
    el.scrim.hidden = false; requestAnimationFrame(() => { el.drawer.classList.add('is-open'); el.scrim.classList.add('is-on'); });
    setTimeout(() => el.drawerClose.focus(), 60);
  }
  function closeDrawer() {
    el.drawer.classList.remove('is-open'); el.scrim.classList.remove('is-on');
    el.drawer.setAttribute('aria-hidden', 'true'); el.drawer.setAttribute('inert', '');
    setTimeout(() => { if (!el.scrim.classList.contains('is-on')) el.scrim.hidden = true; }, 320);
    if (drawerOpener && drawerOpener.focus) drawerOpener.focus();
  }
  el.bagBtn.addEventListener('click', openDrawer);
  el.drawerClose.addEventListener('click', closeDrawer);
  el.scrim.addEventListener('click', closeDrawer);


  /* ---------- search ---------- */
  function paintSearch(q) {
    const t = q.trim().toLowerCase(); el.searchList.innerHTML = '';
    const hits = P.map((pr, i) => ({ pr, i })).filter(({ pr }) => !t || `${pr.group} ${pr.name}`.toLowerCase().includes(t));
    if (!hits.length) { const li = document.createElement('li'); li.className = 'none'; li.textContent = 'Nenhum produto encontrado.'; el.searchList.appendChild(li); return; }
    hits.forEach(({ pr, i }) => {
      const li = document.createElement('li'); const b = document.createElement('button'); b.type = 'button';
      const im = document.createElement('img'); im.src = pr.img3q; im.alt = ''; im.width = 64; im.height = 51;
      const d = document.createElement('div'); const s1 = document.createElement('strong'); s1.textContent = pr.name; const s2 = document.createElement('span'); s2.textContent = pr.group;
      d.append(s1, s2); b.append(im, d); b.addEventListener('click', () => { closeSearch(); goTo(i); });
      li.appendChild(b); el.searchList.appendChild(li);
    });
  }
  function openSearch() { el.searchPanel.hidden = false; el.searchBtn.setAttribute('aria-expanded', 'true'); paintSearch(''); el.searchInput.value = ''; setTimeout(() => el.searchInput.focus(), 20); }
  function closeSearch() { el.searchPanel.hidden = true; el.searchBtn.setAttribute('aria-expanded', 'false'); }
  el.searchBtn.addEventListener('click', () => (el.searchPanel.hidden ? openSearch() : closeSearch()));
  el.searchInput.addEventListener('input', () => paintSearch(el.searchInput.value));
  document.addEventListener('pointerdown', (e) => { if (!el.searchPanel.hidden && !e.target.closest('#searchPanel,#searchBtn')) closeSearch(); });
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!el.searchPanel.hidden) closeSearch();
    else if (el.drawer.classList.contains('is-open')) closeDrawer();
  });


  /* ---------- the shop: facts, opening hours, catalogue, reels ---------- */
  const S = K.store || {};
  const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const DAY_PT = { mon: 'Segunda', tue: 'Terça', wed: 'Quarta', thu: 'Quinta', fri: 'Sexta', sat: 'Sábado', sun: 'Domingo' };
  const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  function shopNow() {
    const f = new Intl.DateTimeFormat('en-GB', { timeZone: S.timezone || 'Africa/Luanda', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const o = Object.fromEntries(f.formatToParts(new Date()).map((x) => [x.type, x.value]));
    const iso = new Intl.DateTimeFormat('en-CA', { timeZone: S.timezone || 'Africa/Luanda' }).format(new Date());
    return { day: o.weekday.slice(0, 3).toLowerCase(), mins: Number(o.hour) * 60 + Number(o.minute), iso };
  }
  function statusText(now) {
    const today = S.hours[now.day];
    if (today && now.mins >= toMin(today[0]) && now.mins < toMin(today[1])) return { open: true, text: `Aberto agora · fecha às ${today[1]}` };
    if (today && now.mins < toMin(today[0])) return { open: false, text: `Fechado · abre hoje às ${today[0]}` };
    const i = DAYS.indexOf(now.day);
    for (let k = 1; k <= 7; k++) {
      const d = DAYS[(i + k) % 7], h = S.hours[d];
      if (h) return { open: false, text: `Fechado · abre ${k === 1 ? 'amanhã' : DAY_PT[d].toLowerCase()} às ${h[0]}` };
    }
    return { open: false, text: 'Fechado' };
  }
  function paintStatus() {
    if (!S.hours) return;
    const now = shopNow(), st = statusText(now);
    [['status', 'statusText'], ['status2', 'statusText2']].forEach(([a, b]) => {
      const box = $('#' + a), txt = $('#' + b); if (!box) return;
      box.hidden = false; box.classList.toggle('is-open', st.open); txt.textContent = st.text;
    });
    const rows = $('#hours'); if (rows) rows.querySelectorAll('li').forEach((li) => li.classList.toggle('is-today', li.dataset.days.split(',').includes(now.day)));
    const cp = $('#campaign');
    if (cp && S.campaign) cp.hidden = now.iso > S.campaign.until;
  }
  function fillShop() {
    $('#visitAddr').textContent = S.address === 'NOT SET' ? '' : S.address; $('#visitNote').textContent = (S.addressNote || '').replace(/NOT SET\.?/g, '');
    if ($('#phoneVisit')) $('#phoneVisit').href = CONTACT;
    $('#visitPay').textContent = S.payments === 'NOT SET' ? '' : S.payments; $('#visitDelivery').textContent = S.delivery === 'NOT SET' ? '' : S.delivery;
    $('#footAddr').textContent = S.address === 'NOT SET' ? '' : S.address;
    if (S.campaign) { $('#campaignTitle').textContent = S.campaign.title; $('#campaignText').textContent = S.campaign.text; }
    const ul = $('#hours');
    if (!S.hours) { const li = document.createElement('li'); const a = document.createElement('span'); a.textContent = 'Horário'; const b2 = document.createElement('span'); b2.textContent = 'Por confirmar com a loja'; li.append(a, b2); ul.appendChild(li); return; }
    const groups = [];
    DAYS.forEach((d) => { const h = S.hours[d]; const key = h ? h.join('-') : 'x'; const g = groups[groups.length - 1]; if (g && g.key === key) { g.days.push(d); } else groups.push({ key, days: [d], h }); });
    groups.forEach((g) => {
      const li = document.createElement('li'); li.dataset.days = g.days.join(',');
      const a = document.createElement('span'); a.textContent = g.days.length > 1 ? `${DAY_PT[g.days[0]]} a ${DAY_PT[g.days[g.days.length - 1]]}` : DAY_PT[g.days[0]];
      const b = document.createElement('span'); b.textContent = g.h ? `${g.h[0]} às ${g.h[1]}` : 'Fechado';
      li.append(a, b); ul.appendChild(li);
    });
    paintStatus(); setInterval(paintStatus, 60000);
  }
  function buildCatalogue() {
    const host = $('#catGroups'); if (!host) return;
    K.groups.forEach((brand) => {
      const items = P.map((pr, i) => ({ pr, i })).filter((x) => x.pr.group === brand); if (!items.length) return;
      const g = document.createElement('div'); g.className = 'cat-group';
      const head = document.createElement('div'); head.className = 'cat-head';
      const h3 = document.createElement('h3'); h3.textContent = brand;
      const n = document.createElement('span'); n.textContent = items.length === 1 ? '1 modelo' : `${items.length} modelos`;
      head.append(h3, n);
      const grid = document.createElement('div'); grid.className = 'cat-grid';
      items.forEach(({ pr, i }) => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'cat-card'; b.setAttribute('aria-label', `Ver detalhes: ${pr.name}`);
        const im = document.createElement('img'); im.src = pr.img3q; im.alt = ''; im.width = 400; im.height = 320; im.loading = 'lazy'; im.decoding = 'async';
        const s1 = document.createElement('strong'); s1.textContent = pr.name; const s2 = document.createElement('span'); s2.textContent = ''; 
        b.append(im, s1, s2);
        /* open the details where you are; the wheel above quietly moves to this shoe so it is there when you scroll back up */
        b.addEventListener('click', () => { goTo(i); openSheet(i); });
        grid.appendChild(b);
      });
      g.append(head, grid); host.appendChild(g);
    });
  }
  /* Instagram's official embeds (reels and posts), loaded only when the row comes near the screen */
  function buildEmbeds(hostId, ids, kind) {
    const host = $(hostId); if (!host || !ids || !ids.length) { if (host && host.closest('.embed-block')) host.closest('.embed-block').hidden = true; return; }
    const frames = [];
    ids.forEach((id, n) => {
      const card = document.createElement('article'); card.className = 'reel reel-' + kind;
      const fr = document.createElement('div'); fr.className = 'reel-frame'; fr.dataset.id = id;
      if ('ResizeObserver' in window) new ResizeObserver(() => fr.style.setProperty('--s', (fr.clientWidth / 320).toFixed(4))).observe(fr); else fr.style.setProperty('--s', 1);
      const ph = document.createElement('div'); ph.className = 'ph'; ph.textContent = 'A carregar';
      fr.appendChild(ph);
      const a = document.createElement('a'); a.className = 'reel-link'; a.href = `https://www.instagram.com/${kind === 'reel' ? 'reel' : 'p'}/${id}/`; a.target = '_blank'; a.rel = 'noopener';
      a.textContent = kind === 'reel' ? `Ver o vídeo ${n + 1} no Instagram` : `Ver a publicação ${n + 1} no Instagram`;
      card.append(fr, a); host.appendChild(card); frames.push(fr);
    });
    const load = (fr) => {
      if (fr.dataset.done) return; fr.dataset.done = '1';
      const f = document.createElement('iframe'); f.title = 'Publicação da Relojoaria LauMY no Instagram'; f.loading = 'lazy'; f.setAttribute('allowfullscreen', '');
      f.referrerPolicy = 'strict-origin-when-cross-origin';
      f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation');
      f.src = `https://www.instagram.com/${kind === 'reel' ? 'reel' : 'p'}/${fr.dataset.id}/embed/`;
      f.addEventListener('load', () => { const p0 = fr.querySelector('.ph'); if (p0) p0.remove(); });
      const clip = document.createElement('div'); clip.className = 'clip'; clip.appendChild(f); fr.appendChild(clip);
    };
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { frames.forEach(load); io.disconnect(); } }, { rootMargin: '600px 0px' });
      io.observe(host);
    } else frames.forEach(load);
  }
  /* the embed reports its full height; media height = full height - 208 (54 header + 154 footer). A landscape video is letterboxed so the footer never shows. */
  window.addEventListener('message', (e) => {
    if (e.origin !== 'https://www.instagram.com' || typeof e.data !== 'string') return;
    let m; try { m = JSON.parse(e.data); } catch (_) { return; }
    if (!m || m.type !== 'MEASURE' || !m.details || !m.details.height) return;
    document.querySelectorAll('.reel-frame iframe').forEach((f) => {
      if (f.contentWindow !== e.source) return;
      const mh = clamp(m.details.height - 208, 120, 400);
      f.closest('.reel-frame').style.setProperty('--mh', mh);
    });
  });
  function buildReels() {
    $('#igFollow').href = K.instagram; $('#igHandleFollow').textContent = K.instagramHandle;
    buildEmbeds('#reels', K.reels, 'reel'); buildEmbeds('#posts', K.posts, 'post');
  }

  /* ---------- the showcase scroll chapters ---------- */
  const goGroup = (name) => { const i = P.findIndex((x) => x.group === name); if (i < 0) return; goTo(i); $('#colecao').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }); };
  function buildChapters() {
    const chs = [...document.querySelectorAll('.chapter')]; if (!chs.length) return;
    const hero = $('#inicio');
    document.querySelectorAll('[data-go-group]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); goGroup(a.dataset.goGroup); }));
    if (reduce) { chs.forEach((c) => c.style.setProperty('--p', 1)); chs.forEach((c) => { c.classList.add('is-static'); }); return; }
    /* scroll sets a target; a short rAF loop eases every value toward it, so nothing jumps with the wheel or the thumb */
    const cur = new Map(); let raf = 0, last = 0;
    const targets = () => {
      const vh = window.innerHeight, out = [];
      chs.forEach((c) => {
        const r = c.getBoundingClientRect(); if (r.bottom < -vh || r.top > vh * 2) return;
        const span = Math.max(1, r.height - vh);
        out.push([c, { '--p': clamp(-r.top / span, 0, 1), '--enter': clamp(1 - r.top / vh, 0, 1) }]);
      });
      if (hero) { const hr = hero.getBoundingClientRect(); out.push([hero, { '--hp': clamp(-hr.top / Math.max(1, hr.height), 0, 1) }]); }
      return out;
    };
    const step = (t) => {
      const dt = Math.min(.05, (t - last) / 1000 || .016); last = t;
      const k = 1 - Math.exp(-dt / .085); let moving = false;
      targets().forEach(([elm, vars]) => {
        let s = cur.get(elm); if (!s) { s = {}; cur.set(elm, s); }
        Object.keys(vars).forEach((key) => {
          const v = vars[key]; const c0 = s[key] === undefined ? v : s[key];
          let n = c0 + (v - c0) * k; if (Math.abs(v - n) < .0004) n = v; else moving = true;
          s[key] = n; elm.style.setProperty(key, n.toFixed(4));
        });
      });
      raf = moving ? requestAnimationFrame(step) : 0;
    };
    const kick = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(step); } };
    window.addEventListener('scroll', kick, { passive: true }); window.addEventListener('resize', kick); kick();
  }

  /* ---------- the highlights carousel ---------- */
  function buildHighlights() {
    const host = $('#hlTrack'), dots = $('#hlDots'); if (!host) return;
    K.groups.forEach((g, gi) => {
      const i = P.findIndex((x) => x.group === g); if (i < 0) return; const pr = P[i];
      const count = P.filter((x) => x.group === g).length;
      const card = document.createElement('a'); card.className = 'hl-card'; card.href = '#colecao'; card.setAttribute('aria-label', `Ver ${g}`);
      const t = document.createElement('h3'); t.textContent = g;
      const s = document.createElement('p'); s.textContent = `${count} ${count === 1 ? 'modelo' : 'modelos'}`;
      const im = document.createElement('img'); im.src = pr.img3q; im.alt = ''; im.width = 600; im.height = 480; im.loading = 'lazy'; im.decoding = 'async';
      card.append(t, s, im); card.addEventListener('click', (e) => { e.preventDefault(); goGroup(g); });
      host.appendChild(card);
      const d = document.createElement('span'); d.className = 'hl-dot'; dots.appendChild(d);
    });
    const cards = [...host.children], dl = [...dots.children];
    const paint = () => { const w = cards[0].getBoundingClientRect().width + 16; const i = clamp(Math.round(host.scrollLeft / w), 0, cards.length - 1); dl.forEach((d, k) => d.classList.toggle('on', k === i)); };
    host.addEventListener('scroll', () => requestAnimationFrame(paint), { passive: true }); paint();
    $('#hlPrev').addEventListener('click', () => host.scrollBy({ left: -(cards[0].getBoundingClientRect().width + 16), behavior: reduce ? 'auto' : 'smooth' }));
    $('#hlNext').addEventListener('click', () => host.scrollBy({ left: cards[0].getBoundingClientRect().width + 16, behavior: reduce ? 'auto' : 'smooth' }));
  }

  /* ---------- nav shadow, resize, start ---------- */
  const onScroll = () => el.nav.classList.toggle('is-solid', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
  let rz = 0; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { measure(); render(); }, 80); });

  loadCart(); paintCart(); fillShop(); buildCatalogue(); buildHighlights(); buildChapters(); buildReels(); measure(); setActive(0);
  if (!reduce) { p = -2.6; }
  render();
  document.documentElement.classList.add('js');
  const start = () => { target = 0; kick(); };
  if (reduce) { p = 0; render(); }
  else if (document.readyState === 'complete') setTimeout(start, 120);
  else window.addEventListener('load', () => setTimeout(start, 120), { once: true });
})();
