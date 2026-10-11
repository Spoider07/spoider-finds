// /api/og?u=<username>  ->  1200x630 share card (black + metal accent) for a profile.
//
// Built server-side, so there are no browser CORS limits on avatars or product
// images. Anything that fails to load (font, avatar, grail image) is simply
// skipped; the card still renders.
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rankFor, getProfile, getOwned, cleanUsername, clip, safeHttps } from './_shared.js';

// @vercel/og bundles old-style (CommonJS) code that expects `require`,
// `__dirname` and `__filename`. An ES-module project has none of them, which
// crashes with 'Dynamic require of "fs"' / '__dirname is not defined'.
// We hand them over before the library loads.
var nodeRequire = createRequire(import.meta.url);
if (typeof globalThis.require === 'undefined') globalThis.require = nodeRequire;
if (typeof globalThis.__dirname === 'undefined') {
  var ogDir;
  try {
    ogDir = dirname(nodeRequire.resolve('@vercel/og'));
  } catch (e) {
    ogDir = join(process.cwd(), 'node_modules', '@vercel', 'og', 'dist');
  }
  globalThis.__dirname = ogDir;
  globalThis.__filename = join(ogDir, 'index.node.js');
}

// NOTE: this one runs on the normal Node.js runtime (no edge config on purpose).
// Vercel's edge bundler rejects @vercel/og in a plain static project.

// Same metals as the profile "Accent" picker.
var ACCENTS = {
  gold: ['201,168,118', '232,199,102'],
  silver: ['176,184,198', '226,232,242'],
  bone: ['214,206,190', '244,238,224'],
  copper: ['201,128,96', '238,168,128'],
  emerald: ['92,176,140', '138,222,182'],
  ink: ['112,150,214', '160,192,244']
};

// ---------- fonts (cached per warm instance; any failure falls back to the default font) ----------
var FONT_URLS = {
  fraunces: [
    'https://cdn.jsdelivr.net/fontsource/fonts/fraunces@latest/latin-500-normal.woff',
    'https://cdn.jsdelivr.net/npm/@fontsource/fraunces/files/fraunces-latin-500-normal.woff'
  ],
  inter: [
    'https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-500-normal.woff',
    'https://cdn.jsdelivr.net/npm/@fontsource/inter/files/inter-latin-500-normal.woff'
  ]
};
var fontsPromise = null;

async function fetchFirst(urls) {
  for (var i = 0; i < urls.length; i++) {
    var ctl = new AbortController();
    var t = setTimeout(function () { ctl.abort(); }, 3000);
    try {
      var res = await fetch(urls[i], { signal: ctl.signal });
      if (res.ok) return await res.arrayBuffer();
    } catch (e) { /* try the next url */ } finally { clearTimeout(t); }
  }
  return null;
}

function loadFonts() {
  if (!fontsPromise) {
    fontsPromise = Promise.all([fetchFirst(FONT_URLS.fraunces), fetchFirst(FONT_URLS.inter)]).then(function (r) {
      var out = [];
      if (r[0]) out.push({ name: 'Fraunces', data: r[0], weight: 500, style: 'normal' });
      if (r[1]) out.push({ name: 'Inter', data: r[1], weight: 500, style: 'normal' });
      if (!out.length) fontsPromise = null; // retry on the next request
      return out;
    });
  }
  return fontsPromise;
}

