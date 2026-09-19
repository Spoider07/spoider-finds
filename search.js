// ============================================================
// Spoider Finds — Search
// Clip-path "ink reveal" overlay + magnetic trigger icon + soft
// ambient glow backdrop + region-aware Supabase search.
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

  // Category chip targets per region — India pages use the
  // "india-" prefixed filenames already live on the site. Icon
  // markup mirrors the same glyphs used on the Categories section
  // for visual consistency.
  var CATEGORY_ICONS = {
    "desk-setup": '<svg class="search-suggest-chip-icon" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="7" width="24" height="15" rx="1.5"/><path d="M13 26h6M16 22v4"/><path d="M9 12.5h9"/></svg>',
    "fashion-finds": '<svg class="search-suggest-chip-icon" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 6.5a2 2 0 1 1 2 2c-.7.4-2 1-2 2.3v.7"/><path d="M16 11.5 6 18.8a1.9 1.9 0 0 0 1.1 3.5h17.8a1.9 1.9 0 0 0 1.1-3.5l-10-7.3Z"/><path d="M7 22.3h18"/></svg>',
    "accessories": '<svg class="search-suggest-chip-icon" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="9" width="24" height="16" rx="2"/><path d="M4 14.5h24"/><circle cx="21.5" cy="19.5" r="1.3" fill="currentColor" stroke="none"/></svg>',
    "amazon-finds": '<svg class="search-suggest-chip-icon" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5 16 7l11 5.5-11 5.5-11-5.5Z"/><path d="M5 12.5v9.7L16 27.7l11-5.5v-9.7"/><path d="M16 18v9.7"/></svg>'
  };
  var CATEGORY_LINKS = {
    us: [
      { slug: "desk-setup", label: "Desk Setup", href: "desk-setup.html" },
      { slug: "fashion-finds", label: "Fashion Finds", href: "fashion-finds.html" },
      { slug: "accessories", label: "Accessories", href: "accessories.html" },
      { slug: "amazon-finds", label: "Amazon Finds", href: "amazon-finds.html" }
    ],
    india: [
      { slug: "desk-setup", label: "Desk Setup", href: "india-desk-setup.html" },
      { slug: "fashion-finds", label: "Fashion Finds", href: "india-fashion-finds.html" },
      { slug: "accessories", label: "Accessories", href: "india-accessories.html" },
      { slug: "amazon-finds", label: "Amazon Finds", href: "india-amazon-finds.html" }
    ]
  };

  var prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var supportsHoverFine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  var overlay, input, resultsEl, regionTag, closeBtn, toggleBtn;
  var isOpen = false;
  var searchToken = 0;
  var debounceTimer = null;
  var keynavIndex = -1;
  var lastQuery = "";
  var lastResultsData = [];
  var quickViewOpen = false;
  var productCache = {};

  function getNavItems() {
    if (!resultsEl) return [];
    return Array.prototype.slice.call(resultsEl.querySelectorAll(".search-result, .search-suggest-chip"));
  }

  // Gives every result/chip a stable id + option role so the input's
  // aria-activedescendant can point screen readers at whichever one
  // is currently highlighted (keyboard or mouse).
  function prepareNavItems() {
    var items = getNavItems();
    items.forEach(function (el, i) {
      el.id = "search-item-" + i;
      el.setAttribute("role", "option");
    });
    keynavIndex = -1;
    if (input) input.removeAttribute("aria-activedescendant");
  }

  function setKeynav(items) {
    items.forEach(function (el, i) {
      el.classList.toggle("is-keynav", i === keynavIndex);
    });
    var active = items[keynavIndex];
    if (active) {
      active.scrollIntoView({ block: "nearest" });
      if (input) input.setAttribute("aria-activedescendant", active.id);
    } else if (input) {
      input.removeAttribute("aria-activedescendant");
    }
  }

  function moveKeynav(delta) {
    var items = getNavItems();
    if (!items.length) return;
    keynavIndex = Math.max(0, Math.min(keynavIndex + delta, items.length - 1));
    setKeynav(items);
  }

  function activateKeynav() {
    var items = getNavItems();
    if (keynavIndex >= 0 && items[keynavIndex]) {
      items[keynavIndex].click();
    }
  }

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
        '<div class="search-glow" id="searchGlow" aria-hidden="true"></div>' +
        '<div class="search-particles" id="searchParticles" aria-hidden="true"></div>' +
        '<button class="search-close" id="searchClose" type="button" aria-label="Close search">' +
          '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 5l14 14M19 5L5 19"/></svg>' +
        '</button>' +
        '<div class="search-field-wrap" id="searchFieldWrap">' +
          '<div class="search-bar">' +
            '<svg class="search-bar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>' +
            '<input type="text" class="search-input" id="searchInput" placeholder="Search for a find…" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="false" aria-controls="searchResults" aria-autocomplete="list" aria-haspopup="listbox">' +
            '<span class="search-region-tag" id="searchRegionTag"></span>' +
          '</div>' +
        '</div>' +
        '<div class="search-results" id="searchResults" role="listbox" aria-live="polite" aria-label="Search results"></div>' +
      '</div>';
    document.body.appendChild(wrap.firstElementChild);

    overlay = document.getElementById("searchOverlay");
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

  // Sparse, slow-drifting gold particles behind the search bar —
  // random horizontal position, duration and delay per particle so
  // they never read as a mechanical loop. Built fresh on every open
  // and torn down on close (see closeSearch / hardResetOverlay) —
  // otherwise these animations would keep running in the background
  // for the entire browsing session even after search is closed,
  // burning CPU/battery for nothing the user can see.
  function buildParticles() {
    var host = document.getElementById("searchParticles");
    if (!host || prefersReducedMotion) return;
    var count = window.matchMedia("(max-width:600px)").matches ? 9 : 16;
    var markup = "";
    for (var i = 0; i < count; i++) {
      var left = (Math.random() * 100).toFixed(1);
      var duration = (10 + Math.random() * 10).toFixed(1);
      var delay = (Math.random() * 14).toFixed(1);
      var size = (1.6 + Math.random() * 2.4).toFixed(1);
      var drift = (14 + Math.random() * 28).toFixed(0);
      var glow = (size * 2.6).toFixed(1);
      markup +=
        '<span class="search-particle" style="' +
        "left:" + left + "%;" +
        "width:" + size + "px;height:" + size + "px;" +
        "--drift:" + drift + "px;" +
        "box-shadow:0 0 " + glow + "px " + (size * 0.5).toFixed(1) + "px rgba(232,199,102,0.5);" +
        "animation-duration:" + duration + "s;animation-delay:" + delay + "s" +
        '"></span>';
    }
    host.innerHTML = markup;
  }

  function clearParticles() {
    var host = document.getElementById("searchParticles");
    if (host) host.innerHTML = "";
  }

  function setClip(pct, ox, oy) {
    overlay.style.clipPath = "circle(" + pct + "% at " + ox + "px " + oy + "px)";
  }

  function openSearch(ox, oy) {
    buildOverlay();
    isOpen = true;
    document.body.style.overflow = "hidden";
    regionTag.textContent = currentRegion() === "india" ? "🇮🇳 IN" : "🇺🇸 US";
    overlay.style.visibility = "visible";
    input.setAttribute("aria-expanded", "true");
    buildParticles();

    if (prefersReducedMotion) {
      setClip(150, ox, oy);
      overlay.classList.add("is-open");
      renderSuggestions();
      // Auto-focus only on fine-pointer (desktop/mouse) devices. On
      // touch, focusing immediately pops the keyboard mid-render,
      // shifting the chip layout right as the user taps — the exact
      // cause of "first tap misses, second tap works". Touch users
      // get the keyboard only when they deliberately tap the field.
      if (supportsHoverFine) setTimeout(function () { input.focus(); }, 50);
      return;
    }

    setClip(0, ox, oy);
    void overlay.offsetWidth; // force reflow before animating
    overlay.style.transition = "clip-path 0.55s cubic-bezier(0.22,1,0.36,1)";
    requestAnimationFrame(function () { setClip(150, ox, oy); });

    setTimeout(function () {
      overlay.classList.add("is-open");
      renderSuggestions();
      if (supportsHoverFine) input.focus();
    }, 320);
  }

  function closeSearch(ox, oy) {
    if (!isOpen) return;
    isOpen = false;
    keynavIndex = -1;
    quickViewOpen = false;
    overlay.classList.remove("is-open");
    document.body.style.overflow = "";
    input.value = "";
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    resultsEl.innerHTML = "";
    clearParticles();

    // Return focus to whatever opened the search, instead of
    // leaving it stranded on a now-hidden input — standard modal
    // behavior, and needed for the Tab focus-trap below to make sense.
    if (toggleBtn) toggleBtn.focus();

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

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function renderState(msg) {
    keynavIndex = -1;
    if (input) input.removeAttribute("aria-activedescendant");
    resultsEl.innerHTML = '<p class="search-state">' + msg + "</p>";
  }

  function categoryChipsMarkup(label) {
    var links = CATEGORY_LINKS[currentRegion()] || CATEGORY_LINKS.us;
    return (
      '<div class="search-suggest">' +
        '<p class="search-suggest-label">' + label + "</p>" +
        '<div class="search-suggest-chips">' +
          links.map(function (c) {
            var icon = CATEGORY_ICONS[c.slug] || "";
            return '<a href="' + c.href + '" class="search-suggest-chip">' + icon + "<span>" + c.label + "</span></a>";
          }).join("") +
        "</div>" +
      "</div>"
    );
  }

  function animateChipsIn() {
    var chips = resultsEl.querySelectorAll(".search-suggest-chip");
    chips.forEach(function (chip, i) {
      if (prefersReducedMotion) {
        chip.classList.add("is-in");
        return;
      }
      chip.style.animationDelay = (i * 0.06).toFixed(2) + "s";
      requestAnimationFrame(function () { chip.classList.add("is-in"); });
    });
  }

  // Idle state (no query yet) — quick category chips instead of a
  // blank scroll area. Re-rendered on open and whenever the input
  // is cleared back to empty.
  function renderSuggestions() {
    resultsEl.innerHTML = categoryChipsMarkup("Popular categories");
    animateChipsIn();
    prepareNavItems();
  }

  // Same lazy-shimmer pattern used on the main product grids
  // (watchImagesForLoad in index.html / category pages) — keeps
  // the search results visually consistent with the rest of the site.
  function watchResultImages() {
    resultsEl.querySelectorAll(".search-result-image").forEach(function (wrapper) {
      var img = wrapper.querySelector("img");
      if (!img) return;
      if (img.complete && img.naturalWidth > 0) {
        wrapper.classList.add("img-loaded");
      } else {
        img.addEventListener("load", function () { wrapper.classList.add("img-loaded"); });
        img.addEventListener("error", function () { wrapper.classList.add("img-loaded"); });
      }
    });
  }

  function renderResults(data, query) {
    lastResultsData = data;
    lastQuery = query;
    if (!data.length) {
      resultsEl.innerHTML =
        '<p class="search-state">No finds match "' + escapeHtml(query) + '" — try another word.</p>' +
        categoryChipsMarkup("Or browse a category");
      animateChipsIn();
      prepareNavItems();
      return;
    }
    data.forEach(function (p) { productCache[p.id] = p; });

    resultsEl.innerHTML = data
      .map(function (p) {
        var tag = CATEGORY_LABELS[p.category] || p.category;
        return (
          '<a href="' + p.affiliate_link + '" class="search-result" data-product-id="' + p.id + '" target="_blank" rel="sponsored noopener nofollow">' +
            '<span class="search-result-image">' +
              '<img src="' + (p.image_url || "") + '" alt="' + p.title + '" loading="lazy">' +
            "</span>" +
            '<span class="search-result-body">' +
              '<span class="search-result-tag">' + tag + "</span>" +
              '<span class="search-result-title">' + p.title + "</span>" +
            "</span>" +
            '<span class="search-result-arrow">→</span>' +
          "</a>"
        );
      })
      .join("");

    watchResultImages();
    prepareNavItems();

    var rows = resultsEl.querySelectorAll(".search-result");
    rows.forEach(function (row, i) {
      if (prefersReducedMotion) {
        row.classList.add("is-in");
        return;
      }
      // Staggered "burst into place" reveal — see .search-result /
      // .is-in / @keyframes searchResultBurst in style.css.
      row.style.animationDelay = (i * 0.06).toFixed(2) + "s";
      requestAnimationFrame(function () {
        row.classList.add("is-in");
      });
    });
  }

  // =========================================================
  // Quick View — search-only detail panel. Tapping a result no
  // longer sends the person straight to Amazon; it replaces the
  // results list with a detail view (image, description, Spoider
  // Score, related picks) with an explicit "View on Amazon" CTA.
  // Category pages / Featured elsewhere on the site still go
  // straight to Amazon on tap — this pattern is search-only, by
  // design, since search is where someone is still deciding.
  // =========================================================
  function scoreBarRow(label, val) {
    var v = Number(val) || 0;
    var pct = Math.max(0, Math.min(10, v)) * 10;
    return (
      '<div class="spoider-bar-row" style="--fill:' + pct + '%">' +
        '<span class="spoider-bar-label">' + label + "</span>" +
        '<span class="spoider-bar-track"><span class="spoider-bar-fill"></span></span>' +
        '<span class="spoider-bar-val">' + v.toFixed(1) + "</span>" +
      "</div>"
    );
  }

  function buildScoreBlock(p) {
    if (p.spoider_score === null || p.spoider_score === undefined) {
      return (
        '<div class="qv-score qv-score--empty">' +
          '<p class="qv-score-empty-label">Not yet scored</p>' +
          '<p class="qv-score-empty-note">This pick hasn\'t been rated yet — check back soon.</p>' +
        "</div>"
      );
    }
    var note = p.editor_note ? escapeHtml(p.editor_note) : "";
    return (
      '<div class="qv-score">' +
        '<div class="qv-score-head">' +
          '<span class="qv-score-eyebrow">SPOIDER SCORE</span>' +
          '<span class="qv-score-num">' + Number(p.spoider_score).toFixed(1) + "</span>" +
        "</div>" +
        (note ? '<p class="qv-score-note">' + note + "</p>" : "") +
        '<div class="spoider-bars">' +
          scoreBarRow("Design", p.score_design) +
          scoreBarRow("Value", p.score_value) +
          scoreBarRow("Usefulness", p.score_usefulness) +
          scoreBarRow("Aesthetic", p.score_aesthetic) +
        "</div>" +
      "</div>"
    );
  }

  function buildQuickViewMarkup(p) {
    var tag = CATEGORY_LABELS[p.category] || p.category;
    var desc = p.description ? escapeHtml(p.description) : "";
    return (
      '<div class="search-quickview" id="searchQuickview">' +
        '<button type="button" class="qv-back" id="qvBack">' +
          '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>' +
          "Back to results" +
        "</button>" +
        '<div class="qv-body">' +
          '<div class="qv-image"><img src="' + (p.image_url || "") + '" alt="' + escapeHtml(p.title) + '" loading="lazy"></div>' +
          '<div class="qv-info">' +
            '<span class="qv-tag">' + tag + "</span>" +
            '<h3 class="qv-title">' + escapeHtml(p.title) + "</h3>" +
            (desc ? '<p class="qv-desc">' + desc + "</p>" : "") +
            buildScoreBlock(p) +
            '<a href="' + p.affiliate_link + '" class="btn btn-primary qv-amazon-btn" target="_blank" rel="sponsored noopener nofollow">View on Amazon →</a>' +
          "</div>" +
        "</div>" +
        '<div class="qv-related" id="qvRelated"></div>' +
      "</div>"
    );
  }

  function openQuickView(p) {
    if (!p) return;
    quickViewOpen = true;
    keynavIndex = -1;
    if (input) input.removeAttribute("aria-activedescendant");
    resultsEl.innerHTML = buildQuickViewMarkup(p);

    var wrap = document.getElementById("searchQuickview");
    if (prefersReducedMotion) {
      if (wrap) wrap.classList.add("is-in");
    } else {
      requestAnimationFrame(function () { if (wrap) wrap.classList.add("is-in"); });
    }

    var backBtn = document.getElementById("qvBack");
    if (backBtn) backBtn.addEventListener("click", closeQuickViewToList);

    var img = wrap ? wrap.querySelector(".qv-image") : null;
    if (img) {
      var imgEl = img.querySelector("img");
      if (imgEl && imgEl.complete && imgEl.naturalWidth > 0) {
        img.classList.add("img-loaded");
      } else if (imgEl) {
        imgEl.addEventListener("load", function () { img.classList.add("img-loaded"); });
        imgEl.addEventListener("error", function () { img.classList.add("img-loaded"); });
      }
    }

    loadRelated(p);
  }

  function closeQuickViewToList() {
    quickViewOpen = false;
    renderResults(lastResultsData, lastQuery);
  }

  function loadRelated(p) {
    var host = document.getElementById("qvRelated");
    if (!host) return;
    ensureSupabaseLib(function () {
      if (!quickViewOpen) return; // user already navigated away
      var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      sb.from("products")
        .select("*")
        .eq("region", p.region)
        .eq("category", p.category)
        .eq("active", true)
        .neq("id", p.id)
        .order("created_at", { ascending: false })
        .limit(4)
        .then(function (res) {
          if (!quickViewOpen) return; // Quick View was closed while this was in flight
          var items = res.error ? [] : (res.data || []);
          if (!items.length) {
            host.innerHTML = "";
            return;
          }
          items.forEach(function (rp) { productCache[rp.id] = rp; });
          host.innerHTML =
            '<p class="qv-related-label">You might also like</p>' +
            '<div class="qv-related-grid">' +
              items.map(function (rp) {
                return (
                  '<button type="button" class="qv-related-card" data-product-id="' + rp.id + '">' +
                    '<span class="qv-related-image"><img src="' + (rp.image_url || "") + '" alt="' + escapeHtml(rp.title) + '" loading="lazy"></span>' +
                    '<span class="qv-related-title">' + escapeHtml(rp.title) + "</span>" +
                  "</button>"
                );
              }).join("") +
            "</div>";
        });
    });
  }

  function renderError(query) {
    keynavIndex = -1;
    if (input) input.removeAttribute("aria-activedescendant");
    resultsEl.innerHTML =
      '<p class="search-state">Something went wrong — try again.</p>' +
      '<div class="search-retry-wrap"><button type="button" class="search-retry-btn" id="searchRetryBtn">Retry</button></div>';
    var btn = document.getElementById("searchRetryBtn");
    if (btn) {
      btn.addEventListener("click", function () {
        if (lastQuery) runSearch(lastQuery);
      });
    }
  }

  function runSearch(query) {
    var region = currentRegion();
    var myToken = ++searchToken;
    lastQuery = query;
    renderState("Searching…");

    ensureSupabaseLib(function () {
      if (myToken !== searchToken) return;
      var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      sb.from("products")
        .select("id, title, description, image_url, affiliate_link, category, region, spoider_score, editor_note, score_design, score_value, score_usefulness, score_aesthetic")
        .eq("region", region)
        .eq("active", true)
        .or("title.ilike.%" + query + "%,description.ilike.%" + query + "%")
        .limit(20)
        .then(function (res) {
          if (myToken !== searchToken) return;
          if (res.error) {
            renderError(query);
            return;
          }
          renderResults(res.data || [], query);
        });
    });
  }

  function onInput(e) {
    var q = e.target.value.trim();
    clearTimeout(debounceTimer);
    if (q.length < 2) {
      if (q.length === 0) {
        renderSuggestions();
      } else {
        resultsEl.innerHTML = "";
        prepareNavItems();
      }
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
      if (!isOpen) return;
      if (e.key === "Escape") {
        if (quickViewOpen) {
          closeQuickViewToList();
        } else {
          closeSearch();
        }
        return;
      }
      if (e.key === "Tab") {
        trapFocus(e);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        moveKeynav(1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        moveKeynav(-1);
      } else if (e.key === "Enter" && keynavIndex >= 0) {
        e.preventDefault();
        activateKeynav();
      }
    });

    // A result tap opens Quick View instead of leaving the site —
    // only a genuine "open in new tab" gesture (middle-click, or a
    // modifier held down) is left to the browser's default handling
    // of the real affiliate href underneath.
    document.addEventListener("click", function (e) {
      var result = e.target.closest(".search-result");
      if (result && resultsEl && resultsEl.contains(result)) {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        openQuickView(productCache[result.dataset.productId]);
        return;
      }
      var relatedCard = e.target.closest(".qv-related-card");
      if (relatedCard && resultsEl && resultsEl.contains(relatedCard)) {
        openQuickView(productCache[relatedCard.dataset.productId]);
      }
    });

    // Category chips and the Quick View's "View on Amazon" button are
    // the only things left that actually navigate away from the page
    // without the overlay being closed first — so if the browser
    // bfcaches this page (or the back button restores it), the
    // snapshot would otherwise be frozen mid-open (body scroll
    // locked, overlay expanded), which is what looked "broken" on
    // return. Force an instant, unanimated close the moment either
    // is tapped, and again on pagehide as a second safety net.
    document.addEventListener(
      "click",
      function (e) {
        if (e.target.closest(".search-suggest-chip, .qv-amazon-btn")) {
          hardResetOverlay();
        }
      },
      true
    );
    window.addEventListener("pagehide", hardResetOverlay);

    document.addEventListener("pointermove", function (e) {
      if (!isOpen || e.pointerType !== "mouse" || !resultsEl) return;
      var item = e.target.closest(".search-result, .search-suggest-chip");
      if (!item || !resultsEl.contains(item)) return;
      var items = getNavItems();
      var idx = items.indexOf(item);
      if (idx !== -1 && idx !== keynavIndex) {
        keynavIndex = idx;
        setKeynav(items);
      }
    });
  }

  // Keeps Tab / Shift+Tab cycling inside the overlay while it's
  // open, instead of letting focus escape onto the page behind it —
  // otherwise a keyboard user could Tab straight past the close
  // button into invisible (clip-path-hidden) page content.
  function trapFocus(e) {
    if (!overlay) return;
    var focusable = overlay.querySelectorAll(
      'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable.length) return;
    var list = Array.prototype.slice.call(focusable);
    var first = list[0];
    var last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function hardResetOverlay() {
    isOpen = false;
    quickViewOpen = false;
    document.body.style.overflow = "";
    clearParticles();
    if (!overlay) return;
    overlay.classList.remove("is-open");
    overlay.style.transition = "none";
    overlay.style.clipPath = "circle(0% at 50% 50%)";
    overlay.style.visibility = "hidden";
  }

  document.addEventListener("DOMContentLoaded", bindTrigger);
})();
