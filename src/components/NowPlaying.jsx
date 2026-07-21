function NowPlaying({ track, progress }) {
  if (!track) {
    return (
      <div className="now-playing">
        <span className="now-playing-empty">Nothing playing yet</span>
      </div>
    );
  }

  const pct = progress && progress.duration
    ? Math.min(100, (progress.position / progress.duration) * 100)
    : 0;

  return (
    <div className="now-playing">
      {track.albumArt && <img src={track.albumArt} alt={track.name} />}
      <div className="now-playing-info">
        <div className="now-playing-track">{track.name}</div>
        <div className="now-playing-artist">{track.artist}</div>
      </div>
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default NowPlaying;