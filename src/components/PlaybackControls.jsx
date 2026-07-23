import { FaPlay, FaPause, FaBackward, FaForward } from "react-icons/fa";

function PlaybackControls({ player, isPaused, hasTrack, onStart }) {
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
    player.nextTrack();
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