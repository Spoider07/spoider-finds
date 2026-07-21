// ============================================================
// Spoider Finds — main script
// Handles: mobile nav toggle, scroll-driven "thread" line,
// and small footer utilities.
// ============================================================

document.addEventListener("DOMContentLoaded", () => {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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

    // Close mobile menu after tapping a link
    navMobile.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        navMobile.classList.remove("open");
        navToggle.classList.remove("active");
        navToggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  // ---- Hero stat count-up ----
  const statNums = document.querySelectorAll(".stat-num[data-count-to]");
  if (statNums.length && !prefersReducedMotion) {
    statNums.forEach((el) => {
      const target = parseInt(el.getAttribute("data-count-to"), 10);
      const suffix = el.getAttribute("data-suffix") || "";
      const duration = 1100;
      const startDelay = 650; // let hero-enter settle first
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

  // ---- Scroll-reveal for sections and cards ----
  const revealEls = document.querySelectorAll(".reveal");

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
    // No IntersectionObserver support (or reduced motion) — just show everything
    revealEls.forEach((el) => el.classList.add("is-visible"));
  }

  // ---- Scroll-driven "thread" signature element ----
  // The gold line's dash length grows with scroll progress,
  // visually "drawing" a thread down the page.
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
  }
});
