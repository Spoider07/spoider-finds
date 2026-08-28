// ============================================================
// Spoider Finds — page transition system
//
// Intercepts internal navigation, fetches the destination page
// in the background, and swaps #page-wrap's content with a
// restrained, cinematic horizontal slide — the outgoing page
// slides fully off-screen, then the incoming page slides in
// from the opposite edge. Direction is decided by where the
// user tapped (left half vs right half). Real browser back/
// forward is handled the same way and never gets silently
// dropped — every navigation gets its own "generation id" so a
// stale in-flight transition can never leave the page stuck
// mid-transform.
//
// Pages that don't have #page-wrap yet (not upgraded) are left
// alone entirely, and any navigation that fails to find
// #page-wrap on the destination page safely falls back to a
// real browser navigation — but always resets the outgoing
// page's transform first, so if the browser's back-forward
// cache (bfcache) freezes this page for later, it freezes it
// in its normal resting state, not mid-slide. A pageshow safety
// net does the same cleanup if a stuck state ever gets restored
// from bfcache anyway. This is what caused the black screen on
// hardware/gesture back button.
//
// CLEANUP REGISTRY (window.SpoiderPage.onCleanup):
// Per-page inline scripts (hero canvas, card tilt, mark parallax,
// etc.) attach window/document listeners, IntersectionObservers,
// and requestAnimationFrame loops. Since those scripts just
// re-execute every time this file swaps them back into #page-wrap,
// without a teardown step every one of those would stack a fresh
// copy on top of the last — repeated navigation to the same page
// silently piled up duplicate resize/scroll/visibility handlers
// and RAF loops running against detached DOM nodes, which is real,
// compounding CPU/battery drain on a phone. Any inline script that
// adds a persistent listener should call
// window.SpoiderPage.onCleanup(fn) once, right after it attaches
// its listeners — fn is called (and then discarded) right before
// the NEXT page swap wipes #page-wrap's content.
// ============================================================

