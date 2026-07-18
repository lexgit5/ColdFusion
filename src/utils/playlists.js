const PLAYLIST_IDS = {
  rain: "39z6f2aYJKGiYD9NYU3gKe",
  snow: "2ZVtkzSwep1uRbZZdGYqxt",
  mist: "6yluWl9U7MMoMABgbXxQ1y",
  clearDayHot: "7DM2FP0VOerdnTAME5eBkf",
  clearDayCold: "3QDQokl660tfIqyWyXtnwG",
  clearNightHot: "3iyGyj1xiuAmdbtjVkq1dE",
  clearNightCold: "5FCNkl4Y2REuq1XmGKhSBD",
};

function getPlaylistUri(category) {
  const id = PLAYLIST_IDS[category];
  return id ? `spotify:playlist:${id}` : null;
}

export { PLAYLIST_IDS, getPlaylistUri };