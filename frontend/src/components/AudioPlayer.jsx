import React from "react";
import { FiPause, FiPlay } from "react-icons/fi";
import { formatDuration } from "../lib/chat";

// Only one voice message plays at a time.
const PLAY_EVENT = "memo:audio-play";

export default function AudioPlayer({ src, duration: knownDuration }) {
  const audioRef = React.useRef(null);
  const [playing, setPlaying] = React.useState(false);
  const [current, setCurrent] = React.useState(0);
  const [duration, setDuration] = React.useState(knownDuration || 0);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    const onOtherPlay = (event) => {
      if (event.detail !== audioRef.current) audioRef.current?.pause();
    };
    window.addEventListener(PLAY_EVENT, onOtherPlay);
    return () => window.removeEventListener(PLAY_EVENT, onOtherPlay);
  }, []);

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      return;
    }
    window.dispatchEvent(new CustomEvent(PLAY_EVENT, { detail: audio }));
    try {
      await audio.play();
    } catch {
      setFailed(true);
    }
  };

  const seek = (event) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const value = Number(event.target.value);
    audio.currentTime = value;
    setCurrent(value);
  };

  const shown = playing || current > 0 ? current : duration;

  return (
    <div className={`voice-player ${playing ? "is-playing" : ""}`}>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrent(0);
        }}
        onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => {
          const d = event.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setDuration(d);
        }}
        onError={() => setFailed(true)}
      />
      <button
        type="button"
        className="voice-toggle"
        onClick={toggle}
        disabled={failed}
        aria-label={playing ? "Tạm dừng tin nhắn thoại" : "Phát tin nhắn thoại"}
      >
        {playing ? <FiPause /> : <FiPlay />}
      </button>
      <input
        type="range"
        className="voice-progress"
        min={0}
        max={duration || 0}
        step={0.1}
        value={Math.min(current, duration || 0)}
        onChange={seek}
        disabled={!duration || failed}
        aria-label="Tua tin nhắn thoại"
        style={{ "--progress": duration ? `${(Math.min(current, duration) / duration) * 100}%` : "0%" }}
      />
      <span className="voice-time">{failed ? "Không phát được" : formatDuration(shown)}</span>
    </div>
  );
}
