import { FC } from "react";
import { FaArrowsAltV, FaHeart, FaMusic, FaRegHeart, FaTimes } from "react-icons/fa";
import { TrackItem } from "../../types";
import { DeckifyImage } from "./DeckifyImage";
import { InteractiveRow, formatMs } from "./InteractiveRow";

export interface TrackRowItemProps {
  track: TrackItem;
  index: number;
  contextUri?: string;
  allTracks?: TrackItem[];
  onPlayTrack: (uri: string, contextUri?: string, allUris?: string[], startIdx?: number) => void;
  onToggleLike: (trackId?: string) => void;
  onOpenActions: (track: TrackItem) => void;
  onFocus?: (track: TrackItem) => void;
  isGrabbed?: boolean;
  hasActiveGrab?: boolean;
  onCommitGrab?: () => void;
  canReorder?: boolean;
  canRemove?: boolean;
  onGrabTrack?: (track: TrackItem) => void;
  onRemoveTrack?: (track: TrackItem, index: number) => void;
}

function renderInlineControlButtons({
  track,
  index,
  isGrabbed,
  hasActiveGrab,
  canReorder,
  canRemove,
  onGrabTrack,
  onRemoveTrack,
}: {
  track: TrackItem;
  index: number;
  isGrabbed?: boolean;
  hasActiveGrab?: boolean;
  canReorder?: boolean;
  canRemove?: boolean;
  onGrabTrack?: (track: TrackItem) => void;
  onRemoveTrack?: (track: TrackItem, index: number) => void;
}) {
  if (hasActiveGrab) {
    if (!isGrabbed) return null;
    return (
      <span
        aria-label="Reordering track"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "4px 8px",
          borderRadius: 6,
          background: "rgba(var(--deckify-accent-rgb, 29, 185, 84), 0.35)",
        }}
      >
        <FaArrowsAltV size={12} color="var(--deckify-accent, #1DB954)" />
      </span>
    );
  }
  return (
    <>
      {canReorder && (
        <InteractiveRow
          aria-label="Reorder track"
          onClick={() => onGrabTrack?.(track)}
          style={{
            width: "auto",
            minWidth: "auto",
            flexShrink: 0,
            minHeight: 36,
            padding: "4px 8px",
            background: isGrabbed ? "rgba(var(--deckify-accent-rgb, 29, 185, 84), 0.35)" : "rgba(255,255,255,0.08)",
          }}
        >
          <FaArrowsAltV size={12} color={isGrabbed ? "var(--deckify-accent, #1DB954)" : "#ccc"} />
        </InteractiveRow>
      )}
      {canRemove && (
        <InteractiveRow
          aria-label="Remove track"
          onClick={() => onRemoveTrack?.(track, index)}
          style={{
            width: "auto",
            minWidth: "auto",
            flexShrink: 0,
            minHeight: 36,
            padding: "4px 8px",
            background: "rgba(255,255,255,0.08)",
          }}
        >
          <FaTimes size={12} color="#ccc" />
        </InteractiveRow>
      )}
    </>
  );
}

function renderTrackMeta(track: TrackItem, img?: string | null) {
  return (
    <>
      {img ? (
        <DeckifyImage src={img} width={32} height={32} style={{ borderRadius: 4 }} />
      ) : (
        <FaMusic size={14} color="#888" />
      )}
      <div style={{ flex: 1, overflow: "hidden" }}>
        <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {track.name}
        </div>
        <div style={{ fontSize: 11, opacity: 0.6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {track.artist}
        </div>
      </div>
    </>
  );
}

export const TrackRowItem: FC<TrackRowItemProps> = ({
  track,
  index,
  contextUri,
  allTracks,
  onPlayTrack,
  onToggleLike,
  onOpenActions,
  onFocus,
  isGrabbed,
  hasActiveGrab,
  onCommitGrab,
  canReorder,
  canRemove,
  onGrabTrack,
  onRemoveTrack,
}) => {
  const img = track.artwork_url || track.image_url;
  const allUris = allTracks ? (allTracks.map((x) => x.uri).filter(Boolean) as string[]) : undefined;
  const grabbedStyle = isGrabbed
    ? {
        border: "1px solid var(--deckify-accent, #1DB954)",
        background: "rgba(var(--deckify-accent-rgb, 29, 185, 84), 0.16)",
      }
    : undefined;

  return (
    <InteractiveRow
      key={track._rowKey || track.id || track.uri || index}
      data-deckify-list-item="true"
      data-deckify-label={track.name || ""}
      data-row-key={track._rowKey || ""}
      suppressFocusHalo={Boolean(hasActiveGrab && !isGrabbed)}
      onClick={() => {
        if (hasActiveGrab || isGrabbed) {
          if (onCommitGrab) onCommitGrab();
          else onGrabTrack?.(track);
          return;
        }
        onPlayTrack(track.uri || "", contextUri, allUris, index);
      }}
      onFocus={() => onFocus?.(track)}
      style={{ gap: 12, ...grabbedStyle }}
    >
      <span style={{ width: 22, fontSize: 12, opacity: 0.5, textAlign: "right" }}>{index + 1}</span>
      {renderTrackMeta(track, img)}
      {hasActiveGrab ? (
        <span
          aria-label="Toggle like"
          onClick={(e) => {
            e.stopPropagation();
            if (track.id) onToggleLike(track.id);
          }}
          style={{ cursor: "pointer", padding: "4px 6px" }}
        >
          {track.is_liked ? <FaHeart size={13} color="var(--deckify-accent, #1DB954)" /> : <FaRegHeart size={13} color="#777" />}
        </span>
      ) : (
        <InteractiveRow
          aria-label="Toggle like"
          onClick={(e) => {
            e?.stopPropagation?.();
            if (track.id) onToggleLike(track.id);
          }}
          style={{
            width: "auto",
            minWidth: "auto",
            flexShrink: 0,
            minHeight: 32,
            padding: "4px 8px",
            borderRadius: 6,
          }}
        >
          {track.is_liked ? <FaHeart size={13} color="var(--deckify-accent, #1DB954)" /> : <FaRegHeart size={13} color="#777" />}
        </InteractiveRow>
      )}
      <span style={{ fontSize: 12, opacity: 0.5 }}>{formatMs(track.duration_ms || 0)}</span>
      {renderInlineControlButtons({
        track,
        index,
        isGrabbed,
        hasActiveGrab,
        canReorder,
        canRemove,
        onGrabTrack,
        onRemoveTrack,
      })}
      {hasActiveGrab ? (
        <span
          aria-label="Track options"
          onClick={(e) => {
            e.stopPropagation();
            onOpenActions(track);
          }}
          style={{ padding: "4px 8px", borderRadius: 4, background: "rgba(255,255,255,0.08)", fontSize: 11, color: "#aaa" }}
        >
          Options (Y)
        </span>
      ) : (
        <InteractiveRow
          aria-label="Track options"
          onClick={(e) => {
            e?.stopPropagation?.();
            onOpenActions(track);
          }}
          style={{
            width: "auto",
            minWidth: "auto",
            flexShrink: 0,
            minHeight: 32,
            padding: "4px 8px",
            borderRadius: 6,
            fontSize: 11,
            color: "#aaa",
          }}
        >
          Options (Y)
        </InteractiveRow>
      )}
    </InteractiveRow>
  );
};
