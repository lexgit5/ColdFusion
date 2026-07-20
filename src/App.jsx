import { useEffect, useState, useRef } from 'react'
import AuthButton from './components/AuthButton'
import { exchangeCodeForToken } from './utils/spotifyAuth'
import { initializePlayer } from './utils/spotifyPlayer'
import { getUserLocation, getWeather } from './utils/weather'
import { getBlendWeights, getDialMetrics } from './utils/blend'
import { fetchTracklists, pickTrack } from './utils/queueBuilder'
import { playTrack, queueTrack } from './utils/spotifyApi'
import { getSkyColor } from './utils/skyColor'
import WeatherInfo from './components/WeatherInfo'
import NowPlaying from './components/NowPlaying'
import PlaybackControls from './components/PlaybackControls'
import WeatherDials from './components/WeatherDials'

import './App.css'

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function App() {
  const [spotifyAuthStatus, setSpotifyAuthStatus] = useState("Not connected");
  const [spotifyWebplayStatus, setSpotifyWebplayStatus] = useState("Not connected");
  const [geolocationStatus, setGeolocationStatus] = useState("Not connected");
  const [weatherStatus, setWeatherStatus] = useState("Not connected");

  const [accessToken, setAccessToken] = useState(null);
  const hasExchangedCode = useRef(false);

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
          window.history.replaceState({}, document.title, "/");
        })
        .catch((err) => {
          console.error(err);
          setSpotifyAuthStatus("Failed to connect");
        });
    }
  }, []);

  const [deviceId, setDeviceId] = useState(null);
  const [player, setPlayer] = useState(null);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPaused, setIsPaused] = useState(true);
  const hasInitializedPlayer = useRef(false);

  useEffect(() => {
    if (!accessToken || hasInitializedPlayer.current) return;
    hasInitializedPlayer.current = true;

    setSpotifyWebplayStatus("Loading...");

    initializePlayer(accessToken, {
      onReady: (device_id, playerInstance) => {
        setDeviceId(device_id);
        setPlayer(playerInstance);
        setSpotifyWebplayStatus("Ready");
      },
      onStateChange: (state) => {
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

  const [weatherData, setWeatherData] = useState(null);

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

  const [blendWeights, setBlendWeights] = useState(null);
  const [hasStarted, setHasStarted] = useState(false);

  async function handleStart() {
    if (!weatherData || !deviceId) {
      console.error('Missing weather data or device — check weather and ensure player is ready first');
      return;
    }

    setHasStarted(true); // triggers the headline, dials, and risers to fade/animate in

    const weights = getBlendWeights(weatherData);
    setBlendWeights(weights);

    const { categories, tracklists } = await fetchTracklists(weights, accessToken);

    for (let i = 0; i < 20; i++) {
      const track = pickTrack(weights, categories, tracklists);
      if (!track) continue;

      if (i === 0) {
        await playTrack(deviceId, accessToken, track.uri);
      } else {
        await queueTrack(deviceId, accessToken, track.uri);
        await wait(500);
      }
    }
  }

  // Setup is "done" once both auth and weather are connected — this hides the setup buttons
  const setupComplete = spotifyAuthStatus === "Connected" && weatherStatus === "Connected";

  // Live sky background color, derived from the current blend weights
  const skyColor = getSkyColor(blendWeights);

  // Dial/riser metrics, computed directly from weather data — updates as soon as
  // weather is checked, independent of whether a queue has been built yet
  const dialMetrics = weatherData ? getDialMetrics(weatherData) : null;

  return (
    <div className="sky-background" style={{ '--sky-color': skyColor, backgroundColor: skyColor }}>
      <div className="page">
        <div className="page-header">ColdFusion</div>

        <WeatherInfo weatherData={weatherData} started={hasStarted} />

        <div className="panel">
          <WeatherDials metrics={dialMetrics} started={hasStarted} />

          <NowPlaying track={currentTrack} />
        </div>

        <div className="panel">
          <PlaybackControls
            player={player}
            isPaused={isPaused}
            hasTrack={!!currentTrack}
            onStart={handleStart}
          />

          <div className={`setup-actions ${setupComplete ? 'hidden' : ''}`}>
            <AuthButton />
            <button className="setup-button" onClick={handleCheckWeather}>
              Check Weather
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App