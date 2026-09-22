// ============================================================
// Spoider Finds — cinematic footer
// One-shot heading focus-in (same cinematic blur-to-sharp move
// as .crazy-title elsewhere), a slow scroll-linked parallax on
// the giant ghost wordmark, and a light magnetic hover on the
// pill nav + back-to-top button (same easing/feel as the .btn
// magnetic handler in script.js, scoped to the footer here).
//
// <footer> lives outside #page-wrap and is never swapped by
// transitions.js, so this binds exactly once per real page load.
// ============================================================
(function () {
  var footer = document.getElementById("footerWeb");
  if (!footer) return;

  var prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var supportsHoverFine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  // ---- cinematic heading focus-in (one-shot) ----
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

  // ---- giant ghost wordmark: slow scroll parallax ----
  var bgText = footer.querySelector(".footer-bg-text");
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
      var shift = (progress - 0.5) * 26;
      bgText.style.transform = "translateX(-50%) translateY(" + shift.toFixed(1) + "px)";
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

  // ---- magnetic hover: pills + back-to-top (fine pointer only) ----
  if (supportsHoverFine && !prefersReducedMotion) {
    var magnets = footer.querySelectorAll(".footer-pill, .footer-top-btn");
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

  // ---- back to top ----
  var topBtn = document.getElementById("footerTopBtn");
  if (topBtn) {
    topBtn.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: prefersReducedMotion ? "auto" : "smooth" });
    });
  }
})();
