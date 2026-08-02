import { FaPlay, FaPause, FaBackward, FaForward } from "react-icons/fa";

function PlaybackControls({ player, isPaused, hasTrack, onNext, onPrevious }) {
  if (!player) {
    return null;
  }

  function handlePlayPause() {
    player.togglePlay();
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
    // Delegates to App.jsx's onPrevious, which uses our own play history
    // (not Spotify's native previousTrack) so it can also re-queue the
    // song we're leaving, per the app's local queue logic.
    onPrevious();
  }

  return (
    <div className="transport">
      <button onClick={handlePrevious} aria-label="Previous track"><FaBackward /></button>
      <button 
        onClick={handlePlayPause}
        className="play-pause" 
        aria-label={isPaused ? 'Play' : 'Pause'} 
      >
        {isPaused ? <FaPlay className="play-icon" /> : <FaPause className="pause-icon" />}
      </button>
      <button onClick={handleNext} aria-label="Next track"><FaForward /></button>
    </div>
  );
}

export default PlaybackControls;