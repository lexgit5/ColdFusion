// Routed through the Cloudflare Pages Function at functions/api/spotify/[[path]].js
// instead of hitting api.spotify.com directly from the browser — that Function
// forwards the request server-side, so it's never subject to CORS at all.
const SPOTIFY_BASE = '/api/spotify';

// Playlist reads are the one exception: they need to go through the
// coldfusion-worker (not the pass-through Pages Function above), since the
// worker swaps in the owner's token server-side. The playlists live on the
// owner's account and are private — a visitor's own valid Spotify token
// still 403s against them, since Spotify checks the token's owner against
// the playlist's owner regardless of who's using the app.
const WORKER_URL = 'https://coldfusion-worker.acg6810.workers.dev';

async function playTrack(deviceId, token, trackUri) {
  const response = await fetch(`${SPOTIFY_BASE}/me/player/play?device_id=${deviceId}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      uris: [trackUri],
    }),
  });

  if (!response.ok && response.status !== 204) {
    const errorBody = await response.text();
    throw new Error(`Play request failed: ${response.status} ${errorBody}`);
  }
}

async function playPlaylist(deviceId, token, playlistUri) {
  const response = await fetch(`${SPOTIFY_BASE}/me/player/play?device_id=${deviceId}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      context_uri: playlistUri,
    }),
  });

  if (!response.ok && response.status !== 204) {
    const errorBody = await response.text();
    throw new Error(`Play request failed: ${response.status} ${errorBody}`);
  }
}

// Fetches a playlist's tracks via the Worker (see WORKER_URL above), which
// uses the owner's token — NOT the visitor's own token — since these
// playlists are private and live on the owner's account. No Authorization
// header is sent here on purpose; the Worker ignores the caller's identity
// for this endpoint and always fetches as the owner.
async function getPlaylistTracks(playlistId) {
  const response = await fetch(`${WORKER_URL}/api/playlists/${playlistId}/items`);

  if (!response.ok) {
    throw new Error(`Failed to fetch playlist tracks: ${response.status}`);
  }

  const data = await response.json();

  return data.items
    .map(({ item, track }) => item ?? track)
    .filter(Boolean)
    .map((track) => ({
      uri: track.uri,
      name: track.name,
      artist: track.artists?.map((a) => a.name).join(', ') ?? 'Unknown',
    }));
}

// Adds a single track to the END of Spotify's actual playback queue on the given device.
// This is what nextTrack()/previousTrack() actually skip through — playTrack alone doesn't queue anything.
async function queueTrack(deviceId, token, trackUri) {
  const url = `${SPOTIFY_BASE}/me/player/queue?uri=${encodeURIComponent(trackUri)}&device_id=${deviceId}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok && response.status !== 204) {
    const errorBody = await response.text();
    throw new Error(`Queue request failed: ${response.status} ${errorBody}`);
  }
}

// Explicitly turns shuffle on/off for the given device.
// Needed because a leftover/default shuffle state will silently reorder your queued tracks
// even though queueTrack adds them in a specific order.
async function setShuffle(deviceId, token, shuffleState) {
  const url = `${SPOTIFY_BASE}/me/player/shuffle?state=${shuffleState}&device_id=${deviceId}`;

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok && response.status !== 204) {
    const errorBody = await response.text();
    throw new Error(`Shuffle request failed: ${response.status} ${errorBody}`);
  }
}

export { playTrack, playPlaylist, getPlaylistTracks, queueTrack, setShuffle };