(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var wrap = document.getElementById("page-wrap");
  if (!wrap) return; // this page hasn't been upgraded — do nothing, normal links work as-is

  var DUR_OUT = 320;
  var DUR_IN = 460;
  var cache = Object.create(null);
  var lastReverse = false; // remembers which way the last transition moved
  var navId = 0; // bumped on every navigation; stale async work checks this and bails

  // ---------- cleanup registry ----------
  // Don't clobber SpoiderPage if script.js already put something on it
  // (e.g. .init for nav/theme-toggle wiring) — only add what's missing.
  window.SpoiderPage = window.SpoiderPage || {};
  window.SpoiderPage._cleanups = window.SpoiderPage._cleanups || [];
  window.SpoiderPage.onCleanup = function (fn) {
    if (typeof fn === "function") window.SpoiderPage._cleanups.push(fn);
  };
  function runPageCleanups() {
    var fns = window.SpoiderPage._cleanups;
    window.SpoiderPage._cleanups = [];
    for (var i = 0; i < fns.length; i++) {
      try {
        fns[i]();
      } catch (e) {
        // one page's teardown misbehaving should never block navigation
      }
    }
  }

  // ---------- inject transition + pulse styles once ----------
  (function injectStyles() {
    var css =
      "body{overflow-x:hidden;}" +
      "#page-wrap{display:block;will-change:transform;}" +
      ".sf-pulse{position:fixed;width:10px;height:10px;margin:-5px 0 0 -5px;border-radius:50%;" +
      "background:radial-gradient(circle, rgba(232,199,102,0.5), rgba(232,199,102,0) 72%);" +
      "pointer-events:none;z-index:9999;transform:scale(0.4);opacity:0.85;" +
      "animation:sfPulseOut .6s cubic-bezier(.22,1,.36,1) forwards;}" +
      "@keyframes sfPulseOut{to{transform:scale(3.4);opacity:0;}}" +
      /* "fwd" = whole canvas sweeps LEFTWARD (tap on the right half) */
      ".sf-out-fwd{animation:sfOutFwd " + DUR_OUT + "ms cubic-bezier(.55,0,.35,1) forwards;}" +
      ".sf-in-fwd{animation:sfInFwd " + DUR_IN + "ms cubic-bezier(.16,1,.3,1) forwards;}" +
      /* "back" = whole canvas sweeps RIGHTWARD (tap on the left half, or real browser-back) */
      ".sf-out-back{animation:sfOutBack " + DUR_OUT + "ms cubic-bezier(.55,0,.35,1) forwards;}" +
      ".sf-in-back{animation:sfInBack " + DUR_IN + "ms cubic-bezier(.16,1,.3,1) forwards;}" +
      "@keyframes sfOutFwd{to{transform:translateX(-100%);}}" +
      "@keyframes sfInFwd{from{transform:translateX(100%);}to{transform:translateX(0);}}" +
      "@keyframes sfOutBack{to{transform:translateX(100%);}}" +
      "@keyframes sfInBack{from{transform:translateX(-100%);}to{transform:translateX(0);}}" +
      "@media (prefers-reduced-motion: reduce){.sf-pulse{display:none;}}";
    var styleEl = document.createElement("style");
    styleEl.textContent = css;
    document.head.appendChild(styleEl);
  })();

  function clearAnimClasses() {
    wrap.classList.remove("sf-out-fwd", "sf-out-back", "sf-in-fwd", "sf-in-back");
    wrap.style.transform = ""; // belt-and-suspenders: kill any leftover inline transform too
  }

  // if this page is ever restored from the browser's bfcache, make sure it's
  // not frozen mid-transition — this is the actual fix for the black screen
  window.addEventListener("pageshow", function (e) {
    if (e.persisted) {
      clearAnimClasses();
    }
  });

  // ---------- link eligibility ----------
  function isEligibleLink(a) {
    if (!a || !a.hasAttribute("href")) return false;
    var raw = a.getAttribute("href");
    if (!raw || raw.charAt(0) === "#") return false; // pure in-page anchor, let browser handle it
    if (a.target && a.target !== "_self") return false;
    if (a.hasAttribute("download")) return false;
    var rel = a.getAttribute("rel") || "";
    if (rel.indexOf("external") !== -1 || rel.indexOf("noopener") !== -1) return false;
    var url;
    try {
      url = new URL(a.href, window.location.href);
    } catch (e) {
      return false;
    }
    if (url.origin !== window.location.origin) return false;
    var lastSeg = url.pathname.split("/").pop();
    if (lastSeg.indexOf(".") !== -1 && lastSeg.split(".").pop().toLowerCase() !== "html") return false;
    return true;
  }

  function spawnPulse(x, y) {
    if (reduceMotion || typeof x !== "number") return;
    var p = document.createElement("span");
    p.className = "sf-pulse";
    p.style.left = x + "px";
    p.style.top = y + "px";
    document.body.appendChild(p);
    setTimeout(function () {
      if (p.parentNode) p.remove();
    }, 650);
  }

  // ---------- fetch + cache ----------
  function fetchPage(url) {
    if (cache[url]) return Promise.resolve(cache[url]);
    return fetch(url, { credentials: "same-origin" })
      .then(function (res) {
        if (!res.ok) throw new Error("bad status");
        return res.text();
      })
      .then(function (html) {
        cache[url] = html;
        return html;
      });
  }

  function extractWrap(html) {
    var doc = new DOMParser().parseFromString(html, "text/html");
    var newWrap = doc.getElementById("page-wrap");
    var titleEl = doc.querySelector("title");
    return {
      wrapHTML: newWrap ? newWrap.innerHTML : null,
      title: titleEl ? titleEl.textContent : document.title,
    };
  }

  // re-run inline scripts inside the freshly injected content (page-specific
  // behavior like the hero canvas). Scripts with a src (e.g. script.js) are
  // skipped — they're already loaded once, outside #page-wrap.
  function runInlineScripts(container) {
    var scripts = container.querySelectorAll("script:not([src])");
    scripts.forEach(function (old) {
      var s = document.createElement("script");
      s.textContent = old.textContent;
      old.parentNode.replaceChild(s, old);
    });
  }

  function waitAnimEnd(el) {
    return new Promise(function (resolve) {
      var done = false;
      function finish() {
        if (done) return;
        done = true;
        el.removeEventListener("animationend", finish);
        resolve();
      }
      el.addEventListener("animationend", finish);
      setTimeout(finish, DUR_OUT + 120);
    });
  }

  function trackPageview() {
    if (typeof window.gtag === "function") {
      window.gtag("event", "page_view", {
        page_path: window.location.pathname + window.location.search,
        page_title: document.title,
        page_location: window.location.href,
      });
    }
  }

  // falls back to a real navigation — always resetting this page's transform
  // first so a bfcache snapshot (if the browser makes one) is clean
  function realNavigate(fullUrl) {
    clearAnimClasses();
    window.location.href = fullUrl;
  }

  // ---------- core navigate/apply ----------
  function navigate(fetchUrl, fullUrl, opts) {
    opts = opts || {};
    var isBack = !!opts.isBack; // true only for real browser back/forward
    var reverseMotion = !!opts.reverseMotion; // true = canvas sweeps rightward
    var pushHistory = opts.pushHistory !== false;
    var hash = opts.hash || "";

    navId++;
    var myId = navId; // this navigation's own id — any older in-flight work checks against navId and bails
    lastReverse = reverseMotion;

    if (!isBack) {
      window.history.replaceState(
        { url: window.location.href, scrollY: window.scrollY },
        "",
        window.location.href
      );
    }

    var fetchPromise = fetchPage(fetchUrl);

    function finish(html) {
      if (myId !== navId) return; // a newer navigation already took over — drop this stale one
      applySwap(html, fullUrl, reverseMotion, pushHistory, hash, opts.restoreScroll, myId);
    }

    if (reduceMotion) {
      fetchPromise.then(finish).catch(function () {
        if (myId === navId) realNavigate(fullUrl);
      });
      return;
    }

    // always start from a clean slate — clears any stuck transform from an
    // interrupted previous transition before starting the new one
    clearAnimClasses();
    void wrap.offsetWidth;
    wrap.classList.add(reverseMotion ? "sf-out-back" : "sf-out-fwd");

    Promise.all([fetchPromise, waitAnimEnd(wrap)])
      .then(function (res) {
        finish(res[0]);
      })
      .catch(function () {
        if (myId === navId) realNavigate(fullUrl);
      });
  }

  function applySwap(html, fullUrl, reverseMotion, pushHistory, hash, restoreScroll, myId) {
    if (myId !== navId) return; // stale — a newer navigation is already in progress

    var extracted = extractWrap(html);
    if (!extracted.wrapHTML) {
      // destination page hasn't been upgraded with #page-wrap yet — fall back safely
      realNavigate(fullUrl);
      return;
    }

    // Tear down whatever the OUTGOING page's inline scripts registered
    // (canvas RAF loops, resize/scroll/visibility listeners, observers)
    // before we rip its markup out from under them. This must happen
    // before innerHTML is replaced.
    runPageCleanups();

    clearAnimClasses();
    wrap.innerHTML = extracted.wrapHTML;
    document.title = extracted.title;
    runInlineScripts(wrap);

    if (pushHistory) {
      window.history.pushState({ url: fullUrl, scrollY: 0 }, "", fullUrl);
    }

    if (hash) {
      var target = document.getElementById(hash.slice(1));
      if (target) {
        requestAnimationFrame(function () {
          target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
        });
      } else {
        window.scrollTo(0, 0);
      }
    } else if (typeof restoreScroll === "number") {
      window.scrollTo(0, restoreScroll);
    } else {
      window.scrollTo(0, 0);
    }

    if (window.SpoiderPage && window.SpoiderPage.init) {
      window.SpoiderPage.init();
    }
    trackPageview();

    if (reduceMotion) {
      prefetchVisibleLinks();
      return;
    }

    void wrap.offsetWidth; // force reflow so the enter animation restarts cleanly
    wrap.classList.add(reverseMotion ? "sf-in-back" : "sf-in-fwd");

    var cleaned = false;
    function cleanup() {
      if (cleaned || myId !== navId) return; // don't wipe a newer transition's classes
      cleaned = true;
      wrap.classList.remove("sf-in-fwd", "sf-in-back");
      wrap.removeEventListener("animationend", cleanup);
    }
    wrap.addEventListener("animationend", cleanup);
    setTimeout(cleanup, DUR_IN + 150); // guaranteed cleanup even if animationend never fires

    prefetchVisibleLinks();
  }

  function prefetchVisibleLinks() {
    var links = wrap.querySelectorAll("a[href]");
    links.forEach(function (a) {
      if (!isEligibleLink(a)) return;
      var url = new URL(a.href, window.location.href);
      var key = url.origin + url.pathname + url.search;
      if (!cache[key]) fetchPage(key).catch(function () {});
    });
  }

  // ---------- click handling ----------
  document.addEventListener(
    "click",
    function (e) {
      var a = e.target.closest("a");
      if (!a || e.defaultPrevented) return;
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (!isEligibleLink(a)) return;

      var url = new URL(a.href, window.location.href);
      var samePage = url.pathname === window.location.pathname && url.search === window.location.search;

      if (samePage) {
        // same document, just a different hash — let it scroll natively, no transition
        return;
      }

      var fetchKey = url.origin + url.pathname + url.search;
      var fullUrl = url.href;

      // direction comes from where the tap landed: left half → sweep right, right half → sweep left
      var x = typeof e.clientX === "number" ? e.clientX : window.innerWidth / 2;
      var y = typeof e.clientY === "number" ? e.clientY : window.innerHeight / 2;
      var reverseMotion = x < window.innerWidth / 2;

      e.preventDefault();
      spawnPulse(x, y);
      navigate(fetchKey, fullUrl, { isBack: false, reverseMotion: reverseMotion, hash: url.hash });
    },
    true
  );

  // ---------- back/forward ----------
  window.addEventListener("popstate", function (e) {
    var url = new URL(window.location.href);
    var fetchKey = url.origin + url.pathname + url.search;
    var restoreScroll = e.state && typeof e.state.scrollY === "number" ? e.state.scrollY : 0;
    navigate(fetchKey, url.href, {
      isBack: true,
      pushHistory: false,
      restoreScroll: restoreScroll,
      hash: url.hash,
      reverseMotion: !lastReverse, // retrace the motion in the opposite direction
    });
  });

  if (!window.history.state) {
    window.history.replaceState({ url: window.location.href, scrollY: window.scrollY }, "", window.location.href);
  }

  // warm the cache for links already on screen
  window.addEventListener("load", prefetchVisibleLinks);
})();
