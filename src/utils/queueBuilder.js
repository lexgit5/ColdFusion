import { getPlaylistTracks } from './spotifyApi';
import { PLAYLIST_IDS } from './playlists';

// Caches each category's playlist tracks for TRACKLIST_CACHE_MS, so calling
// fetchTracklists once per song (as App.jsx now does — once on Start, then
// again every time a song hits 1 minute left) doesn't hit Spotify's API for
// a full playlist re-fetch every single time. A playlist's contents aren't
// changing minute-to-minute, so a cache this long is safe; it's really just
// here to eventually pick up edits made to the source playlists without
// requiring a page reload.
const TRACKLIST_CACHE_MS = 60 * 60 * 1000;
const tracklistCache = {}; // { [category]: { tracks, fetchedAt } }

async function fetchTracklists(weights, token) {
  const categories = Object.keys(weights).filter((cat) => weights[cat] > 0);
  const tracklists = {};

  for (const category of categories) {
    const playlistId = PLAYLIST_IDS[category];
    if (!playlistId) continue;

    const cached = tracklistCache[category];
    const isFresh = cached && (Date.now() - cached.fetchedAt) < TRACKLIST_CACHE_MS;

    if (isFresh) {
      tracklists[category] = cached.tracks;
    } else {
      const tracks = await getPlaylistTracks(playlistId, token);
      tracklistCache[category] = { tracks, fetchedAt: Date.now() };
      tracklists[category] = tracks;
    }
  }

  return { categories, tracklists };
}

function pickWeightedCategory(weights, categories) {
  const roll = Math.random();
  let cumulative = 0;
  for (const category of categories) {
    cumulative += weights[category];
    if (roll <= cumulative) return category;
  }
  return categories[categories.length - 1];
}

// Tracks which URIs have already been picked per category this session.
// Resets for a category once every track in it has been used, so repeats
// only happen after the whole playlist has cycled through.
const usedTracks = {};

function pickTrack(weights, categories, tracklists) {
  const category = pickWeightedCategory(weights, categories);
  const allTracks = tracklists[category];
  if (!allTracks || allTracks.length === 0) return null;

  if (!usedTracks[category]) {
    usedTracks[category] = new Set();
  }

  // If every track in this category has been used, reset — start the cycle over
  if (usedTracks[category].size >= allTracks.length) {
    usedTracks[category].clear();
  }

  // Only pick from tracks not yet used this cycle
  const available = allTracks.filter((t) => !usedTracks[category].has(t.uri));
  const randomTrack = available[Math.floor(Math.random() * available.length)];

  usedTracks[category].add(randomTrack.uri);

  return { ...randomTrack, category };
}

export { fetchTracklists, pickTrack };