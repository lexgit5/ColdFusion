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
  .map(track => track.uri);
}

export { playTrack, playPlaylist, getPlaylistTracks };