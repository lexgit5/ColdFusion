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

async function getWeather(latitude, longitude) {
  // daily=sunrise,sunset + timezone=auto gets local sunrise/sunset for this
  // location, returned as local wall-clock ISO strings (no offset) — safe to
  // parse directly with `new Date(...)` as long as the browser's own
  // timezone roughly matches the location just geolocated, which it will
  // for the normal case of checking weather from where you actually are.
  //
  // past_days=1 & forecast_days=2 pulls yesterday/today/tomorrow's sunrise
  // and sunset (3 entries each) — needed so the sky gradient has a correct
  // start/end point to interpolate across even in the hours before today's
  // sunrise or after today's sunset.
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,precipitation,cloud_cover,weather_code,is_day&daily=sunrise,sunset&timezone=auto&past_days=1&forecast_days=2&temperature_unit=fahrenheit`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Weather fetch failed: ${response.status}`);
  }

  const data = await response.json();

  return {
    ...data.current, // temperature_2m, precipitation, cloud_cover, weather_code, is_day, time — unchanged shape
    daily: data.daily, // { time: [...], sunrise: [...], sunset: [...] } for yesterday/today/tomorrow
  };
}

export { getUserLocation, getWeather };