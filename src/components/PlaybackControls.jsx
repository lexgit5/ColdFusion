import { FaPlay, FaPause, FaBackward, FaForward } from "react-icons/fa";

function PlaybackControls({ player, isPaused, hasTrack, onStart, onNext }) {
  if (!player) {
    return null;
  }

  function handlePlayPause() {
    if (!hasTrack) {
      onStart();
    } else {
      player.togglePlay();
    }
  }

  function handleNext() {
    // Delegates to App.jsx's onNext, which decides whether to skip to an
    // already-queued track (normal Spotify skip) or, if nothing's queued
    // yet for the current song, pick and play a fresh track from current
    // conditions directly — rather than always calling player.nextTrack(),
    // which does nothing useful when the queue is empty.
    onNext();
  }

  function handlePrevious() {
    player.previousTrack();
  }

  return (
    <div className="transport">
      <button onClick={handlePrevious} aria-label="Previous track"><FaBackward /></button>
      <button 
        onClick={handlePlayPause}
        className="play-pause" 
        aria-label={!hasTrack ? 'Start' : isPaused ? 'Play' : 'Pause'} 
      >
        {!hasTrack ? <FaPlay /> : isPaused ? <FaPlay className="play-icon"  /> : <FaPause className="pause-icon"  />}
      </button>
      <button onClick={handleNext} aria-label="Next track"><FaForward /></button>
    </div>
  );
}

export default PlaybackControls;