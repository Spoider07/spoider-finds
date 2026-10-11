// /go/<product-id>  ->  logs the click, then redirects to the product's affiliate link.
//
// Use it for places where script.js can't track taps: Pinterest pins,
// Instagram bio/stories, WhatsApp shares.
//   https://spoider-finds.vercel.app/go/12?src=pinterest
//
// Clicks land in the same public.clicks table as before, with page = "go:<src>".
import { SB_URL, SB_KEY, sbGet, safeHttps, clip } from './_shared.js';

export const config = { runtime: 'edge' };

// Link-preview bots and crawlers must not count as real clicks.
var BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|embedly|headless/i;

async function logClick(product, src) {
  var ctl = new AbortController();
  var t = setTimeout(function () { ctl.abort(); }, 1200);
  try {
    await fetch(SB_URL + '/rest/v1/clicks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SB_KEY, Prefer: 'return=minimal' },
      body: JSON.stringify({
        product_id: String(product.id),
        product_title: clip(product.title, 200) || null,
        region: product.region === 'india' ? 'in' : 'us',
        page: ('go:' + src).slice(0, 200)
      }),
      signal: ctl.signal
    });
  } catch (e) {
    /* tracking must never block the redirect */
  } finally {
    clearTimeout(t);
  }
}

export default async function handler(request) {
  var url = new URL(request.url);
  var home = Response.redirect(url.origin + '/', 302);

  var id = url.searchParams.get('id') || '';
  if (!/^\d{1,12}$/.test(id)) return home;

  var src = (url.searchParams.get('src') || 'direct').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 20) || 'direct';

  var rows = await sbGet('products?id=eq.' + id + '&active=eq.true&select=id,title,affiliate_link,region&limit=1');
  var product = rows && rows[0];
  var target = product ? safeHttps(product.affiliate_link) : null;
  if (!target) return home;

  if (!BOT.test(request.headers.get('user-agent') || '')) await logClick(product, src);

  return new Response(null, {
    status: 302,
    headers: {
      Location: target,
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow'
    }
  });
}
