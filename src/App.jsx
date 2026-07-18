import { useEffect, useState, useRef } from 'react'
import StatusPanel from './components/StatusPanel'
import AuthButton from './components/AuthButton'
import { exchangeCodeForToken } from './utils/spotifyAuth'
import { initializePlayer } from './utils/spotifyPlayer'
import { getUserLocation, getWeather } from './utils/weather'
import { getBlendWeights } from './utils/blend'
import { buildQueue } from './utils/queueBuilder'
import { playTrack } from './utils/spotifyApi'
import WeatherInfo from './components/WeatherInfo'
import NowPlaying from './components/NowPlaying'
import PlaybackControls from './components/PlaybackControls'

import './App.css'

function App() {
  const [spotifyAuthStatus, setSpotifyAuthStatus] = useState("Not connected");
  const [spotifyWebplayStatus, setSpotifyWebplayStatus] = useState("Not connected");
  const [geolocationStatus, setGeolocationStatus] = useState("Not connected");
  const [weatherStatus, setWeatherStatus] = useState("Not connected");

  const [accessToken, setAccessToken] = useState(null); // this and the useEffect below handle Spotify auth
  const hasExchangedCode = useRef(false); // guards against StrictMode double-firing the effect

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');

    if (code && !hasExchangedCode.current) {
      hasExchangedCode.current = true;
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

  const [deviceId, setDeviceId] = useState(null); // this and the useEffect below start the web player
  const [player, setPlayer] = useState(null);
  const [currentTrack, setCurrentTrack] = useState(null); // holds the currently playing track's info for NowPlaying
  const [isPaused, setIsPaused] = useState(true); // tracks play/pause state for PlaybackControls

  useEffect(() => {
    if (!accessToken) return;

    setSpotifyWebplayStatus("Loading...");

    initializePlayer(accessToken, {
      onReady: (device_id, playerInstance) => {
        setDeviceId(device_id);
        setPlayer(playerInstance);
        setSpotifyWebplayStatus("Ready");
      },
      onStateChange: (state) => {
        console.log('Player state changed:', state);
        if (state) {
          setIsPaused(state.paused);
        }
        if (state && state.track_window && state.track_window.current_track) {
          const track = state.track_window.current_track;
          setCurrentTrack({
            name: track.name,
            artist: track.artists.map((a) => a.name).join(', '),
            albumArt: track.album.images[0]?.url,
          });
        }
      },
      onError: (message) => {
        setSpotifyWebplayStatus(`Error: ${message}`);
      },
    });
  }, [accessToken]);

  const [weatherData, setWeatherData] = useState(null); // location permission and weather set up

  async function handleCheckWeather() {
    try {
      setGeolocationStatus("Requesting...");
      const { latitude, longitude } = await getUserLocation();
      setGeolocationStatus("Connected");

      setWeatherStatus("Fetching...");
      const weather = await getWeather(latitude, longitude);
      setWeatherData(weather);
      setWeatherStatus("Connected");
    } catch (err) {
      console.error(err);
      setWeatherStatus(`Error: ${err.message}`);
    }
  }

  // Called by the Play button when nothing is currently playing yet.
  // Builds a blended queue from current weather and starts playback with the first track.
  async function handleStart() {
    if (!weatherData || !deviceId) {
      console.error('Missing weather data or device — check weather and ensure player is ready first');
      return;
    }

    const weights = getBlendWeights(weatherData);
    const queue = await buildQueue(weights, accessToken);
    console.log('Built queue:', queue);

    if (queue.length > 0) {
      await playTrack(deviceId, accessToken, queue[0]);
      // Note: this only plays the FIRST track of the queue for now —
      // queueing up the rest for auto-advance is a separate piece we haven't built yet
    }
  }

  return (
    <>
      <div>
        <StatusPanel
          // initializing the status panel on the main page.
          spotifyAuthStatus={spotifyAuthStatus}
          spotifyWebplayStatus={spotifyWebplayStatus}
          geolocationStatus={geolocationStatus}
          weatherStatus={weatherStatus}
        />
      </div>

      <div>
        <AuthButton />
        <button onClick={handleCheckWeather}>Check Weather</button>
      </div>

      <div>
        <WeatherInfo weatherData={weatherData} />
      </div>

      <div>
        <NowPlaying track={currentTrack} />
      </div>

      <div>
        <PlaybackControls
          player={player}
          isPaused={isPaused}
          hasTrack={!!currentTrack}
          onStart={handleStart}
        />
      </div>
    </>
  )
}

export default App