function PlaybackControls({ player, isPaused, hasTrack, onStart}) {
  if (!player) {
    return <div>Playback Controls: Player not ready</div>;
  }

  function handlePlayPause() {
    if (!hasTrack) {
      onStart();
    } else {
      player.togglePlay();
    }
  }

  function handleNext() {
    player.nextTrack();
  }

  function handlePrevious() {
    player.previousTrack();
  }

  return (
    <div>
      <button onClick={handlePrevious}>⏮ Previous</button>
      <button onClick={handlePlayPause}>{!hasTrack ? '▶ Start' : isPaused ? '▶ Play' : '⏸ Pause'}</button>
      <button onClick={handleNext}>⏭ Next</button>
    </div>
  );
}

export default PlaybackControls;