// Shared helpers for the Spoider Finds edge functions.
// The leading underscore keeps Vercel from exposing this file as a URL.
//
// Only the PUBLISHABLE Supabase key is used here (same one script.js already
// ships to every browser). Row-level security decides what it can read, so no
// secret keys or Vercel environment variables are needed.

export const SB_URL = 'https://gqnwinkddckytrfpnhng.supabase.co';
export const SB_KEY = 'sb_publishable_NYb3HMwKyHL1YxlOIWtcQg_NGJwDwmQ';

export const RANKS = [
  { n: 'Newbie', min: 0 },
  { n: 'Weaver', min: 1 },
  { n: 'Curator', min: 5 },
  { n: 'Architect', min: 10 },
  { n: 'Grandmaster', min: 25 }
];

export function rankFor(count) {
  var r = RANKS[0];
  for (var i = 0; i < RANKS.length; i++) if (count >= RANKS[i].min) r = RANKS[i];
  return r;
}

export function cleanUsername(raw) {
  var u = String(raw || '').trim().toLowerCase();
  return /^[a-z0-9_]{3,20}$/.test(u) ? u : null;
}

export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

export function clip(s, n) {
  s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
}

// Only plain https links to real hostnames (no IPs, no localhost).
export function safeHttps(raw, base) {
  try {
    var u = new URL(String(raw || '').trim(), base);
    if (u.protocol !== 'https:') return null;
    var h = u.hostname;
    if (h === 'localhost' || /^[\d.]+$/.test(h) || h.indexOf(':') > -1 || h.indexOf('.') < 0) return null;
    return u.href;
  } catch (e) {
    return null;
  }
}

function withTimeout(ms) {
  var ctl = new AbortController();
  var t = setTimeout(function () { ctl.abort(); }, ms);
  return { signal: ctl.signal, done: function () { clearTimeout(t); } };
}

// GET from Supabase REST. Returns parsed JSON, or null on any failure.
export async function sbGet(path, ms) {
  var to = withTimeout(ms || 3000);
  try {
    var res = await fetch(SB_URL + '/rest/v1/' + path, {
      headers: { apikey: SB_KEY, Accept: 'application/json' },
      signal: to.signal
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  } finally {
    to.done();
  }
}

export async function getProfile(username) {
  var rows = await sbGet(
    'profiles?username=eq.' + encodeURIComponent(username) +
    '&select=id,username,display_name,avatar_url,bio,theme,created_at&limit=1'
  );
  return rows && rows[0] ? rows[0] : null;
}

// Owned items for a profile: how many, and which one is pinned as the grail.
export async function getOwned(userId) {
  var rows = await sbGet(
    'owned_products?user_id=eq.' + encodeURIComponent(userId) +
    '&select=pinned,products(title,image_url,active)&order=owned_at.desc&limit=500'
  );
  if (!rows) return { count: 0, grail: null };
  var items = rows.filter(function (r) { return r.products && r.products.active !== false; });
  var g = items.filter(function (r) { return r.pinned; })[0];
  return {
    count: items.length,
    grail: g ? { title: g.products.title, image_url: g.products.image_url } : null
  };
}
