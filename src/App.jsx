import { useEffect, useState } from 'react'
import StatusPanel from './components/StatusPanel'
import AuthButton from './components/AuthButton'
import { exchangeCodeForToken } from './utils/spotifyAuth'

import './App.css'

function App() {
  const [spotifyAuthStatus, setSpotifyAuthStatus] = useState("Not connected");
  const [spotifyWebplayStatus, setSpotifyWebplayStatus] = useState("Not connected");
  const [geolocationStatus, setGeolocationStatus] = useState("Not connected");
  const [weatherStatus, setWeatherStatus] = useState("Not connected");

  const [accessToken, setAccessToken] = useState(null);

    useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');

    if (code) {
      setSpotifyAuthStatus("Connecting...");

      exchangeCodeForToken(code)
        .then((token) => {
          setAccessToken(token);
          setSpotifyAuthStatus("Connected");

          // Clean the code out of the URL so it's not sitting there / re-triggered on refresh
          window.history.replaceState({}, document.title, "/");
        })
        .catch((err) => {
          console.error(err);
          setSpotifyAuthStatus("Failed to connect");
        });
    }
  }, []);

  return ( 
    <>
    <div> 
      <StatusPanel
        //initializing the status panel on the main page.
        spotifyAuthStatus={spotifyAuthStatus} 
        spotifyWebplayStatus={spotifyWebplayStatus}
        geolocationStatus={geolocationStatus}
        weatherStatus={weatherStatus}
      />
    </div>

    <div>
      <AuthButton />
    </div>

    <div>Weather Information</div>
    <div>Now Playing</div>
    <div>Playback Controls</div>
    </>
  )
}

export default App
