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


//this is a status panel, kind of like a breaker box or task manager. the goal is to be able to see
//exactly whats goin on with my connected services in order for ease of active troubleshooting.