function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function rgbToHex({ r, g, b }) {
  const toHex = (n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function mix(a, b, amount) {
  // amount = 0 -> all a, amount = 1 -> all b
  return {
    r: a.r + (b.r - a.r) * amount,
    g: a.g + (b.g - a.g) * amount,
    b: a.b + (b.b - a.b) * amount,
  };
}

function rgbToHsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s;
  const l = (max + min) / 2;

  if (max === min) {
    h = 0;
    s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }

  return { h, s, l };
}

function hslToRgb({ h, s, l }) {
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }

  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  return {
    r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, h) * 255),
    b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  };
}

// Desaturates a sky color toward grey based on cloud cover, rather than
// mixing in a fixed grey overlay. This is the point: a color that's already
// near-grey (a deep midnight tone has almost no saturation to begin with)
// barely changes no matter how overcast it is — the effect fades out at
// night on its own, no special-casing needed. A saturated midday blue shows
// it clearly. `cloudFraction` is 0-1 (e.g. cloud_cover / 100).
function applyCloudCover(hex, cloudFraction) {
  const MAX_DESATURATION = 0.65; // at 100% cloud cover, cut saturation by up to 65%
  const MAX_LIGHTNESS_PULL = 0.12; // subtle flattening toward mid-grey lightness

  const hsl = rgbToHsl(hexToRgb(hex));
  const s = hsl.s * (1 - cloudFraction * MAX_DESATURATION);
  const l = hsl.l + (0.5 - hsl.l) * cloudFraction * MAX_LIGHTNESS_PULL;

  return rgbToHex(hslToRgb({ h: hsl.h, s, l }));
}

// Storm darkening: as precipitation intensity climbs, the sky darkens and
// its hue eases toward a cool storm-blue — the way thunderclouds don't just
// dim daylight, they tint it. Same HSL-nudge technique as applyCloudCover
// (rather than mixing toward a fixed RGB color), for two reasons:
//   - Multiplying lightness down (never adding/mixing it up) guarantees this
//     only ever darkens a color, so it can't accidentally lighten an
//     already-near-black night sky.
//   - Like cloud cover, the effect is naturally weakest exactly when the sky
//     is already dark (night) and strongest against a bright midday blue —
//     no special-casing needed, it just falls out of multiplying lightness.
// `precipFraction` is 0-1 (e.g. the same min(precipitation / 5, 1) used for
// the precipitation dial in blend.js).
const STORM_HUE = 0.61; // ~220° — cool blue-grey, matches the rest of the palette's blues

function applyPrecipitation(hex, precipFraction) {
  const MAX_DARKEN = 0.4; // at full intensity, lightness drops to 60% of its current value
  const MAX_HUE_PULL = 0.5; // how far the hue eases toward STORM_HUE at full intensity
  const MAX_SATURATION_BOOST = 0.15; // slight boost so the blue tint reads instead of just going grey

  const hsl = rgbToHsl(hexToRgb(hex));

  // Shift hue toward STORM_HUE via the shorter direction around the color wheel
  let hueDiff = STORM_HUE - hsl.h;
  if (hueDiff > 0.5) hueDiff -= 1;
  if (hueDiff < -0.5) hueDiff += 1;
  let h = hsl.h + hueDiff * precipFraction * MAX_HUE_PULL;
  h = ((h % 1) + 1) % 1;

  const s = Math.min(1, hsl.s + precipFraction * MAX_SATURATION_BOOST);
  const l = hsl.l * (1 - precipFraction * MAX_DARKEN);

  return rgbToHex(hslToRgb({ h, s, l }));
}

// Fallback stops (fixed clock hours), used only before we have a location
// and real sunrise/sunset times to work with — e.g. on first load, before
// "Check Weather" has been clicked.
const FALLBACK_STOPS = [
  { hour: 0,  color: '#05070C' },
  { hour: 5,  color: '#0B0E1A' },
  { hour: 6,  color: '#4A5A8A' },
  { hour: 7,  color: '#E8926B' },
  { hour: 9,  color: '#8FCBEA' },
  { hour: 12, color: '#6EC6F0' },
  { hour: 15, color: '#7FC3EA' },
  { hour: 17, color: '#9AB8D9' },
  { hour: 18, color: '#E8825A' },
  { hour: 19, color: '#5B4B8A' },
  { hour: 20, color: '#1B1F3A' },
  { hour: 22, color: '#0B0E1A' },
  { hour: 24, color: '#05070C' },
];

