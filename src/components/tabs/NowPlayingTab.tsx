import { FC, useState } from "react";
import { Dropdown, Focusable } from "@decky/ui";
import {
  FaSpotify,
  FaRandom,
  FaStepBackward,
  FaPlay,
  FaPause,
  FaStepForward,
  FaRedo,
  FaUndo,
  FaHeart,
  FaRegHeart,
  FaVolumeMute,
  FaVolumeUp,
  FaPlus,
} from "react-icons/fa";
import { StatusResponse, TrackItem, TrackMeta } from "../../types";
import { DeckifyImage } from "../common/DeckifyImage";
import { InteractiveRow, RoundBtn, focusHalo, formatMs } from "../common/InteractiveRow";
import { getScrubStepMs } from "../../hooks/usePlaybackClock";
import { isSpokenContent, PLAYBACK_SPEED_OPTIONS } from "../../utils/playback";

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
  onOpenActions?: (track: TrackItem) => void;
  playbackSpeed?: number;
  onSetPlaybackSpeed?: (speed: number) => void;
}

const TrackArtwork: FC<{ artwork?: string | null; isLossless?: boolean }> = ({
  artwork,
  isLossless,
}) => (
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
        <FaSpotify size={70} color="var(--deckify-accent, #1DB954)" />
      </div>
    )}

    {isLossless && (
      <div
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          background: "rgba(0,0,0,0.8)",
          border: "1px solid var(--deckify-accent, #1DB954)",
          color: "var(--deckify-accent, #1DB954)",
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
);

interface ProgressScrubBarProps {
  durationMs: number;
  currentPositionMs: number;
  handleSeekDelta: (seconds: number) => void;
  onSeekPlayback?: (timeMs: number) => void;
}

const ProgressFillTrack: FC<{ progressPercent: number; isFocused: boolean }> = ({
  progressPercent,
  isFocused,
}) => (
  <div
    style={{
      width: `${progressPercent}%`,
      height: "100%",
      background: "var(--deckify-accent, #1DB954)",
      borderRadius: 6,
      position: "relative",
    }}
  >
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
          ? "0 0 0 2px var(--deckify-accent, #1DB954), 0 2px 8px rgba(0,0,0,0.8)"
          : "0 2px 6px rgba(0,0,0,0.6)",
        transition: "width 0.1s ease, height 0.1s ease, top 0.1s ease, box-shadow 0.1s ease",
      }}
    />
  </div>
);

const ProgressScrubBar: FC<ProgressScrubBarProps> = ({
  durationMs,
  currentPositionMs,
  handleSeekDelta,
  onSeekPlayback,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [, setIsScrubbing] = useState(false);
  const progressPercent = Math.min(100, Math.max(0, (currentPositionMs / durationMs) * 100));

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault?.();
    e.stopPropagation?.();
    setIsScrubbing(true);
    const stepMs = getScrubStepMs(durationMs);
    handleSeekDelta(e.key === "ArrowLeft" ? -stepMs / 1000 : stepMs / 1000);
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetMs = pct * durationMs;
    if (onSeekPlayback) {
      onSeekPlayback(targetMs);
    } else {
      handleSeekDelta((targetMs - currentPositionMs) / 1000);
    }
  };

  return (
    <div style={{ width: "100%", marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, opacity: 0.6, marginBottom: 4 }}>
        <span>{formatMs(currentPositionMs)}</span>
        <span>{formatMs(durationMs)}</span>
      </div>

      <Focusable
        noFocusRing
        tabIndex={0}
        onFocus={() => setIsFocused(true)}
        onBlur={() => { setIsFocused(false); setIsScrubbing(false); }}
        onGamepadFocus={() => setIsFocused(true)}
        onGamepadBlur={() => { setIsFocused(false); setIsScrubbing(false); }}
        onKeyDown={handleKeyDown}
        onClick={handleClick}
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
        <ProgressFillTrack progressPercent={progressPercent} isFocused={isFocused} />
      </Focusable>

      <Focusable flow-children="horizontal" style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 8 }}>
        <InteractiveRow onClick={() => handleSeekDelta(-15)} style={{ padding: "4px 10px", fontSize: 11 }}>
          -15s
        </InteractiveRow>
        <InteractiveRow onClick={() => handleSeekDelta(15)} style={{ padding: "4px 10px", fontSize: 11 }}>
          +15s
        </InteractiveRow>
      </Focusable>
    </div>
  );
};

interface TransportRowProps {
  isSpoken: boolean;
  isPlaying: boolean;
  status: StatusResponse | null;
  track?: TrackMeta | TrackItem | null;
  handlePlayPause: () => void;
  handleNext: () => void;
  handlePrev: () => void;
  handleToggleRepeat: () => void;
  handleToggleLike: (trackId?: string) => void;
  handleSeekDelta: (seconds: number) => void;
  onSetShuffle: (state: boolean) => void;
  onOpenActions?: (track: TrackItem) => void;
}

