// Shared category colors, used by blend.js for dial/riser colors. No longer
// used by skyColor.js, which now derives the background purely from time of
// day rather than weather categories.
const CATEGORY_COLORS = {
  rain: '#5B7A9D',
  snow: '#DCE6EC',
  mist: '#9AA5A8',
  clearDayHot: '#E8A34C',
  clearDayCold: '#7FB8D9',
  clearNightHot: '#8A5FA8',
  clearNightCold: '#3A4A7A',
};

export { CATEGORY_COLORS };