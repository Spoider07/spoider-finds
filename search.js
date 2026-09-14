// ============================================================
// Spoider Finds — Search
// Clip-path "ink reveal" overlay + magnetic trigger icon + faint
// thread-web backdrop + region-aware Supabase search.
//
// Region is read from window.location.pathname AT OPEN TIME (not
// bound once) — so it stays correct after AJAX page transitions
// swap the URL via pushState. Any path containing "india" searches
// the India catalog; everything else searches US.
//
// Bound once globally (nav lives outside #page-wrap and is never
// swapped), so no per-page re-init needed.
// ============================================================
(function () {
  "use strict";

  var SUPABASE_URL = "https://gqnwinkddckytrfpnhng.supabase.co";
  var SUPABASE_KEY = "sb_publishable_NYb3HMwKyHL1YxlOIWtcQg_NGJwDwmQ";
  var CATEGORY_LABELS = {
    "desk-setup": "Desk Setup",
    "fashion-finds": "Fashion Finds",
    "accessories": "Accessories",
    "amazon-finds": "Amazon Finds"
  };

  var prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var supportsHoverFine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  var overlay, webSvg, input, resultsEl, regionTag, closeBtn, toggleBtn;
  var isOpen = false;
  var searchToken = 0;
  var debounceTimer = null;

  function currentRegion() {
    return window.location.pathname.indexOf("india") !== -1 ? "india" : "us";
  }

  function ensureSupabaseLib(callback) {
    if (window.supabase && typeof window.supabase.createClient === "function") {
      callback();
      return;
    }
    var existing = document.querySelector("script[data-supabase-lib]");
    if (existing) {
      existing.addEventListener("load", callback, { once: true });
      return;
    }
    var s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
    s.setAttribute("data-supabase-lib", "true");
    s.onload = callback;
    document.head.appendChild(s);
  }

  function buildOverlay() {
    if (document.getElementById("searchOverlay")) return;

    var wrap = document.createElement("div");
    wrap.innerHTML =
      '<div class="search-overlay" id="searchOverlay" role="dialog" aria-modal="true" aria-label="Search">' +
        '<svg class="search-web" id="searchWeb" aria-hidden="true"></svg>' +
        '<button class="search-close" id="searchClose" type="button" aria-label="Close search">' +
          '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 5l14 14M19 5L5 19"/></svg>' +
        '</button>' +
        '<div class="search-field-wrap" id="searchFieldWrap">' +
          '<span class="search-region-tag" id="searchRegionTag"></span>' +
          '<input type="text" class="search-input" id="searchInput" placeholder="Search for a find…" autocomplete="off" spellcheck="false">' +
        '</div>' +
        '<div class="search-results" id="searchResults"></div>' +
      '</div>';
    document.body.appendChild(wrap.firstElementChild);

    overlay = document.getElementById("searchOverlay");
    webSvg = document.getElementById("searchWeb");
    input = document.getElementById("searchInput");
    resultsEl = document.getElementById("searchResults");
    regionTag = document.getElementById("searchRegionTag");
    closeBtn = document.getElementById("searchClose");

    closeBtn.addEventListener("click", function () { closeSearch(); });
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) closeSearch();
    });
    input.addEventListener("input", onInput);
  }

  function buildWeb() {
    if (!webSvg) return;
    var w = window.innerWidth, h = window.innerHeight;
    webSvg.setAttribute("viewBox", "0 0 " + w + " " + h);
    var cx = w / 2, cy = h * 0.3;
    var count = window.matchMedia("(max-width:600px)").matches ? 9 : 14;
    var markup = "";
    for (var i = 0; i < count; i++) {
      var angle = (Math.PI * 2 * i) / count;
      var len = Math.max(w, h) * 0.9;
      var x2 = cx + Math.cos(angle) * len;
      var y2 = cy + Math.sin(angle) * len;
      markup += '<line x1="' + cx + '" y1="' + cy + '" x2="' + x2 + '" y2="' + y2 + '" style="animation-delay:' + (i * 0.03).toFixed(2) + 's"></line>';
    }
    for (var r = 1; r <= 4; r++) {
      markup += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (r * Math.max(w, h) * 0.13) + '" fill="none" style="stroke:var(--gold);stroke-width:1;opacity:.12"></circle>';
    }
    webSvg.innerHTML = markup;
  }

  function setClip(pct, ox, oy) {
    overlay.style.clipPath = "circle(" + pct + "% at " + ox + "px " + oy + "px)";
  }

  function openSearch(ox, oy) {
    buildOverlay();
    buildWeb();
    isOpen = true;
    document.body.style.overflow = "hidden";
    regionTag.textContent = currentRegion() === "india" ? "INDIA EDITION" : "US EDITION";
    overlay.style.visibility = "visible";

    if (prefersReducedMotion) {
      setClip(150, ox, oy);
      overlay.classList.add("is-open");
      setTimeout(function () { input.focus(); }, 50);
      return;
    }

    setClip(0, ox, oy);
    void overlay.offsetWidth; // force reflow before animating
    overlay.style.transition = "clip-path 0.55s cubic-bezier(0.22,1,0.36,1)";
    requestAnimationFrame(function () { setClip(150, ox, oy); });

    setTimeout(function () {
      overlay.classList.add("is-open");
      input.focus();
    }, 320);
  }

  function closeSearch(ox, oy) {
    if (!isOpen) return;
    isOpen = false;
    overlay.classList.remove("is-open");
    document.body.style.overflow = "";
    input.value = "";
    resultsEl.innerHTML = "";

    if (typeof ox !== "number") {
      var rect = toggleBtn ? toggleBtn.getBoundingClientRect() : null;
      ox = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
      oy = rect ? rect.top + rect.height / 2 : 40;
    }

    if (prefersReducedMotion) {
      overlay.style.visibility = "hidden";
      return;
    }

    overlay.style.transition = "clip-path 0.45s cubic-bezier(0.55,0,0.35,1)";
    setClip(0, ox, oy);
    setTimeout(function () {
      overlay.style.visibility = "hidden";
    }, 460);
  }

  function renderState(msg) {
    resultsEl.innerHTML = '<p class="search-state">' + msg + "</p>";
  }

  function renderResults(data) {
    if (!data.length) {
      renderState("No finds match that — try another word.");
      return;
    }
    resultsEl.innerHTML = data
      .map(function (p) {
        var tag = CATEGORY_LABELS[p.category] || p.category;
        return (
          '<a href="' + p.affiliate_link + '" class="search-result" target="_blank" rel="sponsored noopener nofollow" style="opacity:0;transform:translateY(10px)">' +
            '<span class="search-result-dot"></span>' +
            '<span class="search-result-body">' +
              '<span class="search-result-tag">' + tag + "</span>" +
              '<span class="search-result-title">' + p.title + "</span>" +
            "</span>" +
            '<span class="search-result-arrow">→</span>' +
          "</a>"
        );
      })
      .join("");

    var rows = resultsEl.querySelectorAll(".search-result");
    rows.forEach(function (row, i) {
      if (prefersReducedMotion) {
        row.style.opacity = "1";
        row.style.transform = "none";
        return;
      }
      row.style.transition = "opacity 0.45s var(--ease), transform 0.45s var(--ease)";
      row.style.transitionDelay = (i * 0.05).toFixed(2) + "s";
      requestAnimationFrame(function () {
        row.style.opacity = "1";
        row.style.transform = "translateY(0)";
      });
    });
  }

  function runSearch(query) {
    var region = currentRegion();
    var myToken = ++searchToken;
    renderState("Searching…");

    ensureSupabaseLib(function () {
      if (myToken !== searchToken) return;
      var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      sb.from("products")
        .select("id, title, description, image_url, affiliate_link, category, region")
        .eq("region", region)
        .eq("active", true)
        .or("title.ilike.%" + query + "%,description.ilike.%" + query + "%")
        .limit(20)
        .then(function (res) {
          if (myToken !== searchToken) return;
          if (res.error) {
            renderState("Something went wrong — try again.");
            return;
          }
          renderResults(res.data || []);
        });
    });
  }

  function onInput(e) {
    var q = e.target.value.trim();
    clearTimeout(debounceTimer);
    if (q.length < 2) {
      resultsEl.innerHTML = "";
      return;
    }
    debounceTimer = setTimeout(function () { runSearch(q); }, 300);
  }

  function bindMagnetic(btn) {
    if (!supportsHoverFine || prefersReducedMotion) return;
    var strength = 0.35, maxDist = 10;
    btn.addEventListener("mousemove", function (e) {
      var rect = btn.getBoundingClientRect();
      var relX = e.clientX - (rect.left + rect.width / 2);
      var relY = e.clientY - (rect.top + rect.height / 2);
      var x = Math.max(-maxDist, Math.min(maxDist, relX * strength));
      var y = Math.max(-maxDist, Math.min(maxDist, relY * strength));
      btn.style.transition = "transform 0.08s linear";
      btn.style.transform = "translate(" + x + "px," + y + "px)";
    });
    btn.addEventListener("mouseleave", function () {
      btn.style.transition = "transform 0.4s cubic-bezier(0.22,1,0.36,1)";
      btn.style.transform = "translate(0,0)";
    });
  }

  function bindTrigger() {
    document.addEventListener("click", function (e) {
      var btn = e.target.closest(".search-toggle");
      if (!btn) return;
      toggleBtn = btn;
      var rect = btn.getBoundingClientRect();
      openSearch(rect.left + rect.width / 2, rect.top + rect.height / 2);
    });

    document.querySelectorAll(".search-toggle").forEach(bindMagnetic);

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && isOpen) closeSearch();
    });

    window.addEventListener("resize", function () {
      if (isOpen) buildWeb();
    });
  }

  document.addEventListener("DOMContentLoaded", bindTrigger);
})();
