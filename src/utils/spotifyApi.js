async function playTrack(deviceId, token, trackUri) {
  const response = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
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
  const response = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
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

async function getPlaylistTracks(playlistId, token) {
  const response = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/items`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

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
  const url = `https://api.spotify.com/v1/me/player/queue?uri=${encodeURIComponent(trackUri)}&device_id=${deviceId}`;

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
  const url = `https://api.spotify.com/v1/me/player/shuffle?state=${shuffleState}&device_id=${deviceId}`;

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