// ============================================================
// Spoider Finds — cinematic footer (v2, premium pass)
//
// What this file does now:
//  1) Injects the premium footer CSS itself (loads after style.css,
//     so it cleanly overrides the old .footer--cinematic rules —
//     no other file needs editing, and every page's existing
//     footer markup keeps working as-is).
//  2) Heading cinematic focus-in (one-shot).
//  3) Link rows reveal one-by-one on scroll (numbered editorial
//     list instead of pills).
//  4) Ghost SPOIDER wordmark is measured and fitted to the exact
//     footer width, so the full word always shows (never cropped),
//     with a one-time gold shimmer sweep + slow parallax.
//  5) Magnetic hover on the back-to-top button (fine pointer only).
//
// <footer> lives outside #page-wrap and is never swapped by
// transitions.js, so this binds exactly once per real page load.
// ============================================================
(function () {
  var footer = document.getElementById("footerWeb");
  if (!footer) return;

  var prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var supportsHoverFine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  // ------------------------------------------------------------
  // 1) Injected CSS
  // ------------------------------------------------------------
  var FOOTER_CSS = `
/* ---------- shell: opaque so the fixed gold thread stops at the footer ---------- */
.footer--cinematic {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  background: var(--bg);
  padding: 92px 24px 14px;
}
@media (min-width: 960px) {
  .footer--cinematic { padding: 132px 40px 18px; }
}

/* ---------- thread knot: the page thread drops into the footer and ends in a bead ---------- */
.footer--cinematic::before {
  content: "";
  position: absolute;
  top: 0;
  left: 50%;
  width: 1px;
  height: 48px;
  transform: translateX(-50%);
  background: linear-gradient(to bottom, rgba(var(--web-line), 0.35), rgba(var(--web-line), 0.9));
  z-index: 1;
  pointer-events: none;
}
.footer--cinematic::after {
  content: "";
  position: absolute;
  top: 48px;
  left: 50%;
  width: 7px;
  height: 7px;
  margin: -3px 0 0 -3.5px;
  border-radius: 50%;
  background: var(--gold-bright);
  box-shadow: 0 0 10px 1px rgba(232, 199, 102, 0.35);
  z-index: 1;
  pointer-events: none;
  animation: sfKnotPulse 4.5s ease-in-out infinite;
}
@keyframes sfKnotPulse {
  0%, 100% { box-shadow: 0 0 8px 1px rgba(232, 199, 102, 0.28); }
  50%      { box-shadow: 0 0 18px 4px rgba(232, 199, 102, 0.6); }
}
@media (min-width: 960px) {
  .footer--cinematic::before { height: 72px; }
  .footer--cinematic::after  { top: 72px; }
}

/* ---------- layout order: content, legal bar, then the big wordmark last ---------- */
.footer--cinematic .footer-content {
  order: 1;
  width: 100%;
}
.footer--cinematic .footer-heading {
  margin-bottom: 38px;
}

/* ---------- link rows (numbered editorial list) ---------- */
.footer--cinematic .footer-pills {
  display: flex;
  flex-direction: column;
  flex-wrap: nowrap;
  gap: 0;
  justify-content: flex-start;
  max-width: 560px;
  margin: 0 auto;
  border-top: 1px solid var(--border);
  counter-reset: sfpill;
  text-align: left;
}
.footer--cinematic .footer-pill {
  --i: 0;
  display: flex;
  align-items: center;
  gap: 18px;
  width: 100%;
  padding: 22px 4px;
  font-family: var(--font-display);
  font-weight: 500;
  font-size: clamp(1.3rem, 5.4vw, 1.6rem);
  letter-spacing: -0.015em;
  line-height: 1.2;
  color: var(--text-primary);
  background-color: transparent;
  background-image: linear-gradient(90deg, var(--gold), var(--gold-bright));
  background-repeat: no-repeat;
  background-size: 0% 1px;
  background-position: left bottom;
  background-origin: border-box;
  border: 0;
  border-bottom: 1px solid var(--border);
  border-radius: 0;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  box-shadow: none;
  will-change: auto;
  -webkit-tap-highlight-color: transparent;
  transition:
    opacity 0.8s var(--ease) calc(var(--i) * 0.08s),
    transform 0.8s var(--ease) calc(var(--i) * 0.08s),
    background-size 0.7s var(--ease),
    color 0.3s var(--ease),
    padding-left 0.4s var(--ease);
}
.footer--cinematic .footer-pill:nth-child(1) { --i: 0; }
.footer--cinematic .footer-pill:nth-child(2) { --i: 1; }
.footer--cinematic .footer-pill:nth-child(3) { --i: 2; }
.footer--cinematic .footer-pill:nth-child(4) { --i: 3; }
.footer--cinematic .footer-pill:nth-child(5) { --i: 4; }
.footer--cinematic .footer-pill:nth-child(6) { --i: 5; }

.footer--cinematic .footer-pill::before {
  counter-increment: sfpill;
  content: "0" counter(sfpill);
  font-family: var(--font-mono);
  font-weight: 400;
  font-size: 0.68rem;
  letter-spacing: 0.14em;
  color: var(--gold);
  opacity: 0.85;
  min-width: 1.6em;
}
.footer--cinematic .footer-pill::after {
  content: "\\2197";
  margin-left: auto;
  font-family: var(--font-body);
  font-size: 1.05rem;
  line-height: 1;
  color: var(--gold);
  opacity: 0.75;
  transition: transform 0.4s var(--ease), opacity 0.3s var(--ease), color 0.3s var(--ease);
}

/* India row gets a quiet gold accent so it reads as the special one */
.footer--cinematic .footer-pill[href="india.html"] {
  color: var(--gold-bright);
}

.footer--cinematic .footer-pill:active,
.footer--cinematic .footer-pill:focus-visible {
  background-color: transparent;
  background-size: 100% 1px;
  color: var(--gold-bright);
  padding-left: 10px;
  box-shadow: none;
  border-bottom-color: var(--border);
}
.footer--cinematic .footer-pill:active::after,
.footer--cinematic .footer-pill:focus-visible::after {
  transform: translate(4px, -4px);
  opacity: 1;
  color: var(--gold-bright);
}
@media (hover: hover) {
  .footer--cinematic .footer-pill:hover {
    background-color: transparent;
    background-size: 100% 1px;
    color: var(--gold-bright);
    padding-left: 10px;
    box-shadow: none;
    border-bottom-color: var(--border);
  }
  .footer--cinematic .footer-pill:hover::after {
    transform: translate(4px, -4px);
    opacity: 1;
    color: var(--gold-bright);
  }
}
@media (min-width: 960px) {
  .footer--cinematic .footer-pills { max-width: 640px; }
  .footer--cinematic .footer-pill {
    font-size: 1.85rem;
    padding: 26px 6px;
  }
}

/* scroll-in: rows rise one after another (only armed when JS runs) */
.footer--armed .footer-pill {
  opacity: 0;
  transform: translateY(18px);
}
.footer--armed .footer-pills.is-in .footer-pill {
  opacity: 1;
  transform: none;
}

/* ---------- bottom bar ---------- */
.footer--cinematic .footer-bottom-bar {
  order: 2;
  width: 100%;
  margin: 52px auto 0;
  padding-top: 24px;
  border-top: 0;
  background-image: linear-gradient(90deg, transparent, rgba(var(--web-line), 0.4), transparent);
  background-repeat: no-repeat;
  background-position: top center;
  background-size: 100% 1px;
  font-size: 0.74rem;
}
.footer--cinematic .footer-top-btn {
  width: 42px;
  height: 42px;
  border-color: var(--gold-dim);
}
.footer--cinematic .footer-top-btn svg {
  transition: transform 0.3s var(--ease);
}
.footer--cinematic .footer-top-btn:hover {
  background: var(--gold-dim);
  border-color: var(--gold);
}
.footer--cinematic .footer-top-btn:hover svg {
  transform: translateY(-2px);
}

/* ---------- ghost wordmark: complete, fitted to width, gold-fade fill ---------- */
.footer--cinematic .footer-bg-text {
  order: 3;
  position: relative;
  left: auto;
  bottom: auto;
  transform: none;
  align-self: center;
  width: max-content;
  margin: 0.1em 0 -0.14em;
  z-index: 1;
  font-family: var(--font-display);
  font-weight: 600;
  font-size: clamp(3rem, 21vw, 14rem);
  letter-spacing: -0.03em;
  line-height: 1;
  white-space: nowrap;
  color: transparent;
  -webkit-text-stroke: 1px rgba(201, 168, 118, 0.34);
  background-image:
    linear-gradient(100deg, transparent 38%, rgba(255, 241, 204, 0.55) 50%, transparent 62%),
    linear-gradient(180deg, rgba(201, 168, 118, 0.34) 0%, rgba(201, 168, 118, 0.04) 92%);
  background-repeat: no-repeat;
  background-size: 260% 100%, 100% 100%;
  background-position: 160% 0, 0 0;
  -webkit-background-clip: text;
  background-clip: text;
}
.footer--cinematic .footer-bg-text.is-in {
  animation: sfWordmarkSweep 2.6s cubic-bezier(0.22, 1, 0.36, 1) 0.15s 1 both;
}
@keyframes sfWordmarkSweep {
  from { background-position: 160% 0, 0 0; }
  to   { background-position: -60% 0, 0 0; }
}
html[data-theme="light"] .footer--cinematic .footer-bg-text {
  -webkit-text-stroke: 1px rgba(120, 90, 42, 0.38);
  background-image:
    linear-gradient(100deg, transparent 38%, rgba(255, 250, 235, 0.7) 50%, transparent 62%),
    linear-gradient(180deg, rgba(150, 112, 55, 0.3) 0%, rgba(150, 112, 55, 0.04) 92%);
  background-repeat: no-repeat;
  background-size: 260% 100%, 100% 100%;
  background-position: 160% 0, 0 0;
  -webkit-background-clip: text;
  background-clip: text;
}

@media (prefers-reduced-motion: reduce) {
  .footer--cinematic::after { animation: none; }
  .footer--cinematic .footer-bg-text.is-in { animation: none; }
}
`;

  if (!document.getElementById("sf-footer-premium-css")) {
    var styleEl = document.createElement("style");
    styleEl.id = "sf-footer-premium-css";
    styleEl.textContent = FOOTER_CSS;
    document.head.appendChild(styleEl);
  }

  // rows start hidden only when JS is running and motion is allowed
  if (!prefersReducedMotion) footer.classList.add("footer--armed");

  // ------------------------------------------------------------
  // 2) cinematic heading focus-in (one-shot)
  // ------------------------------------------------------------
  var heading = footer.querySelector(".footer-heading");
  if (heading) {
    if ("IntersectionObserver" in window) {
      var headingIO = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              heading.classList.add("is-in");
              headingIO.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.4, rootMargin: "0px 0px -10% 0px" }
      );
      headingIO.observe(heading);
    } else {
      heading.classList.add("is-in");
    }
  }

  // ------------------------------------------------------------
  // 3) link rows: staggered rise (one-shot)
  // ------------------------------------------------------------
  var pills = footer.querySelector(".footer-pills");
  if (pills) {
    if ("IntersectionObserver" in window && !prefersReducedMotion) {
      var pillsIO = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              pills.classList.add("is-in");
              pillsIO.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.15, rootMargin: "0px 0px -6% 0px" }
      );
      pillsIO.observe(pills);
    } else {
      pills.classList.add("is-in");
    }
  }

  // ------------------------------------------------------------
  // 4) ghost wordmark: fit to width + shimmer once + slow parallax
  // ------------------------------------------------------------
  var bgText = footer.querySelector(".footer-bg-text");

  function fitWordmark() {
    if (!bgText) return;
    bgText.style.fontSize = "100px";
    var w = bgText.offsetWidth;
    if (!w) return;
    var target = footer.clientWidth * 0.94;
    var size = Math.min((100 * target) / w, 420);
    bgText.style.fontSize = size.toFixed(1) + "px";
  }

  if (bgText) {
    fitWordmark();
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(fitWordmark);
    }
    window.addEventListener("load", fitWordmark);

    var fitTimer = null;
    window.addEventListener("resize", function () {
      clearTimeout(fitTimer);
      fitTimer = setTimeout(fitWordmark, 120);
    });

    if ("IntersectionObserver" in window && !prefersReducedMotion) {
      var wordIO = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              bgText.classList.add("is-in");
              wordIO.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.35 }
      );
      wordIO.observe(bgText);
    }
  }

  if (bgText && !prefersReducedMotion) {
    var ticking = false;

    function clamp01(v) {
      return Math.max(0, Math.min(1, v));
    }

    function update() {
      ticking = false;
      var rect = footer.getBoundingClientRect();
      var vh = window.innerHeight;
      var progress = clamp01((vh - rect.top) / (vh + rect.height));
      var shift = (0.5 - progress) * 18;
      bgText.style.transform = "translateY(" + shift.toFixed(1) + "px)";
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
  }

  // ------------------------------------------------------------
  // 5) magnetic hover: back-to-top only (fine pointer)
  // ------------------------------------------------------------
  if (supportsHoverFine && !prefersReducedMotion) {
    var magnets = footer.querySelectorAll(".footer-top-btn");
    var STRENGTH = 0.3;
    var MAX_DIST = 10;

    magnets.forEach(function (el) {
      el.addEventListener("mousemove", function (e) {
        var rect = el.getBoundingClientRect();
        var relX = e.clientX - (rect.left + rect.width / 2);
        var relY = e.clientY - (rect.top + rect.height / 2);
        var x = Math.max(-MAX_DIST, Math.min(MAX_DIST, relX * STRENGTH));
        var y = Math.max(-MAX_DIST, Math.min(MAX_DIST, relY * STRENGTH));
        el.style.transition = "transform 0.08s linear";
        el.style.transform = "translate(" + x + "px, " + y + "px)";
      });
      el.addEventListener("mouseleave", function () {
        el.style.transition = "transform 0.4s cubic-bezier(0.22, 1, 0.36, 1)";
        el.style.transform = "translate(0px, 0px)";
      });
    });
  }

  // ------------------------------------------------------------
  // back to top
  // ------------------------------------------------------------
  var topBtn = document.getElementById("footerTopBtn");
  if (topBtn) {
    topBtn.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: prefersReducedMotion ? "auto" : "smooth" });
    });
  }
})();
