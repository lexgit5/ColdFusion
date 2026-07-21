// Catches any request to /api/spotify/<anything> and forwards it to
// https://api.spotify.com/v1/<anything>, preserving method, query string,
// body, and the Authorization header. Runs server-side on Cloudflare's
// network, so this request is never subject to browser CORS at all —
// CORS is a browser-enforced rule, and this fetch isn't happening in a
// browser.
export async function onRequest(context) {
  const { request, params } = context;

  const path = Array.isArray(params.path) ? params.path.join('/') : params.path;
  const incomingUrl = new URL(request.url);
  const spotifyUrl = `https://api.spotify.com/v1/${path}${incomingUrl.search}`;

  const headers = new Headers();
  const auth = request.headers.get('Authorization');
  if (auth) headers.set('Authorization', auth);
  const contentType = request.headers.get('Content-Type');
  if (contentType) headers.set('Content-Type', contentType);

  const init = { method: request.method, headers };
  if (!['GET', 'HEAD'].includes(request.method)) {
    init.body = await request.text();
  }

  const spotifyResponse = await fetch(spotifyUrl, init);
  const body = await spotifyResponse.text();

  return new Response(body, {
    status: spotifyResponse.status,
    headers: { 'Content-Type': spotifyResponse.headers.get('Content-Type') || 'application/json' },
  });
}