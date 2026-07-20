import { useState, useEffect, useRef } from 'react';

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

function WeatherInfo({ weatherData, started }) {
  const [revealed, setRevealed] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    if (started && !startedRef.current) {
      startedRef.current = true;
      // Same double-rAF pattern as WeatherDials: lets the browser commit the
      // opacity:0 state to the DOM first, so the fade to 1 actually transitions
      // instead of the two updates getting batched into an instant jump.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setRevealed(true));
      });
    }
  }, [started]);

  if (!weatherData) {
    return (
      <div className={`weather-headline ${revealed ? 'revealed' : ''}`}>
        <span className="no-data">Check the weather to get started</span>
      </div>
    );
  }

  const conditionLabel = getConditionLabel(weatherData.weather_code, weatherData.is_day);
  const temp = Math.round(weatherData.temperature_2m);

  return (
    <div className={`weather-headline ${revealed ? 'revealed' : ''}`}>
      {conditionLabel}
    </div>
  );
}

export default WeatherInfo;