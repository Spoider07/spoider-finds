// /u/<username>  ->  a share-friendly page for a profile.
//
// Link-preview bots (WhatsApp, Instagram DMs, Telegram, X, Discord) read the
// Open Graph tags below and show a rich card with the generated image from
// /api/og. Real visitors are sent straight on to the normal profile page.
import { rankFor, getProfile, getOwned, cleanUsername, esc, clip } from './_shared.js';

export const config = { runtime: 'edge' };

export default async function handler(request) {
  var url = new URL(request.url);
  var username = cleanUsername(url.searchParams.get('username'));
  if (!username) return Response.redirect(url.origin + '/', 302);

  var target = '/profile.html?u=' + encodeURIComponent(username);
  var profile = await getProfile(username);
  if (!profile) return Response.redirect(url.origin + target, 302);

  var owned = await getOwned(profile.id);
  var rank = rankFor(owned.count);
  var name = clip(profile.display_name || profile.username, 40);

  var title = name + ' (@' + profile.username + ') — Spoider Finds';
  var desc = rank.n + ' · ' + owned.count + (owned.count === 1 ? ' find owned' : ' finds owned');
  if (profile.bio) desc += ' — ' + clip(profile.bio, 120);

  var pageUrl = url.origin + '/u/' + profile.username;
  var img = url.origin + '/api/og?u=' + encodeURIComponent(profile.username);

  var html = '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>' + esc(title) + '</title>' +
    '<meta name="description" content="' + esc(desc) + '">' +
    '<link rel="canonical" href="' + esc(pageUrl) + '">' +
    '<meta property="og:type" content="profile">' +
    '<meta property="og:site_name" content="Spoider Finds">' +
    '<meta property="og:title" content="' + esc(title) + '">' +
    '<meta property="og:description" content="' + esc(desc) + '">' +
    '<meta property="og:url" content="' + esc(pageUrl) + '">' +
    '<meta property="og:image" content="' + esc(img) + '">' +
    '<meta property="og:image:width" content="1200">' +
    '<meta property="og:image:height" content="630">' +
    '<meta name="twitter:card" content="summary_large_image">' +
    '<meta name="twitter:title" content="' + esc(title) + '">' +
    '<meta name="twitter:description" content="' + esc(desc) + '">' +
    '<meta name="twitter:image" content="' + esc(img) + '">' +
    '<style>body{margin:0;background:#0a0a0b;color:#c9a876;font:16px system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh}a{color:#e8c766}</style>' +
    '<script>location.replace(' + JSON.stringify(target) + ')</script>' +
    '</head><body><noscript><a href="' + esc(target) + '">Open ' + esc(name) + '’s profile</a></noscript></body></html>';

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600'
    }
  });
}
