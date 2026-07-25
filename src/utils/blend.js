// precipitation (from Tomorrow.io's precipitationIntensity, units: 'imperial')
// is inches/hour. 0.3 in/hr is the top of "moderate rain" on a standard
// light/moderate/heavy scale — heavier rain clips to the same max intensity
// as a solid moderate rain rather than reading as more extreme. Shared by
// getBlendWeights and getDialMetrics so both always agree on what counts as
// "full" precipitation intensity.
const PRECIP_CEILING_IN_PER_HR = 0.3;

function getBlendWeights(weatherData) {
  const { precipitation, cloud_cover, day_fraction, temperature_2m } = weatherData;

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
  const precipClaim = Math.min(precipitation / PRECIP_CEILING_IN_PER_HR, 1) * remainingPie;
  remainingPie -= precipClaim;

  // --- 2. Cloud cover claims from what's left, feeds Mist — but scaled by
  // day_fraction, since cloud cover mostly reads visually (an overcast sky).
  // At night there's nothing to see it against, so its claim fades out the
  // same way day/night does below — full pull at solar noon, ~none at solar
  // midnight, smooth in between. Whatever cloud cover doesn't claim because
  // of this stays in remainingPie and flows to the day/night split instead.
  const cloudClaim = (cloud_cover / 100) * remainingPie * day_fraction;
  remainingPie -= cloudClaim;
  weights.mist += cloudClaim;

  // --- 3. Whatever's left splits into Clear Day / Clear Night, graded by
  // proximity to sunrise/sunset rather than a hard on/off switch.
  // day_fraction is 0-1 (see getDayFraction in skyColor.js) — 1 at solar
  // noon, 0 at solar midnight, easing smoothly through 0.5 across the
  // twilight window around each sun event. So a sunset moment doesn't flip
  // straight from "clear day" to "clear night" — it fades through a blend
  // of both, matching how the sky itself looks at that moment.
  const dayShare = day_fraction * remainingPie;
  const nightShare = (1 - day_fraction) * remainingPie;

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

// Precipitation dial walks two 4-stop gradients — light to heavy — picking a
// position along each based on rain intensity, then blends between those two
// positions based on how cold it is (snowLean). So a light warm drizzle sits
// near the light end of WARM_PRECIP_SCALE, a heavy cold downpour sits near
// the dark end of COLD_PRECIP_SCALE, and everything else interpolates
// between.
//
// These are desaturated versions of the original blue/magenta gradient —
// same hues and same light-to-dark direction as before, just with
// saturation cut to ~45% so they sit closer to the rest of the app's muted
// palette instead of reading as neon. Re-anchored to 5 stops: the lightest
// stop is unchanged, but the darkest end now caps out at what used to be
// the 3rd of 4 stops (the old 4th stop read as too dark/heavy), with the
// stops in between evenly re-blended across that shorter light-to-dark span.
const WARM_PRECIP_SCALE = ['#B7CADC', '#9FB3D2', '#869CC8', '#6E85BE', '#566EB4'];
const COLD_PRECIP_SCALE = ['#D6B9C9', '#C49DB6', '#B281A4', '#A06591', '#8E497E'];

// Temperature scale: blue (cold) -> pale neutral centered on 60°F -> red (hot).
// Stops are keyed by actual °F so the pale midpoint stays anchored at 60°
// regardless of what TEMP_MIN/TEMP_MAX are set to below. Modeled on a classic
// dial thermometer's blue-to-red color band.
const TEMP_SCALE = [
  { temp: -10, color: '#3E6EA8' }, // deep blue (plateau starts here)
  { temp: 30,  color: '#3E6EA8' }, // still deep blue — holds until close to the pale zone
  { temp: 45,  color: '#9DB8D9' }, // light blue, ramping in
  { temp: 60,  color: '#F0E8DC' }, // pale neutral (centered here)
  { temp: 75,  color: '#E3A98C' }, // light red/pink, ramping in
  { temp: 90,  color: '#B93A2F' }, // deep red (plateau starts here)
  { temp: 110, color: '#B93A2F' }, // still deep red — holds through the top of the range
];

// Walks a multi-stop hex scale and returns an interpolated RGB color at
// position t (0-1), blending linearly between whichever two stops t falls
// between.
function scaleColor(scale, t) {
  const clamped = Math.max(0, Math.min(1, t));
  const scaled = clamped * (scale.length - 1);
  const index = Math.floor(scaled);
  const frac = scaled - index;
  const start = hexToRgb(scale[index]);
  const end = hexToRgb(scale[Math.min(index + 1, scale.length - 1)]);
  return mix(start, end, frac);
}

// Walks TEMP_SCALE and returns an interpolated RGB color for a given
// temperature, blending linearly between whichever two stops it falls
// between. Stops are clamped to the scale's own min/max, and are keyed by
// real °F values (not normalized 0-1), so the pale midpoint stays pinned to
// 60° no matter what TEMP_MIN/TEMP_MAX the riser uses for its dial position.
function scaleColorByTemp(scale, temp) {
  const clamped = Math.max(scale[0].temp, Math.min(scale[scale.length - 1].temp, temp));
  let i = 0;
  while (i < scale.length - 2 && clamped > scale[i + 1].temp) i++;
  const start = scale[i];
  const end = scale[i + 1];
  const span = end.temp - start.temp;
  const frac = span === 0 ? 0 : (clamped - start.temp) / span;
  return mix(hexToRgb(start.color), hexToRgb(end.color), frac);
}

function getDialMetrics(weatherData, skyColor) {
  const { precipitation, cloud_cover, day_fraction, temperature_2m } = weatherData;

  // --- Precipitation dial ---
  const precipitationIntensity = Math.min(precipitation / PRECIP_CEILING_IN_PER_HR, 1);
  const snowLean = temperature_2m < 32 ? 1 : temperature_2m > 40 ? 0 : (40 - temperature_2m) / 8;
  const precipitationColor = rgbToHex(
    mix(
      scaleColor(WARM_PRECIP_SCALE, precipitationIntensity),
      scaleColor(COLD_PRECIP_SCALE, precipitationIntensity),
      snowLean
    )
  );

  // --- Cloud cover dial ---
  const cloudCoverIntensity = cloud_cover / 100;
  const cloudCoverColor = CATEGORY_COLORS.mist;

  // --- Temperature riser --- normalized across a comfortable visual range, -10°F to 110°F.
  // temperatureLevel (0-1) still drives the riser's dial position from TEMP_MIN/TEMP_MAX;
  // temperatureColor is now driven directly off temperature_2m via TEMP_SCALE, so the
  // pale band stays centered on 60°F even if TEMP_MIN/TEMP_MAX are tuned later.
  const TEMP_MIN = -10;
  const TEMP_MAX = 110;
  const temperatureLevel = Math.max(0, Math.min(1, (temperature_2m - TEMP_MIN) / (TEMP_MAX - TEMP_MIN)));
  const temperatureColor = rgbToHex(scaleColorByTemp(TEMP_SCALE, temperature_2m));

  // --- Brightness riser ---
  // Base level follows the same continuous solar curve as the blend weights
  // and mist (day_fraction) — full brightness at solar noon, darkest at
  // solar midnight, ramping smoothly through twilight. No more hard 0.05
  // floor at night; midnight now bottoms out at 0.
  //
  // Cloud cover and rain can each additionally dim that base — up to 40%
  // for full cloud cover, up to 20% for heavy rain — but only while there's
  // daylight to dim in the first place. Their pull is scaled by day_fraction
  // too, so it fades out across the same twilight window as everything
  // else rather than cutting off abruptly right at sunset/sunrise.
  const CLOUD_MAX_DIM = 0.4;
  const RAIN_MAX_DIM = 0.2;

  const rainFraction = Math.min(precipitation / PRECIP_CEILING_IN_PER_HR, 1); // same scale as the precipitation dial above
  const cloudDim = CLOUD_MAX_DIM * (cloud_cover / 100) * day_fraction;
  const rainDim = RAIN_MAX_DIM * rainFraction * day_fraction;

  const brightnessLevel = Math.max(0, day_fraction * (1 - cloudDim - rainDim));
  const brightnessColor = skyColor || rgbToHex(
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