// ---------- images -> data URIs (png / jpeg / gif only, size capped) ----------
function toBase64(buf) {
  var bytes = new Uint8Array(buf), s = '';
  for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function sniff(buf) {
  var b = new Uint8Array(buf.slice(0, 4));
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
  return null;
}

async function imageData(raw, base, maxBytes) {
  var href = safeHttps(raw, base);
  if (!href) return null;
  var ctl = new AbortController();
  var t = setTimeout(function () { ctl.abort(); }, 3500);
  try {
    var res = await fetch(href, { signal: ctl.signal });
    if (!res.ok) return null;
    var buf = await res.arrayBuffer();
    if (buf.byteLength > maxBytes) return null;
    var mime = sniff(buf);
    return mime ? 'data:' + mime + ';base64,' + toBase64(buf) : null;
  } catch (e) {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// ---------- tiny element helper (no JSX needed) ----------
function h(type, style, children, extra) {
  var props = Object.assign({}, extra || {});
  props.style = style;
  if (children !== undefined) props.children = children;
  return { type: type, props: props };
}

function card(d) {
  var A = 'rgb(' + d.ac[0] + ')', B = 'rgb(' + d.ac[1] + ')', soft = function (a) { return 'rgba(' + d.ac[0] + ',' + a + ')'; };
  var serif = d.hasSerif ? 'Fraunces' : 'Inter';
  var sans = d.hasSans ? 'Inter' : 'Fraunces';
  var tx = { color: '#f1ece2' }, muted = { color: '#9a958b' };

  // ----- left column -----
  var avatar = d.avatar
    ? h('img', { width: 112, height: 112, borderRadius: 56, objectFit: 'cover', border: '3px solid ' + A }, undefined, { src: d.avatar, width: 112, height: 112 })
    : h('div', { width: 112, height: 112, borderRadius: 56, border: '3px solid ' + A, alignItems: 'center', justifyContent: 'center', fontFamily: serif, fontSize: 54, color: B, display: 'flex' },
        (d.name.charAt(0) || 'S').toUpperCase());

  var nameSize = d.name.length > 22 ? 48 : (d.name.length > 15 ? 58 : 68);

  var who = h('div', { display: 'flex', alignItems: 'center' }, [
    avatar,
    h('div', { display: 'flex', flexDirection: 'column', marginLeft: 30 }, [
      h('div', Object.assign({ fontFamily: serif, fontSize: nameSize, lineHeight: 1.08 }, tx), d.name),
      h('div', { fontFamily: sans, fontSize: 28, color: B, marginTop: 8 }, '@' + d.username)
    ])
  ]);

  var stats = h('div', { display: 'flex', alignItems: 'flex-end' }, [
    h('div', { display: 'flex', flexDirection: 'column' }, [
      h('div', { fontFamily: serif, fontSize: 124, lineHeight: 1, color: B }, String(d.count)),
      h('div', Object.assign({ fontFamily: sans, fontSize: 18, letterSpacing: 5, marginTop: 10 }, muted), d.count === 1 ? 'FIND OWNED' : 'FINDS OWNED')
    ]),
    h('div', { display: 'flex', marginLeft: 56, marginBottom: 12, padding: '12px 28px', border: '1px solid ' + soft(0.55), borderRadius: 999, fontFamily: sans, fontSize: 20, letterSpacing: 5, color: A },
      d.rank.toUpperCase())
  ]);

  var left = h('div', { display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: 700, height: 630, padding: '78px 0 78px 84px' }, [
    h('div', { display: 'flex', alignItems: 'center', fontFamily: sans, fontSize: 20, letterSpacing: 7, color: A }, 'SPOIDER FINDS'),
    who,
    stats
  ]);

  // ----- right column: the grail, or quiet concentric rings -----
  // (the grail photo is kept at 250px on purpose: WhatsApp drops to a tiny thumbnail
  //  when the image file is much over ~300 KB, and photos are what make a PNG heavy)
  var right;
  if (d.grail && d.grail.src) {
    right = h('div', { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: 500, height: 630 }, [
      h('div', { display: 'flex', fontFamily: sans, fontSize: 18, letterSpacing: 7, color: A, marginBottom: 20 }, 'THE GRAIL'),
      h('div', { display: 'flex', width: 250, height: 250, borderRadius: 22, overflow: 'hidden', border: '2px solid ' + soft(0.6) },
        h('img', { width: 250, height: 250, objectFit: 'cover' }, undefined, { src: d.grail.src, width: 250, height: 250 })),
      h('div', Object.assign({ display: 'flex', fontFamily: sans, fontSize: 22, marginTop: 22, maxWidth: 300, textAlign: 'center', justifyContent: 'center' }, muted), clip(d.grail.title, 44))
    ]);
  } else {
    var ring = function (size, off, a) {
      return h('div', { position: 'absolute', top: off, left: off, width: size, height: size, borderRadius: size / 2, border: '1px solid ' + soft(a), display: 'flex' });
    };
    right = h('div', { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 500, height: 630 },
      h('div', { display: 'flex', position: 'relative', width: 340, height: 340 }, [
        ring(340, 0, 0.18), ring(240, 50, 0.3), ring(140, 100, 0.5),
        h('div', { position: 'absolute', top: 0, left: 0, width: 340, height: 340, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: serif, fontSize: 96, color: B }, 'S')
      ]));
  }

  return h('div', { display: 'flex', width: 1200, height: 630, backgroundColor: '#0a0a0b', position: 'relative' }, [
    h('div', { position: 'absolute', top: 24, left: 24, right: 24, bottom: 24, border: '1px solid ' + soft(0.3), borderRadius: 28, display: 'flex' }),
    left,
    right
  ]);
}

function brandCard(d) {
  var serif = d.hasSerif ? 'Fraunces' : 'Inter';
  var sans = d.hasSans ? 'Inter' : 'Fraunces';
  return h('div', { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: 1200, height: 630, backgroundColor: '#0a0a0b' }, [
    h('div', { display: 'flex', fontFamily: sans, fontSize: 22, letterSpacing: 9, color: 'rgb(201,168,118)' }, 'A THREAD OF GOOD TASTE'),
    h('div', { display: 'flex', fontFamily: serif, fontSize: 110, color: 'rgb(232,199,102)', marginTop: 24 }, 'Spoider Finds')
  ]);
}

// Classic Node handler (req, res): works on every Vercel Node runtime version.
export default async function handler(req, res) {
  try {
    var host = req.headers.host || 'spoider-finds.vercel.app';
    var proto = req.headers['x-forwarded-proto'] || 'https';
    var url = new URL(req.url, proto + '://' + host);
    var resp = await render(url);
    var buf = Buffer.from(await resp.arrayBuffer());
    res.statusCode = 200;
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Length', String(buf.length));
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    res.end(buf);
  } catch (e) {
    // Show the real error in the browser instead of a blank page (easier to debug).
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end('og error: ' + (e && e.stack ? e.stack : String(e)));
  }
}

async function render(url) {
  var mod = await import('@vercel/og');
  var ImageResponse = mod.ImageResponse;
  var username = cleanUsername(url.searchParams.get('u'));
  var fonts = await loadFonts();
  var meta = {
    hasSerif: fonts.some(function (f) { return f.name === 'Fraunces'; }),
    hasSans: fonts.some(function (f) { return f.name === 'Inter'; })
  };
  var opts = {
    width: 1200,
    height: 630,
    fonts: fonts,
    headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' }
  };

  var profile = username ? await getProfile(username) : null;
  if (!profile) return new ImageResponse(brandCard(meta), opts);

  var owned = await getOwned(profile.id);
  var theme = profile.theme && typeof profile.theme === 'object' ? profile.theme : {};
  var results = await Promise.all([
    profile.avatar_url ? imageData(profile.avatar_url, url.origin, 1500000) : null,
    owned.grail && owned.grail.image_url ? imageData(owned.grail.image_url, url.origin, 3500000) : null
  ]);

  var tree = card(Object.assign(meta, {
    name: clip(profile.display_name || profile.username, 30),
    username: profile.username,
    count: owned.count,
    rank: rankFor(owned.count).n,
    ac: ACCENTS[theme.accent] || ACCENTS.gold,
    avatar: results[0],
    grail: owned.grail ? { title: owned.grail.title, src: results[1] } : null
  }));
  return new ImageResponse(tree, opts);
}
