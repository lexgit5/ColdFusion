function initializePlayer(token, { onReady, onStateChange, onError }) {
  window.onSpotifyWebPlaybackSDKReady = () => {
    const player = new window.Spotify.Player({
      name: 'ColdFusion Web Player',
      getOAuthToken: (cb) => { cb(token); },
      volume: 0.5,
    });

    player.addListener('ready', ({ device_id }) => {
      console.log('Player ready with device ID', device_id);
      if (onReady) onReady(device_id, player);
    });

    player.addListener('not_ready', ({ device_id }) => {
      console.log('Device ID has gone offline', device_id);
    });

    player.addListener('initialization_error', ({ message }) => {
      console.error('Init error:', message);
      if (onError) onError(message);
    });

    player.addListener('authentication_error', ({ message }) => {
      console.error('Auth error:', message);
      if (onError) onError(message);
    });

    player.addListener('account_error', ({ message }) => {
      console.error('Account error (Premium required):', message);
      if (onError) onError(message);
    });

    if (onStateChange) {
      player.addListener('player_state_changed', onStateChange);
    }

    player.connect();
  };

  if (!document.getElementById('spotify-player-sdk')) {
    const script = document.createElement('script');
    script.id = 'spotify-player-sdk';
    script.src = 'https://sdk.scdn.co/spotify-player.js';
    document.body.appendChild(script);
  }
}

export { initializePlayer };