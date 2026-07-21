function getBlendWeights(weatherData) {
  const { precipitation, cloud_cover, is_day, temperature_2m } = weatherData;

  const weights = {
    rain: 0,
    snow: 0,
    mist: 0,
    clearDayHot: 0,
    clearDayCold: 0,
    clearNightHot: 0,
    clearNightCold: 0,
  };

  let remainingPie = 1.0;

  // --- 1. Precipitation claims first ---
  const precipClaim = Math.min(precipitation / 5, 1) * remainingPie; // tune the /5 divisor once you see real data
  remainingPie -= precipClaim;

  // --- 2. Cloud cover claims from what's left, feeds Mist ---
  const cloudClaim = (cloud_cover / 100) * remainingPie;
  remainingPie -= cloudClaim;
  weights.mist += cloudClaim;

  // --- 3. Whatever's left splits into Clear Day / Clear Night by day/night ---
  // is_day is 0 or 1 from Open-Meteo — treat as a hard split for now (no smooth time gradient yet)
  const dayShare = is_day ? remainingPie : 0;
  const nightShare = is_day ? 0 : remainingPie;

  // --- 4. Temperature grades the precipitation slice into Rain vs Snow ---
  const snowLean = temperature_2m < 32 ? 1 : temperature_2m > 40 ? 0 : (40 - temperature_2m) / 8;
  weights.rain += precipClaim * (1 - snowLean);
  weights.snow += precipClaim * snowLean;

  // --- Temperature grades the clear slices into Hot vs Cold ---
  const hotLean = temperature_2m >= 60 ? 1 : temperature_2m <= 45 ? 0 : (temperature_2m - 45) / 15;

  weights.clearDayHot += dayShare * hotLean;
  weights.clearDayCold += dayShare * (1 - hotLean);
  weights.clearNightHot += nightShare * hotLean;
  weights.clearNightCold += nightShare * (1 - hotLean);

  return weights;
}

// Computes the 4 raw values shown on the dial/riser controls, plus a color for each,
// mixed from the same category colors used elsewhere (rain/snow blend for precipitation,
// mist for cloud cover, clearDayCold/clearDayHot for temperature, night/day for brightness).
import { CATEGORY_COLORS } from './colors';
import { hexToRgb, rgbToHex, mix } from './skyColor';

function getDialMetrics(weatherData) {
  const { precipitation, cloud_cover, is_day, temperature_2m } = weatherData;

  // --- Precipitation dial ---
  const precipitationIntensity = Math.min(precipitation / 5, 1); // same scale as blend.js
  const snowLean = temperature_2m < 32 ? 1 : temperature_2m > 40 ? 0 : (40 - temperature_2m) / 8;
  const precipitationColor = rgbToHex(
    mix(hexToRgb(CATEGORY_COLORS.rain), hexToRgb(CATEGORY_COLORS.snow), snowLean)
  );

  // --- Cloud cover dial ---
  const cloudCoverIntensity = cloud_cover / 100;
  const cloudCoverColor = CATEGORY_COLORS.mist;

  // --- Temperature riser --- normalized across a comfortable visual range, -10°F to 110°F
  const TEMP_MIN = -10;
  const TEMP_MAX = 110;
  const temperatureLevel = Math.max(0, Math.min(1, (temperature_2m - TEMP_MIN) / (TEMP_MAX - TEMP_MIN)));
  const temperatureColor = rgbToHex(
    mix(hexToRgb(CATEGORY_COLORS.clearDayCold), hexToRgb(CATEGORY_COLORS.clearDayHot), temperatureLevel)
  );

  // --- Brightness riser --- combines day/night with how overcast it is;
  // a clear night still reads as dark, an overcast day reads as dim rather than bright
  const brightnessLevel = is_day ? Math.max(0, 1 - cloud_cover / 100) : 0.05;
  const brightnessColor = rgbToHex(
    mix(hexToRgb(CATEGORY_COLORS.clearNightCold), hexToRgb(CATEGORY_COLORS.clearDayHot), brightnessLevel)
  );

  return {
    precipitation: { value: precipitationIntensity, color: precipitationColor, raw: precipitation },
    cloudCover: { value: cloudCoverIntensity, color: cloudCoverColor, raw: cloud_cover },
    temperature: { value: temperatureLevel, color: temperatureColor, raw: temperature_2m },
    brightness: { value: brightnessLevel, color: brightnessColor, raw: null },
  };
}

export { getBlendWeights, getDialMetrics };