// ============================================================
// Spoider Finds — main script
// Handles: mobile nav toggle, scroll-driven "thread" line,
// footer utilities, reveal/count-up/snap animations, and the
// unified split-reveal typography system.
//
// Refactored so all per-page setup lives in initPage(), which
// runs on first load AND after every AJAX page transition
// (see transitions.js). One-time, page-independent behaviors
// (cursor trail, first-load intro overlay) live in bindGlobalOnce()
// and only ever run once per real browser session.
// ============================================================

(function () {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const supportsHoverFine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  let globalBound = false;
  let pageCleanupFns = [];

  function bindGlobalOnce() {
    if (globalBound) return;
    globalBound = true;

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
  }

  // ============================================================
  // Split-reveal: unified word-mask typography system.
  //
  // Wraps each word of a heading in an overflow-hidden mask box,
  // with the word sliding up from below on reveal. Inline
  // formatting elements (e.g. <em>, a colored <span>) are kept
  // intact as a single masked unit — their tag, class, and style
  // are preserved untouched, just relocated inside the mask.
  //
  // Trigger modes:
  //   data-trigger="load"  → reveals once, shortly after page load
  //   (default)             → reveals once, on scroll into view
  //
  // Whole-word transform animation only (no per-character DOM,
  // no opacity flicker) — safe and smooth on low-power devices.
  // ============================================================
  function splitIntoWordMasks(el) {
    if (el.dataset.splitDone === "1") return;
    el.dataset.splitDone = "1";

    // Screen readers get the plain original text via aria-label;
    // the generated mask markup is hidden from assistive tech.
    el.setAttribute("aria-label", el.textContent.trim());

    const originalNodes = Array.prototype.slice.call(el.childNodes);
    el.innerHTML = "";

    let wordIndex = 0;
    const STAGGER = 0.055; // seconds between each word's reveal

    function appendMaskedUnit(contentNode) {
      const mask = document.createElement("span");
      mask.className = "word-mask";
      mask.setAttribute("aria-hidden", "true");
      const inner = document.createElement("span");
      inner.className = "word-inner";
      inner.style.transitionDelay = (wordIndex * STAGGER).toFixed(3) + "s";
      inner.appendChild(contentNode);
      mask.appendChild(inner);
      el.appendChild(mask);
      wordIndex++;
    }

    originalNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const parts = node.textContent.split(/(\s+)/).filter((p) => p.length > 0);
        parts.forEach((part) => {
          if (/^\s+$/.test(part)) {
            el.appendChild(document.createTextNode(part));
          } else {
            appendMaskedUnit(document.createTextNode(part));
          }
        });
      } else if (node.nodeName === "BR") {
        el.appendChild(node.cloneNode(true));
      } else {
        // element node (e.g. <em>, <span class="gold-text">) — kept
        // whole and untouched, just moved inside the mask wrapper
        appendMaskedUnit(node);
      }
    });
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
        { threshold: 0.35, rootMargin: "0px 0px -10% 0px" }
      );
      scrollEls.forEach((el) => splitObserver.observe(el));
    } else {
      scrollEls.forEach((el) => el.classList.add("is-visible"));
    }
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
    const statNums = document.querySelectorAll(".stat-num[data-count-to]");
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
