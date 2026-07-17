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
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,precipitation,cloud_cover,weather_code,is_day`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Weather fetch failed: ${response.status}`);
  }

  const data = await response.json();
  return data.current; // { temperature_2m, precipitation, cloud_cover, weather_code, is_day, time }
}

export { getUserLocation, getWeather };