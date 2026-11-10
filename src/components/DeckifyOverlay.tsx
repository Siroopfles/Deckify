import { FC } from "react";
import { FaMusic, FaPlay, FaPause } from "react-icons/fa";

export interface OverlayTrack {
  name?: string;
  artist?: string;
  album?: string;
  artwork_url?: string | null;
  image_url?: string | null;
}

export interface DeckifyOverlayProps {
  track?: OverlayTrack | null;
  isPlaying?: boolean;
  position?: "top-left" | "top-right" | "bottom-left" | "bottom-right" | string;
  visible?: boolean;
}

export const DeckifyOverlay: FC<DeckifyOverlayProps> = ({
  track,
  isPlaying = false,
  position = "top-right",
  visible = true,
}) => {
  if (!visible || !track || !track.name) {
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
    alignItems: "center",
    gap: 10,
    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.6)",
    color: "#fff",
    maxWidth: 320,
    transition: "opacity 0.25s ease-in-out",
  };

  const rawTitle = track.name || "";
  const displayTitle = rawTitle.length > 45 ? `${rawTitle.slice(0, 45)}...` : rawTitle;

  return (
    <div style={posStyle} className="deckify-ingame-overlay">
      {art ? (
        <img
          src={art}
          alt="Artwork"
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
      <div style={{ overflow: "hidden", display: "flex", flexDirection: "column", gap: 2 }}>
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
  );
};

export default DeckifyOverlay;
