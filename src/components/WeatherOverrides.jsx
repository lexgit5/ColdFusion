import { useState } from 'react';

// ============================================================================
// DEBUG PANEL — WEATHER OVERRIDES
// Lets you punch in temperature / precipitation / cloud cover / current time
// to test the dials, sky color, and blend logic in any weather or time of
// day without waiting for real conditions to change.
//
// TO REMOVE THIS DEBUG FEATURE WHEN YOU'RE DONE TESTING:
//   1. Delete this file.
//   2. In App.jsx, delete everything between the
//      "DEBUG: WEATHER OVERRIDES — start/end" comment markers.
//   3. In App.css, delete the ".weather-overrides__*" rule block
//      (marked with the same DEBUG comment).
// That's it — nothing else in the app depends on this panel.
// ============================================================================
//
// Values are staged in local draft state and only take effect once "Apply"
// is pressed; "Revert" clears every override and falls back to whatever the
// last real weather fetch (and the real clock) returned.
//
// weather_code is intentionally NOT overridable — it's only used for the
// headline text and should keep tracking real conditions.
//
// blendWeights: the object returned by getBlendWeights(weatherData) — passed
// in rather than recomputed here, so this panel always reflects exactly
// what the rest of the app (sky color, dial metrics) is actually using.
const BLEND_LABELS = {
  rain: 'Rain',
  snow: 'Snow',
  mist: 'Mist',
  clearDayHot: 'Clear day (hot)',
  clearDayCold: 'Clear day (cold)',
  clearNightHot: 'Clear night (hot)',
  clearNightCold: 'Clear night (cold)',
};

function WeatherOverrides({ weatherData, overrides, blendWeights, onApply, onRevert }) {
  const [draft, setDraft] = useState({
    temperature_2m: overrides.temperature_2m ?? '',
    precipitation: overrides.precipitation ?? '',
    cloud_cover: overrides.cloud_cover ?? '',
    time: overrides.time ?? '',
  });

  if (!weatherData) return null;

  const hasOverrides = Object.keys(overrides).length > 0;

  function handleChange(key, value) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function handleApply() {
    const next = {};
    if (draft.temperature_2m !== '') next.temperature_2m = Number(draft.temperature_2m);
    if (draft.precipitation !== '') next.precipitation = Number(draft.precipitation);
    if (draft.cloud_cover !== '') next.cloud_cover = Number(draft.cloud_cover);
    if (draft.time !== '') next.time = draft.time; // datetime-local string, parsed by App.jsx
    onApply(next);
  }

  function handleRevert() {
    setDraft({ temperature_2m: '', precipitation: '', cloud_cover: '', time: '' });
    onRevert();
  }

  return (
    <div className="panel weather-overrides">
      <div className="weather-overrides__title">
        Test weather
        {hasOverrides && <span className="weather-overrides__badge">Overridden</span>}
      </div>

      <div className="weather-overrides__fields">
        <label className="weather-overrides__field">
          Temp (\u00B0F)
          <input
            type="number"
            value={draft.temperature_2m}
            placeholder={weatherData.temperature_2m != null ? String(Math.round(weatherData.temperature_2m)) : '\u2014'}
            onChange={(e) => handleChange('temperature_2m', e.target.value)}
          />
        </label>

        <label className="weather-overrides__field">
          Precip (in/hr)
          <input
            type="number"
            value={draft.precipitation}
            placeholder={weatherData.precipitation != null ? String(weatherData.precipitation) : '\u2014'}
            onChange={(e) => handleChange('precipitation', e.target.value)}
          />
        </label>

        <label className="weather-overrides__field">
          Cloud cover (%)
          <input
            type="number"
            value={draft.cloud_cover}
            placeholder={weatherData.cloud_cover != null ? String(weatherData.cloud_cover) : '\u2014'}
            onChange={(e) => handleChange('cloud_cover', e.target.value)}
          />
        </label>

        <label className="weather-overrides__field weather-overrides__field--time">
          Date &amp; time
          <input
            type="datetime-local"
            value={draft.time}
            onChange={(e) => handleChange('time', e.target.value)}
          />
        </label>
      </div>

      <div className="weather-overrides__buttons">
        <button className="weather-overrides__apply" onClick={handleApply}>
          Apply
        </button>
        <button
          className="weather-overrides__revert"
          onClick={handleRevert}
          disabled={!hasOverrides}
        >
          Revert to current weather
        </button>
      </div>

      {blendWeights && (
        <div className="weather-overrides__blend">
          <div className="weather-overrides__blend-title">Current blend</div>
          {Object.entries(blendWeights)
            .filter(([, weight]) => weight > 0.001) // hide effectively-zero categories
            .sort(([, a], [, b]) => b - a)
            .map(([key, weight]) => (
              <div className="weather-overrides__blend-row" key={key}>
                <span className="weather-overrides__blend-label">{BLEND_LABELS[key] ?? key}</span>
                <div className="weather-overrides__blend-bar">
                  <div
                    className="weather-overrides__blend-bar-fill"
                    style={{ width: `${weight * 100}%` }}
                  />
                </div>
                <span className="weather-overrides__blend-value">{Math.round(weight * 100)}%</span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

export default WeatherOverrides;