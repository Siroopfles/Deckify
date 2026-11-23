import { FC } from "react";
import { Focusable } from "@decky/ui";
import { FaEllipsisH, FaHeart, FaRegHeart, FaSpotify } from "react-icons/fa";
import { TrackItem, TrackMeta } from "../../types";
import { DeckifyImage } from "../common/DeckifyImage";
import { InteractiveRow, formatMs } from "../common/InteractiveRow";

export interface QueueTabProps {
  queueTracks: TrackItem[];
  handlePlayTrack?: (uri: string, contextUri?: string, allUris?: string[], startIdx?: number) => void;
  handlePlayQueueTrack?: (clickedTrack: TrackItem, idx: number) => void;
  handleToggleLike: (trackId?: string) => void;
  onFocusTrack?: (track: TrackItem) => void;
  onOpenActions?: (track: TrackItem) => void;
  currentlyPlaying?: TrackItem | TrackMeta | null;
  isPlaying?: boolean;
}

export const QueueTab: FC<QueueTabProps> = ({
  queueTracks,
  handlePlayTrack,
  handlePlayQueueTrack,
  handleToggleLike,
  onFocusTrack,
  onOpenActions,
  currentlyPlaying,
  isPlaying,
}) => {
  return (
    <div>
      {currentlyPlaying &&
        renderCurrentlyPlayingCard({
          currentlyPlaying,
          isPlaying,
          onFocusTrack,
          onOpenActions,
        })}

      <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>
        {`Next in Queue (${queueTracks.length})`}
      </h2>

      {queueTracks.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px", opacity: 0.6 }}>
          Queue is empty. Add songs from your library or search.
        </div>
      ) : (
        <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {queueTracks.slice(0, 40).map((t, idx) =>
            renderQueueRow({
              t,
              idx,
              queueTracks,
              handlePlayTrack,
              handlePlayQueueTrack,
              handleToggleLike,
              onFocusTrack,
              onOpenActions,
            })
          )}
        </Focusable>
      )}
    </div>
  );
};

function renderCurrentlyPlayingCard({
  currentlyPlaying,
  isPlaying,
  onFocusTrack,
  onOpenActions,
}: {
  currentlyPlaying: TrackItem | TrackMeta;
  isPlaying?: boolean;
  onFocusTrack?: (track: TrackItem) => void;
  onOpenActions?: (track: TrackItem) => void;
}) {
  const artSrc = currentlyPlaying.artwork_url || currentlyPlaying.image_url || undefined;
  return (
    <div
      data-testid="now-playing-card"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 14px",
        borderRadius: 8,
        background: "rgba(255, 255, 255, 0.06)",
        border: "1px solid rgba(255, 255, 255, 0.12)",
        marginBottom: 16,
      }}
    >
      {artSrc ? (
        <DeckifyImage src={artSrc} width={48} height={48} style={{ borderRadius: 6, flexShrink: 0 }} />
      ) : (
        <div style={{ width: 48, height: 48, borderRadius: 6, background: "#282828", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <FaSpotify size={24} color="var(--deckify-accent, #1DB954)" />
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
        <div
          data-testid="now-playing-badge"
          style={{
            fontSize: 10,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: 0.5,
            color: isPlaying ? "var(--deckify-accent, #1DB954)" : "#999",
            marginBottom: 2,
          }}
        >
          {isPlaying ? "NOW PLAYING" : "CURRENT TRACK"}
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {currentlyPlaying.name || "Unknown Track"}
        </div>
        <div style={{ fontSize: 12, opacity: 0.7, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {currentlyPlaying.artist || "Unknown Artist"}
        </div>
      </div>
      <span style={{ fontSize: 12, opacity: 0.5, flexShrink: 0 }}>
        {formatMs(currentlyPlaying.duration_ms || 0)}
      </span>
      {onOpenActions && (
        <InteractiveRow
          aria-label="Track Options"
          onClick={() => {
            onFocusTrack?.(currentlyPlaying as TrackItem);
            onOpenActions(currentlyPlaying as TrackItem);
          }}
          onFocus={() => onFocusTrack?.(currentlyPlaying as TrackItem)}
          style={{ padding: "6px 12px", minHeight: 36, flexShrink: 0, width: "auto" }}
        >
          <FaEllipsisH size={13} />
        </InteractiveRow>
      )}
    </div>
  );
}

function renderQueueRow({
  t,
  idx,
  queueTracks,
  handlePlayTrack,
  handlePlayQueueTrack,
  handleToggleLike,
  onFocusTrack,
  onOpenActions,
}: {
  t: TrackItem;
  idx: number;
  queueTracks: TrackItem[];
  handlePlayTrack?: (uri: string, contextUri?: string, allUris?: string[], startIdx?: number) => void;
  handlePlayQueueTrack?: (clickedTrack: TrackItem, idx: number) => void;
  handleToggleLike: (trackId?: string) => void;
  onFocusTrack?: (track: TrackItem) => void;
  onOpenActions?: (track: TrackItem) => void;
}) {
  return (
    <InteractiveRow
      key={t.id || t.uri || idx}
      data-deckify-list-item="true"
      data-deckify-label={t.name || ""}
      onClick={() => {
        if (handlePlayQueueTrack) {
          handlePlayQueueTrack(t, idx);
        } else if (handlePlayTrack && t.uri) {
          const remaining = queueTracks.slice(idx).map((x) => x.uri).filter(Boolean) as string[];
          handlePlayTrack(t.uri, undefined, remaining, 0);
        }
      }}
      onFocus={() => onFocusTrack?.(t)}
      style={{ gap: 12 }}
    >
      <span style={{ width: 22, fontSize: 12, opacity: 0.5 }}>{idx + 1}</span>
      {(t.artwork_url || t.image_url) && (
        <DeckifyImage
          src={t.artwork_url || t.image_url || undefined}
          width={32}
          height={32}
          style={{ borderRadius: 4, flexShrink: 0 }}
        />
      )}
      <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
        <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {t.name}
        </div>
        <div style={{ fontSize: 11, opacity: 0.6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {t.artist}
        </div>
      </div>
      <span
        onClick={(e) => {
          e.stopPropagation();
          if (t.id) handleToggleLike(t.id);
        }}
        style={{ cursor: "pointer", padding: "4px 6px" }}
      >
        {t.is_liked ? <FaHeart size={13} color="var(--deckify-accent, #1DB954)" /> : <FaRegHeart size={13} color="#777" />}
      </span>
      {onOpenActions && (
        <span
          aria-label="Track Options"
          onClick={(e) => {
            e.stopPropagation();
            onOpenActions(t);
          }}
          style={{ cursor: "pointer", padding: "4px 6px", opacity: 0.7 }}
        >
          <FaEllipsisH size={12} />
        </span>
      )}
      <span style={{ fontSize: 12, opacity: 0.5 }}>{formatMs(t.duration_ms || 0)}</span>
    </InteractiveRow>
  );
}
