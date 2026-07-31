import { useEffect, useState, useRef } from 'react'
import AuthButton from './components/AuthButton'
import { exchangeCodeForToken } from './utils/spotifyAuth'
import { initializePlayer } from './utils/spotifyPlayer'
import { getUserLocation, getWeather } from './utils/weather'
import { getBlendWeights, getDialMetrics } from './utils/blend'
import { fetchTracklists, pickTrack } from './utils/queueBuilder'
import { playTrack, queueTrack } from './utils/spotifyApi'
import { getSkyColor, getIsDay, getDayFraction, applyCloudCover, applyPrecipitation } from './utils/skyColor'
import WeatherInfo from './components/WeatherInfo'
import NowPlaying from './components/NowPlaying'
import PlaybackControls from './components/PlaybackControls'
import WeatherDials from './components/WeatherDials'
// DEBUG: WEATHER OVERRIDES — start (delete this import too when removing)
import WeatherOverrides from './components/WeatherOverrides'
// DEBUG: WEATHER OVERRIDES — end

import './App.css'

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

// DEBUG: WEATHER OVERRIDES — start
// Turn weatherData + overrides + now into the same effectiveWeatherData
// shape used everywhere else. Pulled out so handleApplyOverrides can
// compute this with the *new* overrides before state has re-rendered.
function computeEffectiveWeatherData(weatherData, overrides, now) {
  if (!weatherData) return null;
  return {
    ...weatherData,
    is_day: getIsDay(weatherData.daily, now) ? 1 : 0,
    day_fraction: getDayFraction(weatherData.daily, now),
    ...(overrides.temperature_2m !== undefined && { temperature_2m: overrides.temperature_2m }),
    ...(overrides.precipitation !== undefined && { precipitation: overrides.precipitation }),
    ...(overrides.cloud_cover !== undefined && { cloud_cover: overrides.cloud_cover }),
  };
}
// DEBUG: WEATHER OVERRIDES — end

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

  const [weatherData, setWeatherData] = useState(null);
  // Stored after the first successful geolocation fetch, so the 15-minute
  // weather refresh below can re-call getWeather() directly without
  // re-prompting the browser's location permission every time.
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

  // Keep weather current: once we have a location, re-fetch every 15
  // minutes in the background — no geolocation re-prompt, just a fresh
  // getWeather() call with the coords we already have. weatherData feeding
  // into effectiveWeatherData (and everything derived from it — dials, sky
  // color, blend weights, and now the next queued track) is already
  // reactive, so this alone keeps everything current.
  //
  // If a refresh fails (network blip, API hiccup), a separate retry loop
  // takes over — trying every WEATHER_RETRY_INTERVAL_MS until one succeeds
  // — rather than silently waiting out the rest of the 15-minute window on
  // stale data. Once a retry succeeds, the retry loop stops and the normal
  // 15-minute interval (which keeps running the whole time) picks back up
  // on its own schedule.
  const WEATHER_REFRESH_INTERVAL_MS = 15 * 60 * 1000;
  const WEATHER_RETRY_INTERVAL_MS = 30 * 1000;
  const retryIntervalRef = useRef(null);

  useEffect(() => {
    if (!coords) return;

    function startRetryLoop() {
      if (retryIntervalRef.current) return; // already retrying, don't stack a second loop

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
        // Don't clobber weatherStatus/weatherData on a background refresh
        // failure — just log it, keep showing the last good reading, and
        // switch to the faster retry cadence until it recovers.
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
  // Manual overrides for temperature / precipitation / cloud cover / current
  // time, set via the WeatherOverrides panel — lets you test the app against
  // any weather or time of day without waiting for real conditions to
  // change. Only fields present in this object override the real value;
  // everything else always tracks real data.
  const [weatherOverrides, setWeatherOverrides] = useState({});

  function handleApplyOverrides(next) {
    // Nothing else to do here — effectiveWeatherData picks up the new
    // overrides on the next render, and since the next queued track is
    // always picked fresh from current conditions (see queueNextTrack),
    // there's no separate queue to rebuild anymore.
    setWeatherOverrides(next);
  }

  function handleRevertOverrides() {
    setWeatherOverrides({});
  }

  // "Now", for every place below that needs the current moment — either the
  // real clock, or the override time typed into the debug panel
  // (datetime-local strings parse as local time via `new Date(...)`).
  // getSkyColor and getIsDay MUST both receive this same value, or the sky
  // color and the day/night flag could disagree with each other.
  const now = weatherOverrides.time ? new Date(weatherOverrides.time) : new Date();
  // DEBUG: WEATHER OVERRIDES — end

  // weatherData with is_day always computed fresh from the current time
  // (real, or overridden — see `now` above) + real sunrise/sunset, rather
  // than trusted from either weather provider (neither Open-Meteo's hybrid
  // setup nor Tomorrow.io's hand back is_day anymore — this is the one and
  // only source of truth for it now). Any active weatherOverrides are
  // layered on top after that.
  const effectiveWeatherData = weatherData
    ? {
        ...weatherData,
        is_day: getIsDay(weatherData.daily, now) ? 1 : 0,
        // Continuous 0-1 day/night grading by proximity to sunrise/sunset,
        // used by getBlendWeights instead of the hard is_day split above.
        // is_day itself is left untouched — getDialMetrics' brightness
        // riser still reads it directly.
        day_fraction: getDayFraction(weatherData.daily, now),
        // DEBUG: WEATHER OVERRIDES — start
        ...(weatherOverrides.temperature_2m !== undefined && { temperature_2m: weatherOverrides.temperature_2m }),
        ...(weatherOverrides.precipitation !== undefined && { precipitation: weatherOverrides.precipitation }),
        ...(weatherOverrides.cloud_cover !== undefined && { cloud_cover: weatherOverrides.cloud_cover }),
        // DEBUG: WEATHER OVERRIDES — end
      }
    : null;

  // Kept in a ref alongside the state value so the progress-watching effect
  // (below) can always read the *latest* weather without needing to list
  // effectiveWeatherData — which is a brand-new object every render — in
  // its own dependency array.
  const effectiveWeatherDataRef = useRef(effectiveWeatherData);
  effectiveWeatherDataRef.current = effectiveWeatherData;

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

  // Picks one track from *current* conditions (whatever effectiveWeatherData
  // is at call time) and plays it immediately, replacing whatever's playing.
  // Used only by Start.
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

  // Picks one track from *current* conditions and adds it to the queue —
  // deliberately independent of whatever weather was in effect when the
  // currently-playing song was chosen. Called once per song, when that
  // song hits 1 minute left (see the progress-watching effect below).
  // Returns true/false so the caller can tell whether it actually succeeded
  // — a failure here (rate limit, empty playlist, network blip, etc.)
  // shouldn't be treated as "handled" for this song.
  async function queueNextTrack() {
    const weatherForPick = effectiveWeatherDataRef.current;
    if (!weatherForPick) return false;

    const weights = getBlendWeights(weatherForPick);
    setBlendWeights(weights);

    const { categories, tracklists } = await fetchTracklists(weights, accessToken);
    const track = pickTrack(weights, categories, tracklists);
    if (!track) return false;

    await withPremium403Retry(() => queueTrack(deviceId, accessToken, track.uri));
    return true;
  }

  // Watches playback progress and queues exactly one track per song, the
  // moment that song has 60 seconds or less left. queuedForUriRef tracks
  // which currently-playing track we've already *successfully* queued
  // behind — it's only set once queueNextTrack() actually resolves, so a
  // failure (rate limit, empty playlist, network blip — anything other than
  // Spotify's 403 "not ready yet", which is already retried internally)
  // leaves the ref untouched and the effect gets another shot at it on the
  // next progress tick, instead of silently giving up on that song's queue
  // for good. The ref resets naturally once currentTrack.uri changes (i.e.
  // the next song actually starts playing).
  const queuedForUriRef = useRef(null);
  const queueingRef = useRef(false); // guards against overlapping attempts while one is already in flight
  const ONE_MINUTE_MS = 60 * 1000;

  useEffect(() => {
    if (!hasStarted || isPaused || !currentTrack || !progress.duration) return;

    const remaining = progress.duration - progress.position;
    if (remaining > ONE_MINUTE_MS) return;
    if (queuedForUriRef.current === currentTrack.uri) return; // already queued behind this song
    if (queueingRef.current) return; // an attempt is already in flight for this tick

    const trackUriAtAttemptTime = currentTrack.uri;
    queueingRef.current = true;

    queueNextTrack()
      .then((succeeded) => {
        if (succeeded) {
          queuedForUriRef.current = trackUriAtAttemptTime;
        }
      })
      .catch((err) => {
        console.error('Failed to queue next track, will retry:', err);
      })
      .finally(() => {
        queueingRef.current = false;
      });
  }, [progress, hasStarted, isPaused, currentTrack]);

  async function handleStart() {
    if (!effectiveWeatherData || !deviceId) {
      console.error('Missing weather data or device — check weather and ensure player is ready first');
      return;
    }

    setHasStarted(true); // triggers the headline, dials, and risers to fade/animate in
    queuedForUriRef.current = null; // fresh session, nothing queued yet

    await playCurrentConditionsTrack();
  }

  // Most of a song's runtime, nothing is queued (queueing only happens once
  // a song has 60 seconds or less left — see the progress-watching effect
  // above), so Spotify's own skip-to-next has nothing to skip to for most
  // of the session. If something HAS already been successfully queued for
  // the current song (queuedForUriRef matches it), defer to Spotify's
  // normal skip. Otherwise, skip by picking and playing a fresh track from
  // current conditions directly — the same thing Start does — so the
  // button always does something sensible regardless of where in the song
  // it's pressed.
  async function handleSkip() {
    if (!player) return;

    const somethingIsQueued = currentTrack && queuedForUriRef.current === currentTrack.uri;

    if (somethingIsQueued) {
      player.nextTrack();
    } else {
      queuedForUriRef.current = null; // the track we're skipping away from no longer matters
      await playCurrentConditionsTrack();
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
  //
  // DEBUG: WEATHER OVERRIDES — while a time override is active, this timer
  // is paused: it exists to nudge the sky forward with the *real* clock,
  // which would otherwise fight a frozen override time. Delete the
  // `if (weatherOverrides.time) return;` line (and the dependency below)
  // when removing the debug panel, restoring the original always-on timer.
  const [, setClockTick] = useState(0);

  useEffect(() => {
    if (weatherOverrides.time) return; // DEBUG: WEATHER OVERRIDES

    const interval = setInterval(() => {
      setClockTick((t) => t + 1);
    }, 60000); // once a minute is plenty for a gradient this gradual

    return () => clearInterval(interval);
  }, [weatherOverrides.time]); // DEBUG: WEATHER OVERRIDES — swap back to [] when removing

  // Live sky background color, anchored to today's real local sunrise/sunset
  // once weather has been checked; falls back to a fixed-hour gradient before
  // that. Then desaturated toward grey based on cloud cover — a color that's
  // already near-grey (deep midnight) barely changes no matter how overcast
  // it is, so the effect naturally fades out at night on its own.
  const baseSkyColor = getSkyColor(weatherData?.daily, now);
  const cloudCoverFraction = effectiveWeatherData ? effectiveWeatherData.cloud_cover / 100 : 0;
  // Same 0-1 intensity scale as the precipitation dial in blend.js (min(precipitation / 5, 1))
  const precipitationFraction = effectiveWeatherData ? Math.min(effectiveWeatherData.precipitation / 5, 1) : 0;
  const computedSkyColor = applyPrecipitation(
    applyCloudCover(baseSkyColor, cloudCoverFraction),
    precipitationFraction
  );

  // Stays on the original default background through the whole landing
  // page — the real weather-based color only takes over once showContent
  // flips true (i.e. after the landing panel has finished fading out), so
  // the background change happens alongside the content fade-in rather than
  // racing the landing panel's own fade-out. The existing 2.5s CSS
  // transition on background-color animates that swap smoothly.
  const DEFAULT_SKY_COLOR = '#0B0E14';
  const skyColor = showContent ? computedSkyColor : DEFAULT_SKY_COLOR;

  // Dial/riser metrics, computed from (is_day-corrected, override-applied)
  // weather data — updates as soon as weather is checked, independent of
  // whether a queue has been built yet. computedSkyColor is passed through
  // so the brightness riser's color always matches the real sky background
  // (cloud desaturation, precipitation darkening, and all) instead of using
  // its own separate day/night blend.
  const dialMetrics = effectiveWeatherData ? getDialMetrics(effectiveWeatherData, computedSkyColor) : null;

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
                onNext={handleSkip}
              />
            </div>

            {/* DEBUG: WEATHER OVERRIDES — start (delete this block to remove the panel) */}
            <WeatherOverrides
              weatherData={weatherData}
              overrides={weatherOverrides}
              blendWeights={getBlendWeights(effectiveWeatherData)}
              onApply={handleApplyOverrides}
              onRevert={handleRevertOverrides}
            />
            {/* DEBUG: WEATHER OVERRIDES — end */}
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