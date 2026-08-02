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
// known-users/location KV. Used here only to (a) check whether this
// Spotify account has already completed setup (Worker login + location
// share) — if not, we hand off to it, and it redirects back here when
// done — and (b) keep the Worker's saved location current, since its cron
// has no browser and can't geolocate itself.
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

  // Spotify user id for this visitor — fetched once during the Worker
  // status check below, and reused afterward to push periodic location
  // updates to the Worker on the same cadence as the weather refresh.
  const [spotifyUserId, setSpotifyUserId] = useState(null);

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
  // redirects back here via ?returnTo when finished. Either way, this does
  // NOT auto-trigger weather/location on the frontend — the "Provide
  // Location" button below still does that manually, same as before.
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
        setSpotifyUserId(me.id);

        const statusRes = await fetch(`${WORKER_URL}/auth/status?userId=${encodeURIComponent(me.id)}`);
        const status = await statusRes.json();

        if (!status.known || !status.hasLocation) {
          window.location.href = `${WORKER_URL}/auth/login?returnTo=${encodeURIComponent(window.location.origin)}`;
        }
        // Already fully set up — nothing else to do here. The user still
        // clicks "Provide Location" themselves to kick off the frontend's
        // own weather fetch.
      } catch (err) {
        console.error('Worker status check failed:', err);
      }
    })();
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

  // Pushes the current coords to the Worker's saved location for this
  // user, so its cron (which has no browser and can't geolocate itself)
  // stays current. Reuses /save-location — the same endpoint the one-time
  // setup page posts to — since it already validates known users and just
  // overwrites the stored location either way.
  async function pushLocationToWorker(latitude, longitude) {
    if (!spotifyUserId) return;
    try {
      await fetch(`${WORKER_URL}/save-location`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: spotifyUserId, latitude, longitude }),
      });
    } catch (err) {
      console.error('Failed to push location update to Worker:', err);
    }
  }

  // Keep weather current: once we have a location, re-fetch every 15
  // minutes in the background — no geolocation re-prompt, just a fresh
  // getWeather() call with the coords we already have. Also pushes the
  // same coords to the Worker on this cadence, so its cron-driven weather
  // check uses an up-to-date location instead of the one-time snapshot
  // from setup. weatherData feeding into effectiveWeatherData (and
  // everything derived from it — dials, sky color, blend weights) is
  // already reactive, so this alone keeps everything current.
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
        pushLocationToWorker(coords.latitude, coords.longitude);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords, spotifyUserId]);

  // DEBUG: WEATHER OVERRIDES — start
  // Manual overrides for temperature / precipitation / cloud cover / current
  // time, set via the WeatherOverrides panel — lets you test the app against
  // any weather or time of day without waiting for real conditions to
  // change. Only fields present in this object override the real value;
  // everything else always tracks real data.
  const [weatherOverrides, setWeatherOverrides] = useState({});

  function handleApplyOverrides(next) {
    setWeatherOverrides(next);
  }

  function handleRevertOverrides() {
    setWeatherOverrides({});
  }
  // DEBUG: WEATHER OVERRIDES — end

  // "Now", for every place below that needs the current moment — either the
  // real clock or the override time typed into the debug panel (datetime-
  // local strings parse as local time via `new Date(...)`).
  const [clockNow, setClockNow] = useState(() => new Date());

  useEffect(() => {
    if (weatherOverrides.time) return; // override drives `now` instead — see effectiveNow below

    const interval = setInterval(() => {
      setClockNow(new Date());
    }, 60000); // once a minute is plenty for a gradient this gradual

    return () => clearInterval(interval);
  }, [weatherOverrides.time]);

  // getSkyColor and getIsDay MUST both receive this same value, or the sky
  // color and the day/night flag could disagree with each other.
  const now = weatherOverrides.time ? new Date(weatherOverrides.time) : clockNow;

  // weatherData with is_day always computed fresh from the current time
  // (real, or overridden — see `now` above) + real sunrise/sunset. Any
  // active weatherOverrides are layered on top after that.
  const effectiveWeatherData = weatherData
    ? {
        ...weatherData,
        is_day: getIsDay(weatherData.daily, now) ? 1 : 0,
        // Continuous 0-1 day/night grading by proximity to sunrise/sunset,
        // used by getBlendWeights instead of the hard is_day split above.
        day_fraction: getDayFraction(weatherData.daily, now),
        // DEBUG: WEATHER OVERRIDES — start
        ...(weatherOverrides.temperature_2m !== undefined && { temperature_2m: weatherOverrides.temperature_2m }),
        ...(weatherOverrides.precipitation !== undefined && { precipitation: weatherOverrides.precipitation }),
        ...(weatherOverrides.cloud_cover !== undefined && { cloud_cover: weatherOverrides.cloud_cover }),
        // DEBUG: WEATHER OVERRIDES — end
      }
    : null;

  // Kept in a ref alongside the state value so playCurrentConditionsTrack
  // can always read the *latest* weather without needing effectiveWeatherData
  // (a brand-new object every render) in a dependency array.
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
  // a couple of frames later.
  const [contentRevealed, setContentRevealed] = useState(false);

  useEffect(() => {
    if (!showContent) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setContentRevealed(true));
    });
  }, [showContent]);

  // Picks one track from *current* conditions (whatever effectiveWeatherData
  // is at call time) and plays it immediately, replacing whatever's playing.
  // Used by Start, and by Skip when there's nothing else to fall back to.
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

  // --- Previous-track history + local queue -------------------------------
  //
  // historyRef holds every track played, in order, so Previous has
  // something to walk backward through. historyIndexRef points at "where
  // we currently are" in that list — distinct from historyRef.length - 1
  // once the user has gone Previous at least once.
  //
  // localQueueRef is a front-of-queue for tracks we explicitly want to play
  // next (e.g. the song bumped back by Previous). It's checked by
  // handleSkip before anything else, because Spotify's own queue API can
  // only *append* to the end of the real queue — there's no way to insert
  // something at the front — so we can't use Spotify's queue for this.
  //
  // isNavigatingHistoryRef is a flag set right before we deliberately
  // change tracks via handlePrevious/handleSkip, so the history-building
  // effect below can tell "we did this on purpose, don't re-add it to
  // history" apart from "a genuinely new track started elsewhere" (e.g.
  // the Worker's server-side queue advancing playback).
  const historyRef = useRef([]);
  const historyIndexRef = useRef(-1);
  const localQueueRef = useRef([]);
  const isNavigatingHistoryRef = useRef(false);
  const lastSeenUriRef = useRef(null); // last uri actually recorded into history, so repeat onStateChange events for the same song don't duplicate it
  const navBusyRef = useRef(false); // true while a Previous/Next navigation is in flight, blocks overlapping clicks from corrupting historyIndexRef

  // Builds history as tracks actually play. Runs on every currentTrack
  // change (Start, the Worker's server-side queue advancing playback, our
  // own Previous/Next handling below, etc).
  useEffect(() => {
    if (!currentTrack) return;

    if (isNavigatingHistoryRef.current) {
      // We caused this change ourselves — historyIndexRef was already
      // updated by the handler that triggered it. Just clear the flag.
      isNavigatingHistoryRef.current = false;
      lastSeenUriRef.current = currentTrack.uri;
      return;
    }

    // onStateChange fires for lots of things besides an actual track change
    // (play/pause, seeks, etc), and setCurrentTrack builds a new object
    // every time even when the song is unchanged — so currentTrack is a
    // new reference on nearly every state-changed event. Only treat this
    // as a "new track" when the uri actually differs from the last one we
    // recorded, otherwise every state-changed tick would duplicate the
    // current song into history.
    if (lastSeenUriRef.current === currentTrack.uri) {
      return;
    }
    lastSeenUriRef.current = currentTrack.uri;

    // A genuinely new track started. If we're not at the end of history
    // (the user had gone Previous and this is a fresh track rather than us
    // walking forward again), drop anything "ahead" before appending —
    // same convention as browser back/forward history.
    const nextIndex = historyIndexRef.current + 1;
    historyRef.current = [...historyRef.current.slice(0, nextIndex), currentTrack];
    historyIndexRef.current = nextIndex;
  }, [currentTrack]);

  // Plays a specific, already-known track directly — used by Previous/Next
  // history navigation, as opposed to playCurrentConditionsTrack, which
  // picks a fresh track from current weather.
  async function playFromUri(uri) {
    await withPremium403Retry(() => playTrack(deviceId, accessToken, uri));
  }

  // Plays the song before the current one in history, and puts the song
  // we're leaving at the front of the local queue so a subsequent Next
  // picks it back up. E.g. listening to song 3, hit Previous: song 2
  // plays, song 3 goes into the local queue. Hit Previous again: song 1
  // plays, local queue becomes [song 2, song 3].
  async function handlePrevious() {
    if (!player) return;
    if (navBusyRef.current) return;

    // Anchor historyIndexRef to what's actually playing before trusting it —
    // overlapping/out-of-order state-changed events can leave it pointing
    // somewhere stale.
    if (currentTrack) {
      const actualIndex = historyRef.current.findIndex((t) => t.uri === currentTrack.uri);
      if (actualIndex !== -1 && actualIndex !== historyIndexRef.current) {
        historyIndexRef.current = actualIndex;
      }
    }

    if (historyIndexRef.current <= 0) return; // nothing before the first song

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

  async function handleStart() {
    if (!effectiveWeatherData || !deviceId) {
      console.error('Missing weather data or device — check weather and ensure player is ready first');
      return;
    }

    setHasStarted(true); // triggers the headline, dials, and risers to fade/animate in

    await playCurrentConditionsTrack();
  }

  // Local-queue and history-forward navigation take priority (songs bumped
  // back by Previous, or walking forward through history after a Previous
  // press). If neither applies, defer to Spotify's own skip-to-next —
  // since the Worker's server-side cron keeps a track queued behind
  // whatever's currently playing, there's normally something there for
  // Spotify to skip to. If Spotify's skip has nothing queued (e.g. right
  // at the very start of a session, before the Worker's cron has had a
  // chance to run), fall back to picking a fresh track from current
  // conditions directly.
  async function handleSkip() {
    if (!player) return;
    if (navBusyRef.current) return;

    // Same resync as handlePrevious — anchor to what's actually playing
    // before trusting historyIndexRef.
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

  // Live sky background color, anchored to today's real local sunrise/sunset
  // once weather has been checked; falls back to a fixed-hour gradient before
  // that. Then desaturated toward grey based on cloud cover.
  const baseSkyColor = getSkyColor(weatherData?.daily, now);
  const cloudCoverFraction = effectiveWeatherData ? effectiveWeatherData.cloud_cover / 100 : 0;
  const precipitationFraction = effectiveWeatherData ? Math.min(effectiveWeatherData.precipitation / 5, 1) : 0;
  const computedSkyColor = applyPrecipitation(
    applyCloudCover(baseSkyColor, cloudCoverFraction),
    precipitationFraction
  );

  // Stays on the original default background through the whole landing
  // page — the real weather-based color only takes over once showContent
  // flips true.
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
                onStart={handleStart}
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