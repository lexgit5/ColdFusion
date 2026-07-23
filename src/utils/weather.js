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

// --- Sunrise/sunset: Open-Meteo -------------------------------------------
// Tomorrow.io's free tier restricts sunriseTime/sunsetTime to a -6 hour
// lookback (paid accounts get -7 days), which isn't enough for the
// yesterday/today/tomorrow window the sky gradient needs. Open-Meteo has no
// such restriction, so it handles this one field instead — everything else
// still comes from Tomorrow.io.
async function getSunriseSunset(latitude, longitude) {
  const params = new URLSearchParams({
    latitude,
    longitude,
    daily: 'sunrise,sunset',
    timezone: 'auto',
    past_days: '1',
    forecast_days: '2',
  });

  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);

  if (!response.ok) {
    throw new Error(`Sunrise/sunset fetch failed: ${response.status}`);
  }

  const data = await response.json();

  // 3 entries each: [0]=yesterday, [1]=today, [2]=tomorrow — matches what
  // skyColor.js's getSkyPeriod expects.
  return {
    sunrise: data.daily.sunrise,
    sunset: data.daily.sunset,
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
  const [current, daily] = await Promise.all([
    getCurrentConditions(latitude, longitude),
    getSunriseSunset(latitude, longitude),
  ]);

  return {
    temperature_2m: current.temperature,
    precipitation: current.precipitationIntensity,
    cloud_cover: current.cloudCover,
    weather_code: current.weatherCode,
    daily,
  };
}

export { getUserLocation, getWeather };