import { CATEGORY_COLORS } from '../utils/skyColor';

const LABELS = {
  rain: 'Rain',
  snow: 'Snow',
  mist: 'Mist',
  clearDayHot: 'Clear Day (Hot)',
  clearDayCold: 'Clear Day (Cold)',
  clearNightHot: 'Clear Night (Hot)',
  clearNightCold: 'Clear Night (Cold)',
};

function BlendBar({ weights }) {
  if (!weights) return null;

  const active = Object.entries(weights).filter(([, weight]) => weight > 0.005);

  return (
    <>
      <div className="blend-bar">
        {active.map(([category, weight]) => (
          <div
            key={category}
            className="blend-bar-segment"
            style={{
              width: `${weight * 100}%`,
              background: CATEGORY_COLORS[category],
            }}
          />
        ))}
      </div>

      <div className="blend-legend">
        {active.map(([category, weight]) => (
          <span key={category} className="blend-legend-item">
            <span
              className="blend-legend-swatch"
              style={{ background: CATEGORY_COLORS[category] }}
            />
            {LABELS[category]} {(weight * 100).toFixed(0)}%
          </span>
        ))}
      </div>
    </>
  );
}

export default BlendBar;