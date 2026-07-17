function getConditionLabel(code, isDay) {
  const map = {
    0: isDay ? "Sunny" : "Clear",
    1: isDay ? "Mostly Sunny" : "Mostly Clear",
    2: "Partly Cloudy",
    3: "Cloudy",
    45: "Foggy",
    48: "Foggy",
    51: "Light Drizzle",
    53: "Drizzle",
    55: "Heavy Drizzle",
    56: "Freezing Drizzle",
    57: "Freezing Drizzle",
    61: "Light Rain",
    63: "Rain",
    65: "Heavy Rain",
    66: "Freezing Rain",
    67: "Freezing Rain",
    71: "Light Snow",
    73: "Snow",
    75: "Heavy Snow",
    77: "Snow Grains",
    80: "Rain Showers",
    81: "Rain Showers",
    82: "Heavy Rain Showers",
    85: "Snow Showers",
    86: "Heavy Snow Showers",
    95: "Thunderstorm",
    96: "Thunderstorm",
    99: "Severe Thunderstorm",
  };

  return map[code] || "Unknown";
}

function WeatherInfo({ weatherData }) {
  if (!weatherData) {
    return <div>Weather Information: No data yet</div>;
  }

  const conditionLabel = getConditionLabel(weatherData.weather_code, weatherData.is_day);
  const temp = Math.round(weatherData.temperature_2m);

  return (
    <div>
      {conditionLabel}, {temp}°
    </div>
  );
}

export default WeatherInfo;