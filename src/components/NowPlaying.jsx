function NowPlaying({ track }) {
  if (!track) {
    return <div>Now Playing: Nothing yet</div>;
  }

  return (
    <div>
      {track.albumArt && <img src={track.albumArt} alt={track.name} width={80} />}
      <p>{track.name}</p>
      <p>{track.artist}</p>
    </div>
  );
}

export default NowPlaying;