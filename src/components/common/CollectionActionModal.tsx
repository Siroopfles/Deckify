import { FC, useEffect, useRef } from "react";
import { Focusable } from "@decky/ui";
import {
  FaCheckCircle,
  FaCompactDisc,
  FaDownload,
  FaEdit,
  FaHeart,
  FaListUl,
  FaPlay,
  FaThumbtack,
  FaTrash,
} from "react-icons/fa";
import { OfflineState, PinnedPlaylistItem } from "../../types";
import { DeckifyImage } from "./DeckifyImage";
import { InteractiveRow } from "./InteractiveRow";
import { clampOfflineProgress } from "./OfflineStatusUI";

export type CollectionActionItem = PinnedPlaylistItem & {
  id?: string;
  description?: string;
  is_editable?: boolean;
};

export interface CollectionActionModalProps {
  collection: CollectionActionItem;
  isPinned: boolean;
  atLimit: boolean;
  offlineState?: OfflineState;
  offlineProgress?: number;
  onClose: () => void;
  onPlay: (collection: CollectionActionItem) => void;
  onTogglePin: (collection: CollectionActionItem) => void;
  onToggleOfflineDownload?: (collection: CollectionActionItem) => void;
  onEditPlaylist?: (collection: CollectionActionItem) => void;
  onDeletePlaylist?: (collection: CollectionActionItem) => void;
}

const TYPE_LABELS: Record<PinnedPlaylistItem["type"], string> = {
  playlist: "Playlist",
  album: "Album",
  liked_songs: "Liked Songs",
};

function renderFallbackIcon(type: PinnedPlaylistItem["type"]) {
  if (type === "album") return <FaCompactDisc size={18} color="#b3b3b3" />;
  if (type === "liked_songs") return <FaHeart size={18} color="var(--deckify-accent, #1DB954)" />;
  return <FaListUl size={18} color="#b3b3b3" />;
}

function renderCollectionHeader(collection: CollectionActionItem) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
      {collection.image_url ? (
        <DeckifyImage src={collection.image_url} width={44} height={44} style={{ borderRadius: 6, flexShrink: 0 }} />
      ) : (
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 6,
            background: "rgba(255,255,255,0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {renderFallbackIcon(collection.type)}
        </div>
      )}
      <div style={{ overflow: "hidden", flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {collection.name}
        </div>
        <div style={{ fontSize: 12, opacity: 0.6 }}>{TYPE_LABELS[collection.type] || "Collection"}</div>
      </div>
    </div>
  );
}

export const CollectionActionModal: FC<CollectionActionModalProps> = ({
  collection,
  isPinned,
  atLimit,
  offlineState,
  offlineProgress,
  onClose,
  onPlay,
  onTogglePin,
  onToggleOfflineDownload,
  onEditPlaylist,
  onDeletePlaylist,
}) => {
  const modalContainerRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const rafId = requestAnimationFrame(() => {
      const target = modalContainerRef.current?.querySelector('[tabindex="0"]') as HTMLElement | null;
      target?.focus?.();
    });
    return () => {
      cancelAnimationFrame(rafId);
      previousFocusRef.current?.focus?.();
      previousFocusRef.current = null;
    };
  }, []);

  const pinLabel = isPinned ? "Unpin from QAM" : atLimit ? "Max 4 Pinned — Unpin One First" : "Pin to QAM";
  const isPlaylist = collection.type === "playlist";
  const isEditablePlaylist = isPlaylist && collection.is_editable !== false;
  const pct = clampOfflineProgress(offlineProgress);
  const isDownloaded = offlineState === "downloaded";
  const isDownloading = offlineState === "downloading";
  const offlineLabel = isDownloaded
    ? "Remove Download"
    : isDownloading
      ? `Downloading ${pct}% — Cancel`
      : "Download for Offline";

  return (
    <div
      ref={modalContainerRef}
      data-testid="collection-action-modal"
      style={{
        position: "absolute", top: 0, left: 0, right: 0, bottom: 38,
        background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
      }}
    >
      <Focusable
        flow-children="column"
        style={{
          background: "#1c1c1c", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 14,
          padding: 20, width: 380, maxWidth: "90%", display: "flex", flexDirection: "column", gap: 8,
        }}
      >
        {renderCollectionHeader(collection)}

        <InteractiveRow tabIndex={0} onClick={() => { onPlay(collection); onClose(); }} style={{ gap: 10 }}>
          <FaPlay size={12} color="var(--deckify-accent, #1DB954)" />
          <span>Play</span>
        </InteractiveRow>

        <InteractiveRow
          onClick={() => { onTogglePin(collection); onClose(); }}
          style={{ gap: 10, color: isPinned ? "var(--deckify-accent, #1DB954)" : atLimit ? "rgba(255,255,255,0.55)" : "#fff" }}
        >
          <FaThumbtack size={12} color={isPinned ? "var(--deckify-accent, #1DB954)" : undefined} />
          <span>{pinLabel}</span>
        </InteractiveRow>

        {onToggleOfflineDownload && (
          <InteractiveRow
            data-testid="collection-offline-toggle"
            onClick={() => { onToggleOfflineDownload(collection); onClose(); }}
            style={{ gap: 10, color: isDownloaded ? "var(--deckify-accent, #1DB954)" : "#fff" }}
          >
            {isDownloaded ? (
              <FaCheckCircle size={12} color="var(--deckify-accent, #1DB954)" />
            ) : (
              <FaDownload size={12} color={isDownloading ? "var(--deckify-accent, #1DB954)" : undefined} />
            )}
            <span>{offlineLabel}</span>
          </InteractiveRow>
        )}

        {isEditablePlaylist && (
          <InteractiveRow onClick={() => { onEditPlaylist?.(collection); onClose(); }} style={{ gap: 10 }}>
            <FaEdit size={12} />
            <span>Edit Playlist Details</span>
          </InteractiveRow>
        )}

        {isPlaylist && (
          <InteractiveRow onClick={() => { onDeletePlaylist?.(collection); onClose(); }} style={{ gap: 10, color: "#FF5555" }}>
            <FaTrash size={12} color="#FF5555" />
            <span>{isEditablePlaylist ? "Delete Playlist" : "Unfollow Playlist"}</span>
          </InteractiveRow>
        )}

        <InteractiveRow onClick={onClose} style={{ justifyContent: "center", marginTop: 4 }}>
          <span>Close (B)</span>
        </InteractiveRow>
      </Focusable>
    </div>
  );
};
