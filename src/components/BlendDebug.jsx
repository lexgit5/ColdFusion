function BlendDebug({ weights, queue }) {
  return (
    <div style={{ border: '1px solid #ccc', padding: '8px', fontSize: '0.85rem' }}>
      <strong>Blend Weights</strong>
      <ul>
        {weights &&
          Object.entries(weights).map(([category, weight]) => (
            <li key={category}>
              {category}: {(weight * 100).toFixed(1)}%
            </li>
          ))}
      </ul>

      <strong>Queue</strong>
      <ol>
        {queue &&
          queue.map((track, i) => (
            <li key={i}>
              {track.name} — {track.artist} [{track.category}]
            </li>
          ))}
      </ol>
    </div>
  );
}

export default BlendDebug;