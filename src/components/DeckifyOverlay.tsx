import { FC, useState, useEffect, useRef } from "react";
import { FaMusic, FaPlay, FaPause } from "react-icons/fa";
import { DeckifyImage } from "./common/DeckifyImage";
import { SyncedLine } from "../types";
import { getThemeCssVars, useAccentTheme } from "../utils/themeBus";

export interface OverlayTrack {
  name?: string;
  artist?: string;
  album?: string;
  artwork_url?: string | null;
  image_url?: string | null;
  duration_ms?: number;
  media_type?: string;
  track_id?: string;
  id?: string;
}

export interface DeckifyOverlayProps {
  track?: OverlayTrack | null;
  isPlaying?: boolean;
  position?: "top-left" | "top-right" | "bottom-left" | "bottom-right" | string;
  visible?: boolean;
  autoHide?: boolean;
  autoHideDurationMs?: number;
  showProgress?: boolean;
  positionMs?: number;
  durationMs?: number;
  lyricsEnabled?: boolean;
  lyricsOffsetMs?: number;
  trackLyricsOffsetMs?: number;
  romanizeOverlayEnabled?: boolean;
  romanizeDisplayStyle?: "dual" | "romanized_only";
  syncedLyrics?: SyncedLine[];
  lyricsLoaded?: boolean;
  onVisibilityChange?: (visible: boolean) => void;
}

