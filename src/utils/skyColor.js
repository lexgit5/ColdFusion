const CATEGORY_COLORS = {
  rain: '#5B7A9D',
  snow: '#DCE6EC',
  mist: '#9AA5A8',
  clearDayHot: '#E8A34C',
  clearDayCold: '#7FB8D9',
  clearNightHot: '#8A5FA8',
  clearNightCold: '#3A4A7A',
};

const BASE_DUSK = { r: 0x0b, g: 0x0e, b: 0x14 }; // fallback / resting background

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

// Given blend weights (object of category -> 0-1, summing to ~1), returns a
// single hex color representing the weighted mix of all active categories,
// pulled partway toward the base dusk color so it stays muted, not neon.
function getSkyColor(weights) {
  if (!weights) return rgbToHex(BASE_DUSK);

  let mixed = { r: 0, g: 0, b: 0 };
  let totalWeight = 0;

  for (const [category, weight] of Object.entries(weights)) {
    if (weight <= 0) continue;
    const color = CATEGORY_COLORS[category];
    if (!color) continue;

    const rgb = hexToRgb(color);
    mixed.r += rgb.r * weight;
    mixed.g += rgb.g * weight;
    mixed.b += rgb.b * weight;
    totalWeight += weight;
  }

  if (totalWeight === 0) return rgbToHex(BASE_DUSK);

  // Normalize in case weights don't sum to exactly 1
  mixed = { r: mixed.r / totalWeight, g: mixed.g / totalWeight, b: mixed.b / totalWeight };

  // Pull toward the base dusk tone so the result stays muted/atmospheric, not saturated
  const muted = mix(mixed, BASE_DUSK, 0.45);

  return rgbToHex(muted);
}

export { getSkyColor, CATEGORY_COLORS };