function getFallbackSkyColor(now) {
  const h = now.getHours() + now.getMinutes() / 60;

  let lower = FALLBACK_STOPS[0];
  let upper = FALLBACK_STOPS[FALLBACK_STOPS.length - 1];

  for (let i = 0; i < FALLBACK_STOPS.length - 1; i++) {
    if (h >= FALLBACK_STOPS[i].hour && h <= FALLBACK_STOPS[i + 1].hour) {
      lower = FALLBACK_STOPS[i];
      upper = FALLBACK_STOPS[i + 1];
      break;
    }
  }

  const span = upper.hour - lower.hour;
  const t = span === 0 ? 0 : (h - lower.hour) / span;
  return rgbToHex(mix(hexToRgb(lower.color), hexToRgb(upper.color), t));
}

// Real-sunrise/sunset-anchored stops, given as a fraction (0-1) of the
// current day or night span. No warm/orange tones — blue eases straight
// into dusk purple at both edges, then purple deepens into midnight.
// Symmetric around both sun events so sunrise and sunset feel the same.
const DAY_STOPS = [
  { t: 0.00, color: '#7A8FC4' }, // cool blue-purple, just after sunrise
  { t: 0.15, color: '#8FCBEA' }, // morning blue, fully awake
  { t: 0.50, color: '#6EC6F0' }, // solar noon — full sky blue
  { t: 0.85, color: '#8FCBEA' }, // afternoon blue (mirrors 0.15)
  { t: 1.00, color: '#7A8FC4' }, // cool blue-purple, just before sunset (mirrors 0.00)
];

const NIGHT_STOPS = [
  { t: 0.00, color: '#7A8FC4' }, // cool blue-purple (matches DAY_STOPS' t=1)
  { t: 0.10, color: '#5B4B8A' }, // dusk purple
  { t: 0.25, color: '#2E2A5C' }, // deep purple-navy
  { t: 0.50, color: '#05070C' }, // solar midnight — deepest
  { t: 0.75, color: '#2E2A5C' }, // deep purple-navy (mirrors 0.25)
  { t: 0.90, color: '#5B4B8A' }, // dawn purple (mirrors 0.10)
  { t: 1.00, color: '#7A8FC4' }, // cool blue-purple (matches DAY_STOPS' t=0)
];

function colorAtStop(stops, t) {
  let lower = stops[0];
  let upper = stops[stops.length - 1];

  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i].t && t <= stops[i + 1].t) {
      lower = stops[i];
      upper = stops[i + 1];
      break;
    }
  }

  const span = upper.t - lower.t;
  const localT = span === 0 ? 0 : (t - lower.t) / span;
  return rgbToHex(mix(hexToRgb(lower.color), hexToRgb(upper.color), localT));
}

// Figures out which named period (day or night) `now` falls in, and how far
// through it we are. Shared by getSkyColor, getIsDay, and getDayFraction so
// all three always agree with each other — there's exactly one notion of
// "now" and one notion of "is it day", not several that could drift apart.
function getSkyPeriod(daily, now) {
  if (!daily || !daily.sunrise || !daily.sunset || daily.sunrise.length < 3 || daily.sunset.length < 3) {
    // No location yet — rough fallback so getIsDay/getDayFraction still
    // return something sensible before weather has ever been checked.
    const h = now.getHours() + now.getMinutes() / 60;
    return { isDay: h >= 6 && h < 18, periodStart: null, periodEnd: null, stops: null };
  }

  const sunrise = daily.sunrise.map((s) => new Date(s));
  const sunset = daily.sunset.map((s) => new Date(s));
  // indices: [0]=yesterday, [1]=today, [2]=tomorrow

  if (now < sunrise[1]) {
    // before today's sunrise — night spans yesterday's sunset to today's sunrise
    return { isDay: false, periodStart: sunset[0], periodEnd: sunrise[1], stops: NIGHT_STOPS };
  }
  if (now < sunset[1]) {
    // daytime — today's sunrise to today's sunset
    return { isDay: true, periodStart: sunrise[1], periodEnd: sunset[1], stops: DAY_STOPS };
  }
  // after today's sunset — night spans today's sunset to tomorrow's sunrise
  return { isDay: false, periodStart: sunset[1], periodEnd: sunrise[2], stops: NIGHT_STOPS };
}

