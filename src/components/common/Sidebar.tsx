import { FC, ReactNode, useState } from "react";
import { Focusable } from "@decky/ui";
import {
  FaPlay,
  FaMicrophone,
  FaFolder,
  FaHeart,
  FaCompactDisc,
  FaUser,
  FaHistory,
  FaPodcast,
  FaSearch,
  FaListUl,
  FaTv,
  FaCog,
  FaMusic,
  FaGamepad,
  FaCompass,
} from "react-icons/fa";
import { ViewMode, StatusResponse, TrackItem } from "../../types";
import { DeckifyImage } from "./DeckifyImage";
import { InteractiveRow, focusHalo } from "./InteractiveRow";

export function SidebarBtn({
  id,
  label,
  icon,
  active,
  onSelect,
}: {
  id: ViewMode;
  label: string;
  icon: ReactNode;
  active: boolean;
  onSelect: (id: ViewMode) => void;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <Focusable
      noFocusRing
      onClick={() => onSelect(id)}
      onActivate={() => onSelect(id)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onGamepadFocus={() => setFocused(true)}
      onGamepadBlur={() => setFocused(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "8px 12px",
        borderRadius: 8,
        marginBottom: 2,
        background: active
          ? "#1db954"
          : focused
          ? "rgba(255,255,255,0.18)"
          : "transparent",
        color: active ? "#000" : "#fff",
        fontWeight: active ? 700 : 500,
        cursor: "pointer",
        fontSize: 13,
        ...focusHalo(focused),
      }}
    >
      <span style={{ fontSize: 14 }}>{icon}</span>
      <span style={{ fontSize: 13 }}>{label}</span>
    </Focusable>
  );
}

export interface SidebarProps {
  mode: ViewMode;
  onSelectMode: (mode: ViewMode) => void;
  status: StatusResponse | null;
  closeModal?: () => void;
  onFocusTrack?: (track: TrackItem | null) => void;
  onOpenActions?: (track: TrackItem) => void;
}

export const Sidebar: FC<SidebarProps> = ({
  mode,
  onSelectMode,
  status,
  closeModal,
  onFocusTrack,
  onOpenActions,
}) => {
  const track = status?.track_meta || status?.track;
  const artwork = track?.artwork_url || track?.image_url;

  return (
    <Focusable
      flow-children="column"
      style={{
        width: 220,
        background: "rgba(0,0,0,0.45)",
        borderRight: "1px solid rgba(255,255,255,0.08)",
        display: "flex",
        flexDirection: "column",
        padding: 16,
        gap: 8,
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      {/* Brand Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexShrink: 0 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#1db954" }} />
        <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: 0.5 }}>Deckify</span>
        <span style={{ fontSize: 9, opacity: 0.4, marginLeft: "auto", background: "rgba(255,255,255,0.1)", padding: "2px 5px", borderRadius: 4 }}>
          L1/R1
        </span>
      </div>

      {/* Scrollable Navigation Menu */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.4, padding: "4px 8px", textTransform: "uppercase", letterSpacing: 0.8 }}>Playback</div>
          <SidebarBtn id="now_playing" label="Now Playing" icon={<FaPlay size={12} />} active={mode === "now_playing"} onSelect={onSelectMode} />
          <SidebarBtn id="lyrics" label="Lyrics" icon={<FaMicrophone size={12} />} active={mode === "lyrics"} onSelect={onSelectMode} />

          <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.4, padding: "8px 8px 4px", textTransform: "uppercase", letterSpacing: 0.8 }}>Library</div>
          <SidebarBtn id="discovery" label="Discovery" icon={<FaCompass size={12} />} active={mode === "discovery"} onSelect={onSelectMode} />
          <SidebarBtn id="playlists" label="Playlists" icon={<FaFolder size={12} />} active={mode === "playlists"} onSelect={onSelectMode} />
          <SidebarBtn id="liked" label="Liked Songs" icon={<FaHeart size={12} />} active={mode === "liked"} onSelect={onSelectMode} />
          <SidebarBtn id="albums" label="Albums" icon={<FaCompactDisc size={12} />} active={mode === "albums"} onSelect={onSelectMode} />
          <SidebarBtn id="artists" label="Artists" icon={<FaUser size={12} />} active={mode === "artists"} onSelect={onSelectMode} />
          <SidebarBtn id="recent" label="Recently Played" icon={<FaHistory size={12} />} active={mode === "recent"} onSelect={onSelectMode} />
          <SidebarBtn id="episodes" label="Podcasts" icon={<FaPodcast size={12} />} active={mode === "episodes"} onSelect={onSelectMode} />

          <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.4, padding: "8px 8px 4px", textTransform: "uppercase", letterSpacing: 0.8 }}>Control</div>
          <SidebarBtn id="search" label="Search" icon={<FaSearch size={12} />} active={mode === "search"} onSelect={onSelectMode} />
          <SidebarBtn id="queue" label="Queue" icon={<FaListUl size={12} />} active={mode === "queue"} onSelect={onSelectMode} />
          <SidebarBtn id="devices" label="Devices" icon={<FaTv size={12} />} active={mode === "devices"} onSelect={onSelectMode} />
          <SidebarBtn id="soundtracks" label="Soundtracks" icon={<FaGamepad size={12} />} active={mode === "soundtracks"} onSelect={onSelectMode} />
          <SidebarBtn id="engine" label="Settings" icon={<FaCog size={12} />} active={mode === "engine"} onSelect={onSelectMode} />
        </Focusable>
      </div>

      {/* Now Playing Widget in Sidebar */}
      {track?.name && (
        <InteractiveRow
          onFocus={() => onFocusTrack?.(track as TrackItem)}
          onBlur={() => onFocusTrack?.(null)}
          onClick={() =>
            onOpenActions ? onOpenActions(track as TrackItem) : onSelectMode("now_playing")
          }
          style={{
            flexShrink: 0,
            padding: 8,
            borderRadius: 8,
            background: "rgba(255,255,255,0.05)",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          {artwork ? (
            <DeckifyImage src={artwork} width={34} height={34} style={{ borderRadius: 4 }} />
          ) : (
            <FaMusic size={18} color="#888" />
          )}
          <div style={{ overflow: "hidden", flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {track.name}
            </div>
            <div style={{ fontSize: 10, opacity: 0.6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {track.artist}
            </div>
          </div>
        </InteractiveRow>
      )}

      {/* Pinned Back to Steam (B) Footer */}
      <InteractiveRow
        onClick={() => closeModal?.()}
        style={{
          flexShrink: 0,
          borderTop: "1px solid rgba(255,255,255,0.08)",
          marginTop: 4,
          minHeight: 44,
          justifyContent: "center",
          background: "rgba(255,255,255,0.08)",
          fontSize: 12,
          fontWeight: 600,
          gap: 6,
        }}
      >
        <span>Back to Steam (B)</span>
      </InteractiveRow>
    </Focusable>
  );
};
