// ============================================================
// Spoider Finds — main script
// Handles: mobile nav toggle, scroll-driven "thread" line,
// footer utilities, reveal/count-up/snap animations, the
// unified split-reveal typography system, the hero-web-to-
// category-grid scroll transition, the user-controlled
// light/dark theme toggle (sweep transition + persistence),
// the Spoider Score hold/hover-to-reveal panel, anonymous
// affiliate click logging to Supabase (public.clicks), and
// the site-wide wishlist heart on every product card
// (public.wishlist).
//
// Refactored so all per-page setup lives in initPage(), which
// runs on first load AND after every AJAX page transition
// (see transitions.js). One-time, page-independent behaviors
// (cursor trail, first-load intro overlay, global tap-spark,
// theme toggle binding, mobile nav, Spoider Score panel toggling,
// affiliate click tracking, wishlist hearts) live in
// bindGlobalOnce() and only ever run once per real browser
// session, bound via event delegation on document — so they
// survive every AJAX swap without rebinding to newly injected
// product cards.
//
// FIXES in this version:
//   1) Hamburger menu: the nav lives OUTSIDE #page-wrap, so it is
//      never replaced on an AJAX swap — but initPage() runs again
//      after every swap and used to add ANOTHER click listener to
//      the same #navToggle each time. After one navigation the
//      button had two listeners that toggled the menu open and
//      immediately shut again (an even number of toggles = nothing
//      happens), so the hamburger looked dead. The menu is now
//      handled once, by delegation, in bindMobileNav().
//   2) Spoider Score hold-to-reveal: if the click that normally
//      follows a completed hold never fired (long-press on a link
//      often doesn't), the "swallow next click" flag stayed set and
//      ate the person's NEXT unrelated tap anywhere on the site.
//      The flag now expires on its own after 500ms.
//   3) Wishlist hearts no longer create a Supabase client of their
//      own. They reuse the single client owned by auth.js
//      (window.SpoiderAuth.client). Two clients on the same
//      storage key both auto-refresh the same rotating refresh
//      token, which can randomly sign a visitor out. Signed-out
//      taps on a heart now open the same "Join the thread" modal
//      as the header instead of jumping straight to Google, and
//      hearts clear themselves if the person signs out.
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
  // NOTE: this listener is scoped to `.theme-toggle` specifically —
  // the header's profile icon uses its own separate `.profile-toggle`
  // class (see index.html / style.css) precisely so it is never
  // caught by this click handler and never triggers a theme sweep.
  //
  // Transition, layered effects:
  //   1) Shockwave ring from the tapped button.
  //   2) Sweep — an expanding circle in the DESTINATION theme's
  //      --bg-elevated color fully covers the viewport, data-theme
  //      flips underneath it, then it fades away.
  //   3) Icon morph — sun/moon glyph rotates + blurs out, then in.
  //   4) Depth-pulse — a brief whole-page blur timed to the flip.
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
  // Mobile nav (hamburger) — bound ONCE, by delegation.
  //
  // The header is persistent (outside #page-wrap), so per-page
  // binding in initPage() stacked a new listener on every AJAX
  // navigation — see FIX 1 at the top of this file. Delegation
  // also means links injected into the menu later (the account
  // block from auth.js) close the menu on tap automatically, and
  // tapping outside the header while it's open closes it too.
  // ============================================================
  function bindMobileNav() {
    function setOpen(open) {
      const navToggle = document.getElementById("navToggle");
      const navMobile = document.getElementById("navMobile");
      if (!navToggle || !navMobile) return;
      navMobile.classList.toggle("open", open);
      navToggle.classList.toggle("active", open);
      navToggle.setAttribute("aria-expanded", open ? "true" : "false");
    }

    document.addEventListener("click", (e) => {
      const navMobile = document.getElementById("navMobile");
      if (!navMobile) return;
      const isOpen = navMobile.classList.contains("open");

      if (e.target.closest("#navToggle")) {
        setOpen(!isOpen);
        return;
      }
      if (!isOpen) return;
      if (e.target.closest("#navMobile a")) {
        setOpen(false);
        return;
      }
      if (!e.target.closest(".nav")) setOpen(false);
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") setOpen(false);
    });
  }

  // ============================================================
  // Spoider Score panel: hold-to-reveal (mobile) / hover-to-reveal
  // (desktop), delegated on document.
  //
  // Desktop (mouse pointers): the panel opens on pointerover of a
  // .product-card and closes on pointerout — using pointerover/
  // pointerout rather than pointerenter/pointerleave because only
  // the "over/out" pair bubbles, which is what lets a single
  // document-level listener catch every card (including ones
  // injected later by a Supabase loader) without per-card binding.
  // relatedTarget is checked so moving between two elements INSIDE
  // the same card doesn't fire a spurious close/reopen.
  //
  // Mobile / touch: a genuine hold (>~260ms, without more than a
  // few px of finger movement — movement means the user is
  // scrolling, not holding) reveals the panel. Releasing after a
  // successful hold closes the panel again after a short linger and
  // swallows the click that would otherwise follow, so the card's
  // affiliate link isn't triggered by the hold itself. A normal
  // quick tap is left completely alone and navigates as before.
  // ============================================================
  function bindSpoiderScorePanels() {
    const HOLD_MS = 260;
    const MOVE_CANCEL_PX = 10;
    const SUPPRESS_WINDOW_MS = 500;

    let holdTimer = null;
    let holdCard = null;
    let startX = 0;
    let startY = 0;
    let suppressNextClick = false;
    let suppressTimer = null;

    function activate(card) {
      document.querySelectorAll(".product-card.is-active").forEach((c) => {
        if (c !== card) c.classList.remove("is-active");
      });
      card.classList.add("is-active");
    }

    function deactivate(card) {
      card.classList.remove("is-active");
    }

    function clearHold() {
      clearTimeout(holdTimer);
      holdTimer = null;
      holdCard = null;
    }

    // ---- Desktop hover ----
    document.addEventListener("pointerover", (e) => {
      if (e.pointerType !== "mouse") return;
      const card = e.target.closest(".product-card");
      if (!card || !card.querySelector(".spoider-panel")) return;
      if (card.contains(e.relatedTarget)) return; // moving within the same card, not a real entry
      activate(card);
    });

    document.addEventListener("pointerout", (e) => {
      if (e.pointerType !== "mouse") return;
      const card = e.target.closest(".product-card");
      if (!card || !card.querySelector(".spoider-panel")) return;
      if (card.contains(e.relatedTarget)) return; // moving within the same card, not a real exit
      deactivate(card);
    });

    // ---- Mobile / touch hold ----
    document.addEventListener(
      "pointerdown",
      (e) => {
        if (e.pointerType === "mouse") return;
        const card = e.target.closest(".product-card");
        if (!card || !card.querySelector(".spoider-panel")) return;
        startX = e.clientX;
        startY = e.clientY;
        holdCard = card;
        holdTimer = setTimeout(() => {
          if (!holdCard) return;
          activate(holdCard);
          if (navigator.vibrate) navigator.vibrate(6);
        }, HOLD_MS);
      },
      { passive: true }
    );

    document.addEventListener(
      "pointermove",
      (e) => {
        if (!holdCard) return;
        if (Math.hypot(e.clientX - startX, e.clientY - startY) > MOVE_CANCEL_PX) clearHold();
      },
      { passive: true }
    );

    document.addEventListener(
      "pointerup",
      (e) => {
        if (!holdCard) return;
        const card = holdCard;
        const wasRevealed = card.classList.contains("is-active");
        clearHold();
        if (wasRevealed) {
          suppressNextClick = true;
          // If the browser never fires the follow-up click (common after a
          // long-press), don't leave the flag armed — it would swallow the
          // person's next, unrelated tap.
          clearTimeout(suppressTimer);
          suppressTimer = setTimeout(() => {
            suppressNextClick = false;
          }, SUPPRESS_WINDOW_MS);
          setTimeout(() => deactivate(card), 240);
        }
      },
      { passive: true }
    );

    document.addEventListener("pointercancel", clearHold, { passive: true });

    // Swallow the tap-navigation click that follows a completed hold
    document.addEventListener(
      "click",
      (e) => {
        if (suppressNextClick) {
          suppressNextClick = false;
          clearTimeout(suppressTimer);
          e.preventDefault();
          e.stopPropagation();
        }
      },
      true
    );

    // Tapping fully outside any card (touch) closes a lingering open panel
    document.addEventListener(
      "pointerdown",
      (e) => {
        if (e.pointerType === "mouse") return;
        if (!e.target.closest(".product-card")) {
          document.querySelectorAll(".product-card.is-active").forEach(deactivate);
        }
      },
      { passive: true }
    );
  }

  // ============================================================
  // Affiliate click tracking (anonymous, fire-and-forget).
  //
  // Logs one row into Supabase's public.clicks table every time a
  // visitor taps/clicks an <a class="product-card">. Bound once on
  // document via delegation, so it automatically covers every
  // category page and every card injected later by any Supabase
  // loader, including after an AJAX page transition.
  //
  // Design notes:
  //   - Plain fetch() to Supabase's REST endpoint with keepalive:true,
  //     so the request still completes even if the browser navigates
  //     away right after the click. Doesn't depend on supabase-js.
  //   - Only the publishable key is sent. "Prefer: return=minimal" is
  //     required: the clicks table has an INSERT-only RLS policy for
  //     anon, so asking Supabase to return the row would be rejected.
  //   - Every failure is swallowed. Tracking must NEVER slow down,
  //     block, or break the redirect to Amazon.
  //   - Clicks on the "Why this?" trigger, the panel close button,
  //     and the wishlist heart are ignored, and so is the click that
  //     follows a completed Spoider Score hold.
  //   - A 1.5s per-card debounce avoids double-logging a double-tap.
  //   - Region is inferred from the page path: any page whose path
  //     contains "india" logs 'in', everything else logs 'us'.
  // ============================================================
  function bindAffiliateClickTracking() {
    const CLICKS_URL = "https://gqnwinkddckytrfpnhng.supabase.co/rest/v1/clicks";
    const SUPABASE_KEY = "sb_publishable_NYb3HMwKyHL1YxlOIWtcQg_NGJwDwmQ";
    const DEBOUNCE_MS = 1500;
    const lastLogged = new WeakMap();

    document.addEventListener("click", (e) => {
      try {
        if (e.defaultPrevented) return;
        if (e.target.closest(".spoider-score-trigger, .spoider-panel-close, .wishlist-heart")) return;

        const card = e.target.closest("a.product-card");
        if (!card) return;

        const now = Date.now();
        if (now - (lastLogged.get(card) || 0) < DEBOUNCE_MS) return;
        lastLogged.set(card, now);

        const heading = card.querySelector("h3");
        const title = heading ? heading.textContent.trim().slice(0, 200) : "";
        const path = window.location.pathname || "";
        const productId = card.dataset && card.dataset.productId ? String(card.dataset.productId).slice(0, 64) : null;

        fetch(CLICKS_URL, {
          method: "POST",
          keepalive: true,
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_KEY,
            Prefer: "return=minimal",
          },
          body: JSON.stringify({
            product_id: productId,
            product_title: title || null,
            region: /india/i.test(path) ? "in" : "us",
            page: path.slice(0, 200),
          }),
        }).catch(() => {});
      } catch (err) {
        /* tracking must never interfere with navigation */
      }
    });
  }

  // ============================================================
  // Wishlist heart — bottom-right of every product card, site-wide.
  //
  // Bound once on document via delegation, so any card injected by
  // any page's Supabase loader — including after an AJAX
  // transition — works immediately with no per-page rebinding. The
  // heart's product id comes from data-heart-id on the button.
  //
  // Behavior:
  //   - Signed out: tapping the heart opens the site's "Join the
  //     thread" sign-in modal (auth.js). The tap itself isn't
  //     remembered — the person just taps the heart again once
  //     they're back and signed in.
  //   - Signed in: optimistic toggle — the heart fills/empties and
  //     plays its pop + gold-ring animation immediately, then the
  //     row is inserted into (or deleted from) public.wishlist. If
  //     that call fails, the heart's visual state is reverted.
  //   - On every real page load and after every AJAX transition,
  //     once the page's loader has rendered its cards, it calls
  //     window.syncWishlistHearts() so hearts for products already
  //     on the signed-in user's wishlist start out filled. If the
  //     person signs out, every heart empties again.
  //   - Uses the ONE Supabase client owned by auth.js
  //     (window.SpoiderAuth.client). See FIX 3 at the top of this
  //     file for why a second client is a bad idea.
  // ============================================================
  function bindWishlistHearts() {
    // Waits (up to ~6s) for auth.js to finish creating its client.
    function getAuthClient() {
      return new Promise((resolve) => {
        let tries = 0;
        (function check() {
          if (window.SpoiderAuth && window.SpoiderAuth.client) {
            resolve(window.SpoiderAuth.client);
            return;
          }
          if (++tries > 60) {
            resolve(null);
            return;
          }
          setTimeout(check, 100);
        })();
      });
    }

    async function syncHeartsOnPage() {
      try {
        if (!document.querySelector(".wishlist-heart")) return;
        const sb = await getAuthClient();
        if (!sb) return;
        const {
          data: { session },
        } = await sb.auth.getSession();

        // re-query AFTER the awaits — the page may have been swapped meanwhile
        const hearts = document.querySelectorAll(".wishlist-heart");
        if (!hearts.length) return;

        if (!session) {
          hearts.forEach((h) => h.classList.remove("is-wishlisted"));
          return;
        }

        const ids = Array.from(hearts)
          .map((h) => h.dataset.heartId)
          .filter(Boolean);
        if (!ids.length) return;

        const res = await sb.from("wishlist").select("product_id").eq("user_id", session.user.id).in("product_id", ids);
        const owned = new Set((res.data || []).map((r) => String(r.product_id)));
        document.querySelectorAll(".wishlist-heart").forEach((h) => {
          h.classList.toggle("is-wishlisted", owned.has(String(h.dataset.heartId)));
        });
      } catch (err) {
        /* sync is best-effort — hearts just stay as they are if this fails */
      }
    }

    document.addEventListener("click", (e) => {
      const heart = e.target.closest(".wishlist-heart");
      if (!heart) return;
      e.preventDefault();
      e.stopPropagation();
      if (heart.dataset.busy === "1") return;
      heart.dataset.busy = "1";

      (async () => {
        try {
          const sb = await getAuthClient();
          if (!sb) return;
          const {
            data: { session },
          } = await sb.auth.getSession();

          if (!session) {
            if (window.SpoiderAuth && typeof window.SpoiderAuth.openModal === "function") {
              window.SpoiderAuth.openModal();
            }
            return;
          }

          const productId = heart.dataset.heartId;
          const wasWishlisted = heart.classList.contains("is-wishlisted");

          heart.classList.toggle("is-wishlisted", !wasWishlisted);
          heart.classList.remove("is-animating");
          void heart.offsetWidth; // restart the pop/burst animation even on rapid re-taps
          heart.classList.add("is-animating");

          try {
            if (wasWishlisted) {
              const del = await sb.from("wishlist").delete().eq("user_id", session.user.id).eq("product_id", productId);
              if (del.error) throw del.error;
            } else {
              const up = await sb
                .from("wishlist")
                .upsert({ user_id: session.user.id, product_id: productId }, { onConflict: "user_id,product_id" });
              if (up.error) throw up.error;
            }
          } catch (err) {
            heart.classList.toggle("is-wishlisted", wasWishlisted); // revert on failure
          }
        } catch (err) {
          /* never let a wishlist failure block the rest of the page */
        } finally {
          heart.dataset.busy = "0";
        }
      })();
    });

    window.syncWishlistHearts = syncHeartsOnPage;

    // keep hearts in step with sign-in / sign-out done from the header
    (function hookAuth(tries) {
      if (window.SpoiderAuth && typeof window.SpoiderAuth.onChange === "function") {
        window.SpoiderAuth.onChange(() => syncHeartsOnPage());
        return;
      }
      if (tries < 60) setTimeout(() => hookAuth(tries + 1), 100);
    })(0);

    syncHeartsOnPage();
  }

  // ============================================================
  // Social layer (site-wide, bound once by delegation / observers):
  //   1) Notification bell in the header (signed-in only) with an
  //      unread dot, a dropdown of "X started following you" rows
  //      (with Follow back), and a live toast the moment someone
  //      follows you (Supabase Realtime on public.notifications).
  //   2) "People you follow own this" — a small overlapping avatar
  //      stack on product cards (signed-in only), from the
  //      friends_owning() RPC. Cards are found by their
  //      .wishlist-heart[data-heart-id], so no per-page changes.
  // Everything is best-effort: any failure leaves the page as is.
  // ============================================================
  function bindSocial() {
    var SB_URL = "https://gqnwinkddckytrfpnhng.supabase.co";
    var FALLBACK_AVATAR = "assets/images/spoider-logo-vector.svg";
    var S = { sb: null, uid: null, items: [], unread: 0, following: new Set(), channel: null, open: false, sheetOpen: false };
    var mq = window.matchMedia("(max-width:760px)");
    var subs = [];
    var sheet = null, sheetBack = null, sheetList = null;

    // ---------- styles (self-contained, theme-aware) ----------
    var st = document.createElement("style");
    st.textContent =
      ".notif-bell{position:relative;margin-left:22px}" +
      ".notif-bell + .theme-toggle{margin-left:12px}" +
      "@media (max-width:760px){.notif-bell{margin-left:auto}.notif-bell + .theme-toggle{margin-left:10px}}" +
      ".notif-bell .nb-dot{position:absolute;top:6px;right:7px;min-width:8px;height:8px;border-radius:999px;background:var(--gold-bright);box-shadow:0 0 0 2px var(--bg-elevated,#0a0a0b);opacity:0;transform:scale(.4);transition:opacity .25s var(--ease),transform .35s cubic-bezier(.34,1.56,.64,1)}" +
      ".notif-bell.has-unread .nb-dot{opacity:1;transform:scale(1)}" +
      ".nf-panel{box-sizing:border-box;position:fixed;z-index:10001;width:min(360px,calc(100vw - 24px));max-height:min(70vh,520px);display:flex;flex-direction:column;background:var(--bg-elevated,#111113);border:1px solid var(--border);border-radius:16px;box-shadow:0 30px 70px -20px rgba(0,0,0,.6),0 0 0 1px rgba(201,168,118,.06);opacity:0;transform:translateY(-6px) scale(.98);transform-origin:top right;pointer-events:none;transition:opacity .22s var(--ease),transform .28s var(--ease);overflow:hidden}" +
      ".nf-panel.open{opacity:1;transform:none;pointer-events:auto}" +
      ".nf-head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px 12px;border-bottom:1px solid var(--border)}" +
      ".nf-head h3{font-family:var(--font-display,inherit);font-weight:500;font-size:1.05rem;color:var(--text-primary);margin:0;letter-spacing:-.01em}" +
      ".nf-list{overflow-y:auto;overscroll-behavior:contain;padding:6px}" +
      ".nf-empty{padding:34px 24px;text-align:center;color:var(--text-secondary);font-size:.86rem;line-height:1.55}" +
      ".nf-row{display:flex;align-items:center;gap:12px;padding:10px;border-radius:12px;text-decoration:none;color:inherit;position:relative;transition:background .2s var(--ease)}" +
      ".nf-row:hover{background:var(--surface)}" +
      ".nf-row.is-new::before{content:'';position:absolute;left:2px;top:50%;width:4px;height:4px;margin-top:-2px;border-radius:50%;background:var(--gold-bright)}" +
      ".nf-av{width:40px;height:40px;border-radius:50%;object-fit:cover;flex-shrink:0;background:var(--surface);border:1px solid var(--border)}" +
      ".nf-txt{flex:1;min-width:0;font-size:.84rem;line-height:1.4;color:var(--text-secondary)}" +
      ".nf-txt b{color:var(--text-primary);font-weight:600}" +
      ".nf-txt time{display:block;font-size:.72rem;color:var(--text-secondary);opacity:.75;margin-top:1px}" +
      ".nf-fb{flex-shrink:0;font:inherit;font-size:.76rem;font-weight:600;padding:7px 13px;border-radius:999px;border:1px solid var(--gold);background:var(--gold);color:#0b0b0c;cursor:pointer;transition:transform .2s var(--ease),opacity .2s}" +
      ".nf-fb:active{transform:scale(.95)}" +
      ".nf-fb.is-on{background:transparent;color:var(--gold);border-color:var(--border);cursor:default}" +
      ".nf-toast{box-sizing:border-box;position:fixed;z-index:10002;top:14px;left:50%;width:min(380px,calc(100vw - 24px));display:flex;align-items:center;gap:12px;padding:12px 14px;background:var(--bg-elevated,#111113);border:1px solid var(--gold-dim,rgba(201,168,118,.35));border-radius:16px;box-shadow:0 24px 60px -18px rgba(0,0,0,.65),0 0 40px -16px rgba(201,168,118,.4);color:var(--text-primary);text-decoration:none;transform:translate(-50%,-140%);opacity:0;transition:transform .5s cubic-bezier(.22,1,.36,1),opacity .35s}" +
      ".nf-toast.show{transform:translate(-50%,0);opacity:1}" +
      "@media (min-width:900px){.nf-toast{left:auto;right:24px;transform:translate(0,-140%)}.nf-toast.show{transform:none}}" +
      ".nf-toast .nf-av{width:42px;height:42px}" +
      ".nf-toast .nf-txt{font-size:.86rem}" +
      ".fo-row{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px 14px}" +
      ".fo-row > :first-child{flex:0 0 auto}" +
      ".friends-own{display:inline-flex;align-items:center;gap:8px;min-width:0;max-width:100%;opacity:0;transform:translateY(3px);transition:opacity .5s var(--ease),transform .5s var(--ease)}" +
      ".friends-own.in{opacity:1;transform:none}" +
      ".friends-own .fo-av{display:inline-flex;flex-shrink:0}" +
      ".friends-own .fo-av img{width:22px;height:22px;border-radius:50%;object-fit:cover;border:2px solid var(--bg-elevated,#111113);background:var(--surface);margin-left:-7px;box-sizing:content-box}" +
      ".friends-own .fo-av img:first-child{margin-left:0}" +
      ".friends-own .fo-t{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.74rem;line-height:1.2;color:var(--text-secondary);letter-spacing:.01em}" +
      ".friends-own .fo-t b{color:var(--gold-bright);font-weight:600}" +
      ".friends-own{cursor:pointer;-webkit-tap-highlight-color:transparent;border-radius:999px;padding:3px 8px 3px 3px;margin:-3px -8px -3px -3px;transition:opacity .5s var(--ease),transform .5s var(--ease),background .2s}" +
      ".friends-own:hover{background:var(--surface)}" +
      ".friends-own:focus-visible{outline:2px solid var(--gold);outline-offset:2px}" +
      ".fo-pop{position:fixed;z-index:10005;box-sizing:border-box;max-height:250px;overflow-y:auto;overscroll-behavior:contain;padding:6px;background:var(--bg-elevated,#111113);border:1px solid var(--border);border-radius:14px;box-shadow:0 24px 60px -18px rgba(0,0,0,.65);opacity:0;transform:translateY(4px) scale(.98);transition:opacity .2s var(--ease),transform .25s var(--ease)}" +
      ".fo-pop.in{opacity:1;transform:none}" +
      ".fo-pop .fo-ph{padding:6px 10px 8px;font-size:.7rem;letter-spacing:.06em;text-transform:uppercase;color:var(--text-secondary)}" +
      ".fo-pr{display:flex;align-items:center;gap:10px;width:100%;padding:8px 10px;border:none;border-radius:10px;background:none;color:var(--text-primary);font:inherit;text-align:left;cursor:pointer}" +
      ".fo-pr:hover{background:var(--surface)}" +
      ".fo-pr img{width:30px;height:30px;border-radius:50%;object-fit:cover;flex-shrink:0;background:var(--surface);border:1px solid var(--border)}" +
      ".fo-pr span{min-width:0;display:flex;flex-direction:column;font-size:.84rem;line-height:1.25}" +
      ".fo-pr span i{font-style:normal;font-size:.72rem;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
      ".profile-toggle.nf-pt{position:relative}" +
      ".profile-toggle.nf-pt::after{content:'';position:absolute;top:5px;right:6px;width:8px;height:8px;border-radius:50%;background:var(--gold-bright);box-shadow:0 0 0 2px var(--bg-elevated,#0a0a0b)}" +
      ".nf-back{position:fixed;inset:0;z-index:10003;background:rgba(0,0,0,.55);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);opacity:0;pointer-events:none;transition:opacity .3s var(--ease)}" +
      ".nf-back.open{opacity:1;pointer-events:auto}" +
      ".nf-sheet{position:fixed;z-index:10004;left:0;right:0;bottom:0;box-sizing:border-box;max-height:78vh;display:flex;flex-direction:column;background:var(--bg-elevated,#111113);border:1px solid var(--border);border-bottom:none;border-radius:22px 22px 0 0;transform:translateY(102%);transition:transform .42s cubic-bezier(.22,1,.36,1);padding-bottom:env(safe-area-inset-bottom)}" +
      ".nf-sheet.open{transform:none}" +
      ".nf-sheet .nf-grab{width:38px;height:4px;border-radius:4px;background:var(--border);margin:9px auto 0}" +
      ".nf-sheet .nf-head{padding:12px 14px 12px 18px}" +
      ".nf-x{width:32px;height:32px;border-radius:50%;border:1px solid var(--border);background:var(--surface);color:var(--text-secondary);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;padding:0}" +
      ".nf-x svg{width:14px;height:14px}" +
      "@media (max-width:760px){.nf-toast{top:auto;bottom:calc(16px + env(safe-area-inset-bottom));transform:translate(-50%,140%);padding:10px 12px;border-radius:14px}.nf-toast.show{transform:translate(-50%,0)}.nf-toast .nf-av{width:36px;height:36px}.nf-toast .nf-txt{font-size:.82rem}}" +
      "@media (prefers-reduced-motion:reduce){.nf-panel,.nf-toast,.friends-own,.nf-sheet,.nf-back,.notif-bell .nb-dot{transition:none}}";
    document.head.appendChild(st);

    // ---------- helpers ----------
    function getClient() {
      return new Promise(function (resolve) {
        var tries = 0;
        (function check() {
          if (window.SpoiderAuth && window.SpoiderAuth.client) return resolve(window.SpoiderAuth.client);
          if (++tries > 60) return resolve(null);
          setTimeout(check, 100);
        })();
      });
    }
    function nameOf(p) { return (p && (p.display_name || p.username)) || "Someone"; }
    function avatarOf(p) { return (p && p.avatar_url) || FALLBACK_AVATAR; }
    function profileHref(p) { return "profile.html?u=" + encodeURIComponent((p && p.username) || ""); }
    function ago(iso) {
      var s = Math.max(1, (Date.now() - new Date(iso).getTime()) / 1000);
      if (s < 60) return "just now";
      if (s < 3600) return Math.floor(s / 60) + "m ago";
      if (s < 86400) return Math.floor(s / 3600) + "h ago";
      if (s < 86400 * 7) return Math.floor(s / 86400) + "d ago";
      return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
    }
    function mk(tag, cls, text) {
      var el = document.createElement(tag);
      if (cls) el.className = cls;
      if (text != null) el.textContent = text;
      return el;
    }
    function avatarImg(p, cls) {
      var img = mk("img", cls);
      img.alt = "";
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";
      img.src = avatarOf(p);
      img.addEventListener("error", function () { if (img.src.indexOf(FALLBACK_AVATAR) < 0) img.src = FALLBACK_AVATAR; }, { once: true });
      return img;
    }

    // ---------- bell + panel ----------
    var bell = null, panel = null, listEl = null;

    function buildBell() {
      if (mq.matches) return false;
      var nav = document.querySelector(".nav") || document.getElementById("nav");
      var anchor = nav && nav.querySelector(".theme-toggle");
      if (!anchor) return false;
      bell = mk("button", "theme-toggle notif-bell");
      bell.type = "button";
      bell.setAttribute("aria-label", "Notifications");
      bell.setAttribute("aria-haspopup", "true");
      bell.setAttribute("aria-expanded", "false");
      bell.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9a6 6 0 1112 0c0 5 2 6.5 2 6.5H4S6 14 6 9z"/><path d="M10 19a2 2 0 004 0"/></svg><span class="nb-dot"></span>';
      // keep it out of the theme-sweep handler (it listens on .theme-toggle)
      bell.classList.remove("theme-toggle");
      bell.classList.add("profile-toggle");
      anchor.parentNode.insertBefore(bell, anchor);

      panel = mk("div", "nf-panel");
      panel.setAttribute("role", "dialog");
      panel.setAttribute("aria-label", "Notifications");
      var head = mk("div", "nf-head");
      head.appendChild(mk("h3", "", "Notifications"));
      panel.appendChild(head);
      listEl = mk("div", "nf-list");
      panel.appendChild(listEl);
      document.body.appendChild(panel);
      renderList();
      return true;
    }

    function destroyBell() {
      if (bell && bell.parentNode) bell.remove();
      if (panel && panel.parentNode) panel.remove();
      bell = panel = listEl = null;
      S.open = false;
    }

    function positionPanel() {
      if (!bell || !panel) return;
      var r = bell.getBoundingClientRect();
      var w = Math.min(360, window.innerWidth - 24);
      var left = Math.min(Math.max(12, r.right - w), window.innerWidth - w - 12);
      panel.style.top = Math.round(r.bottom + 10) + "px";
      panel.style.left = Math.round(left) + "px";
    }

    function setOpen(open) {
      if (!panel) return;
      S.open = open;
      if (open) positionPanel();
      panel.classList.toggle("open", open);
      bell.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) {
        setTimeout(markAllRead, 900);
      } else {
        S.items.forEach(function (n) { n.read_at = n.read_at || "x"; });
        renderList();
      }
    }

    function updateBadge() {
      S.unread = S.items.filter(function (n) { return !n.read_at; }).length;
      if (bell) bell.classList.toggle("has-unread", S.unread > 0);
      var pt = document.querySelector(".nav .profile-toggle:not(.notif-bell)");
      document.querySelectorAll(".profile-toggle.nf-pt").forEach(function (x) { if (x !== pt || !(mq.matches && S.unread > 0)) x.classList.remove("nf-pt"); });
      if (pt && mq.matches && S.unread > 0) pt.classList.add("nf-pt");
      subs.forEach(function (fn) { try { fn(S.unread); } catch (e) {} });
    }

    function renderList() {
      renderInto(listEl);
      renderInto(sheetList);
      updateBadge();
    }
    function renderInto(listEl) {
      if (!listEl) return;
      listEl.textContent = "";
      if (!S.items.length) {
        var e = mk("div", "nf-empty");
        e.appendChild(mk("div", "", "Nothing yet."));
        e.appendChild(mk("div", "", "When someone follows you, you'll see it here."));
        listEl.appendChild(e);
        return;
      }
      S.items.forEach(function (n) {
        var a = n.actor || {};
        var row = mk("a", "nf-row" + (n.read_at ? "" : " is-new"));
        row.href = profileHref(a);
        row.appendChild(avatarImg(a, "nf-av"));
        var t = mk("div", "nf-txt");
        var b = mk("b", "", nameOf(a));
        t.appendChild(b);
        t.appendChild(document.createTextNode(" started following you"));
        t.appendChild(mk("time", "", ago(n.created_at)));
        row.appendChild(t);
        var iFollow = S.following.has(a.id);
        var btn = mk("button", "nf-fb" + (iFollow ? " is-on" : ""), iFollow ? "Following" : "Follow back");
        btn.type = "button";
        btn.addEventListener("click", function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          followBack(a.id, btn);
        });
        row.appendChild(btn);
        listEl.appendChild(row);
      });
    }

    async function followBack(targetId, btn) {
      if (!S.sb || !S.uid || S.following.has(targetId)) return;
      S.following.add(targetId);
      btn.textContent = "Following";
      btn.classList.add("is-on");
      var r = await S.sb.from("follows").insert({ follower_id: S.uid, following_id: targetId });
      if (r.error && r.error.code !== "23505") {
        S.following.delete(targetId);
        btn.textContent = "Follow back";
        btn.classList.remove("is-on");
      }
    }

    async function markAllRead() {
      if ((!S.open && !S.sheetOpen) || !S.sb || !S.uid) return;
      var any = S.items.some(function (n) { return !n.read_at; });
      if (!any) return;
      S.items.forEach(function (n) { if (!n.read_at) n.read_at = new Date().toISOString(); });
      updateBadge(); // dot clears now, the "new" markers clear when the panel closes
      try {
        await S.sb.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", S.uid).is("read_at", null);
      } catch (e) {}
    }

    // ---------- bottom sheet (mobile; also opened from the profile page) ----------
    function buildSheet() {
      if (sheet) return;
      sheetBack = mk("div", "nf-back");
      sheet = mk("div", "nf-sheet");
      sheet.setAttribute("role", "dialog");
      sheet.setAttribute("aria-label", "Notifications");
      sheet.appendChild(mk("div", "nf-grab"));
      var head = mk("div", "nf-head");
      head.appendChild(mk("h3", "", "Notifications"));
      var x = mk("button", "nf-x");
      x.type = "button";
      x.setAttribute("aria-label", "Close");
      x.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
      x.addEventListener("click", function () { setSheet(false); });
      head.appendChild(x);
      sheet.appendChild(head);
      sheetList = mk("div", "nf-list");
      sheet.appendChild(sheetList);
      sheetBack.addEventListener("click", function () { setSheet(false); });
      sheetList.addEventListener("click", function (e) { if (e.target.closest(".nf-row") && !e.target.closest(".nf-fb")) setSheet(false); });
      document.body.appendChild(sheetBack);
      document.body.appendChild(sheet);
      renderInto(sheetList);
    }
    function setSheet(open) {
      if (open) buildSheet();
      if (!sheet) return;
      S.sheetOpen = open;
      if (open) {
        if (S.open) setOpen(false);
        requestAnimationFrame(function () { requestAnimationFrame(function () { sheet.classList.add("open"); sheetBack.classList.add("open"); }); });
        setTimeout(markAllRead, 900);
      } else {
        sheet.classList.remove("open");
        sheetBack.classList.remove("open");
        S.items.forEach(function (n) { n.read_at = n.read_at || "x"; });
        setTimeout(renderList, 350);
      }
    }
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && S.sheetOpen) setSheet(false); });
    function openNotifications() {
      if (!S.uid) return;
      if (mq.matches || !bell) setSheet(true); else setOpen(true);
    }
    window.SpoiderNotify = {
      open: openNotifications,
      openSheet: function () { if (S.uid) setSheet(true); },
      onChange: function (fn) { subs.push(fn); try { fn(S.unread); } catch (e) {} return function () { subs = subs.filter(function (f) { return f !== fn; }); }; },
      get unread() { return S.unread; },
      get signedIn() { return !!S.uid; }
    };
    var onMq = function () {
      if (!S.uid) return;
      if (mq.matches) { destroyBell(); } else { if (S.sheetOpen) setSheet(false); if (!bell) buildBell(); }
      renderList();
    };
    if (mq.addEventListener) mq.addEventListener("change", onMq); else if (mq.addListener) mq.addListener(onMq);

    // ---------- data ----------
    var SEL = "id,created_at,read_at,actor:profiles!notifications_actor_id_fkey(id,username,display_name,avatar_url)";

    async function loadNotifications() {
      if (!S.sb || !S.uid) return;
      try {
        var res = await S.sb.from("notifications").select(SEL).eq("user_id", S.uid).eq("type", "follow").order("created_at", { ascending: false }).limit(30);
        if (res.error) throw res.error;
        S.items = res.data || [];
        var ids = S.items.map(function (n) { return n.actor && n.actor.id; }).filter(Boolean);
        S.following = new Set();
        if (ids.length) {
          var f = await S.sb.from("follows").select("following_id").eq("follower_id", S.uid).in("following_id", ids);
          (f.data || []).forEach(function (r) { S.following.add(r.following_id); });
        }
        renderList();
      } catch (e) { /* bell just stays empty */ }
    }

    var toastTimer = null;
    function showToast(n) {
      try {
        var a = n.actor || {};
        var old = document.querySelector(".nf-toast");
        if (old) old.remove();
        var t = mk("a", "nf-toast");
        t.href = profileHref(a);
        t.setAttribute("role", "status");
        t.addEventListener("click", function (ev) {
          if (mq.matches) { ev.preventDefault(); t.remove(); setSheet(true); }
        });
        t.appendChild(avatarImg(a, "nf-av"));
        var txt = mk("div", "nf-txt");
        txt.appendChild(mk("b", "", nameOf(a)));
        txt.appendChild(document.createTextNode(" started following you"));
        t.appendChild(txt);
        document.body.appendChild(t);
        requestAnimationFrame(function () { requestAnimationFrame(function () { t.classList.add("show"); }); });
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () {
          t.classList.remove("show");
          setTimeout(function () { if (t.parentNode) t.remove(); }, 600);
        }, 6000);
        if (navigator.vibrate) navigator.vibrate(8);
      } catch (e) {}
    }

    async function onInsert(row) {
      try {
        var res = await S.sb.from("notifications").select(SEL).eq("id", row.id).maybeSingle();
        var n = res.data || { id: row.id, created_at: row.created_at, read_at: null, actor: null };
        if (!n.actor) return;
        S.items = [n].concat(S.items.filter(function (x) { return x.id !== n.id; })).slice(0, 30);
        if (S.open) n.read_at = null;
        renderList();
        showToast(n);
      } catch (e) {}
    }

    function subscribe() {
      unsubscribe();
      try {
        S.channel = S.sb.channel("notif:" + S.uid)
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: "user_id=eq." + S.uid }, function (p) { onInsert(p.new); })
          .on("postgres_changes", { event: "DELETE", schema: "public", table: "notifications", filter: "user_id=eq." + S.uid }, function (p) {
            var id = p.old && p.old.id;
            if (id == null) return;
            S.items = S.items.filter(function (x) { return x.id !== id; });
            renderList();
          })
          .subscribe();
      } catch (e) {}
    }
    function unsubscribe() {
      try { if (S.channel && S.sb) S.sb.removeChannel(S.channel); } catch (e) {}
      S.channel = null;
    }

    // ---------- bell interactions ----------
    document.addEventListener("click", function (e) {
      if (!bell) return;
      if (e.target.closest(".notif-bell")) { setOpen(!S.open); return; }
      if (S.open && !e.target.closest(".nf-panel")) setOpen(false);
      else if (S.open && e.target.closest(".nf-row")) setOpen(false);
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && S.open) setOpen(false); });
    window.addEventListener("resize", function () { if (S.open) positionPanel(); });
    window.addEventListener("scroll", function () { if (S.open) positionPanel(); }, { passive: true });
    document.addEventListener("visibilitychange", function () { if (!document.hidden && S.uid) loadNotifications(); });

    // ---------- "people you follow own this" on cards ----------
    var cardTimer = null;
    var cardCache = new Map(); // productId -> [profiles]

    function clearCardAvatars() {
      document.querySelectorAll(".friends-own").forEach(function (el) { el.remove(); });
      document.querySelectorAll("[data-fo-done]").forEach(function (el) { el.removeAttribute("data-fo-done"); });
      cardCache.clear();
    }

    function goProfile(p) {
      if (!p || !p.username) return;
      var a = document.createElement("a");
      a.href = profileHref(p);
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      a.remove();
    }

    var pop = null;
    function closePop() {
      if (!pop) return;
      var el = pop; pop = null;
      el.classList.remove("in");
      setTimeout(function () { if (el.parentNode) el.remove(); }, 220);
    }
    function openPop(anchor, list) {
      closePop();
      pop = mk("div", "fo-pop");
      pop.setAttribute("role", "menu");
      pop.appendChild(mk("div", "fo-ph", "People you follow who own this"));
      list.forEach(function (p) {
        var b = mk("button", "fo-pr");
        b.type = "button";
        b.setAttribute("role", "menuitem");
        b.appendChild(avatarImg(p, ""));
        var t = mk("span", "");
        t.appendChild(document.createTextNode(nameOf(p)));
        if (p.username) t.appendChild(mk("i", "", "@" + p.username));
        b.appendChild(t);
        b.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); closePop(); goProfile(p); });
        pop.appendChild(b);
      });
      document.body.appendChild(pop);
      var r = anchor.getBoundingClientRect();
      var w = Math.min(270, window.innerWidth - 24);
      pop.style.width = w + "px";
      pop.style.left = Math.round(Math.min(Math.max(12, r.left), window.innerWidth - w - 12)) + "px";
      var h = Math.min(250, pop.scrollHeight);
      if (r.top > h + 20) pop.style.top = Math.round(r.top - h - 10) + "px";
      else pop.style.top = Math.round(r.bottom + 10) + "px";
      requestAnimationFrame(function () { requestAnimationFrame(function () { if (pop) pop.classList.add("in"); }); });
    }
    document.addEventListener("click", function (e) { if (pop && !e.target.closest(".fo-pop") && !e.target.closest(".friends-own")) closePop(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closePop(); });
    window.addEventListener("scroll", closePop, { passive: true });

    function findViewLink(card) {
      var all = card.querySelectorAll("a,span,div,button,p");
      var hit = null;
      for (var k = 0; k < all.length; k++) {
        var el = all[k];
        if (/^\s*View on Amazon/i.test(el.textContent || "") && (el.textContent || "").length < 40) hit = el;
      }
      return hit;
    }

    function paintCard(card, list) {
      if (card.querySelector(".friends-own") || !list || !list.length) return;
      var names = list.map(nameOf);
      var chip = mk("span", "friends-own");
      var avs = mk("span", "fo-av");
      avs.setAttribute("aria-hidden", "true");
      list.slice(0, 3).forEach(function (p) { avs.appendChild(avatarImg(p, "")); });
      chip.appendChild(avs);
      var t = mk("span", "fo-t");
      var first = mk("b", "", names[0]);
      t.appendChild(first);
      if (names.length === 1) t.appendChild(document.createTextNode(" owns this"));
      else if (names.length === 2) { t.appendChild(document.createTextNode(" & ")); t.appendChild(mk("b", "", names[1])); t.appendChild(document.createTextNode(" own this")); }
      else t.appendChild(document.createTextNode(" +" + (names.length - 1) + " own this"));
      chip.appendChild(t);
      chip.setAttribute("role", "button");
      chip.tabIndex = 0;
      chip.setAttribute("aria-label", names.join(", ") + (names.length > 1 ? " — people you follow own this. Open list" : " owns this. Open profile"));
      var act = function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (list.length === 1) goProfile(list[0]);
        else if (pop) closePop();
        else openPop(chip, list);
      };
      chip.addEventListener("click", act);
      chip.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") act(e); });
      chip.addEventListener("pointerdown", function (e) { e.stopPropagation(); });

      var link = findViewLink(card);
      var row = link && link.closest(".fo-row");
      if (link && !row && link.parentNode && card.contains(link.parentNode)) {
        row = mk("div", "fo-row");
        link.parentNode.insertBefore(row, link);
        row.appendChild(link);
      }
      if (row) row.appendChild(chip);
      else { chip.style.margin = "12px 18px 16px"; card.appendChild(chip); }
      requestAnimationFrame(function () { requestAnimationFrame(function () { chip.classList.add("in"); }); });
    }

    async function decorateCards() {
      if (!S.sb || !S.uid) return;
      var cards = Array.prototype.filter.call(document.querySelectorAll("a.product-card"), function (c) {
        return !c.hasAttribute("data-fo-done") && c.querySelector(".wishlist-heart[data-heart-id]");
      });
      if (!cards.length) return;
      var byId = new Map();
      cards.forEach(function (c) {
        c.setAttribute("data-fo-done", "1");
        var id = Number(c.querySelector(".wishlist-heart").dataset.heartId);
        if (!isFinite(id)) return;
        if (!byId.has(id)) byId.set(id, []);
        byId.get(id).push(c);
      });
      var need = Array.from(byId.keys()).filter(function (id) { return !cardCache.has(id); });
      if (need.length) {
        try {
          var res = await S.sb.rpc("friends_owning", { p_ids: need });
          if (res.error) throw res.error;
          need.forEach(function (id) { cardCache.set(id, []); });
          (res.data || []).forEach(function (r) {
            var arr = cardCache.get(Number(r.product_id));
            if (arr && !arr.some(function (p) { return p.user_id === r.user_id; })) arr.push(r);
          });
        } catch (e) { cards.forEach(function (c) { c.removeAttribute("data-fo-done"); }); return; }
      }
      if (!S.uid) return;
      byId.forEach(function (els, id) { els.forEach(function (c) { if (c.isConnected) paintCard(c, cardCache.get(id)); }); });
    }

    function scheduleCards() {
      clearTimeout(cardTimer);
      cardTimer = setTimeout(decorateCards, 200);
    }

    if ("MutationObserver" in window) {
      new MutationObserver(function (muts) {
        if (!S.uid) return;
        for (var i = 0; i < muts.length; i++) {
          if (muts[i].addedNodes && muts[i].addedNodes.length) { scheduleCards(); return; }
        }
      }).observe(document.body, { childList: true, subtree: true });
    }

    // ---------- session wiring ----------
    async function onSession(user) {
      var uid = user ? user.id : null;
      if (uid === S.uid) { if (uid) { if (!bell) buildBell(); scheduleCards(); } return; }
      S.uid = uid;
      S.items = []; S.following = new Set();
      if (!uid) {
        unsubscribe(); destroyBell(); clearCardAvatars();
        return;
      }
      if (!bell) buildBell();
      await loadNotifications();
      subscribe();
      scheduleCards();
    }

    (async function boot() {
      S.sb = await getClient();
      if (!S.sb) return;
      try {
        var s = await S.sb.auth.getSession();
        onSession(s && s.data && s.data.session ? s.data.session.user : null);
      } catch (e) {}
      S.sb.auth.onAuthStateChange(function (_ev, session) {
        // never await supabase calls inside this callback (auth deadlock) — defer
        setTimeout(function () { onSession(session ? session.user : null); }, 0);
      });
    })();
  }

  function bindGlobalOnce() {
    if (globalBound) return;
    globalBound = true;

    bindThemeToggle();
    bindMobileNav();
    bindSpoiderScorePanels();
    bindAffiliateClickTracking();
    bindWishlistHearts();
    bindSocial();

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
    // tap point and fades out. Bound once on document via delegation,
    // so it survives every AJAX page swap without rebinding. Skips
    // .hero-mark-inner (own burst treatment), .theme-toggle (own sweep
    // transition) and .wishlist-heart (own pop + burst animation). ----
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
          if (!target || target.closest(".hero-mark-inner") || target.closest(".theme-toggle") || target.closest(".wishlist-heart")) return;
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
  // <em>, a colored <span>) are preserved on a PER-WORD basis.
  //
  // Motion tiers (element decides its own pace/feel via context):
  //   .hero-title / anything inside .hero → dramatic, slow, spring
  //   .eyebrow                             → restrained, fast
  //   <h3>                                 → very subtle, fast
  //   everything else (section headings)   → the base tier
  //
  // Trigger modes:
  //   data-trigger="load"  → reveals once, shortly after page load
  //   (default)             → reveals once, on scroll into view
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
    // elements currently wrapping each piece of text, so every
    // individual word can be masked and staggered while still carrying
    // its formatting.
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
  // As the user scrolls from the hero into the Categories section,
  // the web canvas fades and gently contracts, while each category
  // card "catches" a thin gold thread line across its top edge, one
  // card after another — reading as the overhead web's threads
  // landing into the grid below, rather than two disconnected
  // sections. Driven by scroll position (smoothstepped). No-ops
  // safely on any page that doesn't have both a .web-canvas and a
  // .category-grid.
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
      // 85% of viewport height, finishes once it reaches 40%.
      const start = vh * 0.85;
      const end = vh * 0.4;
      const raw = (start - gridRect.top) / (start - end);
      const progress = smoothstep(raw);

      // Web canvas fades and gathers inward slightly, as if its
      // threads are retreating rather than simply vanishing.
      canvas.style.opacity = (1 - progress).toFixed(3);
      canvas.style.transform = "scale(" + (1 - progress * 0.12).toFixed(3) + ")";

      // Each card catches its thread a beat after the previous one.
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
  // combined). curatedCountToken guards against a stale fetch
  // landing after the user has already navigated away.
  //
  // This is a public read-only count (no signed-in session
  // needed), so the client explicitly disables session
  // persistence/detection — otherwise it could race auth.js for
  // any Google OAuth redirect landing on the page.
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
        const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
        });
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

    // (Mobile nav toggle used to be bound here — it now lives in
    // bindMobileNav(), bound once. See FIX 1 at the top of the file.)

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

    // ---- Wishlist hearts: mark already-wishlisted products filled
    // for any cards that are already in the DOM at this point (a
    // page loader's own render call is still the primary trigger —
    // see loadFeatured()/loadProducts() — but this covers the rare
    // case of static/pre-rendered cards on a page). ----
    if (window.syncWishlistHearts) window.syncWishlistHearts();
  }

  // Exposed so transitions.js can re-run page setup after swapping in new content
  window.SpoiderPage = { init: initPage };

  document.addEventListener("DOMContentLoaded", () => {
    bindGlobalOnce();
    initPage();
  });
})();
// ============================================================
// Glass product cards - the light.
// CSS (style.css, "GLASS PRODUCT CARDS") draws the card frame and the
// info panel; this only moves two tiny light layers with transform +
// opacity (no repaint): a saturated-gold glint on the 1px rim and a
// soft glow inside the info panel. The poster itself is never touched.
// Desktop: one cursor lights every nearby card edge (cards next to the
// pointer glow too) and the hue drifts gold -> champagne with the
// cursor's x. Phones: tilt the phone (gyroscope, where the browser
// allows it) or scroll, and the light slides along the card edges.
// Delegated + observer based, so cards injected later (Supabase
// loaders, page transitions) are picked up with no rebinding. Only
// visible cards are touched; nothing runs while idle.
// ============================================================
(function () {
  "use strict";
  if (window.__sfGlass) return;
  window.__sfGlass = true;

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var coarse = window.matchMedia("(hover: none)").matches;
  var REST = { x: 0.24, y: 0.0, s: 0 };
  var st = new WeakMap(), size = new WeakMap();
  var live = new Set(), visible = new Set();
  var raf = 0, io = null, ro = null;
  var root = document.documentElement;

  function get(card) {
    var s = st.get(card);
    if (!s) {
      s = { x: REST.x, y: REST.y, s: 0, tx: REST.x, ty: REST.y, ts: 0, follow: false, cold: true,
            glare: card.querySelector(".sf-glare"), glints: card.querySelectorAll(".sf-rim i") };
      st.set(card, s);
    }
    return s;
  }
  function paint(card, s) {
    var d = size.get(card);
    if (!d || !s.glints || !s.glints.length) return;
    var px = s.x * d.w, py = s.y * d.h;
    var tr = "translate3d(" + (px - 320).toFixed(1) + "px," + (py - 320).toFixed(1) + "px,0)";
    var op = Math.max(0, Math.min(1, s.s)).toFixed(3);
    for (var i = 0; i < s.glints.length; i++) { s.glints[i].style.transform = tr; s.glints[i].style.opacity = op; }
    if (s.glare) {
      s.glare.style.transform = "translate3d(" + (px - 260).toFixed(1) + "px," + (py - (d.bt || 0) - 260).toFixed(1) + "px,0)";
      s.glare.style.opacity = op;
    }
  }
  function loop() {
    raf = 0;
    live.forEach(function (card) {
      var s = st.get(card);
      if (!s || !card.isConnected) { live.delete(card); return; }
      var k = s.follow ? 0.17 : 0.09;                       // a little drag = liquid
      s.x += (s.tx - s.x) * k; s.y += (s.ty - s.y) * k; s.s += (s.ts - s.s) * 0.12;
      paint(card, s);
      if (Math.abs(s.tx - s.x) < 0.0008 && Math.abs(s.ty - s.y) < 0.0008 && Math.abs(s.ts - s.s) < 0.003) {
        s.x = s.tx; s.y = s.ty; s.s = s.ts; paint(card, s); live.delete(card);
      }
    });
    if (live.size) raf = requestAnimationFrame(loop);
  }
  function wake(card) { live.add(card); if (!raf) raf = requestAnimationFrame(loop); }
  function cardOf(t) { return t && t.closest ? t.closest(".product-card") : null; }
  function rest(s) { s.follow = false; s.cold = true; s.tx = REST.x; s.ty = REST.y; s.ts = 0; }
  function measure(card, r) {
    var b = card.querySelector(".product-body");
    size.set(card, { w: r.width, h: r.height, bt: b ? b.offsetTop : 0 });
  }

  // hue drifts gold -> champagne with the pointer's x (kept inside our one colour family)
  var hue = 42;
  function setHue(xFrac) {
    var h = Math.round(36 + Math.max(0, Math.min(1, xFrac)) * 18);
    if (h !== hue) { hue = h; root.style.setProperty("--sf-h", h); }
  }

  // ---- mouse / pen: one cursor lights every nearby card edge ----
  var mx = 0, my = 0, mRaf = 0, mouseIn = false;
  function mouseFrame() {
    mRaf = 0;
    var list = [], rects = [];
    visible.forEach(function (c) { if (c.isConnected) { list.push(c); rects.push(c.getBoundingClientRect()); } else visible.delete(c); });
    for (var i = 0; i < list.length; i++) {
      var r = rects[i], s = get(list[i]);
      if (!r.width || !r.height) continue;
      if (!size.get(list[i])) measure(list[i], r);
      var dx = mx < r.left ? r.left - mx : (mx > r.right ? mx - r.right : 0);
      var dy = my < r.top ? r.top - my : (my > r.bottom ? my - r.bottom : 0);
      var dist = Math.hypot(dx, dy), inten = Math.max(0, 1 - dist / 300);
      if (inten <= 0) { if (s.follow) { rest(s); wake(list[i]); } continue; }
      s.follow = true;
      s.tx = Math.max(-0.6, Math.min(1.6, (mx - r.left) / r.width));
      s.ty = Math.max(-0.6, Math.min(1.6, (my - r.top) / r.height));
      if (s.cold) { s.x = s.tx; s.y = s.ty; s.cold = false; }
      s.ts = dist === 0 ? 1 : 0.3 + 0.6 * inten;
      wake(list[i]);
    }
  }
  function resetAll() { visible.forEach(function (c) { var s = st.get(c); if (s && s.follow) { rest(s); wake(c); } }); }
  if (!reduce && !coarse) {
    document.addEventListener("pointermove", function (ev) {
      if (ev.pointerType === "touch") return;
      mx = ev.clientX; my = ev.clientY; mouseIn = true;
      setHue(mx / (window.innerWidth || 1200));
      if (!mRaf) mRaf = requestAnimationFrame(mouseFrame);
    }, { passive: true });
    document.documentElement.addEventListener("pointerleave", function () { mouseIn = false; resetAll(); }, { passive: true });
    window.addEventListener("blur", resetAll);
    window.addEventListener("scroll", function () { if (mouseIn && !mRaf) mRaf = requestAnimationFrame(mouseFrame); }, { passive: true });
  }

  // ---- press: a tiny haptic tick on touch ----
  if (!reduce) {
    document.addEventListener("pointerdown", function (ev) {
      if (ev.pointerType === "touch" && navigator.vibrate && cardOf(ev.target)) { try { navigator.vibrate(8); } catch (e) {} }
    }, { passive: true });
  }

  // ---- phones: tilt the phone (gyro) and/or scroll, the light slides along the edges ----
  var tiltOn = false, tiltX = 0, tiltY = 0, b0 = null, g0 = null, sRaf = 0;
  var touching = false;
  function phoneFrame() {
    sRaf = 0;
    if (touching) return;
    var vh = window.innerHeight || 800, list = [], i, r;
    visible.forEach(function (card) { if (card.isConnected) list.push(card); else visible.delete(card); });
    var rects = list.map(function (c) { return c.getBoundingClientRect(); });    // all reads first
    for (i = 0; i < list.length; i++) {
      var s = get(list[i]);
      r = rects[i];
      if (!size.get(list[i]) && r.width) measure(list[i], r);
      var t = Math.max(0, Math.min(1, (r.top + r.height / 2) / vh));
      var bx = 0.18 + 0.64 * (1 - t), by = -0.06 + 0.46 * (1 - t);
      if (tiltOn) { s.tx = Math.max(-0.2, Math.min(1.2, 0.5 * bx + 0.25 + tiltX * 0.55)); s.ty = Math.max(-0.2, Math.min(1.2, 0.5 * by + 0.18 + tiltY * 0.5)); s.ts = 0.95; }
      else { s.tx = bx; s.ty = by; s.ts = 0.85; }
      s.follow = true;
      wake(list[i]);
    }
  }
  function kickPhone() { if (!sRaf) sRaf = requestAnimationFrame(phoneFrame); }
  if (coarse && !reduce) {
    window.addEventListener("scroll", kickPhone, { passive: true });
    window.addEventListener("resize", kickPhone);
    // finger: the most reliable phone light. Press and drag on a card and the gold follows your finger
    // (neighbouring cards glow too); let go and it settles back to the scroll light.
    function fingerAt(ev) {
      var t = ev.touches && ev.touches[0];
      if (!t) return;
      touching = true; mx = t.clientX; my = t.clientY;
      setHue(mx / (window.innerWidth || 400));
      if (!mRaf) mRaf = requestAnimationFrame(mouseFrame);
    }
    function fingerUp() {
      if (!touching) return;
      touching = false;
      resetAll();
      setTimeout(kickPhone, 60);
    }
    document.addEventListener("touchstart", function (ev) { if (cardOf(ev.target)) fingerAt(ev); }, { passive: true });
    document.addEventListener("touchmove", function (ev) { if (touching) fingerAt(ev); }, { passive: true });
    document.addEventListener("touchend", fingerUp, { passive: true });
    document.addEventListener("touchcancel", fingerUp, { passive: true });
    // gyroscope: Android browsers deliver it on https with no prompt; iOS needs a permission we deliberately don't ask for
    var isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if ("DeviceOrientationEvent" in window && !isIOS) {
      window.addEventListener("deviceorientation", function (e) {
        if (e.gamma == null || e.beta == null) return;
        if (b0 === null) { b0 = e.beta; g0 = e.gamma; }
        b0 += (e.beta - b0) * 0.004; g0 += (e.gamma - g0) * 0.004;      // slowly re-centre
        tiltX = Math.max(-1, Math.min(1, (e.gamma - g0) / 22));
        tiltY = Math.max(-1, Math.min(1, (e.beta - b0) / 22));
        tiltOn = true;
        kickPhone();
      }, { passive: true });
    }
  }

  // ============================================================
  // FLIP: grab a card and turn it over; the back is the Spoider Score.
  // Tap = Amazon (untouched). Horizontal drag = the card follows the
  // finger / mouse in 3D, then springs to the nearest face (a flick
  // carries it over). Vertical drag stays a normal scroll.
  // ============================================================
  var SVGNS = "http://www.w3.org/2000/svg";
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function buildFlip(card, panel) {
    var numEl = panel.querySelector(".spoider-num");
    var score = numEl ? parseFloat(numEl.textContent) : NaN;
    if (!isFinite(score)) return null;
    var noteEl = panel.querySelector(".spoider-note");
    var note = noteEl ? noteEl.textContent.trim() : "";
    var rows = [];
    panel.querySelectorAll(".spoider-bar-row").forEach(function (r) {
      var lab = r.querySelector(".spoider-bar-label"), val = r.querySelector(".spoider-bar-val");
      if (!lab || !val) return;
      var v = parseFloat(val.textContent) || 0;
      rows.push({ label: lab.textContent.trim(), val: v });
    });

    var front = el("div", "sf-face sf-front");
    Array.prototype.slice.call(card.childNodes).forEach(function (n) {
      if (n === panel) return;
      if (n.nodeType === 1 && n.classList.contains("product-glow")) return;
      front.appendChild(n);
    });
    panel.remove();

    var back = el("div", "sf-face sf-back");
    var inn = el("div", "sf-back-in");
    inn.appendChild(el("span", "sf-b-eyebrow", "Spoider Score"));
    var g = el("div", "sf-b-gauge");
    var svg = document.createElementNS(SVGNS, "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("aria-hidden", "true");
    var c1 = document.createElementNS(SVGNS, "circle"), c2 = document.createElementNS(SVGNS, "circle");
    [c1, c2].forEach(function (c) { c.setAttribute("cx", "50"); c.setAttribute("cy", "50"); c.setAttribute("r", "46"); });
    c1.setAttribute("class", "sf-b-track"); c2.setAttribute("class", "sf-b-arc");
    svg.appendChild(c1); svg.appendChild(c2);
    g.appendChild(svg);
    var num = el("span", "sf-b-num", score.toFixed(1));
    g.appendChild(num);
    inn.appendChild(g);
    if (note) inn.appendChild(el("p", "sf-b-note", note));
    var bars = el("div", "sf-b-bars");
    rows.forEach(function (r, i) {
      var row = el("div", "sf-b-row");
      row.style.setProperty("--i", i);
      row.style.setProperty("--f", Math.max(0, Math.min(1, r.val / 10)).toFixed(3));
      row.appendChild(el("span", "sf-b-label", r.label));
      var t = el("span", "sf-b-track2"); t.appendChild(el("span", "sf-b-fill"));
      row.appendChild(t);
      row.appendChild(el("span", "sf-b-val", r.val.toFixed(1)));
      bars.appendChild(row);
    });
    inn.appendChild(bars);
    inn.appendChild(el("span", "sf-b-foot", "View on Amazon →"));
    back.appendChild(inn);

    var flip = el("div", "sf-flip");
    flip.appendChild(front); flip.appendChild(back);
    card.appendChild(flip);
    card.classList.add("sf-flippable");
    card.style.setProperty("--sf-off", (289 * (1 - Math.max(0, Math.min(10, score)) / 10)).toFixed(1));
    card.__sf = { flip: flip, num: num, score: score, ry: 0, v: 0, target: 0, raf: 0, face: 0, last: 0, countRaf: 0 };
    return [front, back];
  }

  function applyRy(card) {
    var f = card.__sf, a = f.ry * Math.PI / 180;
    var lift = Math.abs(Math.sin(a)) * 46;
    f.flip.style.transform = "perspective(1100px) translateZ(" + lift.toFixed(1) + "px) rotateY(" + f.ry.toFixed(2) + "deg)";
  }
  function countUp(card, on) {
    var f = card.__sf;
    cancelAnimationFrame(f.countRaf);
    if (!on) { f.num.textContent = f.score.toFixed(1); return; }
    if (reduce) { f.num.textContent = f.score.toFixed(1); return; }
    var t0 = performance.now(), dur = 1100;
    (function tick(now) {
      var k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      f.num.textContent = (f.score * e).toFixed(1);
      if (k < 1) f.countRaf = requestAnimationFrame(tick);
    })(t0);
  }
  function setFace(card, face) {
    var f = card.__sf;
    if (f.face === face) return;
    f.face = face;
    if (face === 1) {
      card.classList.add("sf-on");
      f.num.textContent = "0.0";
      countUp(card, true);
      if (navigator.vibrate && !reduce) { try { navigator.vibrate(6); } catch (e) {} }
    } else {
      card.classList.remove("sf-on");
      countUp(card, false);
    }
  }
  // critically-damped-ish spring toward the target angle, carrying the finger's speed
  function spring(card) {
    var f = card.__sf;
    if (f.raf) return;
    f.last = performance.now();
    (function step(now) {
      var dt = Math.min(0.032, (now - f.last) / 1000); f.last = now;
      var k = 150, c = 21;
      f.v += (-k * (f.ry - f.target) - c * f.v) * dt;
      f.ry += f.v * dt;
      applyRy(card);
      if (Math.abs(f.ry - f.target) < 0.15 && Math.abs(f.v) < 2) {
        f.ry = f.target; f.v = 0; f.raf = 0;
        var n = ((Math.round(f.target / 180) % 2) + 2) % 2;      // fold back to 0 / 180 so it never winds up
        f.ry = f.target = n * 180; applyRy(card);
        card.classList.remove("sf-flipping");
        return;
      }
      f.raf = requestAnimationFrame(step);
    })(f.last);
  }
  function settle(card, vel) {
    var f = card.__sf, start = f.startRy;
    var proj = f.ry + vel * 0.16;                       // vel in deg/s, a flick carries it ~0.16s further
    var t = Math.round(proj / 180) * 180;
    t = Math.max(start - 180, Math.min(start + 180, t));
    f.target = t;
    f.v = reduce ? 0 : vel * 0.35;
    setFace(card, ((Math.round(t / 180) % 2) + 2) % 2);
    if (reduce) { f.ry = t; applyRy(card); var n = ((Math.round(t / 180) % 2) + 2) % 2; f.ry = f.target = n * 180; applyRy(card); card.classList.remove("sf-flipping"); return; }
    spring(card);
  }

  var drag = null, swallow = 0;
  function dragStart(ev) {
    if (ev.pointerType === "mouse" && ev.button !== 0) return;
    if (ev.target.closest && ev.target.closest(".wishlist-heart")) return;
    var card = cardOf(ev.target);
    if (!card || !card.__sf) return;
    var f = card.__sf;
    if (f.raf) { cancelAnimationFrame(f.raf); f.raf = 0; f.startRy = f.ry; }
    drag = { card: card, id: ev.pointerId, x: ev.clientX, y: ev.clientY, mode: "wait", w: card.getBoundingClientRect().width || 320,
             startRy: f.ry, lx: ev.clientX, lt: performance.now(), vel: 0 };
    f.startRy = f.ry;
  }
  function dragMove(ev) {
    if (!drag || ev.pointerId !== drag.id) return;
    var dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
    if (drag.mode === "wait") {
      if (Math.abs(dy) > 9 && Math.abs(dy) > Math.abs(dx)) { drag = null; return; }       // it's a scroll
      if (Math.abs(dx) > 7 && Math.abs(dx) > Math.abs(dy) * 1.15) {
        drag.mode = "drag";
        try { drag.card.setPointerCapture(ev.pointerId); } catch (e) {}
        drag.card.classList.add("sf-dragging", "sf-flipping");
        drag.x = ev.clientX; drag.lx = ev.clientX; drag.lt = performance.now();
        dx = 0;
        if (drag.card.__sf.raf) { cancelAnimationFrame(drag.card.__sf.raf); drag.card.__sf.raf = 0; }
        if (ev.cancelable) ev.preventDefault();
      } else return;
    }
    var f = drag.card.__sf, now = performance.now();
    var next = drag.startRy + (ev.clientX - drag.x) / (drag.w * 0.85) * 180;
    next = Math.max(drag.startRy - 200, Math.min(drag.startRy + 200, next));
    var dt = Math.max(1, now - drag.lt);
    drag.vel = 0.7 * drag.vel + 0.3 * ((next - f.ry) / dt * 1000);
    drag.lt = now;
    f.ry = next; applyRy(drag.card);
    // the back's number counts the moment it is more than half turned
    var n = ((Math.round(next / 180) % 2) + 2) % 2;
    if (Math.abs(((next % 360) + 360) % 360 - 180) < 90 && f.face !== 1) setFace(drag.card, 1);
    else if (Math.abs(((next % 360) + 360) % 360 - 180) >= 90 && f.face !== 0 && n === 0) setFace(drag.card, 0);
  }
  function dragEnd(ev) {
    if (!drag || (ev && ev.pointerId !== drag.id)) return;
    var d = drag; drag = null;
    if (d.mode !== "drag") return;
    d.card.classList.remove("sf-dragging");
    swallow = performance.now() + 450;                   // the click that follows a drag must not open Amazon
    settle(d.card, d.vel);
  }
  document.addEventListener("pointerdown", dragStart, { passive: true });
  document.addEventListener("pointermove", dragMove, { passive: false });
  document.addEventListener("pointerup", dragEnd, { passive: true });
  document.addEventListener("pointercancel", dragEnd, { passive: true });
  document.addEventListener("click", function (ev) {
    if (swallow && performance.now() < swallow && cardOf(ev.target)) { ev.preventDefault(); ev.stopPropagation(); swallow = 0; }
  }, true);
  document.addEventListener("dragstart", function (ev) {
    var c = cardOf(ev.target); if (c && c.__sf) ev.preventDefault();
  });

  // a one-time, very slow "tilt" on the first scored card you see, so people know it turns
  var teased = false;
  try { teased = sessionStorage.getItem("sf-flip-tease") === "1"; } catch (e) {}
  function tease(card) {
    if (teased || reduce || !card.__sf || card.__sf.raf || card.__sf.ry !== 0) return;
    teased = true;
    try { sessionStorage.setItem("sf-flip-tease", "1"); } catch (e) {}
    var f = card.__sf;
    setTimeout(function () {
      if (drag || f.ry !== 0) return;
      card.classList.add("sf-flipping");
      f.startRy = 0; f.target = 17; f.v = 0; spring(card);
      setTimeout(function () { if (!drag && f.face === 0) { f.target = 0; spring(card); } }, 650);
    }, 700);
  }

  // ---- poster colour -> glass ----
  function wash(card) {
    var img = card.querySelector(".product-image img");
    if (!img) return;
    var src = img.currentSrc || img.getAttribute("src");
    if (!src || !img.complete || !img.naturalWidth) return;
    if (card.__sfWash === src) return;
    card.__sfWash = src;
    card.style.setProperty("--card-img", 'url("' + String(src).replace(/["\\\n\r]/g, "") + '")');
    card.setAttribute("data-wash", "");
  }
  document.addEventListener("load", function (ev) {
    var t = ev.target;
    if (t && t.tagName === "IMG") { var c = cardOf(t); if (c) wash(c); }
  }, true);

  function adopt(card) {
    if (card.__sfGlass) return;
    card.__sfGlass = true;
    var faces = [card];
    var panel = card.querySelector(".spoider-panel");
    if (panel) { var built = buildFlip(card, panel); if (built) faces = built; }
    var body = card.querySelector(".product-body");
    if (body) {
      var L = document.createElement("div");
      L.className = "sf-light"; L.setAttribute("aria-hidden", "true");
      L.innerHTML = '<i class="sf-glare"></i>';
      body.appendChild(L);
    }
    faces.forEach(function (f) {
      var R = document.createElement("div");
      R.className = "sf-rim"; R.setAttribute("aria-hidden", "true");
      R.innerHTML = "<i></i>";
      f.appendChild(R);
    });
    wash(card);
    if (ro) ro.observe(card);
    if (io) io.observe(card);
  }
  function scan(rootEl) {
    if (!rootEl || !rootEl.querySelectorAll) return;
    if (rootEl.matches && rootEl.matches(".product-card")) adopt(rootEl);
    var list = rootEl.querySelectorAll(".product-card");
    for (var i = 0; i < list.length; i++) adopt(list[i]);
  }
  if ("ResizeObserver" in window) {
    ro = new ResizeObserver(function (es) {
      es.forEach(function (e) {
        measure(e.target, { width: e.contentRect.width, height: e.contentRect.height });
        paint(e.target, get(e.target));
      });
    });
  }
  if ("IntersectionObserver" in window) {
    io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting) { visible.add(e.target); if (coarse && !reduce) kickPhone(); if (!teased && e.target.__sf && e.intersectionRatio > 0.6) tease(e.target); }
        else visible.delete(e.target);
      });
    }, { rootMargin: "80px 0px", threshold: [0, 0.6] });
  }
  var pending = 0;
  new MutationObserver(function () {
    if (pending) return;
    pending = requestAnimationFrame(function () { pending = 0; scan(document); });
  }).observe(document.documentElement, { childList: true, subtree: true });
  scan(document);
})();
