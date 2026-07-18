import { useEffect, useState, useRef } from 'react'
import StatusPanel from './components/StatusPanel'
import AuthButton from './components/AuthButton'
import { exchangeCodeForToken } from './utils/spotifyAuth'
import { initializePlayer } from './utils/spotifyPlayer'
import { getUserLocation, getWeather } from './utils/weather'
import { getBlendWeights } from './utils/blend'
import { fetchTracklists, pickTrack } from './utils/queueBuilder'
import { playTrack, queueTrack } from './utils/spotifyApi'
import WeatherInfo from './components/WeatherInfo'
import NowPlaying from './components/NowPlaying'
import PlaybackControls from './components/PlaybackControls'
import BlendDebug from './components/BlendDebug'

import './App.css'

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
  const hasInitializedPlayer = useRef(false); // guards against StrictMode double-firing the player setup effect

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

  const [blendWeights, setBlendWeights] = useState(null); // debug: current blend breakdown
  const [queue, setQueue] = useState(null); // debug: tracks sent so far, in the order we sent them

  // Called by the Play button when nothing is currently playing yet.
  // Rolls one track at a time, sends it to Spotify immediately, waits for it to settle,
  // then displays it — no separate "plan" array, so the display can never drift from what was sent.
  async function handleStart() {
    if (!weatherData || !deviceId) {
      console.error('Missing weather data or device — check weather and ensure player is ready first');
      return;
    }

    const weights = getBlendWeights(weatherData);
    setBlendWeights(weights);

    const { categories, tracklists } = await fetchTracklists(weights, accessToken);

    setQueue([]); // reset display queue

    for (let i = 0; i < 10; i++) {
      const track = pickTrack(weights, categories, tracklists);
      if (!track) continue;

      console.log(`Sending track ${i}:`, track.name, track.uri);

      if (i === 0) {
        await playTrack(deviceId, accessToken, track.uri);
      } else {
        await queueTrack(deviceId, accessToken, track.uri);
        await wait(1000); // give Spotify's backend time to actually commit the addition before the next call
      }

      console.log(`Confirmed queued ${i}:`, track.name);

      setQueue((prev) => [...prev, track]);
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

      <div>
        <BlendDebug weights={blendWeights} queue={queue} />
      </div>
    </>
  )
}

export default App