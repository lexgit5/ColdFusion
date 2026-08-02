// Entry point for the ColdFusion frontend Worker (static-assets deployment).
//
// Handles one special route — /api/spotify/* — which proxies to Spotify's
// API server-side, exactly like the old Pages Function did. This matters
// because CORS is a browser-enforced rule; a request made from this
// Worker (server-side, not in a browser) is never subject to it, so the
// frontend can call Spotify endpoints that would otherwise be blocked by
// CORS if called directly from client-side JS.
//
// Everything else falls through to env.ASSETS.fetch(request), which
// serves the static site (index.html, JS/CSS bundles, etc.) exactly like
// a normal Pages deployment would — this is what makes React Router-style
// client-side routes (like landing on `/` after the Spotify redirect)
// work correctly instead of 404ing.
//
// Requires the "assets" block in wrangler.jsonc:
//   "assets": { "directory": "./dist", "binding": "ASSETS" }

async function handleSpotifyProxy(request, path) {
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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/spotify/')) {
      const path = url.pathname.replace('/api/spotify/', '');
      return handleSpotifyProxy(request, path);
    }

    // Not a proxy route — serve the built static site as normal.
    return env.ASSETS.fetch(request);
  },
};