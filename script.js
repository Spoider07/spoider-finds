// ============================================================
// Spoider Finds — main script
// Handles: mobile nav toggle, scroll-driven "thread" line,
// footer utilities, reveal/count-up/snap animations, the
// unified split-reveal typography system, the hero-web-to-
// category-grid scroll transition, the user-controlled
// light/dark theme toggle (sweep transition + persistence),
// and the Spoider Score tap-to-reveal panel.
//
// Refactored so all per-page setup lives in initPage(), which
// runs on first load AND after every AJAX page transition
// (see transitions.js). One-time, page-independent behaviors
// (cursor trail, first-load intro overlay, global tap-spark,
// theme toggle binding, Spoider Score panel toggling) live in
// bindGlobalOnce() and only ever run once per real browser
// session, bound via event delegation on document — so they
// survive every AJAX swap without rebinding to newly injected
// product cards.
// ============================================================

(function () {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const supportsHoverFine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  let globalBound = false;
  let pageCleanupFns = [];

  // Bumped every time initCuratedCountStat() runs (i.e. every real
  // page load and every SPA transition back to a page with the
  // stat). The in-flight Supabase fetch captures its own token and
  // checks it before touching the DOM — if the user has already
  // navigated away by the time the fetch resolves, the token won't
  // match anymore and the stale result is safely dropped instead of
  // being written into a #page-wrap that's since been replaced.
  let curatedCountToken = 0;

  // ============================================================
  // Theme toggle (user-controlled, persisted via localStorage)
  //
  // Default is Dark. html[data-theme="light"] is what the CSS
  // keys off of — this script only ever sets/reads that one
  // attribute plus localStorage. The anti-flash inline script in
  // each page's <head> already sets the attribute before first
  // paint if Light was previously chosen, so this code never has
  // to "fix" an initial flash — it only handles the toggle itself.
  //
  // Transition, three layered effects:
  //   1) Shockwave ring — a thin gold ring bursts outward from
  //      the tapped button the instant it's pressed, reading as
  //      an energy pulse that precedes the color fill.
  //   2) Sweep — an expanding circle (Web Animations API), grown
  //      from the tapped button's position in the DESTINATION
  //      theme's --bg-elevated color, fully covers the viewport.
  //      Once covered, data-theme flips (invisible, hidden under
  //      the circle), then the circle fades to reveal the new
  //      theme already settled.
  //   3) Icon morph — the sun/moon glyph itself rotates + blurs
  //      out as the sweep grows, then rotates + blurs back in
  //      once the theme has flipped underneath the cover, instead
  //      of an instant CSS display swap.
  //   4) Depth-pulse — a brief whole-page blur (camera focus-pull)
  //      timed to the moment of the flip, resolving to sharp just
  //      as the sweep fades away.
  // ============================================================
  const THEME_KEY = "sf-theme";

  function getStoredTheme() {
    try {
      return localStorage.getItem(THEME_KEY);
    } catch (e) {
      return null;
    }
  }

  function setStoredTheme(value) {
    try {
      localStorage.setItem(THEME_KEY, value);
    } catch (e) {
      /* localStorage unavailable (privacy mode etc.) — theme just won't persist */
    }
  }

  function currentTheme() {
    return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
  }

  function updateToggleUI() {
    const isLight = currentTheme() === "light";
    document.querySelectorAll(".theme-toggle").forEach((btn) => {
      btn.setAttribute("aria-pressed", isLight ? "true" : "false");
      btn.setAttribute("aria-label", isLight ? "Switch to dark mode" : "Switch to light mode");
    });
  }

  function flipTheme(nextTheme) {
    document.documentElement.setAttribute("data-theme", nextTheme);
    setStoredTheme(nextTheme);
    updateToggleUI();
    window.dispatchEvent(new CustomEvent("sf-theme-change", { detail: { theme: nextTheme } }));
  }

  // Runs the icon morph-out immediately (before the sweep even
  // finishes growing) and hands back a function to trigger the
  // morph-in once the theme has actually flipped. Forces both
  // icons visible via inline style during the transition window
  // (overriding the CSS display:none rule that normally hides
  // whichever one doesn't match the current theme) so the
  // outgoing glyph has something to animate out on, and the
  // incoming glyph has something to animate in on. Inline styles
  // are cleared once the incoming glyph settles, handing control
  // back to the normal CSS rules.
  function morphToggleIcon(btn) {
    if (!btn) return function () {};
    const sun = btn.querySelector(".icon-sun");
    const moon = btn.querySelector(".icon-moon");
    if (sun) sun.style.display = "inline-flex";
    if (moon) moon.style.display = "inline-flex";
    btn.classList.add("morphing");

    return function morphIn() {
      btn.classList.remove("morphing");
      requestAnimationFrame(() => {
        btn.classList.add("morph-in");
        setTimeout(() => {
          btn.classList.remove("morph-in");
          if (sun) sun.style.display = "";
          if (moon) moon.style.display = "";
        }, 420);
      });
    };
  }

  function spawnShockwave(originX, originY, size) {
    const ring = document.createElement("div");
    ring.className = "theme-shockwave";
    ring.style.top = originY + "px";
    ring.style.left = originX + "px";
    ring.style.width = "0px";
    ring.style.height = "0px";
    document.body.appendChild(ring);

    const ringSize = size * 0.62;
    const anim = ring.animate(
      [
        { width: "0px", height: "0px", opacity: 1 },
        { width: ringSize * 0.6 + "px", height: ringSize * 0.6 + "px", opacity: 0.55 },
        { width: ringSize + "px", height: ringSize + "px", opacity: 0 },
      ],
      { duration: 520, easing: "cubic-bezier(0.16,1,0.3,1)", fill: "forwards" }
    );
    anim.onfinish = () => {
      if (ring.parentNode) ring.remove();
    };
  }

  function runThemeSweep(nextTheme, originX, originY, btnEl) {
    const root = document.documentElement;

    if (prefersReducedMotion || typeof root.animate !== "function") {
      flipTheme(nextTheme);
      return;
    }

    // Read the destination theme's elevated background color by
    // briefly flipping the attribute, reading the computed value,
    // then reverting — the actual (visible) flip happens later,
    // once the sweep circle has fully covered the screen.
    const prevTheme = currentTheme();
    root.setAttribute("data-theme", nextTheme);
    const destColor = getComputedStyle(root).getPropertyValue("--bg-elevated").trim() || "#0a0a0b";
    root.setAttribute("data-theme", prevTheme);

    const maxDist = Math.hypot(
      Math.max(originX, window.innerWidth - originX),
      Math.max(originY, window.innerHeight - originY)
    );
    const size = maxDist * 2.3;

    // 1) Shockwave — fires immediately, precedes the color fill
    spawnShockwave(originX, originY, size);

    // 3) Icon morph-out — fires immediately alongside the shockwave
    const triggerMorphIn = morphToggleIcon(btnEl);

    const sweep = document.createElement("div");
    sweep.className = "theme-sweep";
    sweep.style.top = originY + "px";
    sweep.style.left = originX + "px";
    sweep.style.width = "0px";
    sweep.style.height = "0px";
    sweep.style.background = destColor;
    document.body.appendChild(sweep);

    const grow = sweep.animate(
      [
        { width: "0px", height: "0px" },
        { width: size + "px", height: size + "px" },
      ],
      { duration: 480, easing: "cubic-bezier(0.22,1,0.36,1)", fill: "forwards" }
    );

    grow.onfinish = () => {
      flipTheme(nextTheme);

      // 4) Depth-pulse — brief whole-page blur timed to the flip,
      // resolving to sharp as the sweep fades out over it.
      document.body.classList.add("sf-theme-focus-pulse");
      setTimeout(() => document.body.classList.remove("sf-theme-focus-pulse"), 520);

      // 3) Icon morph-in — now that data-theme has flipped, CSS
      // points to the correct glyph; animate it in.
      triggerMorphIn();

      const fade = sweep.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: 260,
        easing: "ease",
        fill: "forwards",
      });
      fade.onfinish = () => {
        if (sweep.parentNode) sweep.remove();
      };
    };
  }

  function bindThemeToggle() {
    updateToggleUI();
    document.addEventListener("click", (e) => {
      const btn = e.target.closest(".theme-toggle");
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const next = currentTheme() === "light" ? "dark" : "light";
      runThemeSweep(next, x, y, btn);
    });
  }

  // ============================================================
  // Spoider Score panel: tap-to-reveal, delegated on document.
  //
  // Deliberately NOT hover-driven — most traffic is mobile
  // (Instagram/Pinterest referrals), so a hover-only reveal would
  // never be seen by most visitors. Tap works identically on
  // desktop and mobile, no separate code paths.
  //
  // .product-card is itself an <a> — tapping the trigger or close
  // button must never fire the wrapping link's navigation, so both
  // call preventDefault + stopPropagation. Tapping anywhere else on
  // the card (including inside an already-open panel) still
  // navigates to the affiliate link, which is intended: once the
  // score has answered "why this", tapping the product buys it.
  //
  // Bound once on document via delegation (same pattern as the
  // tap-spark handler below), so newly injected cards — from any
  // page's Supabase loader, including after an AJAX transition —
  // work immediately with no rebinding.
  // ============================================================
  function bindSpoiderScorePanels() {
    document.addEventListener("click", (e) => {
      const trigger = e.target.closest(".spoider-score-trigger");
      const closeBtn = e.target.closest(".spoider-panel-close");

      if (trigger) {
        e.preventDefault();
        e.stopPropagation();
        const card = trigger.closest(".product-card");
        if (!card) return;
        document.querySelectorAll(".product-card.is-active").forEach((c) => {
          if (c !== card) c.classList.remove("is-active");
        });
        card.classList.toggle("is-active");
        return;
      }

      if (closeBtn) {
        e.preventDefault();
        e.stopPropagation();
        const card = closeBtn.closest(".product-card");
        if (card) card.classList.remove("is-active");
        return;
      }

      // Tapping fully outside any product card closes whatever panel
      // is currently open (mirrors "tap outside to dismiss").
      if (!e.target.closest(".product-card")) {
        document.querySelectorAll(".product-card.is-active").forEach((c) => c.classList.remove("is-active"));
      }
    });
  }

  function bindGlobalOnce() {
    if (globalBound) return;
    globalBound = true;

    bindThemeToggle();
    bindSpoiderScorePanels();

    // ---- Cursor-trail particles (fine-pointer / desktop only) ----
    if (supportsHoverFine && !prefersReducedMotion) {
      let lastParticleTime = 0;
      const particleThrottleMs = 45;

      document.addEventListener("mousemove", (e) => {
        const now = performance.now();
        if (now - lastParticleTime < particleThrottleMs) return;
        lastParticleTime = now;

        const particle = document.createElement("div");
        particle.className = "cursor-particle";
        particle.style.left = e.clientX + "px";
        particle.style.top = e.clientY + "px";
        document.body.appendChild(particle);

        requestAnimationFrame(() => {
          particle.style.opacity = "0";
          particle.style.transform = "translate(-50%, -50%) scale(0.3)";
        });

        setTimeout(() => {
          if (particle.parentNode) particle.remove();
        }, 650);
      });
    }

    // ---- Page-load intro overlay (once per session, real load only) ----
    const pageLoader = document.getElementById("pageLoader");
    if (pageLoader) {
      let alreadyShown = false;
      try {
        alreadyShown = sessionStorage.getItem("spoiderLoaderShown") === "1";
      } catch (e) {
        // sessionStorage unavailable (privacy mode etc.) — harmless
      }

      if (alreadyShown || prefersReducedMotion) {
        pageLoader.remove();
      } else {
        try {
          sessionStorage.setItem("spoiderLoaderShown", "1");
        } catch (e) {
          /* ignore */
        }
        const hideDelay = 950;
        setTimeout(() => {
          pageLoader.classList.add("loader-hidden");
          setTimeout(() => {
            if (pageLoader.parentNode) pageLoader.remove();
          }, 450);
        }, hideDelay);
      }
    }

    // ---- Global tap-spark: a restrained, premium micro-feedback on
    // interactive taps. A small radial gold spark spawns at the exact
    // tap point and fades out — never a bounce, never a ripple that
    // fills the element. Deliberately understated so it reads as
    // polish, not decoration. Bound once on document via delegation,
    // so it survives every AJAX page swap without rebinding. Skips
    // .hero-mark-inner entirely — that element already has its own
    // dedicated burst/flash treatment, and layering this on top would
    // double up and look cheap. Also skips .theme-toggle — that has
    // its own sweep transition and doesn't need the generic spark. ----
    if (!prefersReducedMotion) {
      const sparkStyle = document.createElement("style");
      sparkStyle.textContent =
        ".sf-tap-spark{position:fixed;width:8px;height:8px;margin:-4px 0 0 -4px;" +
        "border-radius:50%;pointer-events:none;z-index:9999;" +
        "background:radial-gradient(circle, rgba(255,241,204,0.9) 0%, rgba(232,199,102,0.55) 45%, rgba(232,199,102,0) 75%);" +
        "transform:scale(0.3);opacity:0.9;" +
        "animation:sfTapSparkOut .48s cubic-bezier(.22,1,.36,1) forwards;}" +
        "@keyframes sfTapSparkOut{to{transform:scale(2.6);opacity:0;}}";
      document.head.appendChild(sparkStyle);

      const TAP_SPARK_SELECTOR =
        "a, button, .btn, .category-card, .product-card, .trust-card, .latest-item, .india-pill";

      function spawnTapSpark(x, y) {
        const spark = document.createElement("span");
        spark.className = "sf-tap-spark";
        spark.style.left = x + "px";
        spark.style.top = y + "px";
        document.body.appendChild(spark);
        setTimeout(() => {
          if (spark.parentNode) spark.remove();
        }, 520);
      }

      document.addEventListener(
        "pointerdown",
        (e) => {
          if (e.pointerType === "mouse" && e.button !== 0) return;
          const target = e.target.closest(TAP_SPARK_SELECTOR);
          if (!target || target.closest(".hero-mark-inner") || target.closest(".theme-toggle")) return;
          spawnTapSpark(e.clientX, e.clientY);
        },
        { passive: true }
      );
    }
  }

  // ============================================================
  // Split-reveal: unified word-mask typography system.
  //
  // Wraps each word of a heading in an overflow-hidden mask box,
  // with the word rising up from below on reveal while resolving
  // from a soft blur + slight tilt into sharp focus (see the
  // matching .split-reveal CSS). Inline formatting elements (e.g.
  // <em>, a colored <span>) are preserved on a PER-WORD basis: if
  // <em>Multiple Words</em> appears inside a heading, each word
  // gets its own mask/stagger, each still wrapped in its own
  // <em> clone — so the italic styling survives, and the element
  // is never accidentally treated as one giant animated word.
  //
  // Motion tiers (element decides its own pace/feel via context —
  // see the matching .split-reveal CSS tiers):
  //   .hero-title / anything inside .hero → dramatic, slow, spring
  //   .eyebrow                             → restrained, fast, label-like
  //   <h3>                                 → very subtle, fast
  //   everything else (section headings)   → the base, controlled tier
  //
  // Stagger timing (organic, not mechanical):
  //   Delay follows a power curve — words start close together and
  //   fan out slightly as the sequence progresses, reading like a
  //   natural ripple rather than a metronome. Noticeably longer
  //   words get a small extra beat so they don't feel rushed past.
  //   Each tier has its own pace so a small label doesn't take as
  //   long to resolve as the hero headline.
  //
  // Trigger modes:
  //   data-trigger="load"  → reveals once, shortly after page load
  //   (default)             → reveals once, on scroll into view
  //
  // Whole-word transform/filter animation only (no per-character
  // DOM, no opacity flicker) — safe and smooth on low-power devices.
  // ============================================================
  function getStaggerTier(el) {
    if (el.classList.contains("hero-title") || el.closest(".hero")) {
      return { base: 0.09, power: 0.78, longBonus: 0.025 }; // hero — dramatic, slower fan-out
    }
    if (el.classList.contains("eyebrow")) {
      return { base: 0.035, power: 0.9, longBonus: 0.01 }; // label — quick, restrained
    }
    if (el.tagName === "H3") {
      return { base: 0.04, power: 0.9, longBonus: 0.01 }; // minor heading — quick, subtle
    }
    return { base: 0.065, power: 0.82, longBonus: 0.02 }; // section heading — the controlled default
  }

  function splitIntoWordMasks(el) {
    if (el.dataset.splitDone === "1") return;
    el.dataset.splitDone = "1";

    // Screen readers get the plain original text via aria-label;
    // the generated mask markup is hidden from assistive tech.
    el.setAttribute("aria-label", el.textContent.trim());

    const tier = getStaggerTier(el);
    const LONG_WORD_CHARS = 7; // words longer than this get a small extra beat

    const originalNodes = Array.prototype.slice.call(el.childNodes);
    el.innerHTML = "";

    let wordIndex = 0;

    // Rebuilds a word (or a whitespace run) wrapped in clones of any
    // inline formatting elements it was found inside (innermost last),
    // so <em>/<span class="gold-text">/etc. survive on a per-word basis.
    function wrapInFormatting(text, formatChain) {
      let node = document.createTextNode(text);
      for (let i = formatChain.length - 1; i >= 0; i--) {
        const wrapper = formatChain[i].cloneNode(false); // shallow clone: tag + attributes, no children
        wrapper.appendChild(node);
        node = wrapper;
      }
      return node;
    }

    function appendMaskedWord(wordText, formatChain) {
      const mask = document.createElement("span");
      mask.className = "word-mask";
      mask.setAttribute("aria-hidden", "true");
      const inner = document.createElement("span");
      inner.className = "word-inner";

      let delay = Math.pow(wordIndex, tier.power) * tier.base;
      if (wordText.trim().length > LONG_WORD_CHARS) delay += tier.longBonus;
      inner.style.transitionDelay = delay.toFixed(3) + "s";

      inner.appendChild(wrapInFormatting(wordText, formatChain));
      mask.appendChild(inner);
      el.appendChild(mask);
      wordIndex++;
    }

    // Walks the original nodes, tracking the chain of inline formatting
    // elements (e.g. [em] or [em, span.gold-text]) currently wrapping
    // each piece of text, so every individual word can be masked and
    // staggered while still carrying its formatting.
    function walk(node, formatChain) {
      if (node.nodeType === Node.TEXT_NODE) {
        const parts = node.textContent.split(/(\s+)/).filter((p) => p.length > 0);
        parts.forEach((part) => {
          if (/^\s+$/.test(part)) {
            el.appendChild(wrapInFormatting(part, formatChain));
          } else {
            appendMaskedWord(part, formatChain);
          }
        });
      } else if (node.nodeName === "BR") {
        el.appendChild(node.cloneNode(true));
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const childChain = formatChain.concat([node]);
        Array.prototype.slice.call(node.childNodes).forEach((child) => walk(child, childChain));
      }
    }

    originalNodes.forEach((node) => walk(node, []));
  }

  function initSplitReveal() {
    const splitEls = document.querySelectorAll(".split-reveal");
    if (!splitEls.length) return;

    splitEls.forEach(splitIntoWordMasks);

    if (prefersReducedMotion) {
      splitEls.forEach((el) => el.classList.add("is-visible"));
      return;
    }

    const loadEls = [];
    const scrollEls = [];
    splitEls.forEach((el) => {
      if (el.dataset.trigger === "load") loadEls.push(el);
      else scrollEls.push(el);
    });

    loadEls.forEach((el) => {
      const startDelay = parseFloat(el.dataset.delay || "0") * 1000;
      setTimeout(() => el.classList.add("is-visible"), startDelay);
    });

    if (scrollEls.length && "IntersectionObserver" in window) {
      const splitObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add("is-visible");
              splitObserver.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.2, rootMargin: "0px 0px -8% 0px" }
      );
      scrollEls.forEach((el) => splitObserver.observe(el));
    } else {
      scrollEls.forEach((el) => el.classList.add("is-visible"));
    }
  }

  // ============================================================
  // Hero web → category grid scroll transition
  //
  // The hero's spider-web canvas (built in index.html's inline
  // script) previously just switched on/off via its own
  // IntersectionObserver, with no connection to what happened
  // next on the page. This ties the two together: as the user
  // scrolls from the hero into the Categories section, the web
  // canvas fades and gently contracts, while each category card
  // "catches" a thin gold thread line across its top edge, one
  // card after another (a small stagger per card) — reading as
  // the overhead web's threads landing into the grid below,
  // rather than two disconnected sections.
  //
  // Driven by scroll position (smoothstepped, same pattern as
  // the featured-card scroll-scale effect in index.html's inline
  // script and the .thread SVG draw below) rather than a CSS
  // transition, since the value needs to track scroll 1:1 every
  // frame. No-ops safely on any page that doesn't have both a
  // .web-canvas and a .category-grid (only index.html and
  // india.html currently have the web canvas).
  // ============================================================
  function initHeroWebToGridThread() {
    if (prefersReducedMotion) return;

    const heroSection = document.querySelector(".hero");
    const canvas = document.querySelector(".web-canvas");
    const grid = document.querySelector(".category-grid");
    if (!heroSection || !canvas || !grid) return;

    const cards = Array.prototype.slice.call(grid.querySelectorAll(".category-card"));
    if (!cards.length) return;

    canvas.style.willChange = "opacity, transform";

    function smoothstep(t) {
      t = Math.max(0, Math.min(1, t));
      return t * t * (3 - 2 * t);
    }

    let ticking = false;

    function update() {
      ticking = false;
      const gridRect = grid.getBoundingClientRect();
      const vh = window.innerHeight;

      // Progress window: starts once the grid's top edge climbs to
      // 85% of viewport height (user is nearing the end of the
      // hero), finishes once it reaches 40% (grid substantially in
      // view). Mirrors the featured-card scale effect's approach.
      const start = vh * 0.85;
      const end = vh * 0.4;
      const raw = (start - gridRect.top) / (start - end);
      const progress = smoothstep(raw);

      // Web canvas fades and gathers inward slightly, as if its
      // threads are retreating rather than simply vanishing.
      canvas.style.opacity = (1 - progress).toFixed(3);
      canvas.style.transform = "scale(" + (1 - progress * 0.12).toFixed(3) + ")";

      // Each card catches its thread a beat after the previous one,
      // instead of all four lighting up at once.
      cards.forEach((card, i) => {
        const staggerOffset = i * 0.12;
        const cardProgress = smoothstep((progress - staggerOffset) / (1 - staggerOffset));
        card.style.setProperty("--thread-catch", cardProgress.toFixed(3));
      });
    }

    function onScroll() {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    }

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    pageCleanupFns.push(() => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      canvas.style.opacity = "";
      canvas.style.transform = "";
      canvas.style.willChange = "";
      cards.forEach((card) => card.style.removeProperty("--thread-catch"));
    });
  }

  // ============================================================
  // Curated Finds stat: live count from Supabase.
  //
  // Handled separately from the generic data-count-to stat
  // animation below because its target isn't known synchronously
  // — it has to be fetched from Supabase first. The element is
  // excluded from the generic loop entirely (see initPage()) so
  // the two never race for control of the same DOM node.
  //
  // Counts every active product across BOTH regions (US + India
  // combined) — no .eq('region', ...) filter. If you ever want a
  // region-specific version on india.html, give that element a
  // different id (e.g. stat-india-count) and add a filtered
  // variant rather than reusing this one.
  //
  // curatedCountToken guards against a stale fetch landing after
  // the user has already navigated away (SPA transition swapped
  // #page-wrap, or navigated back to this same page again before
  // the first fetch resolved) — the token is captured locally and
  // checked before every DOM write and on every animation frame.
  // ============================================================
  function initCuratedCountStat() {
    const el = document.getElementById("stat-curated-count");
    if (!el) return;

    curatedCountToken += 1;
    const myToken = curatedCountToken;

    const SUPABASE_URL = "https://gqnwinkddckytrfpnhng.supabase.co";
    const SUPABASE_KEY = "sb_publishable_NYb3HMwKyHL1YxlOIWtcQg_NGJwDwmQ";
    const suffix = el.getAttribute("data-suffix") || "+";
    const fallbackTarget = parseInt(el.getAttribute("data-count-to"), 10) || 0;

    function animateTo(target) {
      if (myToken !== curatedCountToken) return; // a newer page/nav already took over

      if (prefersReducedMotion) {
        el.textContent = target + suffix;
        return;
      }

      el.textContent = "0" + suffix;
      const duration = 2000;
      const startDelay = 500;
      const startTime = performance.now() + startDelay;

      const tick = (now) => {
        if (myToken !== curatedCountToken) return; // bail — a newer page/nav has taken over
        if (now < startTime) {
          requestAnimationFrame(tick);
          return;
        }
        const progress = Math.min((now - startTime) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = Math.round(eased * target) + suffix;
        if (progress < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }

    function ensureSupabaseLib(callback) {
      if (window.supabase && typeof window.supabase.createClient === "function") {
        callback();
        return;
      }
      const existing = document.querySelector("script[data-supabase-lib]");
      if (existing) {
        existing.addEventListener("load", callback, { once: true });
        return;
      }
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
      s.setAttribute("data-supabase-lib", "true");
      s.onload = callback;
      document.head.appendChild(s);
    }

    ensureSupabaseLib(async () => {
      if (myToken !== curatedCountToken) return; // page moved on while the lib was loading

      try {
        const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        const res = await sb
          .from("products")
          .select("*", { count: "exact", head: true })
          .eq("active", true);

        if (myToken !== curatedCountToken) return; // page moved on while this was in flight
        if (res.error) throw res.error;

        const count = typeof res.count === "number" ? res.count : fallbackTarget;
        el.setAttribute("data-count-to", count);
        animateTo(count);
      } catch (err) {
        console.error("Curated count fetch failed:", err);
        animateTo(fallbackTarget); // graceful fallback — still animates, just with the last-known static number
      }
    });
  }

  function initPage() {
    // clear listeners bound by the previous page (avoid pile-up across transitions)
    pageCleanupFns.forEach((fn) => fn());
    pageCleanupFns = [];

    // ---- Footer year ----
    const yearEl = document.getElementById("year");
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    // ---- Mobile nav toggle ----
    const navToggle = document.getElementById("navToggle");
    const navMobile = document.getElementById("navMobile");

    if (navToggle && navMobile) {
      navToggle.addEventListener("click", () => {
        const isOpen = navMobile.classList.toggle("open");
        navToggle.classList.toggle("active", isOpen);
        navToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
      });

      navMobile.querySelectorAll("a").forEach((link) => {
        link.addEventListener("click", () => {
          navMobile.classList.remove("open");
          navToggle.classList.remove("active");
          navToggle.setAttribute("aria-expanded", "false");
        });
      });
    }

    // ---- Product image shimmer ----
    document.querySelectorAll(".product-image").forEach((wrapper) => {
      const img = wrapper.querySelector("img");
      if (!img) return;
      if (img.complete && img.naturalWidth > 0) {
        wrapper.classList.add("img-loaded");
      } else {
        img.addEventListener("load", () => wrapper.classList.add("img-loaded"));
        img.addEventListener("error", () => wrapper.classList.add("img-loaded"));
      }
    });

    // ---- Nav scroll state (glassmorphism intensify + logo shrink) ----
    const navEl = document.getElementById("nav") || document.querySelector(".nav");
    if (navEl) {
      const updateNavScrollState = () => {
        navEl.classList.toggle("scrolled", window.scrollY > 40);
      };
      updateNavScrollState();
      window.addEventListener("scroll", updateNavScrollState, { passive: true });
      pageCleanupFns.push(() => window.removeEventListener("scroll", updateNavScrollState));
    }

    // ---- Active nav link tracking ----
    const navAnchorLinks = document.querySelectorAll(
      '.nav-links a[href^="#"], .nav-mobile a[href^="#"]'
    );
    if (navAnchorLinks.length && "IntersectionObserver" in window) {
      const setActiveNavLink = (hash) => {
        navAnchorLinks.forEach((a) => {
          a.classList.toggle("active", a.getAttribute("href") === hash);
        });
      };
      const trackedSectionIds = ["categories", "featured", "latest"];
      const sectionObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              setActiveNavLink("#" + entry.target.id);
            }
          });
        },
        { rootMargin: "-45% 0px -50% 0px", threshold: 0 }
      );
      trackedSectionIds.forEach((id) => {
        const el = document.getElementById(id);
        if (el) sectionObserver.observe(el);
      });
      pageCleanupFns.push(() => sectionObserver.disconnect());
    }

    // ---- Magnetic buttons (fine-pointer / desktop only) ----
    if (supportsHoverFine && !prefersReducedMotion) {
      const magneticButtons = document.querySelectorAll(".btn");
      const strength = 0.35;
      const maxDist = 14;

      magneticButtons.forEach((btn) => {
        btn.addEventListener("mousemove", (e) => {
          const rect = btn.getBoundingClientRect();
          const relX = e.clientX - (rect.left + rect.width / 2);
          const relY = e.clientY - (rect.top + rect.height / 2);
          const x = Math.max(-maxDist, Math.min(maxDist, relX * strength));
          const y = Math.max(-maxDist, Math.min(maxDist, relY * strength));
          btn.style.transition = "transform 0.08s linear";
          btn.style.transform = `translate(${x}px, ${y}px)`;
        });
        btn.addEventListener("mouseleave", () => {
          btn.style.transition = "transform 0.4s cubic-bezier(0.22, 1, 0.36, 1)";
          btn.style.transform = "translate(0px, 0px)";
        });
      });
    }

    // ---- Hero stat count-up ----
    // stat-curated-count is excluded here — it's handled by
    // initCuratedCountStat() below, which fetches its target live
    // from Supabase instead of reading a static data-count-to.
    const statNums = document.querySelectorAll(".stat-num[data-count-to]:not(#stat-curated-count)");
    if (statNums.length && !prefersReducedMotion) {
      statNums.forEach((el) => {
        const target = parseInt(el.getAttribute("data-count-to"), 10);
        const suffix = el.getAttribute("data-suffix") || "";
        el.textContent = "0" + suffix;
        const duration = 2000;
        const startDelay = 500;
        const startTime = performance.now() + startDelay;

        const tick = (now) => {
          if (now < startTime) {
            requestAnimationFrame(tick);
            return;
          }
          const progress = Math.min((now - startTime) / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          el.textContent = Math.round(eased * target) + suffix;
          if (progress < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    } else {
      statNums.forEach((el) => {
        el.textContent = el.getAttribute("data-count-to") + (el.getAttribute("data-suffix") || "");
      });
    }

    // ---- Curated Finds stat: live count from Supabase ----
    initCuratedCountStat();

    // ---- Snap-reveal text (golden particles converge into place) ----
    const snapEls = document.querySelectorAll(".snap-reveal");

    if (snapEls.length && !prefersReducedMotion) {
      snapEls.forEach((el) => {
        if (el.dataset.snapSplit === "1") return; // safety guard, fresh DOM shouldn't hit this
        const text = el.textContent;
        el.textContent = "";
        el.setAttribute("aria-label", text);
        el.dataset.snapSplit = "1";

        const words = text.split(/(\s+)/).filter((w) => w.length > 0);

        words.forEach((word, i) => {
          const span = document.createElement("span");
          span.className = "letter";
          span.textContent = word;
          span.setAttribute("aria-hidden", "true");
          span.style.setProperty("--i", i);
          el.appendChild(span);
        });
      });

      if ("IntersectionObserver" in window) {
        const snapObserver = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                const target = entry.target;
                const wordCount = target.querySelectorAll(".letter").length;
                target.classList.add("in-view");
                const totalTime = wordCount * 70 + 550 + 500;
                setTimeout(() => target.classList.add("settled"), totalTime);
                snapObserver.unobserve(target);
              }
            });
          },
          { threshold: 0.3, rootMargin: "0px 0px -60px 0px" }
        );
        snapEls.forEach((el) => snapObserver.observe(el));
      } else {
        snapEls.forEach((el) => el.classList.add("in-view", "settled"));
      }
    }

    // ---- Split-reveal (unified word-mask typography system) ----
    initSplitReveal();

    // ---- Hero web canvas → category grid scroll transition ----
    initHeroWebToGridThread();

    // ---- Scroll-reveal for sections and cards ----
    const revealEls = document.querySelectorAll(".reveal:not(.crazy-title)");

    if (revealEls.length && !prefersReducedMotion && "IntersectionObserver" in window) {
      const revealObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add("is-visible");
              revealObserver.unobserve(entry.target);
            }
          });
        },
        { threshold: 0, rootMargin: "0px 0px 150px 0px" }
      );
      revealEls.forEach((el) => revealObserver.observe(el));
    } else {
      revealEls.forEach((el) => el.classList.add("is-visible"));
    }

    // ---- "Four threads. One taste." cinematic focus-in ----
    const crazyTitleEl = document.querySelector(".crazy-title");
    if (crazyTitleEl) {
      if (!prefersReducedMotion && "IntersectionObserver" in window) {
        const crazyObserver = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                entry.target.classList.add("is-visible");
                crazyObserver.unobserve(entry.target);
              }
            });
          },
          { threshold: 0.4, rootMargin: "0px 0px -15% 0px" }
        );
        crazyObserver.observe(crazyTitleEl);
      } else {
        crazyTitleEl.classList.add("is-visible");
      }
    }

    // ---- Scroll-driven "thread" signature element ----
    const threadPath = document.getElementById("threadPath");

    if (threadPath && !prefersReducedMotion) {
      const pathLength = 3000;

      const updateThread = () => {
        const scrollTop = window.scrollY;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        const progress = docHeight > 0 ? Math.min(scrollTop / docHeight, 1) : 0;
        const drawn = progress * pathLength;
        threadPath.style.strokeDasharray = `${drawn} ${pathLength}`;
      };

      updateThread();
      window.addEventListener("scroll", updateThread, { passive: true });
      window.addEventListener("resize", updateThread);
      pageCleanupFns.push(() => {
        window.removeEventListener("scroll", updateThread);
        window.removeEventListener("resize", updateThread);
      });
    }
  }

  // Exposed so transitions.js can re-run page setup after swapping in new content
  window.SpoiderPage = { init: initPage };

  document.addEventListener("DOMContentLoaded", () => {
    bindGlobalOnce();
    initPage();
  });
})();
