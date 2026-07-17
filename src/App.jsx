import { use, useState } from 'react'
import StatusPanel from './components/StatusPanel'

import './App.css'

function App() {
  const [spotifyAuthStatus, setSpotifyAuthstatus] = useState("Not connected");
  const [spotifyWebplayStatus, setSpotifyWebplayStatus] = useState("Not connected");
  const [geolocationStatus, setGeolocationStatus] = useState("Not connected");
  const [weatherStatus, setWeatherStatus] = useState("Not connected");

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

    <div>Spotify Authorization</div>
    <div>Weather Information</div>
    <div>Now Playing</div>
    <div>Playback Controls</div>
    </>
  )
}

export default App
