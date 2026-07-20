function NowPlaying({ track }) {
  if (!track) {
    return (
      <div className="now-playing">
        <span className="now-playing-empty">Nothing playing yet</span>
      </div>
    );
  }

  return (
    <div className="now-playing">
      {track.albumArt && <img src={track.albumArt} alt={track.name} />}
      <div className="now-playing-info">
        <div className="now-playing-track">{track.name}</div>
        <div className="now-playing-artist">{track.artist}</div>
      </div>
    </div>
  );
}

export default NowPlaying;