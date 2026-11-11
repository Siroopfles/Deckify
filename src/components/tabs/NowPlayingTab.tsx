import { FC, useState } from "react";
import { Focusable } from "@decky/ui";
import {
  FaSpotify,
  FaRandom,
  FaStepBackward,
  FaPlay,
  FaPause,
  FaStepForward,
  FaRedo,
  FaHeart,
  FaRegHeart,
  FaVolumeMute,
  FaVolumeUp,
} from "react-icons/fa";
import { StatusResponse } from "../../types";
import { DeckifyImage } from "../common/DeckifyImage";
import { InteractiveRow, RoundBtn, focusHalo, formatMs } from "../common/InteractiveRow";
import { getScrubStepMs } from "../../hooks/usePlaybackClock";

export interface NowPlayingTabProps {
  status: StatusResponse | null;
  currentPositionMs: number;
  handlePlayPause: () => void;
  handleNext: () => void;
  handlePrev: () => void;
  handleToggleRepeat: () => void;
  handleToggleLike: (trackId?: string) => void;
  handleSeekDelta: (seconds: number) => void;
  handleVolumeDelta: (delta: number) => void;
  onSetShuffle: (state: boolean) => void;
  onSeekPlayback?: (timeMs: number) => void;
}

export const NowPlayingTab: FC<NowPlayingTabProps> = ({
  status,
  currentPositionMs,
  handlePlayPause,
  handleNext,
  handlePrev,
  handleToggleRepeat,
  handleToggleLike,
  handleSeekDelta,
  handleVolumeDelta,
  onSetShuffle,
  onSeekPlayback,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [, setIsScrubbing] = useState(false);

  const track = status?.track_meta || status?.track;
  const artwork = track?.artwork_url || track?.image_url;
  const isPlaying = Boolean(status?.is_playing);
  const streamInfo = (status as any)?.stream_info || status?.audio_stream_info;
  const isLossless = streamInfo?.is_lossless_rate;

  const progressPercent = track?.duration_ms && track.duration_ms > 0
    ? Math.min(100, Math.max(0, (currentPositionMs / track.duration_ms) * 100))
    : 0;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        maxWidth: 500,
        margin: "0 auto",
        textAlign: "center",
      }}
    >
      {/* Album Artwork with Elevation */}
      <div style={{ position: "relative", marginBottom: 24 }}>
        {artwork ? (
          <DeckifyImage
            src={artwork}
            width={240}
            height={240}
            style={{ borderRadius: 14, boxShadow: "0 16px 40px rgba(0,0,0,0.6)" }}
          />
        ) : (
          <div
            style={{
              width: 240,
              height: 240,
              borderRadius: 14,
              background: "#222",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <FaSpotify size={70} color="#1db954" />
          </div>
        )}

        {/* Lossless badge */}
        {isLossless && (
          <div
            style={{
              position: "absolute",
              top: 10,
              right: 10,
              background: "rgba(0,0,0,0.8)",
              border: "1px solid #1db954",
              color: "#1db954",
              padding: "3px 8px",
              borderRadius: 6,
              fontSize: 10,
              fontWeight: 800,
            }}
          >
            LOSSLESS FLAC
          </div>
        )}
      </div>

      {/* Track Details */}
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 4px 0", color: "#fff" }}>
        {track?.name || "No active track"}
      </h1>
      <p style={{ fontSize: 15, opacity: 0.7, margin: "0 0 16px 0" }}>
        {track?.artist || "Choose a playlist or album"}
      </p>

      {/* Progress Bar & Seek Scrubbing */}
      {track?.duration_ms && track.duration_ms > 0 && (
        <div style={{ width: "100%", marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, opacity: 0.6, marginBottom: 4 }}>
            <span>{formatMs(currentPositionMs)}</span>
            <span>{formatMs(track.duration_ms)}</span>
          </div>

          <Focusable
            noFocusRing
            tabIndex={0}
            onFocus={() => setIsFocused(true)}
            onBlur={() => {
              setIsFocused(false);
              setIsScrubbing(false);
            }}
            onGamepadFocus={() => setIsFocused(true)}
            onGamepadBlur={() => {
              setIsFocused(false);
              setIsScrubbing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") {
                e.preventDefault?.();
                e.stopPropagation?.();
                setIsScrubbing(true);
                const stepMs = getScrubStepMs(track.duration_ms);
                handleSeekDelta(-stepMs / 1000);
              } else if (e.key === "ArrowRight") {
                e.preventDefault?.();
                e.stopPropagation?.();
                setIsScrubbing(true);
                const stepMs = getScrubStepMs(track.duration_ms);
                handleSeekDelta(stepMs / 1000);
              }
            }}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              if (rect.width > 0) {
                const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                const targetMs = pct * track.duration_ms;
                if (onSeekPlayback) {
                  onSeekPlayback(targetMs);
                } else {
                  handleSeekDelta((targetMs - currentPositionMs) / 1000);
                }
              }
            }}
            style={{
              width: "100%",
              height: 12,
              background: "rgba(255,255,255,0.15)",
              borderRadius: 6,
              cursor: "pointer",
              padding: 0,
              overflow: "visible",
              ...focusHalo(isFocused),
            }}
          >
            {/* Live fill bar bound to currentPositionMs */}
            <div
              style={{
                width: `${progressPercent}%`,
                height: "100%",
                background: "#1db954",
                borderRadius: 6,
                position: "relative",
              }}
            >
              {/* Visible thumb handle */}
              <div
                style={{
                  position: "absolute",
                  right: -6,
                  top: isFocused ? -3 : -2,
                  width: isFocused ? 18 : 16,
                  height: isFocused ? 18 : 16,
                  borderRadius: "50%",
                  background: "#fff",
                  boxShadow: isFocused
                    ? "0 0 0 2px #1db954, 0 2px 8px rgba(0,0,0,0.8)"
                    : "0 2px 6px rgba(0,0,0,0.6)",
                  transition: "width 0.1s ease, height 0.1s ease, top 0.1s ease, box-shadow 0.1s ease",
                }}
              />
            </div>
          </Focusable>

          {/* Scrub controls */}
          <Focusable flow-children="horizontal" style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 8 }}>
            <InteractiveRow onClick={() => handleSeekDelta(-15)} style={{ padding: "4px 10px", fontSize: 11 }}>
              -15s
            </InteractiveRow>
            <InteractiveRow onClick={() => handleSeekDelta(15)} style={{ padding: "4px 10px", fontSize: 11 }}>
              +15s
            </InteractiveRow>
          </Focusable>
        </div>
      )}

      {/* Playback Controls */}
      <Focusable
        flow-children="horizontal"
        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14 }}
      >
        <RoundBtn
          onClick={() => onSetShuffle(!status?.shuffle_state)}
          active={status?.shuffle_state}
          size={42}
        >
          <FaRandom size={16} />
        </RoundBtn>

        <RoundBtn onClick={handlePrev} size={46}>
          <FaStepBackward size={18} />
        </RoundBtn>

        <RoundBtn onClick={handlePlayPause} size={54} accent>
          {isPlaying ? <FaPause size={20} /> : <FaPlay size={20} style={{ marginLeft: 2 }} />}
        </RoundBtn>

        <RoundBtn onClick={handleNext} size={46}>
          <FaStepForward size={18} />
        </RoundBtn>

        <RoundBtn
          onClick={handleToggleRepeat}
          active={status?.repeat_state !== undefined && status?.repeat_state !== "off"}
          size={42}
        >
          <FaRedo size={15} />
          {status?.repeat_state === "track" && (
            <span style={{ position: "absolute", fontSize: 8, top: 4, right: 4, fontWeight: 900 }}>1</span>
          )}
        </RoundBtn>

        <RoundBtn onClick={() => handleToggleLike()} active={status?.is_liked} size={42}>
          {status?.is_liked ? <FaHeart size={16} /> : <FaRegHeart size={16} />}
        </RoundBtn>
      </Focusable>

      {/* Volume Slider Bar */}
      <div style={{ marginTop: 20, width: "100%", maxWidth: 360, display: "flex", alignItems: "center", gap: 10 }}>
        <RoundBtn onClick={() => handleVolumeDelta(-5)} size={32}>
          <FaVolumeMute size={12} />
        </RoundBtn>
        <InteractiveRow
          onClick={() => {}}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") handleVolumeDelta(-5);
            if (e.key === "ArrowRight") handleVolumeDelta(5);
          }}
          style={{ flex: 1, height: 10, background: "rgba(255,255,255,0.15)", borderRadius: 5, padding: 0, overflow: "hidden" }}
        >
          <div style={{ width: `${status?.volume || 50}%`, height: "100%", background: "#1db954" }} />
        </InteractiveRow>
        <RoundBtn onClick={() => handleVolumeDelta(5)} size={32}>
          <FaVolumeUp size={12} />
        </RoundBtn>
      </div>
    </div>
  );
};
