import { Dispatch, FC, MutableRefObject, SetStateAction, useEffect, useMemo, useState } from "react";
import { Focusable } from "@decky/ui";
import { FaArrowsAltV, FaEllipsisH, FaHeart, FaRegHeart, FaSpotify, FaTimes } from "react-icons/fa";
import { assignStableRowKeys, useGrabMoveOrder } from "../../hooks/useGrabMoveOrder";
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
  onReorderQueueTrack?: (fromIndex: number, toIndex: number, nextTracks: TrackItem[]) => Promise<boolean> | boolean;
  onRemoveQueueTrack?: (track: TrackItem, index: number) => Promise<void> | void;
  onClearQueue?: () => Promise<void> | void;
  onGrabStateChange?: (grabbing: boolean) => void;
  grabTriggerRef?: MutableRefObject<((track: TrackItem) => void) | null>;
  grabCancelRef?: MutableRefObject<(() => boolean) | null>;
  setQueueTracks?: Dispatch<SetStateAction<TrackItem[]>>;
}

const COMPACT_BTN_STYLE = {
  width: "auto",
  minWidth: "auto",
  flexShrink: 0,
  minHeight: 36,
  padding: "4px 8px",
  background: "rgba(255,255,255,0.08)",
};

export const QueueTab: FC<QueueTabProps> = ({
  queueTracks,
  handlePlayTrack,
  handlePlayQueueTrack,
  handleToggleLike,
  onFocusTrack,
  onOpenActions,
  currentlyPlaying,
  isPlaying,
  onReorderQueueTrack,
  onRemoveQueueTrack,
  onClearQueue,
  onGrabStateChange,
  grabTriggerRef,
  grabCancelRef,
  setQueueTracks,
}) => {
  const [confirmClear, setConfirmClear] = useState(false);
  const stableTracks = useMemo(() => assignStableRowKeys(queueTracks, "q"), [queueTracks]);
  const { grabbedKey, enterGrabMode, commitGrab, cancelGrab, handleGamepadDirection } = useGrabMoveOrder({
    items: stableTracks,
    setItems: setQueueTracks,
    onCommit: onReorderQueueTrack,
  });

  useEffect(() => {
    if (grabTriggerRef) {
      grabTriggerRef.current = (track: TrackItem) => {
        const match = stableTracks.find((item) => item === track || (track._rowKey && item._rowKey === track._rowKey))
          || stableTracks.find((item) => (track.uri && item.uri === track.uri) || (track.id && item.id === track.id));
        if (match?._rowKey) enterGrabMode(match._rowKey);
      };
    }
    if (grabCancelRef) grabCancelRef.current = cancelGrab;
  }, [grabTriggerRef, grabCancelRef, stableTracks, enterGrabMode, cancelGrab]);

  useEffect(() => {
    onGrabStateChange?.(Boolean(grabbedKey));
  }, [grabbedKey, onGrabStateChange]);

  return (
    <div>
      {currentlyPlaying &&
        renderCurrentlyPlayingCard({ currentlyPlaying, isPlaying, onFocusTrack, onOpenActions })}
      {renderQueueHeader({ count: stableTracks.length, confirmClear, setConfirmClear, onClearQueue })}
      {stableTracks.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px", opacity: 0.6 }}>
          Queue is empty. Add songs from your library or search.
        </div>
      ) : (
        <Focusable
          flow-children="column"
          onGamepadDirection={handleGamepadDirection}
          style={{ display: "flex", flexDirection: "column", gap: 3 }}
        >
          {stableTracks.slice(0, 40).map((t, idx) =>
            renderQueueRow({
              t,
              rawTrack: queueTracks[idx] ?? t,
              idx,
              queueTracks: stableTracks,
              isGrabbed: Boolean(grabbedKey && t._rowKey === grabbedKey),
              onGrabToggle: () => (grabbedKey === t._rowKey ? void commitGrab() : enterGrabMode(t._rowKey || "")),
              onReorderEnabled: Boolean(onReorderQueueTrack),
              onRemoveQueueTrack,
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

function renderQueueHeader({
  count,
  confirmClear,
  setConfirmClear,
  onClearQueue,
}: {
  count: number;
  confirmClear: boolean;
  setConfirmClear: (next: boolean) => void;
  onClearQueue?: () => Promise<void> | void;
}) {
  return (
    <Focusable
      flow-children="horizontal"
      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16 }}
    >
      <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>{`Next in Queue (${count})`}</h2>
      {count > 0 && onClearQueue && !confirmClear && (
        <InteractiveRow
          aria-label="Clear Queue"
          onClick={() => setConfirmClear(true)}
          style={{ ...COMPACT_BTN_STYLE, padding: "6px 12px", fontSize: 12 }}
        >
          Clear Queue
        </InteractiveRow>
      )}
      {count > 0 && onClearQueue && confirmClear && (
        <Focusable flow-children="horizontal" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <InteractiveRow
            aria-label="Confirm Clear Queue"
            onClick={() => {
              setConfirmClear(false);
              onClearQueue();
            }}
            style={{ ...COMPACT_BTN_STYLE, padding: "6px 12px", fontSize: 12, color: "#FF5555" }}
          >
            Confirm Clear?
          </InteractiveRow>
          <InteractiveRow
            aria-label="Cancel Clear Queue"
            onClick={() => setConfirmClear(false)}
            style={{ ...COMPACT_BTN_STYLE, padding: "6px 12px", fontSize: 12 }}
          >
            Cancel
          </InteractiveRow>
        </Focusable>
      )}
    </Focusable>
  );
}

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

interface RenderQueueRowArgs {
  t: TrackItem;
  rawTrack: TrackItem;
  idx: number;
  queueTracks: TrackItem[];
  isGrabbed: boolean;
  onGrabToggle: () => void;
  onReorderEnabled: boolean;
  onRemoveQueueTrack?: (track: TrackItem, index: number) => Promise<void> | void;
  handlePlayTrack?: (uri: string, contextUri?: string, allUris?: string[], startIdx?: number) => void;
  handlePlayQueueTrack?: (clickedTrack: TrackItem, idx: number) => void;
  handleToggleLike: (trackId?: string) => void;
  onFocusTrack?: (track: TrackItem) => void;
  onOpenActions?: (track: TrackItem) => void;
}

function renderLikeButton(t: TrackItem, handleToggleLike: (trackId?: string) => void) {
  return (
    <span
      onClick={(e) => {
        e.stopPropagation();
        if (t.id) handleToggleLike(t.id);
      }}
      style={{ cursor: "pointer", padding: "4px 6px" }}
    >
      {t.is_liked ? <FaHeart size={13} color="var(--deckify-accent, #1DB954)" /> : <FaRegHeart size={13} color="#777" />}
    </span>
  );
}

function renderReorderButton(isGrabbed: boolean, onGrabToggle: () => void) {
  return (
    <InteractiveRow
      aria-label="Reorder track"
      onClick={onGrabToggle}
      style={{
        ...COMPACT_BTN_STYLE,
        background: isGrabbed ? "rgba(var(--deckify-accent-rgb, 29, 185, 84), 0.35)" : COMPACT_BTN_STYLE.background,
      }}
    >
      <FaArrowsAltV size={12} color={isGrabbed ? "var(--deckify-accent, #1DB954)" : "#ccc"} />
    </InteractiveRow>
  );
}

function renderQueueRow(args: RenderQueueRowArgs) {
  const {
    t,
    rawTrack,
    idx,
    queueTracks,
    isGrabbed,
    onGrabToggle,
    onReorderEnabled,
    onRemoveQueueTrack,
    handlePlayTrack,
    handlePlayQueueTrack,
    handleToggleLike,
    onFocusTrack,
    onOpenActions,
  } = args;
  const art = t.artwork_url || t.image_url || undefined;
  const grabbedStyle = isGrabbed
    ? { border: "1px solid var(--deckify-accent, #1DB954)", background: "rgba(var(--deckify-accent-rgb, 29, 185, 84), 0.16)" }
    : undefined;

  return (
    <InteractiveRow
      key={t._rowKey || t.id || t.uri || idx}
      data-deckify-list-item="true"
      data-deckify-label={t.name || ""}
      data-row-key={t._rowKey || ""}
      onClick={() => {
        if (isGrabbed) onGrabToggle();
        else if (handlePlayQueueTrack) handlePlayQueueTrack(rawTrack, idx);
        else if (handlePlayTrack && t.uri) {
          handlePlayTrack(t.uri, undefined, queueTracks.slice(idx).map((x) => x.uri).filter(Boolean) as string[], 0);
        }
      }}
      onFocus={() => onFocusTrack?.(rawTrack)}
      style={{ gap: 12, ...grabbedStyle }}
    >
      <span style={{ width: 22, fontSize: 12, opacity: 0.5 }}>{idx + 1}</span>
      {art && <DeckifyImage src={art} width={32} height={32} style={{ borderRadius: 4, flexShrink: 0 }} />}
      <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
        <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</div>
        <div style={{ fontSize: 11, opacity: 0.6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.artist}</div>
      </div>
      {renderLikeButton(t, handleToggleLike)}
      {onReorderEnabled && renderReorderButton(isGrabbed, onGrabToggle)}
      {onRemoveQueueTrack && (
        <InteractiveRow aria-label="Remove track" onClick={() => onRemoveQueueTrack(rawTrack, idx)} style={COMPACT_BTN_STYLE}>
          <FaTimes size={12} color="#ccc" />
        </InteractiveRow>
      )}
      {onOpenActions && (
        <span aria-label="Track Options" onClick={(e) => { e.stopPropagation(); onOpenActions(rawTrack); }} style={{ cursor: "pointer", padding: "4px 6px", opacity: 0.7 }}>
          <FaEllipsisH size={12} />
        </span>
      )}
      <span style={{ fontSize: 12, opacity: 0.5 }}>{formatMs(t.duration_ms || 0)}</span>
    </InteractiveRow>
  );
}
