import { useEffect, useState, useRef } from 'react'
import AuthButton from './components/AuthButton'
import { exchangeCodeForToken } from './utils/spotifyAuth'
import { initializePlayer } from './utils/spotifyPlayer'
import { getUserLocation, getWeather } from './utils/weather'
import { getBlendWeights, getDialMetrics } from './utils/blend'
import { fetchTracklists, pickTrack } from './utils/queueBuilder'
import { playTrack } from './utils/spotifyApi'
import { getSkyColor, getIsDay, getDayFraction, applyCloudCover, applyPrecipitation, getContrastingTextColor } from './utils/skyColor'
import WeatherInfo from './components/WeatherInfo'
import NowPlaying from './components/NowPlaying'
import PlaybackControls from './components/PlaybackControls'
import WeatherDials from './components/WeatherDials'
// DEBUG: WEATHER OVERRIDES — start (delete this import too when removing)
import WeatherOverrides from './components/WeatherOverrides'
// DEBUG: WEATHER OVERRIDES — end

import './App.css'

const DEBUG = import.meta.env.VITE_DEBUG_WEATHER === 'false';

// Backend Worker that runs the weather->queue cron and owns the
// known-users/location KV. Used here only to check whether this Spotify
// account has already completed setup (Worker login + location share) —
// if not, we hand off to it, and it redirects back here when done.
const WORKER_URL = 'https://coldfusion-worker.acg6810.workers.dev';

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Only trigger the 403-retry loop for Spotify's "not ready yet" error, not
// for genuine failures — those should surface, not spin forever.
async function withPremium403Retry(action) {
  let done = false;
  while (!done) {
    try {
      await action();
      done = true;
    } catch (err) {
      if (err.message.includes("403")) {
        console.log("Spotify not ready yet. Retrying in 1 second...");
        await wait(1000);
      } else {
        throw err;
      }
    }
  }
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
            uri: track.uri,
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

  // --- Worker setup check --------------------------------------------------
  //
  // Once we have a token, check whether this Spotify account has already
  // completed the Worker's one-time setup (known user + location saved).
  // If not, hand off to the Worker's /auth/login, which does both and
  // redirects back here via ?returnTo when finished. If it's already set
  // up, skip straight into fetching weather — no manual "Provide Location"
  // step needed on returning visits.
  const hasCheckedWorkerStatus = useRef(false);

  useEffect(() => {
    if (!accessToken || hasCheckedWorkerStatus.current) return;
    hasCheckedWorkerStatus.current = true;

    (async () => {
      try {
        const meRes = await fetch('/api/spotify/me', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!meRes.ok) throw new Error(`Failed to fetch Spotify profile: ${meRes.status}`);
        const me = await meRes.json();

        const statusRes = await fetch(`${WORKER_URL}/auth/status?userId=${encodeURIComponent(me.id)}`);
        const status = await statusRes.json();

        if (!status.known || !status.hasLocation) {
          window.location.href = `${WORKER_URL}/auth/login?returnTo=${encodeURIComponent(window.location.origin)}`;
          return;
        }

        // Already fully set up — go straight into weather.
        await handleCheckWeather();
      } catch (err) {
        console.error('Worker status check failed:', err);
        setWeatherStatus(`Error: ${err.message}`);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const [weatherData, setWeatherData] = useState(null);
  const [coords, setCoords] = useState(null);

  async function handleCheckWeather() {
    try {
      setGeolocationStatus("Requesting...");
      const { latitude, longitude } = await getUserLocation();
      setGeolocationStatus("Connected");
      setCoords({ latitude, longitude });

      setWeatherStatus("Fetching...");
      const weather = await getWeather(latitude, longitude);
      setWeatherData(weather);
      console.log('Weather updated (initial):', weather);
      setWeatherStatus("Connected");
    } catch (err) {
      console.error(err);
      setWeatherStatus(`Error: ${err.message}`);
    }
  }

  // Keep weather current for the on-screen dials/headline: once we have a
  // location, re-fetch every 15 minutes.
  const WEATHER_REFRESH_INTERVAL_MS = 15 * 60 * 1000;
  const WEATHER_RETRY_INTERVAL_MS = 30 * 1000;
  const retryIntervalRef = useRef(null);

  useEffect(() => {
    if (!coords) return;

    function startRetryLoop() {
      if (retryIntervalRef.current) return;

      retryIntervalRef.current = setInterval(async () => {
        try {
          const weather = await getWeather(coords.latitude, coords.longitude);
          setWeatherData(weather);
          console.log('Weather updated (retry succeeded):', weather);
          clearInterval(retryIntervalRef.current);
          retryIntervalRef.current = null;
        } catch (err) {
          console.error('Weather refresh retry failed, trying again shortly:', err);
        }
      }, WEATHER_RETRY_INTERVAL_MS);
    }

    const interval = setInterval(async () => {
      try {
        const weather = await getWeather(coords.latitude, coords.longitude);
        setWeatherData(weather);
        console.log('Weather updated (15-min refresh):', weather);
      } catch (err) {
        console.error('Background weather refresh failed, switching to retry cadence:', err);
        startRetryLoop();
      }
    }, WEATHER_REFRESH_INTERVAL_MS);

    return () => {
      clearInterval(interval);
      if (retryIntervalRef.current) {
        clearInterval(retryIntervalRef.current);
        retryIntervalRef.current = null;
      }
    };
  }, [coords]);

  // DEBUG: WEATHER OVERRIDES — start
  const [weatherOverrides, setWeatherOverrides] = useState({});

  function handleApplyOverrides(next) {
    setWeatherOverrides(next);
  }

  function handleRevertOverrides() {
    setWeatherOverrides({});
  }
  // DEBUG: WEATHER OVERRIDES — end

  const [clockNow, setClockNow] = useState(() => new Date());

  useEffect(() => {
    if (weatherOverrides.time) return;

    const interval = setInterval(() => {
      setClockNow(new Date());
    }, 60000);

    return () => clearInterval(interval);
  }, [weatherOverrides.time]);

  const now = weatherOverrides.time ? new Date(weatherOverrides.time) : clockNow;

  const effectiveWeatherData = weatherData
    ? {
        ...weatherData,
        is_day: getIsDay(weatherData.daily, now) ? 1 : 0,
        day_fraction: getDayFraction(weatherData.daily, now),
        // DEBUG: WEATHER OVERRIDES — start
        ...(weatherOverrides.temperature_2m !== undefined && { temperature_2m: weatherOverrides.temperature_2m }),
        ...(weatherOverrides.precipitation !== undefined && { precipitation: weatherOverrides.precipitation }),
        ...(weatherOverrides.cloud_cover !== undefined && { cloud_cover: weatherOverrides.cloud_cover }),
        // DEBUG: WEATHER OVERRIDES — end
      }
    : null;

  const effectiveWeatherDataRef = useRef(effectiveWeatherData);
  effectiveWeatherDataRef.current = effectiveWeatherData;

  const [blendWeights, setBlendWeights] = useState(null);
  const [hasStarted, setHasStarted] = useState(false);

  const [showContent, setShowContent] = useState(false);

  useEffect(() => {
    if (!hasStarted) return;
    const timer = setTimeout(() => setShowContent(true), 800);
    return () => clearTimeout(timer);
  }, [hasStarted]);

  const [contentRevealed, setContentRevealed] = useState(false);

  useEffect(() => {
    if (!showContent) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setContentRevealed(true));
    });
  }, [showContent]);

  // Picks one track from *current* conditions and plays it immediately,
  // replacing whatever's playing.
  async function playCurrentConditionsTrack() {
    const weatherForPick = effectiveWeatherDataRef.current;
    if (!weatherForPick) return;

    const weights = getBlendWeights(weatherForPick);
    setBlendWeights(weights);

    const { categories, tracklists } = await fetchTracklists(weights, accessToken);
    const track = pickTrack(weights, categories, tracklists);
    if (!track) return;

    await withPremium403Retry(() => playTrack(deviceId, accessToken, track.uri));
  }

  // --- Auto-start playback --------------------------------------------------
  //
  // Replaces the old manual Start button: once weather data is in and the
  // Web Playback SDK device is ready, kick off playback automatically.
  const hasAutoStarted = useRef(false);

  useEffect(() => {
    if (hasAutoStarted.current) return;
    if (weatherStatus !== "Connected" || !deviceId || !effectiveWeatherData) return;

    hasAutoStarted.current = true;
    setHasStarted(true);
    playCurrentConditionsTrack();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weatherStatus, deviceId, effectiveWeatherData]);

  // --- Previous-track history + local queue -------------------------------
  const historyRef = useRef([]);
  const historyIndexRef = useRef(-1);
  const localQueueRef = useRef([]);
  const isNavigatingHistoryRef = useRef(false);
  const lastSeenUriRef = useRef(null);
  const navBusyRef = useRef(false);

  useEffect(() => {
    if (!currentTrack) return;

    if (isNavigatingHistoryRef.current) {
      isNavigatingHistoryRef.current = false;
      lastSeenUriRef.current = currentTrack.uri;
      return;
    }

    if (lastSeenUriRef.current === currentTrack.uri) {
      return;
    }
    lastSeenUriRef.current = currentTrack.uri;

    const nextIndex = historyIndexRef.current + 1;
    historyRef.current = [...historyRef.current.slice(0, nextIndex), currentTrack];
    historyIndexRef.current = nextIndex;
  }, [currentTrack]);

  async function playFromUri(uri) {
    await withPremium403Retry(() => playTrack(deviceId, accessToken, uri));
  }

  async function handlePrevious() {
    if (!player) return;
    if (navBusyRef.current) return;

    if (currentTrack) {
      const actualIndex = historyRef.current.findIndex((t) => t.uri === currentTrack.uri);
      if (actualIndex !== -1 && actualIndex !== historyIndexRef.current) {
        historyIndexRef.current = actualIndex;
      }
    }

    if (historyIndexRef.current <= 0) return;

    const leavingTrack = historyRef.current[historyIndexRef.current];
    const targetTrack = historyRef.current[historyIndexRef.current - 1];

    if (!leavingTrack || !targetTrack) return;

    navBusyRef.current = true;
    try {
      localQueueRef.current = [leavingTrack, ...localQueueRef.current];

      isNavigatingHistoryRef.current = true;
      historyIndexRef.current -= 1;

      await playFromUri(targetTrack.uri);
    } finally {
      navBusyRef.current = false;
    }
  }
  // -------------------------------------------------------------------------

  async function handleSkip() {
    if (!player) return;
    if (navBusyRef.current) return;

    if (currentTrack) {
      const actualIndex = historyRef.current.findIndex((t) => t.uri === currentTrack.uri);
      if (actualIndex !== -1 && actualIndex !== historyIndexRef.current) {
        historyIndexRef.current = actualIndex;
      }
    }

    if (localQueueRef.current.length > 0) {
      const nextTrack = localQueueRef.current[0];
      if (nextTrack) {
        navBusyRef.current = true;
        try {
          localQueueRef.current = localQueueRef.current.slice(1);
          isNavigatingHistoryRef.current = true;
          historyIndexRef.current += 1;
          await playFromUri(nextTrack.uri);
        } finally {
          navBusyRef.current = false;
        }
        return;
      }
    }

    if (historyIndexRef.current < historyRef.current.length - 1) {
      const nextTrack = historyRef.current[historyIndexRef.current + 1];
      if (nextTrack) {
        navBusyRef.current = true;
        try {
          isNavigatingHistoryRef.current = true;
          historyIndexRef.current += 1;
          await playFromUri(nextTrack.uri);
        } finally {
          navBusyRef.current = false;
        }
        return;
      }
    }

    await playCurrentConditionsTrack();
  }

  const baseSkyColor = getSkyColor(weatherData?.daily, now);
  const cloudCoverFraction = effectiveWeatherData ? effectiveWeatherData.cloud_cover / 100 : 0;
  const precipitationFraction = effectiveWeatherData ? Math.min(effectiveWeatherData.precipitation / 5, 1) : 0;
  const computedSkyColor = applyPrecipitation(
    applyCloudCover(baseSkyColor, cloudCoverFraction),
    precipitationFraction
  );

  const DEFAULT_SKY_COLOR = '#0B0E14';
  const skyColor = showContent ? computedSkyColor : DEFAULT_SKY_COLOR;

  const dialMetrics = effectiveWeatherData ? getDialMetrics(effectiveWeatherData, computedSkyColor) : null;

  const headlineTextColor = getContrastingTextColor(skyColor);

  return (
    <div className={`sky-background ${!showContent ? 'sky-background--centered' : ''}`} style={{ '--sky-color': skyColor, backgroundColor: skyColor, '--headline-color': headlineTextColor.hex, '--headline-color-rgb': headlineTextColor.rgb }}>
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
                onNext={handleSkip}
                onPrevious={handlePrevious}
              />
            </div>

            {/* DEBUG: WEATHER OVERRIDES — start (delete this block to remove the panel) */}
            {DEBUG && (
              <WeatherOverrides
                weatherData={weatherData}
                overrides={weatherOverrides}
                blendWeights={getBlendWeights(effectiveWeatherData)}
                onApply={handleApplyOverrides}
                onRevert={handleRevertOverrides}
              />
            )}
            {/* DEBUG: WEATHER OVERRIDES — end */}
          </div>
        )}

        {!showContent && (
          <div className="panel landing-panel">
            <div className="landing-title">ColdFusion</div>

            <div className="landing-toggle">
              <AuthButton connected={spotifyAuthStatus === "Connected"} />
              {spotifyAuthStatus === "Connected" && (
                <p className="landing-status-text">
                  {weatherStatus === "Error" ? weatherStatus : "Getting things ready..."}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App