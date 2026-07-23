import { useEffect, useState, useRef } from 'react'
import AuthButton from './components/AuthButton'
import { exchangeCodeForToken } from './utils/spotifyAuth'
import { initializePlayer } from './utils/spotifyPlayer'
import { getUserLocation, getWeather } from './utils/weather'
import { getBlendWeights, getDialMetrics } from './utils/blend'
import { fetchTracklists, pickTrack } from './utils/queueBuilder'
import { playTrack, queueTrack } from './utils/spotifyApi'
import { getSkyColor, getIsDay, applyCloudCover } from './utils/skyColor'
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

  // Playback progress. The SDK only hands us `position` at the moment of a
  // state-changed event (track change, play/pause, seek) — it doesn't push
  // updates every second on its own. progressRef holds the last known
  // position/duration plus when we got it; a separate interval below
  // estimates "now" by extrapolating from that snapshot while playing.
  const [progress, setProgress] = useState({ position: 0, duration: 0 });
  const progressRef = useRef({ position: 0, duration: 0, updatedAt: Date.now(), paused: true });

  useEffect(() => {
    let animationFrame;

    const updateProgress = () => {
      const { position, duration, updatedAt, paused } = progressRef.current;

      if (!paused && duration) {
        const elapsed = Date.now() - updatedAt;
        const estimated = Math.min(duration, position + elapsed);

        setProgress({
          position: estimated,
          duration,
        });
      }

      animationFrame = requestAnimationFrame(updateProgress);
    };

    animationFrame = requestAnimationFrame(updateProgress);

    return () => cancelAnimationFrame(animationFrame);
  }, []);

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

          progressRef.current = {
            position: state.position,
            duration: state.duration,
            updatedAt: Date.now(),
            paused: state.paused,
          };
          setProgress({ position: state.position, duration: state.duration });
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

  // weatherData with is_day always computed fresh from the real current time
  // + real sunrise/sunset, rather than trusted from either weather provider
  // (neither Open-Meteo's hybrid setup nor Tomorrow.io's hand back is_day
  // anymore — this is the one and only source of truth for it now).
  const effectiveWeatherData = weatherData
    ? {
        ...weatherData,
        is_day: getIsDay(weatherData.daily) ? 1 : 0,
      }
    : null;

  const [blendWeights, setBlendWeights] = useState(null);
  const [hasStarted, setHasStarted] = useState(false);

  // Content (header, weather headline, dials, now playing) waits to fade in
  // until the landing panel has actually finished fading out — otherwise
  // both transitions run at once and overlap. 600ms matches
  // .landing-panel--hidden's own fade-out duration in App.css; keep the two
  // in sync if that duration ever changes.
  const [showContent, setShowContent] = useState(false);

  useEffect(() => {
    if (!hasStarted) return;
    const timer = setTimeout(() => setShowContent(true), 800);
    return () => clearTimeout(timer);
  }, [hasStarted]);

  // The header/weather/dials/now-playing content mounts fresh the moment
  // showContent flips true, so there's no earlier "invisible" frame for a
  // CSS opacity transition to animate from — it would just pop in. This
  // gives it one: render at opacity 0 first, then flip contentRevealed true
  // a couple of frames later (same double-rAF pattern WeatherInfo/
  // WeatherDials use internally), so the fade actually plays.
  const [contentRevealed, setContentRevealed] = useState(false);

  useEffect(() => {
    if (!showContent) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setContentRevealed(true));
    });
  }, [showContent]);

  async function handleStart() {
    if (!effectiveWeatherData || !deviceId) {
      console.error('Missing weather data or device — check weather and ensure player is ready first');
      return;
    }

    setHasStarted(true); // triggers the headline, dials, and risers to fade/animate in

    const weights = getBlendWeights(effectiveWeatherData);
    setBlendWeights(weights);

    const { categories, tracklists } = await fetchTracklists(weights, accessToken);

    for (let i = 0; i < 10; i++) {
      const track = pickTrack(weights, categories, tracklists);
      if (!track) continue;

      let queued = false;

      while (!queued) {
        try {
          if (i === 0) {
            await playTrack(deviceId, accessToken, track.uri);
          } else {
            await queueTrack(deviceId, accessToken, track.uri);
          }

          queued = true;
        } catch (err) {
          // Retry only if it's the Spotify Premium 403
          if (err.message.includes("403")) {
            console.log("Spotify not ready yet. Retrying in 1 second...");
            await wait(1000);
          } else {
            // Unknown error - stop the whole process
            throw err;
          }
        }
      }

      // Keep your spacing between queued songs
      await wait(1000);

    }
  }

  // Setup is "done" once both auth and weather are connected
  const setupComplete = spotifyAuthStatus === "Connected" && weatherStatus === "Connected";

  // The Start button waits to fade in until landing-setup has actually
  // finished fading out — otherwise the two crossfade instead of a clean
  // fade-out-then-fade-in. 800ms matches .landing-setup's own opacity
  // transition duration in App.css; keep the two in sync if that changes.
  const [showStart, setShowStart] = useState(false);

  useEffect(() => {
    if (!setupComplete) {
      setShowStart(false);
      return;
    }
    const timer = setTimeout(() => setShowStart(true), 800);
    return () => clearTimeout(timer);
  }, [setupComplete]);

  // Forces a re-render once a minute so getSkyColor()/getIsDay() re-read the
  // current time and the background (and brightness dial) keep drifting on
  // their own, even with no other state changes happening. The tick value
  // itself is never read — only the state update (and resulting re-render)
  // matters.
  const [, setClockTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setClockTick((t) => t + 1);
    }, 60000); // once a minute is plenty for a gradient this gradual

    return () => clearInterval(interval);
  }, []);

  // Live sky background color, anchored to today's real local sunrise/sunset
  // once weather has been checked; falls back to a fixed-hour gradient before
  // that. Then desaturated toward grey based on cloud cover — a color that's
  // already near-grey (deep midnight) barely changes no matter how overcast
  // it is, so the effect naturally fades out at night on its own.
  const baseSkyColor = getSkyColor(weatherData?.daily);
  const cloudCoverFraction = effectiveWeatherData ? effectiveWeatherData.cloud_cover / 100 : 0;
  const computedSkyColor = applyCloudCover(baseSkyColor, cloudCoverFraction);

  // Stays on the original default background through the whole landing
  // page — the real weather-based color only takes over once showContent
  // flips true (i.e. after the landing panel has finished fading out), so
  // the background change happens alongside the content fade-in rather than
  // racing the landing panel's own fade-out. The existing 2.5s CSS
  // transition on background-color animates that swap smoothly.
  const DEFAULT_SKY_COLOR = '#0B0E14';
  const skyColor = showContent ? computedSkyColor : DEFAULT_SKY_COLOR;

  // Dial/riser metrics, computed from (is_day-corrected) weather data —
  // updates as soon as weather is checked, independent of whether a queue
  // has been built yet
  const dialMetrics = effectiveWeatherData ? getDialMetrics(effectiveWeatherData) : null;

  return (
    <div className={`sky-background ${!showContent ? 'sky-background--centered' : ''}`} style={{ '--sky-color': skyColor, backgroundColor: skyColor }}>
      <div className="page">
        {showContent && (
          <div className={`content-reveal ${contentRevealed ? 'content-reveal--visible' : ''}`}>
            <WeatherInfo weatherData={effectiveWeatherData} started={showContent} />

            <div className="panel">
              <WeatherDials metrics={dialMetrics} started={showContent} />
            </div>

            <div className="panel">
              <NowPlaying track={currentTrack} progress={progress} />

              <PlaybackControls
                player={player}
                isPaused={isPaused}
                hasTrack={!!currentTrack}
                onStart={handleStart}
              />
            </div>
          </div>
        )}

        {!showContent && (
          <div className={`panel landing-panel ${hasStarted ? 'landing-panel--hidden' : ''}`}>
            <div className="landing-title">ColdFusion</div>

            <div className="landing-toggle">
              <div className={`landing-setup ${setupComplete ? 'landing-setup--hidden' : ''}`}>
                <AuthButton connected={spotifyAuthStatus === "Connected"} />
                <button
                  className={`setup-button ${weatherStatus === "Connected" ? 'setup-button--connected' : ''}`}
                  onClick={handleCheckWeather}
                  disabled={weatherStatus === "Connected"}
                >
                  {weatherStatus === "Connected" ? "Location Provided" : "Provide Location"}
                </button>
              </div>

              <div className={`landing-start ${showStart ? '' : 'landing-start--hidden'}`}>
                <button className="start-button" onClick={handleStart}>
                  Start
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App