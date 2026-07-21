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

// `daily` is the { time, sunrise, sunset } block from getWeather() — arrays
// of 3 ISO strings each (yesterday, today, tomorrow), thanks to past_days=1
// & forecast_days=2 in the API request. Falls back to the fixed-hour
// gradient if it's not available yet (no weather checked, or an older
// weatherData shape without the daily block).
function getSkyColor(daily) {
  const now = new Date();

  if (!daily || !daily.sunrise || !daily.sunset || daily.sunrise.length < 3 || daily.sunset.length < 3) {
    return getFallbackSkyColor(now);
  }

  const sunrise = daily.sunrise.map((s) => new Date(s));
  const sunset = daily.sunset.map((s) => new Date(s));
  // indices: [0]=yesterday, [1]=today, [2]=tomorrow

  let periodStart, periodEnd, stops;

  if (now < sunrise[1]) {
    // before today's sunrise — night spans yesterday's sunset to today's sunrise
    periodStart = sunset[0];
    periodEnd = sunrise[1];
    stops = NIGHT_STOPS;
  } else if (now < sunset[1]) {
    // daytime — today's sunrise to today's sunset
    periodStart = sunrise[1];
    periodEnd = sunset[1];
    stops = DAY_STOPS;
  } else {
    // after today's sunset — night spans today's sunset to tomorrow's sunrise
    periodStart = sunset[1];
    periodEnd = sunrise[2];
    stops = NIGHT_STOPS;
  }

  const span = periodEnd - periodStart;
  const t = span > 0 ? (now - periodStart) / span : 0;
  const clampedT = Math.max(0, Math.min(1, t));

  return colorAtStop(stops, clampedT);
}

export { getSkyColor, applyCloudCover, hexToRgb, rgbToHex, mix };