// `daily` is the { time, sunrise, sunset } block from getWeather() — arrays
// of 3 ISO strings each (yesterday, today, tomorrow), thanks to past_days=1
// & forecast_days=2 in the API request. Falls back to the fixed-hour
// gradient if it's not available yet (no weather checked, or an older
// weatherData shape without the daily block).
//
// `now` defaults to the real current time but can be overridden (e.g. by a
// debug time-override panel) to preview the sky at any moment.
function getSkyColor(daily, now = new Date()) {
  const period = getSkyPeriod(daily, now);

  if (!period.stops) {
    return getFallbackSkyColor(now);
  }

  const span = period.periodEnd - period.periodStart;
  const t = span > 0 ? (now - period.periodStart) / span : 0;
  const clampedT = Math.max(0, Math.min(1, t));

  return colorAtStop(period.stops, clampedT);
}

// Whether it's day or night right now, based on the same real sunrise/sunset
// logic getSkyColor uses — meant to replace reading weatherData.is_day
// directly, so the sky color and "is it day" can never disagree with each
// other. `now` defaults to the real current time, same override support as
// getSkyColor above (and both must be passed the same `now` to stay in sync).
function getIsDay(daily, now = new Date()) {
  return getSkyPeriod(daily, now).isDay;
}

// Standard smoothstep (0 below edge0, 1 above edge1, eased S-curve between).
function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// How far `now` is into "day-ness" as a continuous 0-1 value, instead of the
// hard is_day 0/1 split — graded by proximity to whichever sunrise/sunset is
// nearest. Flat at 1 through the middle of the day, flat at 0 through the
// middle of the night, and eases smoothly through 0.5 across a
// TWILIGHT_WINDOW_MS-wide window straddling the nearest sun event, so it
// reaches exactly 0 right at sunset and exactly 1 right at sunrise with no
// jump — the day-side and night-side ramps are two halves of one continuous
// curve, not two independent ramps that could disagree at the boundary.
//
// Falls back to a hard 0/1 (same as getIsDay) before there's sunrise/sunset
// data to grade against.
const TWILIGHT_WINDOW_MS = 60 * 60 * 1000; // total width of the ramp: 30 min on each side of the sun event

function getDayFraction(daily, now = new Date()) {
  const period = getSkyPeriod(daily, now);

  if (!period.periodStart || !period.periodEnd) {
    return period.isDay ? 1 : 0;
  }

  const sunriseTime = period.isDay ? period.periodStart : period.periodEnd;
  const sunsetTime = period.isDay ? period.periodEnd : period.periodStart;

  const distToSunrise = Math.abs(now - sunriseTime);
  const distToSunset = Math.abs(now - sunsetTime);
  const halfWindow = TWILIGHT_WINDOW_MS / 2;

  // Grade against whichever sun event is nearer — far from both, this
  // clamps to the same flat 0/1 that getIsDay would give.
  return distToSunrise <= distToSunset
    ? smoothstep(-halfWindow, halfWindow, now - sunriseTime)   // ramps night(0) -> day(1) across sunrise
    : smoothstep(-halfWindow, halfWindow, sunsetTime - now);   // ramps day(1) -> night(0) across sunset
}

export { getSkyColor, getIsDay, getDayFraction, applyCloudCover, applyPrecipitation, hexToRgb, rgbToHex, mix };