function getUserLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported by this browser'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      (error) => {
        reject(new Error(`Geolocation failed: ${error.message}`));
      }
    );
  });
}

// Tomorrow.io requires an API key. Set VITE_TOMORROW_API_KEY in a .env file
// (adjust the env var access below if you're not on Vite).
const API_KEY = import.meta.env.VITE_TOMORROW_API_KEY;

// --- Sunrise/sunset + current precipitation: Open-Meteo -------------------
// Tomorrow.io's free tier restricts sunriseTime/sunsetTime to a -6 hour
// lookback (paid accounts get -7 days), which isn't enough for the
// yesterday/today/tomorrow window the sky gradient needs. Open-Meteo has no
// such restriction, so it handles sunrise/sunset instead — everything else
// still comes from Tomorrow.io.
//
// Also pulls current precipitation from the same request (no extra fetch)
// so getWeather can cross-check it against Tomorrow.io's number — Tomorrow's
// nowcast has been seen to report 0 while it was actually raining, so
// precipitation specifically uses whichever provider reports the higher
// value rather than trusting Tomorrow.io alone. Just precipitation for now;
// temperature and cloud cover aren't part of this fetch.
async function getSunriseSunsetAndPrecipitation(latitude, longitude) {
  const params = new URLSearchParams({
    latitude,
    longitude,
    daily: 'sunrise,sunset',
    current: 'precipitation',
    precipitation_unit: 'inch', // match Tomorrow.io's units: 'imperial' (in/hr)
    timezone: 'auto',
    past_days: '1',
    forecast_days: '2',
  });

  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);

  if (!response.ok) {
    throw new Error(`Sunrise/sunset fetch failed: ${response.status}`);
  }

  const data = await response.json();

  return {
    // 3 entries each: [0]=yesterday, [1]=today, [2]=tomorrow — matches what
    // skyColor.js's getSkyPeriod expects.
    daily: {
      sunrise: data.daily.sunrise,
      sunset: data.daily.sunset,
    },
    precipitation: data.current.precipitation,
  };
}

// --- Current conditions: Tomorrow.io ---------------------------------------
async function getCurrentConditions(latitude, longitude) {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const params = new URLSearchParams({
    location: `${latitude},${longitude}`,
    fields: 'temperature,precipitationIntensity,cloudCover,weatherCode',
    timesteps: 'current',
    units: 'imperial',
    timezone,
    apikey: API_KEY,
  });

  const response = await fetch(`https://api.tomorrow.io/v4/timelines?${params}`);

  if (!response.ok) {
    throw new Error(`Weather fetch failed: ${response.status}`);
  }

  const data = await response.json();
  const values = data.data.timelines[0]?.intervals[0]?.values;

  if (!values) {
    throw new Error('Weather fetch succeeded but returned no current conditions');
  }

  return values;
}

// Combines both sources into the shape the rest of the app already expects
// (blend.js, skyColor.js, WeatherInfo.jsx) — temperature_2m, precipitation,
// cloud_cover, weather_code, daily.sunrise/daily.sunset. is_day is
// intentionally NOT included here — App.jsx computes it itself from daily +
// the current/overridden time, independent of either provider.
async function getWeather(latitude, longitude) {
  const [current, openMeteo] = await Promise.all([
    getCurrentConditions(latitude, longitude),
    getSunriseSunsetAndPrecipitation(latitude, longitude),
  ]);

  // Precipitation: take whichever provider reports the higher value.
  // Tomorrow.io's nowcast has been observed reporting 0 in/hr during actual
  // rain — a false negative (missing real rain) is worse for this app than
  // a false positive, so this errs toward whichever source is willing to
  // say it's raining.
  const precipitation = Math.max(current.precipitationIntensity, openMeteo.precipitation);

  return {
    temperature_2m: current.temperature,
    precipitation,
    cloud_cover: current.cloudCover,
    weather_code: current.weatherCode,
    daily: openMeteo.daily,
  };
}

export { getUserLocation, getWeather };