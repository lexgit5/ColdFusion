import { getPlaylistTracks } from './spotifyApi';
import { PLAYLIST_IDS } from './playlists';

async function buildQueue(weights, token, queueLength = 20) {
  const categories = Object.keys(weights).filter((cat) => weights[cat] > 0);

  // Fetch tracklists only for categories that actually have weight
  const tracklists = {};
  for (const category of categories) {
  const playlistId = PLAYLIST_IDS[category];

  console.log("Category:", category);
  console.log("Playlist ID:", playlistId);

  if (playlistId) {
    tracklists[category] = await getPlaylistTracks(playlistId, token);
  }
}

  const queue = [];
  for (let i = 0; i < queueLength; i++) {
    const category = pickWeightedCategory(weights, categories);
    const tracks = tracklists[category];
    if (tracks && tracks.length > 0) {
      const randomTrack = tracks[Math.floor(Math.random() * tracks.length)];
      queue.push(randomTrack);
    }
  }

  return queue;
}

function pickWeightedCategory(weights, categories) {
  const roll = Math.random();
  let cumulative = 0;

  for (const category of categories) {
    cumulative += weights[category];
    if (roll <= cumulative) {
      return category;
    }
  }

  return categories[categories.length - 1]; // fallback for floating point edge cases
}

export { buildQueue };