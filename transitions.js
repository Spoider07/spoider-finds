// ============================================================
// Spoider Finds — page transition system
//
// Intercepts internal navigation, fetches the destination page
// in the background, and swaps #page-wrap's content with a
// restrained, cinematic motion sequence — no reload flash, no
// loading-screen feeling. Falls back to a normal page load for
// any page that hasn't been upgraded yet (no #page-wrap found),
// or for anything outside its scope (external links, downloads,
// target=_blank, reduced-motion users skip the animation but
// still get the flash-free swap).
// ============================================================

(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var wrap = document.getElementById("page-wrap");
  if (!wrap) return; // this page hasn't been upgraded — do nothing, normal links work as-is

  var DUR_OUT = 300;
  var DUR_IN = 420;
  var cache = Object.create(null);
  var busy = false;

  // ---------- inject transition + pulse styles once ----------
  (function injectStyles() {
    var css =
      "#page-wrap{display:block;}" +
      ".sf-pulse{position:fixed;width:10px;height:10px;margin:-5px 0 0 -5px;border-radius:50%;" +
      "background:radial-gradient(circle, rgba(232,199,102,0.5), rgba(232,199,102,0) 72%);" +
      "pointer-events:none;z-index:9999;transform:scale(0.4);opacity:0.85;" +
      "animation:sfPulseOut .6s cubic-bezier(.22,1,.36,1) forwards;}" +
      "@keyframes sfPulseOut{to{transform:scale(3.4);opacity:0;}}" +
      ".sf-out-fwd{animation:sfOutFwd " + DUR_OUT + "ms cubic-bezier(.55,0,.35,1) forwards;}" +
      ".sf-in-fwd{animation:sfInFwd " + DUR_IN + "ms cubic-bezier(.16,1,.3,1) forwards;}" +
      ".sf-out-back{animation:sfOutBack " + DUR_OUT + "ms cubic-bezier(.55,0,.35,1) forwards;}" +
      ".sf-in-back{animation:sfInBack " + DUR_IN + "ms cubic-bezier(.16,1,.3,1) forwards;}" +
      "@keyframes sfOutFwd{to{opacity:0;transform:translateY(-16px) scale(.985);}}" +
      "@keyframes sfInFwd{from{opacity:0;transform:translateY(20px) scale(.99);}to{opacity:1;transform:translateY(0) scale(1);}}" +
      "@keyframes sfOutBack{to{opacity:0;transform:translateY(16px) scale(.985);}}" +
      "@keyframes sfInBack{from{opacity:0;transform:translateY(-20px) scale(.99);}to{opacity:1;transform:translateY(0) scale(1);}}" +
      "@media (prefers-reduced-motion: reduce){.sf-pulse{display:none;}}";
    var styleEl = document.createElement("style");
    styleEl.textContent = css;
    document.head.appendChild(styleEl);
  })();

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

  // ---------- core navigate/apply ----------
  function navigate(fetchUrl, fullUrl, opts) {
    opts = opts || {};
    var isBack = !!opts.isBack;
    var pushHistory = opts.pushHistory !== false;
    var hash = opts.hash || "";

    if (busy) return;
    busy = true;

    if (!isBack) {
      window.history.replaceState(
        { url: window.location.href, scrollY: window.scrollY },
        "",
        window.location.href
      );
    }

    var fetchPromise = fetchPage(fetchUrl);

    function finish(html) {
      applySwap(html, fullUrl, isBack, pushHistory, hash, opts.restoreScroll);
    }

    if (reduceMotion) {
      fetchPromise
        .then(function (html) {
          finish(html);
          busy = false;
        })
        .catch(function () {
          window.location.href = fullUrl;
        });
      return;
    }

    wrap.classList.remove("sf-in-fwd", "sf-in-back");
    wrap.classList.add(isBack ? "sf-out-back" : "sf-out-fwd");

    Promise.all([fetchPromise, waitAnimEnd(wrap)])
      .then(function (res) {
        finish(res[0]);
      })
      .catch(function () {
        window.location.href = fullUrl;
      });
  }

  function applySwap(html, fullUrl, isBack, pushHistory, hash, restoreScroll) {
    var extracted = extractWrap(html);
    if (!extracted.wrapHTML) {
      // destination page hasn't been upgraded with #page-wrap yet — fall back safely
      window.location.href = fullUrl;
      return;
    }

    wrap.classList.remove("sf-out-fwd", "sf-out-back");
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
      busy = false;
      prefetchVisibleLinks();
      return;
    }

    void wrap.offsetWidth; // force reflow so the enter animation restarts cleanly
    wrap.classList.add(isBack ? "sf-in-back" : "sf-in-fwd");
    wrap.addEventListener("animationend", function handler() {
      wrap.classList.remove("sf-in-fwd", "sf-in-back");
      wrap.removeEventListener("animationend", handler);
      busy = false;
    });
    setTimeout(function () {
      busy = false;
    }, DUR_IN + 150);

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

      e.preventDefault();
      spawnPulse(e.clientX, e.clientY);
      navigate(fetchKey, fullUrl, { isBack: false, hash: url.hash });
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
    });
  });

  if (!window.history.state) {
    window.history.replaceState({ url: window.location.href, scrollY: window.scrollY }, "", window.location.href);
  }

  // warm the cache for links already on screen
  window.addEventListener("load", prefetchVisibleLinks);
})();
