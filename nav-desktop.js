// ============================================================
// Spoider Finds — nav-desktop.js
//
// One shared file, loaded on every page (the header is duplicated in
// every HTML file, so this enhances whatever header is already there
// instead of needing markup edits on each page).
//
// DESKTOP NAVBAR (real mouse + >=960px only; CSS is gated by media query,
// so phones / "Request desktop site" on Android are never affected):
//   1. Gliding gold indicator that slides between links on hover and
//      settles back on the active link
//   2. Categories mega-menu (glass panel, live product counts + latest
//      product preview from Supabase, US / India switch)
//   3. Hide on scroll down, show on scroll up + gold scroll-progress line
//   4. Siblings dim while one link is hovered (focus effect)
//   5. Soft gold spotlight that follows the cursor inside the navbar
//   6. Logo mark tilt on hover, "/" or Ctrl+K opens search
//
// WISHLIST HEART (all devices):
//   Adds the heart to every .product-card that doesn't already have one
//   (needs data-product-id on the card, same as click tracking uses),
//   including cards injected later by any page's Supabase loader.
//
// Also fixes: .nav-links a:hover letter-spacing made neighbouring links
// jitter sideways on hover — neutralised here.
// ============================================================
(function () {
  "use strict";
  if (window.__sfNavDesktop) return;
  window.__sfNavDesktop = true;

  var SUPABASE_URL = "https://gqnwinkddckytrfpnhng.supabase.co";
  var SUPABASE_KEY = "sb_publishable_NYb3HMwKyHL1YxlOIWtcQg_NGJwDwmQ";

  /* ----------------------------------------------------------
     CSS
     ---------------------------------------------------------- */
  var CSS = `
/* chevron is injected by JS on every device, so it must be hidden unless the
   real-mouse desktop block below turns it on (otherwise the unsized SVG
   renders huge on phones / Android "desktop site") */
.sfn-chev { display: none; width: 8px; height: 8px; }
.sfn-chev svg { width: 8px; height: 8px; }

/* ===== wishlist heart: shared fix ===== */
.product-card:has(.spoider-score-trigger) .wishlist-heart { top: 10px; left: 10px; right: auto; bottom: auto; }

/* ===== desktop navbar (mouse + wide screens only) ===== */
@media (min-width: 960px) and (hover: hover) and (pointer: fine) {
  .nav.sfn-on {
    transition: transform .5s var(--ease), background .35s var(--ease), box-shadow .35s var(--ease), border-color .35s var(--ease);
  }
  .nav.sfn-on.scrolled { border-bottom-color: rgba(201, 168, 118, .2); }
  .nav.sfn-on.sfn-hide { transform: translateY(-101%); box-shadow: none; }

  /* cursor spotlight */
  .nav.sfn-on::before {
    content: ""; position: absolute; inset: 0; pointer-events: none; opacity: 0;
    transition: opacity .45s var(--ease);
    background: radial-gradient(420px circle at var(--mx, 50%) var(--my, 50%), rgba(201, 168, 118, .11), transparent 70%);
  }
  .nav.sfn-on:hover::before { opacity: 1; }
  .nav.sfn-on .nav-inner { position: relative; z-index: 1; }

  /* scroll progress hairline */
  .sfn-progress {
    position: absolute; left: 0; bottom: -1px; width: 100%; height: 1px; z-index: 2;
    background: linear-gradient(90deg, var(--gold), var(--gold-bright));
    transform: scaleX(0); transform-origin: left center; opacity: .85; pointer-events: none;
  }

  /* links */
  .nav.sfn-on .nav-links { position: relative; }
  .nav.sfn-on .nav-links a,
  .nav.sfn-on .nav-links a:hover { letter-spacing: normal; }
  .nav.sfn-on .nav-links a::after { display: none; }
  .nav.sfn-on .nav-links a { transition: color .25s var(--ease), opacity .3s var(--ease); }
  .nav.sfn-on .nav-links:has(a:hover) a:not(:hover) { opacity: .45; }
  .nav.sfn-megaopen .nav-links a:not(.sfn-cat) { opacity: .45; }
  .nav-links a.sfn-cat.is-open { color: var(--gold); }
  .sfn-chev { display: inline-block; width: 8px; height: 8px; margin-left: 6px; vertical-align: 1px; transition: transform .35s var(--ease); }
  .sfn-chev svg { display: block; width: 100%; height: 100%; }
  .sfn-cat.is-open .sfn-chev { transform: rotate(180deg); }

  /* gliding indicator */
  .sfn-ind {
    position: absolute; left: 0; bottom: -7px; height: 2px; width: 0; border-radius: 2px;
    background: linear-gradient(90deg, transparent, var(--gold-bright) 18%, var(--gold-bright) 82%, transparent);
    box-shadow: 0 0 14px 1px rgba(232, 199, 102, .5);
    opacity: 0; pointer-events: none;
    transition: transform .5s var(--ease), width .5s var(--ease), opacity .3s var(--ease);
  }
  .sfn-ind.is-on { opacity: 1; }
  .sfn-ind.no-anim { transition: none; }

  /* logo + search hint */
  .nav.sfn-on .logo-img { transition: transform .6s var(--ease), filter .4s var(--ease); }
  html:not([data-theme="light"]) .nav.sfn-on .logo:hover .logo-img { transform: rotate(-10deg) scale(1.08); filter: drop-shadow(0 0 8px rgba(232, 199, 102, .45)); }
  html[data-theme="light"] .nav.sfn-on .logo:hover .logo-img { transform: rotate(-10deg) scale(1.08); }
  .nav.sfn-on .search-toggle { position: relative; }
  .nav.sfn-on .search-toggle::after {
    content: "Search   /"; position: absolute; top: calc(100% + 12px); right: 0; white-space: nowrap;
    font-family: var(--font-mono); font-size: .62rem; letter-spacing: .04em; color: var(--text-secondary);
    background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 8px; padding: 5px 10px;
    opacity: 0; transform: translateY(-4px); pointer-events: none;
    transition: opacity .25s var(--ease), transform .25s var(--ease);
  }
  .nav.sfn-on .search-toggle:hover::after { opacity: 1; transform: none; }

  /* mega menu */
  .sfn-mega {
    position: fixed; top: var(--sfn-top, 78px); left: 50%; z-index: 101;
    width: min(980px, calc(100vw - 80px));
    background: color-mix(in srgb, var(--bg-elevated) 90%, transparent);
    -webkit-backdrop-filter: blur(26px) saturate(1.2); backdrop-filter: blur(26px) saturate(1.2);
    border: 1px solid var(--border); border-radius: var(--radius-lg);
    box-shadow: 0 44px 90px -34px var(--shadow-soft), 0 0 0 1px var(--gold-dim);
    opacity: 0; visibility: hidden; pointer-events: none;
    transform: translate(-50%, 10px) scale(.985); transform-origin: 50% 0;
    transition: opacity .25s var(--ease), transform .45s var(--ease), visibility 0s linear .45s;
  }
  .sfn-mega.is-open {
    opacity: 1; visibility: visible; pointer-events: auto; transform: translate(-50%, 0) scale(1);
    transition: opacity .28s var(--ease), transform .45s var(--ease), visibility 0s;
  }
  .sfn-mega::before { content: ""; position: absolute; left: 0; right: 0; top: -26px; height: 26px; }
  .sfn-tip {
    position: absolute; top: -6px; left: var(--tip, 50%); width: 12px; height: 12px; margin-left: -6px;
    transform: rotate(45deg); background: color-mix(in srgb, var(--bg-elevated) 96%, transparent);
    border-left: 1px solid var(--border); border-top: 1px solid var(--border);
  }
  .sfn-mega-inner { display: grid; grid-template-columns: 1.4fr .6fr; gap: 26px; padding: 26px; }
  .sfn-mega-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
  .sfn-mega-eyebrow { font-family: var(--font-mono); font-size: .64rem; letter-spacing: .18em; color: var(--gold); }
  .sfn-seg { display: inline-flex; gap: 2px; padding: 3px; border: 1px solid var(--border); border-radius: 999px; background: var(--surface); }
  .sfn-seg button {
    font-family: var(--font-mono); font-size: .66rem; letter-spacing: .04em; color: var(--text-secondary);
    background: transparent; border: 0; border-radius: 999px; padding: 6px 14px; cursor: pointer;
    transition: background .25s var(--ease), color .25s var(--ease);
  }
  .sfn-seg button:hover { color: var(--text-primary); }
  .sfn-seg button.is-on { background: var(--gold-dim); color: var(--gold-bright); }

  .sfn-cat-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
  .sfn-cat-card {
    position: relative; overflow: hidden; display: grid; grid-template-columns: auto 1fr; column-gap: 14px; row-gap: 2px;
    align-items: start; padding: 18px; border-radius: var(--radius-md);
    border: 1px solid var(--border); background: var(--surface);
    transition: transform .35s var(--ease), border-color .3s var(--ease), background .3s var(--ease);
  }
  .sfn-mega.is-open .sfn-cat-card { animation: sfnIn .55s var(--ease) backwards; animation-delay: calc(var(--i, 0) * 55ms + 80ms); }
  @keyframes sfnIn { from { opacity: 0; transform: translateY(12px); } }
  .sfn-cat-card::after {
    content: ""; position: absolute; top: -45%; right: -35%; width: 150px; height: 150px; pointer-events: none;
    background: radial-gradient(circle, var(--gold-dim), transparent 70%); opacity: 0; transition: opacity .35s var(--ease);
  }
  .sfn-cat-card:hover, .sfn-cat-card.is-hot { transform: translateY(-3px); border-color: var(--gold-dim); background: var(--surface-hover); }
  .sfn-cat-card:hover::after, .sfn-cat-card.is-hot::after { opacity: 1; }
  .sfn-cat-icon {
    grid-row: span 3; width: 40px; height: 40px; border-radius: 12px; display: flex; align-items: center; justify-content: center;
    color: var(--gold); border: 1px solid var(--gold-dim); background: var(--gold-dim);
    transition: color .3s var(--ease), transform .4s var(--ease);
  }
  .sfn-cat-icon svg { width: 19px; height: 19px; }
  .sfn-cat-card:hover .sfn-cat-icon { color: var(--gold-bright); transform: scale(1.08) rotate(-4deg); }
  .sfn-cat-name { font-family: var(--font-display); font-weight: 500; font-size: 1.05rem; letter-spacing: -.01em; color: var(--text-primary); }
  .sfn-cat-blurb { font-size: .78rem; line-height: 1.5; color: var(--text-secondary); display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .sfn-cat-count { margin-top: 6px; font-family: var(--font-mono); font-size: .62rem; letter-spacing: .06em; color: var(--text-muted); }
  .sfn-cat-arrow { position: absolute; top: 16px; right: 16px; color: var(--gold); opacity: 0; transform: translate(-4px, 4px); transition: opacity .3s var(--ease), transform .3s var(--ease); }
  .sfn-cat-card:hover .sfn-cat-arrow, .sfn-cat-card.is-hot .sfn-cat-arrow { opacity: 1; transform: none; }

  .sfn-preview {
    display: flex; flex-direction: column; gap: 10px; padding: 14px; border-radius: var(--radius-md);
    border: 1px solid var(--border); background: var(--surface); text-decoration: none; color: inherit;
    transition: border-color .3s var(--ease), background .3s var(--ease);
  }
  .sfn-mega.is-open .sfn-preview { animation: sfnIn .6s var(--ease) backwards; animation-delay: .2s; }
  .sfn-preview:hover { border-color: var(--gold-dim); background: var(--surface-hover); }
  .sfn-prev-eyebrow { font-family: var(--font-mono); font-size: .6rem; letter-spacing: .14em; color: var(--text-muted); text-transform: uppercase; }
  .sfn-prev-img { position: relative; display: block; aspect-ratio: 4 / 5; border-radius: 10px; overflow: hidden; background: linear-gradient(135deg, var(--shimmer-a), var(--shimmer-b)); }
  .sfn-prev-img img { width: 100%; height: 100%; object-fit: cover; display: block; transition: opacity .22s var(--ease), transform .6s var(--ease); }
  .sfn-prev-img.is-swap img { opacity: 0; }
  .sfn-preview:hover .sfn-prev-img img { transform: scale(1.05); }
  .sfn-prev-title { font-family: var(--font-display); font-size: .95rem; line-height: 1.3; color: var(--text-primary); display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .sfn-prev-cta { font-family: var(--font-mono); font-size: .64rem; letter-spacing: .04em; color: var(--gold); }
}
@media (prefers-reduced-motion: reduce) {
  .sfn-mega.is-open .sfn-cat-card, .sfn-mega.is-open .sfn-preview { animation: none; }
}
@media (max-width: 959px), (hover: none), (pointer: coarse) {
  .sfn-mega, .sfn-ind, .sfn-progress, .sfn-chev { display: none !important; }
}
`;

  var st = document.createElement("style");
  st.id = "sfn-style";
  st.textContent = CSS;
  document.head.appendChild(st);

  /* ----------------------------------------------------------
     WISHLIST HEART — site-wide
     Works even when a page's own loader never put data-product-id on its
     cards: the product id is looked up from Supabase by the card's
     affiliate link (Amazon ASIN), then image, then title.
     ---------------------------------------------------------- */
  var HEART_SVG =
    '<svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.6-10-9.2C.6 8.4 2 4.8 5.6 4A5.4 5.4 0 0 1 12 7a5.4 5.4 0 0 1 6.4-3A5.6 5.6 0 0 1 22 11.8C19.5 16.4 12 21 12 21Z"/></svg>';

  var PROD_MAP = null, prodPromise = null, mapFailedAt = 0, warnedUnresolved = false;

  function asinOf(u) {
    var m = /\/(?:dp|gp\/product|d)\/([A-Z0-9]{10})/i.exec(u || "");
    return m ? m[1].toUpperCase() : null;
  }
  function keyOf(u) {
    var a = asinOf(u);
    if (a) return "asin:" + a;
    return "url:" + String(u || "").split("#")[0].replace(/\/+$/, "");
  }

  function loadProdMap() {
    if (PROD_MAP) return Promise.resolve(PROD_MAP);
    if (prodPromise) return prodPromise;
    if (Date.now() - mapFailedAt < 30000) return Promise.resolve(null); // back off after a failure
    try {
      var raw = sessionStorage.getItem("sfn-prod-map");
      if (raw) {
        var o = JSON.parse(raw);
        if (o && Date.now() - o.t < 600000) { PROD_MAP = o.m; return Promise.resolve(PROD_MAP); }
      }
    } catch (e) { /* storage unavailable — just fetch */ }

    var url = SUPABASE_URL + "/rest/v1/products?select=id,affiliate_link,image_url,title&active=eq.true&limit=1000";
    prodPromise = fetch(url, { headers: { apikey: SUPABASE_KEY } })
      .then(function (r) { if (!r.ok) throw new Error("bad status"); return r.json(); })
      .then(function (rows) {
        var m = {};
        rows.forEach(function (p) {
          if (p.affiliate_link) m[keyOf(p.affiliate_link)] = p.id;
          if (p.image_url) m["img:" + p.image_url] = p.id;
          if (p.title) m["t:" + String(p.title).trim().toLowerCase()] = p.id;
        });
        PROD_MAP = m;
        try { sessionStorage.setItem("sfn-prod-map", JSON.stringify({ t: Date.now(), m: m })); } catch (e) { /* ignore */ }
        return m;
      })
      .catch(function () { mapFailedAt = Date.now(); prodPromise = null; return null; });
    return prodPromise;
  }

  function findId(card) {
    var id = card.dataset && (card.dataset.productId || card.dataset.heartId);
    if (id) return id;
    if (!PROD_MAP) return null;
    var href = card.getAttribute("href");
    if (href && PROD_MAP[keyOf(href)]) return PROD_MAP[keyOf(href)];
    var img = card.querySelector("img");
    var src = img && img.getAttribute("src");
    if (src && PROD_MAP["img:" + src]) return PROD_MAP["img:" + src];
    var h = card.querySelector("h3");
    var t = h && h.textContent.trim().toLowerCase();
    if (t && PROD_MAP["t:" + t]) return PROD_MAP["t:" + t];
    return null;
  }

  function addHearts() {
    var added = false, unresolved = 0;
    document.querySelectorAll(".product-card").forEach(function (card) {
      if (card.querySelector(".wishlist-heart")) return;
      var id = findId(card);
      if (!id) { unresolved++; return; }
      id = String(id).replace(/[^\w-]/g, "");

      var img = card.querySelector("img");
      var host = card.querySelector(".product-image") || (img && img.parentElement) || card;
      if (window.getComputedStyle(host).position === "static") host.style.position = "relative";

      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "wishlist-heart";
      btn.setAttribute("data-heart-id", id);
      btn.setAttribute("aria-label", "Add to wishlist");
      btn.innerHTML = HEART_SVG;
      host.appendChild(btn);
      if (!card.dataset.productId) card.dataset.productId = id; // also makes click tracking record the product id
      added = true;
    });
    if (unresolved && PROD_MAP && !warnedUnresolved) {
      warnedUnresolved = true;
      console.info("[nav-desktop] " + unresolved + " product card(s) could not be matched to a product id — heart skipped.");
    }
    if (added && typeof window.syncWishlistHearts === "function") window.syncWishlistHearts();
  }

  function ensureHearts() {
    var needsLookup = false;
    document.querySelectorAll(".product-card").forEach(function (card) {
      if (card.querySelector(".wishlist-heart")) return;
      if (!(card.dataset && (card.dataset.productId || card.dataset.heartId))) needsLookup = true;
    });
    addHearts();
    if (needsLookup && !PROD_MAP) loadProdMap().then(addHearts);
  }

  function initHearts() {
    ensureHearts();
    var target = document.getElementById("page-wrap") || document.body;
    var queued = false;
    new MutationObserver(function () {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () {
        queued = false;
        ensureHearts();
      });
    }).observe(target, { childList: true, subtree: true });
    window.addEventListener("load", ensureHearts);
  }

  /* ----------------------------------------------------------
     NAVBAR
     ---------------------------------------------------------- */
  var CATS = [
    {
      slug: "desk-setup", name: "Desk Setup",
      blurb: "Minimal workstations, cable management and ambient lighting.",
      icon: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="7" width="24" height="15" rx="1.5"/><path d="M13 26h6M16 22v4"/><path d="M9 12.5h9"/></svg>'
    },
    {
      slug: "fashion-finds", name: "Fashion Finds",
      blurb: "Understated staples and statement pieces worth the click.",
      icon: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M16 6.5a2 2 0 1 1 2 2c-.7.4-2 1-2 2.3v.7"/><path d="M16 11.5 6 18.8a1.9 1.9 0 0 0 1.1 3.5h17.8a1.9 1.9 0 0 0 1.1-3.5l-10-7.3Z"/><path d="M7 22.3h18"/></svg>'
    },
    {
      slug: "accessories", name: "Accessories",
      blurb: "The small details that quietly upgrade everything else.",
      icon: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="9" width="24" height="16" rx="2"/><path d="M4 14.5h24"/><circle cx="21.5" cy="19.5" r="1.3" fill="currentColor" stroke="none"/></svg>'
    },
    {
      slug: "amazon-finds", name: "Amazon Finds",
      blurb: "Genuinely surprising products we didn't expect to love.",
      icon: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 16 7l11 5.5-11 5.5-11-5.5Z"/><path d="M5 12.5v9.7L16 27.7l11-5.5v-9.7"/><path d="M16 18v9.7"/></svg>'
    }
  ];
  var ARROW = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M8 7h9v9"/></svg>';
  var CHEV = '<span class="sfn-chev" aria-hidden="true"><svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3.5 5 6.5 8 3.5"/></svg></span>';

  function initNav() {
    var nav = document.getElementById("nav") || document.querySelector(".nav");
    var navLinks = nav && nav.querySelector(".nav-links");
    if (!nav || !navLinks) return;

    var links = Array.prototype.slice.call(navLinks.querySelectorAll("a"));
    var catLink = links.filter(function (a) { return /^categories/i.test(a.textContent.trim()); })[0] || null;

    nav.classList.add("sfn-on");

    /* ---- gliding indicator ---- */
    var ind = document.createElement("span");
    ind.className = "sfn-ind";
    ind.setAttribute("aria-hidden", "true");
    navLinks.appendChild(ind);

    var hovered = null;
    var isOpen = false;

    function restLink() {
      for (var i = 0; i < links.length; i++) if (links[i].classList.contains("active")) return links[i];
      return null;
    }
    function hideInd() { if (ind.classList.contains("is-on")) ind.classList.remove("is-on"); }
    function place(a, instant) {
      if (!a) { hideInd(); return; }
      var fresh = !ind.classList.contains("is-on");
      if (instant || fresh) ind.classList.add("no-anim");
      ind.style.width = a.offsetWidth + "px";
      ind.style.transform = "translateX(" + a.offsetLeft + "px)";
      if (ind.classList.contains("no-anim")) { void ind.offsetWidth; ind.classList.remove("no-anim"); }
      if (!ind.classList.contains("is-on")) ind.classList.add("is-on");
    }
    function settle() { var r = restLink(); if (r) place(r); else hideInd(); }
    function refresh() { var r = hovered || (isOpen ? catLink : restLink()); if (r) place(r, true); else hideInd(); }

    navLinks.addEventListener("mouseover", function (e) {
      var a = e.target.closest("a");
      if (!a || !navLinks.contains(a) || a === hovered) return;
      hovered = a;
      place(a);
    });
    navLinks.addEventListener("mouseleave", function () {
      hovered = null;
      if (!isOpen) settle();
    });
    // Watch ONLY the real links (never the indicator itself). Observing the
    // whole .nav-links subtree made place() -> ind.classList change -> observer
    // -> place() ... an endless microtask loop that froze the page.
    var linkObserver = new MutationObserver(function () { if (!hovered && !isOpen) settle(); });
    links.forEach(function (a) { linkObserver.observe(a, { attributes: true, attributeFilter: ["class"] }); });

    settle();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(refresh);
    window.addEventListener("load", refresh);

    /* ---- cursor spotlight ---- */
    var mx = 0, my = 0, spQueued = false;
    nav.addEventListener("mousemove", function (e) {
      var r = nav.getBoundingClientRect();
      mx = e.clientX - r.left;
      my = e.clientY - r.top;
      if (spQueued) return;
      spQueued = true;
      requestAnimationFrame(function () {
        spQueued = false;
        nav.style.setProperty("--mx", mx + "px");
        nav.style.setProperty("--my", my + "px");
      });
    }, { passive: true });

    /* ---- scroll: hide on down / show on up + progress line ---- */
    var bar = document.createElement("span");
    bar.className = "sfn-progress";
    bar.setAttribute("aria-hidden", "true");
    nav.appendChild(bar);

    var lastY = window.scrollY, hidden = false, scQueued = false;
    function setHidden(v) {
      if (hidden === v) return;
      hidden = v;
      nav.classList.toggle("sfn-hide", v);
    }
    function onScroll() {
      if (scQueued) return;
      scQueued = true;
      requestAnimationFrame(function () {
        scQueued = false;
        var y = window.scrollY;
        var max = document.documentElement.scrollHeight - window.innerHeight;
        bar.style.transform = "scaleX(" + (max > 0 ? Math.min(y / max, 1) : 0).toFixed(4) + ")";
        var d = y - lastY;
        if (y < 120) { setHidden(false); lastY = y; return; }
        if (Math.abs(d) < 6) return;
        if (!isOpen) setHidden(d > 0);
        lastY = y;
      });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    nav.addEventListener("focusin", function () { setHidden(false); });
    document.addEventListener("pointermove", function (e) {
      if (hidden && e.pointerType === "mouse" && e.clientY < 10) setHidden(false);
    }, { passive: true });

    /* ---- search shortcut: "/" or Ctrl/Cmd+K ---- */
    document.addEventListener("keydown", function (e) {
      var t = e.target;
      var typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      var isSlash = e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey;
      var isK = (e.key === "k" || e.key === "K") && (e.ctrlKey || e.metaKey);
      if (!isSlash && !isK) return;
      if (typing && !isK) return;
      var btn = document.querySelector(".search-toggle");
      if (!btn) return;
      var ov = document.querySelector(".search-overlay");
      if (ov && ov.classList.contains("is-open")) return;
      e.preventDefault();
      btn.click();
    });

    if (!catLink) return;

    /* ---- categories mega-menu ---- */
    var region = /india/i.test(window.location.pathname) ? "in" : "us";
    var active = CATS[0].slug;
    var DATA = null, dataPromise = null;

    catLink.classList.add("sfn-cat");
    catLink.setAttribute("aria-haspopup", "true");
    catLink.setAttribute("aria-expanded", "false");
    catLink.insertAdjacentHTML("beforeend", CHEV);

    var mega = document.createElement("div");
    mega.className = "sfn-mega";
    mega.id = "sfnMega";
    mega.setAttribute("role", "region");
    mega.setAttribute("aria-label", "Categories");
    mega.setAttribute("aria-hidden", "true");
    catLink.setAttribute("aria-controls", "sfnMega");

    var cardsHTML = CATS.map(function (c, i) {
      return '<a class="sfn-cat-card" data-slug="' + c.slug + '" style="--i:' + i + '" href="' + c.slug + '.html">' +
        '<span class="sfn-cat-icon">' + c.icon + "</span>" +
        '<span class="sfn-cat-name">' + c.name + "</span>" +
        '<span class="sfn-cat-blurb">' + c.blurb + "</span>" +
        '<span class="sfn-cat-count">—</span>' +
        '<span class="sfn-cat-arrow">' + ARROW + "</span>" +
        "</a>";
    }).join("");

    mega.innerHTML =
      '<span class="sfn-tip"></span>' +
      '<div class="sfn-mega-inner">' +
        "<div>" +
          '<div class="sfn-mega-head">' +
            '<span class="sfn-mega-eyebrow">EXPLORE THE THREAD</span>' +
            '<div class="sfn-seg" role="group" aria-label="Region">' +
              '<button type="button" data-r="us">US</button>' +
              '<button type="button" data-r="in">🇮🇳 India</button>' +
            "</div>" +
          "</div>" +
          '<div class="sfn-cat-grid">' + cardsHTML + "</div>" +
        "</div>" +
        '<a class="sfn-preview" href="#">' +
          '<span class="sfn-prev-eyebrow"></span>' +
          '<span class="sfn-prev-img"><img alt="" decoding="async"></span>' +
          '<span class="sfn-prev-title"></span>' +
          '<span class="sfn-prev-cta"></span>' +
        "</a>" +
      "</div>";
    document.body.appendChild(mega);

    var cardEls = Array.prototype.slice.call(mega.querySelectorAll(".sfn-cat-card"));
    var segBtns = Array.prototype.slice.call(mega.querySelectorAll(".sfn-seg button"));
    var prev = mega.querySelector(".sfn-preview");
    var prevEyebrow = mega.querySelector(".sfn-prev-eyebrow");
    var prevWrap = mega.querySelector(".sfn-prev-img");
    var prevImg = prevWrap.querySelector("img");
    var prevTitle = mega.querySelector(".sfn-prev-title");
    var prevCta = mega.querySelector(".sfn-prev-cta");

    function catBySlug(s) { return CATS.filter(function (c) { return c.slug === s; })[0]; }
    function hrefFor(slug) { return (region === "in" ? "india-" : "") + slug + ".html"; }

    /* data: one light REST call, cached for 10 min per tab */
    function loadData() {
      if (DATA) return Promise.resolve(DATA);
      if (dataPromise) return dataPromise;
      try {
        var raw = sessionStorage.getItem("sfn-mega-data");
        if (raw) {
          var obj = JSON.parse(raw);
          if (obj && Date.now() - obj.t < 600000) { DATA = obj.d; return Promise.resolve(DATA); }
        }
      } catch (e) { /* storage unavailable — just fetch */ }

      var url = SUPABASE_URL + "/rest/v1/products?select=id,title,image_url,category,region,created_at&active=eq.true&order=created_at.desc&limit=400";
      dataPromise = fetch(url, { headers: { apikey: SUPABASE_KEY } })
        .then(function (r) { if (!r.ok) throw new Error("bad status"); return r.json(); })
        .then(function (rows) {
          var d = { us: {}, in: {} };
          rows.forEach(function (p) {
            var reg = p.region === "in" ? "in" : "us";
            var b = d[reg][p.category] || (d[reg][p.category] = { n: 0, latest: null });
            b.n++;
            if (!b.latest) b.latest = { title: p.title, image_url: p.image_url };
          });
          DATA = d;
          try { sessionStorage.setItem("sfn-mega-data", JSON.stringify({ t: Date.now(), d: d })); } catch (e) { /* ignore */ }
          return d;
        })
        .catch(function () { dataPromise = null; return null; });
      return dataPromise;
    }

    var swapT = null;
    function showPreview(slug) {
      var cat = catBySlug(slug);
      if (!cat) return;
      active = slug;
      cardEls.forEach(function (c) { c.classList.toggle("is-hot", c.dataset.slug === slug); });
      var b = DATA && DATA[region][slug];
      var src = (b && b.latest && b.latest.image_url) || "";
      prev.href = hrefFor(slug);
      prevEyebrow.textContent = "Latest in " + cat.name;
      prevTitle.textContent = b && b.latest ? b.latest.title : cat.blurb;
      prevCta.textContent = "Browse " + cat.name + " →";

      clearTimeout(swapT);
      prevWrap.classList.add("is-swap");
      swapT = setTimeout(function () {
        if (!src) { prevImg.removeAttribute("src"); prevWrap.classList.remove("is-swap"); return; }
        if (prevImg.getAttribute("src") === src) { prevWrap.classList.remove("is-swap"); return; }
        prevImg.onload = prevImg.onerror = function () { prevWrap.classList.remove("is-swap"); };
        prevImg.src = src;
      }, 130);
    }

    function render() {
      cardEls.forEach(function (c) {
        var slug = c.dataset.slug;
        c.href = hrefFor(slug);
        var b = DATA && DATA[region][slug];
        c.querySelector(".sfn-cat-count").textContent = DATA ? (b ? b.n + (b.n === 1 ? " find" : " finds") : "Coming soon") : "—";
      });
      segBtns.forEach(function (b) { b.classList.toggle("is-on", b.dataset.r === region); });
      showPreview(active);
    }

    segBtns.forEach(function (b) {
      b.addEventListener("click", function () { region = b.dataset.r; render(); });
    });
    cardEls.forEach(function (c) {
      c.addEventListener("mouseenter", function () { showPreview(c.dataset.slug); });
      c.addEventListener("focus", function () { showPreview(c.dataset.slug); });
    });

    /* open / close with hover intent */
    var openT = null, closeT = null;

    function position() {
      var nr = nav.getBoundingClientRect();
      mega.style.setProperty("--sfn-top", Math.round(nr.bottom + 12) + "px");
      var lr = catLink.getBoundingClientRect();
      var pw = mega.offsetWidth;
      var pl = (document.documentElement.clientWidth - pw) / 2;
      var tip = Math.max(32, Math.min(pw - 32, lr.left + lr.width / 2 - pl));
      mega.style.setProperty("--tip", Math.round(tip) + "px");
    }
    function open() {
      clearTimeout(closeT);
      if (isOpen) return;
      setHidden(false);
      position();
      isOpen = true;
      nav.classList.add("sfn-megaopen");
      catLink.classList.add("is-open");
      catLink.setAttribute("aria-expanded", "true");
      mega.setAttribute("aria-hidden", "false");
      mega.classList.add("is-open");
      place(catLink);
      render();
      loadData().then(function () { if (isOpen) render(); });
    }
    function close() {
      clearTimeout(openT);
      if (!isOpen) return;
      isOpen = false;
      nav.classList.remove("sfn-megaopen");
      catLink.classList.remove("is-open");
      catLink.setAttribute("aria-expanded", "false");
      mega.setAttribute("aria-hidden", "true");
      mega.classList.remove("is-open");
      if (!hovered) settle();
    }
    function scheduleOpen() { clearTimeout(closeT); clearTimeout(openT); openT = setTimeout(open, 90); }
    function scheduleClose() { clearTimeout(openT); clearTimeout(closeT); closeT = setTimeout(close, 180); }

    catLink.addEventListener("mouseenter", scheduleOpen);
    catLink.addEventListener("mouseleave", scheduleClose);
    mega.addEventListener("mouseenter", function () { clearTimeout(closeT); });
    mega.addEventListener("mouseleave", scheduleClose);
    mega.addEventListener("click", function (e) { if (e.target.closest("a")) close(); });

    catLink.addEventListener("focus", open);
    catLink.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        open();
        if (cardEls[0]) cardEls[0].focus();
      }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && isOpen) { close(); catLink.focus({ preventScroll: true }); }
    });
    // clicking any other header link, or leaving via keyboard, closes it too
    navLinks.addEventListener("click", function (e) {
      var a = e.target.closest("a");
      if (a) close();
    });
    window.addEventListener("resize", function () { close(); refresh(); }, { passive: true });

    // warm the data once the page has settled, so the first open is instant
    window.addEventListener("load", function () { setTimeout(loadData, 1200); });
  }

  function boot() {
    initHearts();
    initNav();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