function renderTransportRow({
  isSpoken,
  isPlaying,
  status,
  track,
  handlePlayPause,
  handleNext,
  handlePrev,
  handleToggleRepeat,
  handleToggleLike,
  handleSeekDelta,
  onSetShuffle,
  onOpenActions,
}: TransportRowProps) {
  return (
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

      {isSpoken ? (
        <RoundBtn onClick={() => handleSeekDelta(-15)} size={46} aria-label="Rewind 15s">
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 1 }}>
            <FaUndo size={13} />
            <span style={{ fontSize: 9, fontWeight: 700, marginTop: 2 }}>-15s</span>
          </div>
        </RoundBtn>
      ) : (
        <RoundBtn onClick={handlePrev} size={46} aria-label="Previous">
          <FaStepBackward size={18} />
        </RoundBtn>
      )}

      <RoundBtn onClick={handlePlayPause} size={54} accent aria-label={isPlaying ? "Pause" : "Play"}>
        {isPlaying ? <FaPause size={20} /> : <FaPlay size={20} style={{ marginLeft: 2 }} />}
      </RoundBtn>

      {isSpoken ? (
        <RoundBtn onClick={() => handleSeekDelta(15)} size={46} aria-label="Forward 15s">
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 1 }}>
            <FaRedo size={13} />
            <span style={{ fontSize: 9, fontWeight: 700, marginTop: 2 }}>+15s</span>
          </div>
        </RoundBtn>
      ) : (
        <RoundBtn onClick={handleNext} size={46} aria-label="Next">
          <FaStepForward size={18} />
        </RoundBtn>
      )}

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

      <RoundBtn
        onClick={() => track && onOpenActions?.(track as TrackItem)}
        size={42}
        aria-label="Add to Playlist"
      >
        <FaPlus size={15} />
      </RoundBtn>
    </Focusable>
  );
}

function renderSpokenSpeedDropdown({
  playbackSpeed,
  disabled,
  onSelect,
}: {
  playbackSpeed: number;
  disabled: boolean;
  onSelect: (speed: number) => void;
}) {
  return (
    <div style={{ width: "100%", maxWidth: 280, marginTop: 14 }}>
      <Dropdown
        rgOptions={PLAYBACK_SPEED_OPTIONS}
        selectedOption={playbackSpeed}
        disabled={disabled}
        onChange={(opt) => {
          const parsed = Number(opt?.data);
          if (Number.isFinite(parsed) && parsed > 0) {
            onSelect(parsed);
          }
        }}
      />
      {disabled && (
        <p style={{ fontSize: 11, opacity: 0.65, margin: "6px 0 0 0" }}>
          Playback speed requires Official Spotify Client
        </p>
      )}
    </div>
  );
}

const VolumeBar: FC<{ volume: number; handleVolumeDelta: (delta: number) => void }> = ({
  volume,
  handleVolumeDelta,
}) => (
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
      <div style={{ width: `${volume}%`, height: "100%", background: "var(--deckify-accent, #1DB954)" }} />
    </InteractiveRow>
    <RoundBtn onClick={() => handleVolumeDelta(5)} size={32}>
      <FaVolumeUp size={12} />
    </RoundBtn>
  </div>
);

function resolveIsLossless(status: StatusResponse | null): boolean {
  const legacyStream = (status as { stream_info?: { is_lossless_rate?: boolean } } | null)?.stream_info;
  return Boolean((legacyStream || status?.audio_stream_info)?.is_lossless_rate);
}

function resolveNowPlayingMeta(status: StatusResponse | null, playbackSpeed?: number) {
  const track = status?.track_meta || status?.track;
  return {
    track,
    artwork: track?.artwork_url || track?.image_url,
    isPlaying: Boolean(status?.is_playing),
    isLossless: resolveIsLossless(status),
    isSpoken: isSpokenContent(track),
    isSpotifyClient: status?.audio_backend === "spotify_client",
    resolvedSpeed: playbackSpeed ?? status?.playback_speed ?? 1.0,
    volume: status?.volume || 50,
  };
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
  onOpenActions,
  playbackSpeed,
  onSetPlaybackSpeed,
}) => {
  const meta = resolveNowPlayingMeta(status, playbackSpeed);
  const { track, artwork, isPlaying, isLossless, isSpoken, isSpotifyClient, resolvedSpeed, volume } = meta;

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
      <TrackArtwork artwork={artwork} isLossless={isLossless} />

      <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 4px 0", color: "#fff" }}>
        {track?.name || "No active track"}
      </h1>
      <p style={{ fontSize: 15, opacity: 0.7, margin: "0 0 16px 0" }}>
        {track?.artist || "Choose a playlist or album"}
      </p>

      {track?.duration_ms && track.duration_ms > 0 && (
        <ProgressScrubBar
          durationMs={track.duration_ms}
          currentPositionMs={currentPositionMs}
          handleSeekDelta={handleSeekDelta}
          onSeekPlayback={onSeekPlayback}
        />
      )}

      {renderTransportRow({
        isSpoken,
        isPlaying,
        status,
        track,
        handlePlayPause,
        handleNext,
        handlePrev,
        handleToggleRepeat,
        handleToggleLike,
        handleSeekDelta,
        onSetShuffle,
        onOpenActions,
      })}

      {isSpoken &&
        renderSpokenSpeedDropdown({
          playbackSpeed: resolvedSpeed,
          disabled: !isSpotifyClient,
          onSelect: (speed) => onSetPlaybackSpeed?.(speed),
        })}

      <VolumeBar volume={volume} handleVolumeDelta={handleVolumeDelta} />
    </div>
  );
};