export const DeckifyOverlay: FC<DeckifyOverlayProps> = ({
  track,
  isPlaying = false,
  position = "top-right",
  visible = true,
  autoHide = false,
  autoHideDurationMs = 6000,
  showProgress = false,
  positionMs = 0,
  durationMs = 0,
  lyricsEnabled = false,
  lyricsOffsetMs = 0,
  trackLyricsOffsetMs = 0,
  romanizeOverlayEnabled = false,
  romanizeDisplayStyle = "dual",
  syncedLyrics = [],
  lyricsLoaded = false,
  onVisibilityChange,
}) => {
  const { accent, animationsSuspended } = useAccentTheme();
  const [isVisible, setIsVisible] = useState<boolean>(
    Boolean(visible && track && track.name && isPlaying)
  );
  const [activeLineIndex, setActiveLineIndex] = useState<number>(-1);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lyricTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevPlayingRef = useRef<boolean>(isPlaying);
  const prevTrackIdRef = useRef<string | undefined>(
    track?.track_id || track?.id || track?.name
  );
  const prevLyricTrackRef = useRef<string | undefined>(
    track?.track_id || track?.id || track?.name
  );
  const posAnchorRef = useRef<{ posMs: number; atMs: number }>({
    posMs: positionMs,
    atMs: Date.now(),
  });
  const onVisibilityChangeRef = useRef(onVisibilityChange);
  onVisibilityChangeRef.current = onVisibilityChange;

  const effectiveVisible = Boolean(isVisible && visible && track && track.name);

  useEffect(() => {
    onVisibilityChangeRef.current?.(effectiveVisible);
  }, [effectiveVisible]);

  useEffect(() => {
    return () => {
      onVisibilityChangeRef.current?.(false);
    };
  }, []);

  const clampedAutoHideMs = Math.min(15000, Math.max(3000, autoHideDurationMs ?? 6000));

  useEffect(() => {
    const currentTrackId = track?.track_id || track?.id || track?.name;
    prevPlayingRef.current = isPlaying;
    prevTrackIdRef.current = currentTrackId;

    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    if (pauseTimerRef.current) {
      clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = null;
    }

    if (!visible || !track || !track.name) {
      setIsVisible(false);
      return;
    }

    if (isPlaying) {
      setIsVisible(true);
      if (autoHide) {
        hideTimerRef.current = setTimeout(() => {
          setIsVisible(false);
        }, clampedAutoHideMs);
      }
    } else {
      // Music is paused: grace period (D-04: 3-4s with pause icon before fading)
      if (autoHide && isVisible) {
        pauseTimerRef.current = setTimeout(() => {
          setIsVisible(false);
        }, 3500);
      }
    }

    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
    };
  }, [isPlaying, track?.name, track?.track_id, track?.id, visible, autoHide, clampedAutoHideMs]);

  useEffect(() => {
    posAnchorRef.current = { posMs: positionMs, atMs: Date.now() };
  }, [positionMs, isPlaying, track?.track_id, track?.id, track?.name]);

  useEffect(() => {
    const currentTrackId = track?.track_id || track?.id || track?.name;

    if (lyricTimerRef.current) {
      clearTimeout(lyricTimerRef.current);
      lyricTimerRef.current = null;
    }

    if (!lyricsEnabled) {
      prevLyricTrackRef.current = currentTrackId;
      setActiveLineIndex(-1);
      return;
    }

    if (prevLyricTrackRef.current !== currentTrackId) {
      prevLyricTrackRef.current = currentTrackId;
      setActiveLineIndex(-1);
    }

    if (!isPlaying) {
      return;
    }

    if (syncedLyrics.length === 0) {
      setActiveLineIndex(-1);
      return;
    }

    const rawGlobalOffset = Number.isFinite(lyricsOffsetMs) ? (lyricsOffsetMs as number) : 0;
    const clampedOffsetMs = Math.min(2000, Math.max(-2000, rawGlobalOffset));
    const rawTrackOffset = Number.isFinite(trackLyricsOffsetMs) ? (trackLyricsOffsetMs as number) : 0;
    const clampedTrackOffsetMs = Math.min(10000, Math.max(-10000, rawTrackOffset));

    const scheduleNext = () => {
      const effectivePosMs =
        posAnchorRef.current.posMs +
        Math.max(0, Date.now() - posAnchorRef.current.atMs) +
        clampedOffsetMs -
        clampedTrackOffsetMs;

      let idx = -1;
      for (let i = 0; i < syncedLyrics.length; i++) {
        if (syncedLyrics[i].timeMs <= effectivePosMs) {
          idx = i;
        } else {
          break;
        }
      }
      setActiveLineIndex(idx);

      const nextIdx = idx + 1;
      if (nextIdx < syncedLyrics.length) {
        const delay = Math.max(16, syncedLyrics[nextIdx].timeMs - effectivePosMs);
        lyricTimerRef.current = setTimeout(scheduleNext, delay);
      }
    };

    scheduleNext();

    return () => {
      if (lyricTimerRef.current) {
        clearTimeout(lyricTimerRef.current);
        lyricTimerRef.current = null;
      }
    };
  }, [
    lyricsEnabled,
    syncedLyrics,
    isPlaying,
    positionMs,
    lyricsOffsetMs,
    trackLyricsOffsetMs,
    track?.track_id,
    track?.id,
    track?.name,
  ]);

  if (!track || !track.name) {
    return null;
  }

  const art = track.artwork_url || track.image_url;
  const isTop = position.includes("top");
  const isLeft = position.includes("left");

  const posStyle: React.CSSProperties = {
    ...getThemeCssVars(accent, animationsSuspended),
    position: "fixed",
    zIndex: 9999,
    pointerEvents: "none",
    margin: 16,
    top: isTop ? 16 : undefined,
    bottom: !isTop ? 16 : undefined,
    left: isLeft ? 16 : undefined,
    right: !isLeft ? 16 : undefined,
    background: "rgba(18, 18, 18, 0.88)",
    backdropFilter: "blur(12px)",
    border: "1px solid rgba(255, 255, 255, 0.12)",
    borderRadius: 10,
    padding: "8px 12px",
    display: "flex",
    flexDirection: "column",
    gap: 6,
    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.6)",
    color: "#fff",
    maxWidth: 320,
    opacity: isVisible ? 1 : 0,
    transform: isVisible
      ? "translateY(0)"
      : isTop
      ? "translateY(-10px)"
      : "translateY(10px)",
    transition: animationsSuspended
      ? "none"
      : "opacity 0.35s cubic-bezier(0.16, 1, 0.3, 1), transform 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
    overflow: "hidden",
  };

  const rawTitle = track.name || "";
  const displayTitle =
    rawTitle.length > 45 ? `${rawTitle.slice(0, 45)}...` : rawTitle;

  let displayLyricText = "♪ •••";
  let lyricDisplayKey = "placeholder";
  let hasActiveLine = false;
  let activeRomanized: string | undefined;
  if (syncedLyrics.length === 0 && lyricsLoaded) {
    displayLyricText = "No synced lyrics";
    lyricDisplayKey = "no-synced-lyrics";
  } else if (
    lyricsLoaded &&
    activeLineIndex >= 0 &&
    activeLineIndex < syncedLyrics.length &&
    syncedLyrics[activeLineIndex]
  ) {
    const activeLine = syncedLyrics[activeLineIndex];
    activeRomanized = romanizeOverlayEnabled && activeLine.romanized ? activeLine.romanized : undefined;
    displayLyricText =
      activeRomanized && romanizeDisplayStyle === "romanized_only"
        ? activeRomanized
        : activeLine.text;
    lyricDisplayKey = `line-${activeLineIndex}-${activeLine.timeMs}`;
    hasActiveLine = true;
  }
  const showDualRomanized = Boolean(
    hasActiveLine && activeRomanized && romanizeDisplayStyle !== "romanized_only"
  );
  const showSingleRomanized = Boolean(
    hasActiveLine && activeRomanized && romanizeDisplayStyle === "romanized_only"
  );

  return (
    <div style={posStyle} className="deckify-ingame-overlay">
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at top right, rgba(var(--deckify-accent-rgb, 29, 185, 84), 0.16), transparent 65%)",
          pointerEvents: "none",
        }}
      />
      {lyricsEnabled && !animationsSuspended && (
        <style>{`@keyframes deckifyLyricFadeIn { from { opacity: 0; } to { opacity: 1; } }`}</style>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {art ? (
          <DeckifyImage
            src={art}
            width={36}
            height={36}
            style={{ borderRadius: 6, objectFit: "cover", flexShrink: 0 }}
          />
        ) : (
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 6,
              background: "#282828",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <FaMusic size={16} color="var(--deckify-accent, #1DB954)" />
          </div>
        )}
        <div
          style={{
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {isPlaying ? (
              <FaPlay size={9} color="var(--deckify-accent, #1DB954)" style={{ flexShrink: 0 }} />
            ) : (
              <FaPause size={9} color="#888" style={{ flexShrink: 0 }} />
            )}
            <span>{displayTitle}</span>
          </div>
          {track.artist && (
            <div
              style={{
                fontSize: 10,
                opacity: 0.7,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {track.artist}
            </div>
          )}
        </div>
      </div>

      {lyricsEnabled && (
        <div
          data-testid="overlay-lyric-row"
          style={{
            ...(showDualRomanized
              ? { minHeight: 32, lineHeight: "16px", fontSize: 12 }
              : showSingleRomanized
              ? { height: 20, lineHeight: "20px", fontSize: 12 }
              : { height: 18, lineHeight: "18px", fontSize: 11 }),
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            borderTop: "1px solid rgba(255, 255, 255, 0.08)",
            paddingTop: 4,
            marginTop: 4,
            opacity: isPlaying ? 1 : 0.5,
            transition: animationsSuspended ? "none" : "opacity 200ms ease",
            color: hasActiveLine
              ? "rgba(255, 255, 255, 0.90)"
              : "rgba(255, 255, 255, 0.55)",
          }}
        >
          {showDualRomanized && activeRomanized
            ? [
                <span
                  key={lyricDisplayKey}
                  style={{
                    display: "block",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    animation: animationsSuspended ? "none" : "deckifyLyricFadeIn 200ms ease",
                  }}
                >
                  {displayLyricText}
                </span>,
                <span
                  key={`${lyricDisplayKey}-roma`}
                  data-testid="overlay-lyric-romanized"
                  style={{
                    display: "block",
                    fontSize: 12,
                    opacity: 0.72,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {activeRomanized}
                </span>,
              ]
            : (
                <span
                  key={lyricDisplayKey}
                  style={{
                    display: "block",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    animation: animationsSuspended ? "none" : "deckifyLyricFadeIn 200ms ease",
                  }}
                >
                  {displayLyricText}
                </span>
              )}
        </div>
      )}

      {showProgress && (durationMs > 0 || track?.media_type === "dj_interlude") && (
        <div
          data-testid="overlay-progress-bar"
          style={{
            width: "100%",
            height: 2,
            background: "rgba(255, 255, 255, 0.15)",
            borderRadius: 1,
            overflow: "hidden",
            marginTop: 2,
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${
                durationMs > 0
                  ? Math.min(100, Math.max(0, (positionMs / durationMs) * 100))
                  : Math.min(100, Math.max(8, (positionMs / 25000) * 100))
              }%`,
              background: "var(--deckify-accent, #1DB954)",
              transition: animationsSuspended ? "none" : "width 0.25s linear",
            }}
          />
        </div>
      )}
    </div>
  );
};

export default DeckifyOverlay;
