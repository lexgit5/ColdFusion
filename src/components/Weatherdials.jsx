import { useState, useEffect, useRef } from 'react';

function Dial({ value, color, label, valueLabel, revealed }) {
  const sweep = value * 270; // volume-knob style, 270° sweep with a gap at the bottom
  const angle = -135 + sweep; // pointer angle matches the same sweep as the ring fill

  return (
    <div className="control">
      <div
        className="dial"
        style={{
          background: `conic-gradient(from -135deg, ${color} 0deg ${sweep}deg, var(--hairline) ${sweep}deg 270deg, transparent 270deg 360deg)`,
        }}
      >
        <div className="dial-hole">
          <div className="dial-pointer" style={{ transform: `rotate(${angle}deg)` }} />
        </div>
      </div>
      <div className={`control-label ${revealed ? 'revealed' : ''}`}>{label}</div>
      <div className={`control-value ${revealed ? 'revealed' : ''}`}>{valueLabel}</div>
    </div>
  );
}

// Must match the .riser / .riser-cap / .riser-fill dimensions in App.css
const TRACK_HEIGHT = 56;
const CAP_HEIGHT = 13;

function Riser({ value, color, label, valueLabel, revealed }) {
  // The cap's travel is inset by its own height so it never pokes past the
  // top or bottom of the track — at value 0 its bottom edge sits flush with
  // the track's bottom, at value 1 its top edge sits flush with the top.
  // The fill grows from the bottom up to the cap's center, so it stays
  // visually "under" the cap across the whole range.
  const capBottom = value * (TRACK_HEIGHT - CAP_HEIGHT);
  const fillHeight = capBottom + CAP_HEIGHT / 2;

  return (
    <div className="control">
      <div className="riser">
        <div
          className="riser-fill"
          style={{ height: `${fillHeight}px`, background: color }}
        />
        <div
          className="riser-cap"
          style={{ bottom: `${capBottom}px` }}
        />
      </div>
      <div className={`control-label ${revealed ? 'revealed' : ''}`}>{label}</div>
      <div className={`control-value ${revealed ? 'revealed' : ''}`}>{valueLabel}</div>
    </div>
  );
}

// Solves CSS's default "ease" curve — cubic-bezier(0.25, 0.1, 0.25, 1.0) —
// via Newton-Raphson, so the number count-up tracks the same easing as the
// dial/riser CSS transitions instead of drifting out of sync with them.
function easeCss(t) {
  const x1 = 0.25, y1 = 0.1, x2 = 0.25, y2 = 1.0;

  const bezierX = (u) => 3 * (1 - u) ** 2 * u * x1 + 3 * (1 - u) * u ** 2 * x2 + u ** 3;
  const bezierY = (u) => 3 * (1 - u) ** 2 * u * y1 + 3 * (1 - u) * u ** 2 * y2 + u ** 3;
  const bezierXDeriv = (u) => 3 * (1 - u) ** 2 * x1 + 6 * (1 - u) * u * (x2 - x1) + 3 * u ** 2 * (1 - x2);

  let guess = t;
  for (let i = 0; i < 8; i++) {
    const dx = bezierXDeriv(guess);
    if (Math.abs(dx) < 1e-6) break;
    guess -= (bezierX(guess) - t) / dx;
  }
  return bezierY(guess);
}

// Animates a number from 0 up to `target` over `duration` ms, using the same
// easing curve as the CSS transitions, starting when `active` flips true.
function useAnimatedValue(target, active, duration = 2500) {
  const [display, setDisplay] = useState(0);
  const frameRef = useRef(null);

  useEffect(() => {
    if (!active) return;

    let start = null;
    function tick(timestamp) {
      if (start === null) start = timestamp;
      const progress = Math.min(1, (timestamp - start) / duration);
      setDisplay(target * easeCss(progress));
      if (progress < 1) frameRef.current = requestAnimationFrame(tick);
    }

    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [active, target, duration]);

  return active ? display : 0;
}

function WeatherDials({ metrics, started }) {
  const [revealed, setRevealed] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    if (started && !startedRef.current) {
      startedRef.current = true;
      // Two rAFs, not one: the first lets React commit the value=0 render
      // to the DOM, the second flips to real values on the next paint —
      // giving the browser an actual "0" state to transition away from,
      // instead of batching both updates into a single instant jump.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setRevealed(true));
      });
    }
  }, [started]);

  // Hooks must run unconditionally, so targets fall back to 0 while metrics
  // is still null (before weather has been checked).
  const precipTarget = metrics ? metrics.precipitation.value * 100 : 0;
  const cloudTarget = metrics ? metrics.cloudCover.value * 100 : 0;
  const tempTarget = metrics ? metrics.temperature.raw : 0;
  const brightTarget = metrics ? metrics.brightness.value * 100 : 0;

  const precipDisplay = useAnimatedValue(precipTarget, revealed);
  const cloudDisplay = useAnimatedValue(cloudTarget, revealed);
  const tempDisplay = useAnimatedValue(tempTarget, revealed);
  const brightDisplay = useAnimatedValue(brightTarget, revealed);

  if (!metrics) return null;

  const { precipitation, cloudCover, temperature, brightness } = metrics;
  const posValue = (m) => (revealed ? m.value : 0); // drives dial/riser position only

  return (
    <div className="weather-controls">
      <Dial
        value={posValue(precipitation)}
        color={precipitation.color}
        label="Precipitation"
        valueLabel={`${Math.round(precipDisplay)}%`}
        revealed={revealed}
      />
      <Dial
        value={posValue(cloudCover)}
        color={cloudCover.color}
        label="Cloud Cover"
        valueLabel={`${Math.round(cloudDisplay)}%`}
        revealed={revealed}
      />
      <Riser
        value={posValue(temperature)}
        color={temperature.color}
        label="Temperature"
        valueLabel={`${Math.round(tempDisplay)}°`}
        revealed={revealed}
      />
      <Riser
        value={posValue(brightness)}
        color={brightness.color}
        label="Brightness"
        valueLabel={`${Math.round(brightDisplay)}%`}
        revealed={revealed}
      />
    </div>
  );
}

export default WeatherDials;