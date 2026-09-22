// ============================================================
// Spoider Finds — footer web
// One-shot spider-descent entrance (threads + rings + mark draw
// in via IntersectionObserver — same pattern as .reveal/
// .split-reveal elsewhere) plus a light scroll-linked parallax
// between the particle layer and the web/spider layer for depth.
//
// <footer> lives outside #page-wrap and is never swapped by
// transitions.js, so this binds exactly once per real page load.
// ============================================================
(function () {
  var stage = document.getElementById("footerWebStage");
  if (!stage) return;

  var prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var particlesHost = document.getElementById("footerWebParticles");

  // ---- ambient gold dust (sparse, slow) ----
  if (particlesHost && !prefersReducedMotion) {
    var COUNT = window.matchMedia("(max-width: 700px)").matches ? 6 : 10;
    for (var i = 0; i < COUNT; i++) {
      var p = document.createElement("span");
      p.className = "footer-particle";
      var size = 2 + Math.random() * 2.4;
      p.style.width = size + "px";
      p.style.height = size + "px";
      p.style.left = 4 + Math.random() * 92 + "%";
      p.style.top = 10 + Math.random() * 70 + "%";
      p.style.setProperty("--fdx", (Math.random() * 24 - 12).toFixed(1) + "px");
      p.style.animationDuration = 7 + Math.random() * 6 + "s";
      p.style.animationDelay = (Math.random() * 6).toFixed(2) + "s";
      particlesHost.appendChild(p);
    }
  }

  // ---- one-shot entrance ----
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            stage.classList.add("is-in");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -10% 0px" }
    );
    io.observe(stage);
  } else {
    stage.classList.add("is-in");
  }

  // ---- layered depth parallax ----
  if (!prefersReducedMotion) {
    var webSvg = stage.querySelector(".footer-web-svg");
    var ticking = false;

    function clamp01(v) {
      return Math.max(0, Math.min(1, v));
    }

    function update() {
      ticking = false;
      var rect = stage.getBoundingClientRect();
      var vh = window.innerHeight;
      var progress = clamp01((vh - rect.top) / (vh + rect.height));
      var depthShift = (progress - 0.5) * 18; // particles: slower, drifty
      var webShift = (progress - 0.5) * 6; // web/spider: subtler, stays anchored

      if (particlesHost) particlesHost.style.transform = "translateY(" + depthShift.toFixed(1) + "px)";
      if (webSvg) webSvg.style.transform = "translateY(" + webShift.toFixed(1) + "px)";
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
})();
