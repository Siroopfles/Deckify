import { FC, useState, useEffect, useRef } from "react";
import { FaMusic, FaPlay, FaPause } from "react-icons/fa";
import { DeckifyImage } from "./common/DeckifyImage";

export interface OverlayTrack {
  name?: string;
  artist?: string;
  album?: string;
  artwork_url?: string | null;
  image_url?: string | null;
  duration_ms?: number;
  track_id?: string;
  id?: string;
}

export interface DeckifyOverlayProps {
  track?: OverlayTrack | null;
  isPlaying?: boolean;
  position?: "top-left" | "top-right" | "bottom-left" | "bottom-right" | string;
  visible?: boolean;
  autoHide?: boolean;
  showProgress?: boolean;
  positionMs?: number;
  durationMs?: number;
}

export const DeckifyOverlay: FC<DeckifyOverlayProps> = ({
  track,
  isPlaying = false,
  position = "top-right",
  visible = true,
  autoHide = false,
  showProgress = false,
  positionMs = 0,
  durationMs = 0,
}) => {
  const [isVisible, setIsVisible] = useState<boolean>(
    Boolean(visible && track && track.name && isPlaying)
  );
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevPlayingRef = useRef<boolean>(isPlaying);
  const prevTrackIdRef = useRef<string | undefined>(
    track?.track_id || track?.id || track?.name
  );

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
        }, 6000);
      }
    } else {
      // Music is paused: grace period (D-04: 3-4s with pause icon before fading)
      if (isVisible) {
        pauseTimerRef.current = setTimeout(() => {
          setIsVisible(false);
        }, 3500);
      }
    }

    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
    };
  }, [isPlaying, track?.name, track?.track_id, track?.id, visible, autoHide]);

  if (!track || !track.name) {
    return null;
  }

  const art = track.artwork_url || track.image_url;
  const isTop = position.includes("top");
  const isLeft = position.includes("left");

  const posStyle: React.CSSProperties = {
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
    transition:
      "opacity 0.35s cubic-bezier(0.16, 1, 0.3, 1), transform 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
    overflow: "hidden",
  };

  const rawTitle = track.name || "";
  const displayTitle =
    rawTitle.length > 45 ? `${rawTitle.slice(0, 45)}...` : rawTitle;

  return (
    <div style={posStyle} className="deckify-ingame-overlay">
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
            <FaMusic size={16} color="#1db954" />
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
              <FaPlay size={9} color="#1db954" style={{ flexShrink: 0 }} />
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

      {showProgress && durationMs > 0 && (
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
              width: `${Math.min(
                100,
                Math.max(0, (positionMs / durationMs) * 100)
              )}%`,
              background: "#1db954",
              transition: "width 0.25s linear",
            }}
          />
        </div>
      )}
    </div>
  );
};

export default DeckifyOverlay;
