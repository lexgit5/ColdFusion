function StatusPanel ({spotifyAuthStatus, spotifyWebplayStatus, geolocationStatus, weatherStatus}) {
    return (
        <div className="status-panel">
            <p>Spotify Auth: {spotifyAuthStatus}</p>
            <p>Spotify Web Playback: {spotifyWebplayStatus}</p>
            <p>Geolocation: {geolocationStatus}</p>
            <p>Open-Meteo: {weatherStatus}</p>
        </div>
    );
}

export default StatusPanel;