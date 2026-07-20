// ============================================================
// Spoider Finds — main script
// Handles: mobile nav toggle, scroll-driven "thread" line,
// and small footer utilities.
// ============================================================

document.addEventListener("DOMContentLoaded", () => {
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

  // ---- Scroll-driven "thread" signature element ----
  // The gold line's dash length grows with scroll progress,
  // visually "drawing" a thread down the page.
  const threadPath = document.getElementById("threadPath");
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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
