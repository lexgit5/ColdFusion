import { useState, useEffect, useRef } from 'react';

// Tomorrow.io's weatherCode values (a flat, context-free code — day/night
// wording is still handled ourselves via isDay, same as before, rather than
// switching to their separate weatherCodeDay/weatherCodeNight fields).
function getConditionLabel(code, isDay) {
  const map = {
    0: "Unknown",
    1000: isDay ? "Sunny" : "Clear",
    1100: isDay ? "Mostly Sunny" : "Mostly Clear",
    1101: "Partly Cloudy",
    1102: "Mostly Cloudy",
    1001: "Cloudy",
    2000: "Foggy",
    2100: "Foggy",
    4000: "Drizzle",
    4001: "Rain",
    4200: "Light Rain",
    4201: "Heavy Rain",
    5000: "Snow",
    5001: "Flurries",
    5100: "Light Snow",
    5101: "Heavy Snow",
    6000: "Freezing Drizzle",
    6001: "Freezing Rain",
    6200: "Light Freezing\u00A0Rain",
    6201: "Heavy Freezing\u00A0Rain",
    7000: "Ice Pellets",
    7101: "Heavy Ice\u00A0Pellets",
    7102: "Light Ice\u00A0Pellets",
    8000: "Thunderstorm",
  };

  return map[code] || "Unknown";
}

// Short labels ("Sunny") read better big; long ones ("Heavy Freezing Rain")
// need to come down a size (and are allowed to wrap) or they'd force a
// scroll on shorter viewports. Tune the two thresholds if new condition
// strings get added and a label lands in the wrong tier.
function getSizeClass(label) {
  if (label.length <= 6) return 'weather-headline--lg';
  if (label.length <= 12) return 'weather-headline--md';
  return 'weather-headline--sm';
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
  const sizeClass = getSizeClass(conditionLabel);

  return (
    <div className={`weather-headline ${sizeClass} ${revealed ? 'revealed' : ''}`}>
      {conditionLabel}
    </div>
  );
}

export default WeatherInfo;