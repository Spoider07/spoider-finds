// ============================================================
// Spoider Finds — auth (Google sign-in via Supabase)
//
// Loaded once by transitions.js, which lives outside #page-wrap,
// so this never re-runs on AJAX page swaps and the header UI
// survives every transition. Injects its own styles and its own
// markup:
//   - desktop (>= 761px): pill in the header; avatar + account
//     popover once signed in
//   - mobile (<= 760px): the header has no spare room, so the
//     entry sits at the top of the hamburger menu
//
// The visitor session lives under its own storage key
// ("sf-user-auth") on purpose: other Supabase clients on the site
// (page loaders, admin panel) never see or touch it, and it can
// never mix with the admin session.
//
// Hooks for later features (profiles, "I own this"):
//   window.SpoiderAuth.client / .getUser() / .onChange(fn)
// ============================================================

(function () {
  "use strict";
  if (window.SpoiderAuth) return;

  var SUPABASE_URL = "https://gqnwinkddckytrfpnhng.supabase.co";
  var SUPABASE_KEY = "sb_publishable_NYb3HMwKyHL1YxlOIWtcQg_NGJwDwmQ";
  var STORAGE_KEY = "sf-user-auth";
  var PENDING_KEY = "sf-auth-pending";

  var G_ICON =
    '<svg viewBox="0 0 48 48" aria-hidden="true">' +
    '<path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>' +
    '<path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>' +
    '<path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>' +
    '<path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>' +
    "</svg>";

  var OUT_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>';

  var client = null;
  var state = { user: null, profile: null, busy: false };
  var subscribers = [];
  var refs = { wrap: null, mobile: null };
  var toastTimer = null;

  // ---------- styles ----------
  function injectStyles() {
    if (document.getElementById("sf-auth-styles")) return;
    var css = `
.auth-wrap{position:relative;margin-left:14px;flex-shrink:0;}
.auth-btn{display:inline-flex;align-items:center;gap:9px;height:34px;padding:0 16px 0 7px;border-radius:999px;background:var(--surface);border:1px solid var(--border);color:var(--text-primary);font-family:var(--font-body);font-weight:500;font-size:.82rem;cursor:pointer;-webkit-tap-highlight-color:transparent;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);transition:border-color .3s var(--ease),background .3s var(--ease),color .3s var(--ease),transform .2s var(--ease),box-shadow .3s var(--ease);}
.auth-btn:hover{border-color:var(--gold-dim);color:var(--gold-bright);background:var(--surface-hover);box-shadow:0 12px 28px -16px var(--shadow-soft),0 0 0 1px var(--gold-dim);}
.auth-btn:active{transform:scale(.95);}
.auth-btn[disabled],.auth-mobile-btn[disabled]{opacity:.75;cursor:progress;}
.auth-g{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:#fff;flex-shrink:0;}
.auth-g svg{width:13px;height:13px;display:block;}
.auth-spin{width:14px;height:14px;margin:0 4px 0 4px;border-radius:50%;border:2px solid var(--gold-dim);border-top-color:var(--gold-bright);animation:authSpin .7s linear infinite;flex-shrink:0;}
@keyframes authSpin{to{transform:rotate(360deg);}}
.auth-avatar-btn{display:block;width:34px;height:34px;padding:0;border-radius:50%;overflow:hidden;background:var(--surface);border:1px solid var(--gold-dim);cursor:pointer;-webkit-tap-highlight-color:transparent;transition:border-color .3s var(--ease),box-shadow .3s var(--ease),transform .2s var(--ease);}
.auth-avatar-btn:hover,.auth-avatar-btn[aria-expanded="true"]{border-color:var(--gold);box-shadow:0 0 0 3px var(--gold-dim);}
.auth-avatar-btn:active{transform:scale(.93);}
.auth-av-img{width:100%;height:100%;object-fit:cover;display:block;}
.auth-initial{display:flex;width:100%;height:100%;align-items:center;justify-content:center;font-family:var(--font-display);font-weight:600;font-size:.95rem;color:var(--gold-bright);background:var(--gold-dim);}
.auth-pop{position:absolute;top:calc(100% + 14px);right:0;width:264px;padding:18px;border-radius:var(--radius-md);background:var(--bg-elevated);border:1px solid var(--border);box-shadow:0 28px 56px -24px var(--shadow-soft),0 0 0 1px var(--gold-dim);opacity:0;visibility:hidden;pointer-events:none;transform:translateY(-6px) scale(.97);transform-origin:top right;transition:opacity .25s var(--ease),transform .38s var(--ease-spring),visibility 0s linear .38s;z-index:120;}
.auth-pop.is-open{opacity:1;visibility:visible;pointer-events:auto;transform:none;transition-delay:0s;}
.auth-pop::before{content:"";position:absolute;top:0;left:14%;right:14%;height:1px;background:linear-gradient(90deg,transparent,var(--gold-bright),transparent);opacity:.7;}
.auth-pop-user{display:flex;align-items:center;gap:12px;margin-bottom:16px;}
.auth-pop-av{width:46px;height:46px;border-radius:50%;overflow:hidden;flex-shrink:0;border:1px solid var(--gold-dim);}
.auth-pop-text{min-width:0;}
.auth-pop-name{display:block;font-family:var(--font-display);font-weight:500;font-size:1.05rem;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.auth-pop-mail{display:block;margin-top:3px;font-size:.76rem;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.auth-out{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:11px 14px;border-radius:999px;background:transparent;border:1px solid var(--border);color:var(--text-secondary);font-family:var(--font-body);font-weight:500;font-size:.85rem;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:border-color .25s var(--ease),color .25s var(--ease),background .25s var(--ease),transform .2s var(--ease);}
.auth-out svg{width:15px;height:15px;display:block;}
.auth-out:hover{border-color:var(--gold-dim);color:var(--gold-bright);background:var(--surface-hover);}
.auth-out:active{transform:scale(.96);}
.auth-mobile{display:none;padding:14px 0 16px;border-bottom:1px solid var(--border);}
.auth-mobile-btn{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:13px 18px;border-radius:999px;border:none;background:var(--gold);color:#0a0a0b;font-family:var(--font-body);font-weight:600;font-size:.92rem;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:background .2s var(--ease),transform .2s var(--ease),box-shadow .2s var(--ease);}
.auth-mobile-btn:active{transform:scale(.97);box-shadow:0 0 24px -2px rgba(201,168,118,.7);}
.auth-mobile-btn .auth-spin{border-color:rgba(10,10,11,.2);border-top-color:#0a0a0b;}
.auth-mobile-user{display:flex;align-items:center;gap:12px;}
.auth-mobile-av{width:42px;height:42px;border-radius:50%;overflow:hidden;flex-shrink:0;border:1px solid var(--gold-dim);}
.auth-mobile-text{flex:1;min-width:0;}
.auth-mobile-name{display:block;font-family:var(--font-display);font-weight:500;font-size:1rem;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.auth-mobile-mail{display:block;margin-top:2px;font-size:.74rem;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.auth-mobile-out{flex-shrink:0;padding:8px 16px;border-radius:999px;background:transparent;border:1px solid var(--border);color:var(--text-secondary);font-family:var(--font-body);font-weight:500;font-size:.8rem;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:border-color .25s var(--ease),color .25s var(--ease),transform .2s var(--ease);}
.auth-mobile-out:active{transform:scale(.95);border-color:var(--gold);color:var(--gold);}
.auth-toast{position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom,0px));z-index:10000;display:flex;align-items:center;gap:11px;max-width:min(92vw,380px);padding:12px 20px;border-radius:999px;background:var(--bg-elevated);border:1px solid var(--gold-dim);box-shadow:0 20px 44px -20px var(--shadow-soft),0 0 0 1px var(--gold-dim);color:var(--text-primary);font-family:var(--font-body);font-weight:500;font-size:.85rem;pointer-events:none;opacity:0;transform:translate(-50%,16px);transition:opacity .35s var(--ease),transform .5s var(--ease-spring);}
.auth-toast.is-in{opacity:1;transform:translate(-50%,0);}
.auth-toast-dot{width:7px;height:7px;border-radius:50%;background:var(--gold-bright);box-shadow:0 0 10px rgba(232,199,102,.7);flex-shrink:0;}
@media (max-width:760px){.auth-wrap{display:none;}.auth-mobile{display:block;}}
@media (prefers-reduced-motion:reduce){.auth-spin{animation:none;}.auth-pop,.auth-toast{transition:none;}}
`;
    var el = document.createElement("style");
    el.id = "sf-auth-styles";
    el.textContent = css;
    document.head.appendChild(el);
  }

  // ---------- helpers ----------
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function identity() {
    var u = state.user;
    if (!u) return null;
    var m = u.user_metadata || {};
    var p = state.profile || {};
    var name = p.display_name || m.full_name || m.name || (u.email ? u.email.split("@")[0] : "Member");
    return {
      name: name,
      first: String(name).split(" ")[0],
      email: u.email || "",
      avatar: p.avatar_url || m.avatar_url || m.picture || "",
    };
  }

  function avatarMarkup(id) {
    var initial = esc((id.name || "?").trim().charAt(0).toUpperCase() || "?");
    if (!id.avatar) return '<span class="auth-initial">' + initial + "</span>";
    return (
      '<img class="auth-av-img" src="' + esc(id.avatar) + '" alt="" referrerpolicy="no-referrer" decoding="async" data-initial="' + initial + '">'
    );
  }

  // Google avatar URLs can fail to load — fall back to the initial
  function wireAvatars(root) {
    var imgs = root.querySelectorAll(".auth-av-img");
    for (var i = 0; i < imgs.length; i++) {
      (function (img) {
        img.addEventListener(
          "error",
          function () {
            var s = document.createElement("span");
            s.className = "auth-initial";
            s.textContent = img.getAttribute("data-initial") || "?";
            if (img.parentNode) img.parentNode.replaceChild(s, img);
          },
          { once: true }
        );
      })(imgs[i]);
    }
  }

  function toast(msg) {
    var el = document.getElementById("sfAuthToast");
    if (!el) {
      el = document.createElement("div");
      el.id = "sfAuthToast";
      el.className = "auth-toast";
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "polite");
      document.body.appendChild(el);
    }
    el.innerHTML = '<span class="auth-toast-dot"></span><span class="auth-toast-msg"></span>';
    el.querySelector(".auth-toast-msg").textContent = msg;
    void el.offsetWidth;
    el.classList.add("is-in");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.remove("is-in");
    }, 3400);
  }

  function setPending(on) {
    try {
      if (on) sessionStorage.setItem(PENDING_KEY, "1");
      else sessionStorage.removeItem(PENDING_KEY);
    } catch (e) {}
  }
  function takePending() {
    try {
      var v = sessionStorage.getItem(PENDING_KEY) === "1";
      if (v) sessionStorage.removeItem(PENDING_KEY);
      return v;
    } catch (e) {
      return false;
    }
  }

  // ---------- rendering ----------
  function signinInner(label) {
    if (state.busy) return '<span class="auth-spin"></span><span class="auth-label">Connecting…</span>';
    return '<span class="auth-g">' + G_ICON + '</span><span class="auth-label">' + label + "</span>";
  }

  function renderDesktop() {
    var id = identity();
    if (!id) {
      refs.wrap.innerHTML =
        '<button class="auth-btn" type="button" data-auth="signin"' + (state.busy ? " disabled" : "") + ">" + signinInner("Sign in") + "</button>";
      return;
    }
    var wasOpen = isPopOpen();
    refs.wrap.innerHTML =
      '<button class="auth-avatar-btn" type="button" data-auth="toggle" aria-haspopup="true" aria-expanded="' + wasOpen + '" aria-label="Account menu">' + avatarMarkup(id) + "</button>" +
      '<div class="auth-pop' + (wasOpen ? " is-open" : "") + '" role="menu">' +
        '<div class="auth-pop-user">' +
          '<span class="auth-pop-av">' + avatarMarkup(id) + "</span>" +
          '<span class="auth-pop-text"><span class="auth-pop-name">' + esc(id.name) + '</span><span class="auth-pop-mail">' + esc(id.email) + "</span></span>" +
        "</div>" +
        '<button class="auth-out" type="button" role="menuitem" data-auth="signout">' + OUT_ICON + "Sign out</button>" +
      "</div>";
    wireAvatars(refs.wrap);
  }

  function renderMobile() {
    var id = identity();
    if (!id) {
      refs.mobile.innerHTML =
        '<button class="auth-mobile-btn" type="button" data-auth="signin"' + (state.busy ? " disabled" : "") + ">" + signinInner("Continue with Google") + "</button>";
      return;
    }
    refs.mobile.innerHTML =
      '<div class="auth-mobile-user">' +
        '<span class="auth-mobile-av">' + avatarMarkup(id) + "</span>" +
        '<span class="auth-mobile-text"><span class="auth-mobile-name">' + esc(id.name) + '</span><span class="auth-mobile-mail">' + esc(id.email) + "</span></span>" +
        '<button class="auth-mobile-out" type="button" data-auth="signout">Sign out</button>' +
      "</div>";
    wireAvatars(refs.mobile);
  }

  function render() {
    if (refs.wrap) renderDesktop();
    if (refs.mobile) renderMobile();
  }

  function notify() {
    for (var i = 0; i < subscribers.length; i++) {
      try {
        subscribers[i](state.user);
      } catch (e) {}
    }
  }

  // ---------- account popover ----------
  function isPopOpen() {
    var p = refs.wrap && refs.wrap.querySelector(".auth-pop");
    return !!(p && p.classList.contains("is-open"));
  }
  function setPop(open) {
    var pop = refs.wrap && refs.wrap.querySelector(".auth-pop");
    var btn = refs.wrap && refs.wrap.querySelector(".auth-avatar-btn");
    if (!pop || !btn) return;
    pop.classList.toggle("is-open", open);
    btn.setAttribute("aria-expanded", open ? "true" : "false");
  }

  // ---------- auth actions ----------
  function signIn() {
    if (state.busy) return;
    if (!client) {
      toast("Sign in is still loading — try again in a moment.");
      return;
    }
    state.busy = true;
    render();
    setPending(true);
    client.auth
      .signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin + window.location.pathname + window.location.search,
          queryParams: { prompt: "select_account" },
        },
      })
      .then(function (res) {
        if (res && res.error) throw res.error;
      })
      .catch(function () {
        state.busy = false;
        setPending(false);
        render();
        toast("Couldn't reach Google. Please try again.");
      });
  }

  function signOut() {
    setPop(false);
    if (!client) return;
    client.auth.signOut({ scope: "local" }).then(function () {
      toast("Signed out.");
    });
  }

  function loadProfile(uid) {
    client
      .from("profiles")
      .select("display_name, username, avatar_url")
      .eq("id", uid)
      .maybeSingle()
      .then(function (res) {
        if (state.user && state.user.id === uid && res && res.data) {
          state.profile = res.data;
          render();
          notify();
        }
      });
  }

  function applySession(session, event) {
    var user = session && session.user ? session.user : null;
    var changed = (state.user && state.user.id) !== (user && user.id);
    state.user = user;
    if (!user) state.profile = null;
    state.busy = false;
    render();
    if (user) {
      if (changed || !state.profile) loadProfile(user.id);
      if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && takePending()) {
        toast("Welcome, " + identity().first + ".");
      }
    }
    if (changed) notify();
  }

  // ---------- supabase ----------
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

  function startClient() {
    if (!window.supabase || typeof window.supabase.createClient !== "function") return;
    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        flowType: "pkce",
        storageKey: STORAGE_KEY,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
    window.SpoiderAuth.client = client;
    // callback stays synchronous and light — any supabase call inside it
    // is deferred, otherwise the client can deadlock on itself
    client.auth.onAuthStateChange(function (event, session) {
      setTimeout(function () {
        applySession(session, event);
      }, 0);
    });
  }

  // ---------- mount ----------
  function mountUI() {
    var inner = document.querySelector(".nav-inner");
    if (inner && !document.getElementById("sfAuthWrap")) {
      var wrap = document.createElement("div");
      wrap.className = "auth-wrap";
      wrap.id = "sfAuthWrap";
      inner.insertBefore(wrap, inner.querySelector(".nav-toggle"));
      refs.wrap = wrap;
    }
    var mob = document.getElementById("navMobile") || document.querySelector(".nav-mobile");
    if (mob && !document.getElementById("sfAuthMobile")) {
      var m = document.createElement("div");
      m.className = "auth-mobile";
      m.id = "sfAuthMobile";
      mob.insertBefore(m, mob.firstChild);
      refs.mobile = m;
    }
    render();
  }

  // Google can send the visitor back with an error (e.g. they cancelled)
  function handleReturnParams() {
    try {
      var sp = new URLSearchParams(window.location.search);
      var hp = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      var failed = sp.get("error") || sp.get("error_description") || hp.get("error") || hp.get("error_description");
      if (!failed) return;
      setPending(false);
      toast("Sign in didn't go through. Please try again.");
      ["error", "error_code", "error_description"].forEach(function (k) {
        sp.delete(k);
      });
      var qs = sp.toString();
      var keepHash = hp.get("error") || hp.get("error_description") ? "" : window.location.hash;
      window.history.replaceState(window.history.state, "", window.location.pathname + (qs ? "?" + qs : "") + keepHash);
    } catch (e) {}
  }

  function bindGlobal() {
    document.addEventListener("click", function (e) {
      var t = e.target.closest("[data-auth]");
      if (t) {
        var action = t.getAttribute("data-auth");
        if (action === "signin") signIn();
        else if (action === "signout") signOut();
        else if (action === "toggle") setPop(!isPopOpen());
        return;
      }
      if (isPopOpen() && !e.target.closest(".auth-pop")) setPop(false);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && isPopOpen()) setPop(false);
    });
    // coming back via the browser's back button can restore a frozen
    // "Connecting…" state from bfcache — reset it
    window.addEventListener("pageshow", function (e) {
      if (e.persisted && state.busy) {
        state.busy = false;
        setPending(false);
        render();
      }
    });
  }

  window.SpoiderAuth = {
    client: null,
    getUser: function () {
      return state.user;
    },
    onChange: function (fn) {
      if (typeof fn === "function") subscribers.push(fn);
    },
    signIn: signIn,
    signOut: signOut,
  };

  function boot() {
    injectStyles();
    mountUI();
    bindGlobal();
    handleReturnParams();
    ensureSupabaseLib(startClient);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
