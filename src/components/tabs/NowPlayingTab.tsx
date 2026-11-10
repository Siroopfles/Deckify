import { FC } from "react";
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
import { InteractiveRow, RoundBtn, formatMs } from "../common/InteractiveRow";

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
}) => {
  const track = status?.track_meta || status?.track;
  const artwork = track?.artwork_url || track?.image_url;
  const isPlaying = Boolean(status?.is_playing);
  const streamInfo = (status as any)?.stream_info || status?.audio_stream_info;
  const isLossless = streamInfo?.is_lossless_rate;

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
            <span>{formatMs(status?.position_ms || currentPositionMs || 0)}</span>
            <span>{formatMs(track.duration_ms)}</span>
          </div>
          <InteractiveRow
            onClick={() => {}}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") handleSeekDelta(-10);
              if (e.key === "ArrowRight") handleSeekDelta(10);
            }}
            style={{ width: "100%", height: 10, background: "rgba(255,255,255,0.15)", borderRadius: 5, padding: 0, overflow: "hidden" }}
          >
            <div
              style={{
                width: `${Math.min(100, (((status?.position_ms || currentPositionMs || 0)) / track.duration_ms) * 100)}%`,
                height: "100%",
                background: "#1db954",
              }}
            />
          </InteractiveRow>

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
