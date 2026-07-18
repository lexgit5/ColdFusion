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

export { getBlendWeights };