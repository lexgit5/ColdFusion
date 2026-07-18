import { getPlaylistTracks } from './spotifyApi';
import { PLAYLIST_IDS } from './playlists';

async function fetchTracklists(weights, token) {
  const categories = Object.keys(weights).filter((cat) => weights[cat] > 0);
  const tracklists = {};
  for (const category of categories) {
    const playlistId = PLAYLIST_IDS[category];
    if (playlistId) {
      tracklists[category] = await getPlaylistTracks(playlistId, token);
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