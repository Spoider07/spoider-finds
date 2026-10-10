/* presence.js — anonymous "who is on the site right now" counter.
 *
 * Each open, visible tab joins one Supabase Realtime presence channel
 * ("site-presence") under a random per-tab id. The admin panel joins the
 * same channel read-only and counts the ids. Nothing is stored in the
 * database, and no personal data is sent: only a random id and the page
 * path. When a tab is hidden or closed it leaves the channel automatically.
 *
 * Loaded once per full page load. transitions.js only swaps #page-wrap, so
 * this keeps running across in-site navigation without reconnecting.
 */
(function () {
  'use strict';
  if (window.__spoiderPresence) return;
  window.__spoiderPresence = true;

  var SUPABASE_URL = 'https://gqnwinkddckytrfpnhng.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_NYb3HMwKyHL1YxlOIWtcQg_NGJwDwmQ';
  var CHANNEL = 'site-presence';

  // Never count the admin panel itself.
  if (/(^|\/)admin(\.html)?$/i.test(location.pathname)) return;

  // Random id, kept for the lifetime of this tab so a reload isn't counted twice.
  var tabId;
  try {
    tabId = sessionStorage.getItem('sf-tab-id');
    if (!tabId) {
      tabId = 't' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      sessionStorage.setItem('sf-tab-id', tabId);
    }
  } catch (e) {
    tabId = 't' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  var channel = null;
  var subscribed = false;

  function pagePath() {
    var p = location.pathname.split('/').pop() || 'index.html';
    return p.replace(/\.html$/i, '') || 'index';
  }

  function track() {
    if (!channel || !subscribed || document.hidden) return;
    try { channel.track({ p: pagePath(), t: Date.now() }); } catch (e) {}
  }

  function untrack() {
    if (!channel || !subscribed) return;
    try { channel.untrack(); } catch (e) {}
  }

  function connect() {
    if (!window.supabase || typeof window.supabase.createClient !== 'function') return;
    try {
      // Separate, session-less client: must never touch the site's real auth state.
      var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
      });
      channel = client.channel(CHANNEL, { config: { presence: { key: tabId } } });
      channel.subscribe(function (status) {
        if (status === 'SUBSCRIBED') {
          subscribed = true;
          track();
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          subscribed = false;
        }
      });

      document.addEventListener('visibilitychange', function () {
        if (document.hidden) untrack(); else track();
      });
      // Keep the page path fresh when the AJAX transitions change the URL.
      window.addEventListener('popstate', track);
      var lastPath = location.pathname;
      setInterval(function () {
        if (location.pathname !== lastPath) { lastPath = location.pathname; track(); }
      }, 3000);
      window.addEventListener('pagehide', untrack);
    } catch (e) { /* presence is best-effort; never break the site */ }
  }

  function ensureLib(cb) {
    if (window.supabase && typeof window.supabase.createClient === 'function') { cb(); return; }
    var existing = document.querySelector('script[data-supabase-lib]');
    if (existing) { existing.addEventListener('load', cb, { once: true }); return; }
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    s.setAttribute('data-supabase-lib', 'true');
    s.onload = cb;
    document.head.appendChild(s);
  }

  // Start after the page has settled so it never competes with first paint.
  function start() { ensureLib(connect); }
  function later() {
    if ('requestIdleCallback' in window) requestIdleCallback(start, { timeout: 4000 });
    else setTimeout(start, 2500);
  }
  if (document.readyState === 'complete') later();
  else window.addEventListener('load', later);
})();
