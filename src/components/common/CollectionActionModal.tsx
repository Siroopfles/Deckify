import { FC, useEffect, useRef } from "react";
import { Focusable } from "@decky/ui";
import {
  FaCompactDisc,
  FaHeart,
  FaListUl,
  FaPlay,
  FaThumbtack,
} from "react-icons/fa";
import { PinnedPlaylistItem } from "../../types";
import { DeckifyImage } from "./DeckifyImage";
import { InteractiveRow } from "./InteractiveRow";

export interface CollectionActionModalProps {
  collection: PinnedPlaylistItem;
  isPinned: boolean;
  atLimit: boolean;
  onClose: () => void;
  onPlay: (collection: PinnedPlaylistItem) => void;
  onTogglePin: (collection: PinnedPlaylistItem) => void;
}

const TYPE_LABELS: Record<PinnedPlaylistItem["type"], string> = {
  playlist: "Playlist",
  album: "Album",
  liked_songs: "Liked Songs",
};

export const CollectionActionModal: FC<CollectionActionModalProps> = ({
  collection,
  isPinned,
  atLimit,
  onClose,
  onPlay,
  onTogglePin,
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
      if (previousFocusRef.current) {
        previousFocusRef.current?.focus?.();
        previousFocusRef.current = null;
      }
    };
  }, []);

  const pinLabel = isPinned
    ? "Unpin from QAM"
    : atLimit
    ? "Max 4 Pinned — Unpin One First"
    : "Pin to QAM";

  const renderFallbackIcon = () => {
    if (collection.type === "album") {
      return <FaCompactDisc size={18} color="#b3b3b3" />;
    }
    if (collection.type === "liked_songs") {
      return <FaHeart size={18} color="var(--deckify-accent, #1DB954)" />;
    }
    return <FaListUl size={18} color="#b3b3b3" />;
  };

  return (
    <div
      ref={modalContainerRef}
      data-testid="collection-action-modal"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 38,
        background: "rgba(0,0,0,0.85)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
    >
      <Focusable
        flow-children="column"
        style={{
          background: "#1c1c1c",
          border: "1px solid rgba(255,255,255,0.15)",
          borderRadius: 14,
          padding: 20,
          width: 380,
          maxWidth: "90%",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          {collection.image_url ? (
            <DeckifyImage
              src={collection.image_url}
              width={44}
              height={44}
              style={{ borderRadius: 6, flexShrink: 0 }}
            />
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
              {renderFallbackIcon()}
            </div>
          )}
          <div style={{ overflow: "hidden", flex: 1 }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {collection.name}
            </div>
            <div style={{ fontSize: 12, opacity: 0.6 }}>
              {TYPE_LABELS[collection.type] || "Collection"}
            </div>
          </div>
        </div>

        <InteractiveRow
          tabIndex={0}
          onClick={() => {
            onPlay(collection);
            onClose();
          }}
          style={{ gap: 10 }}
        >
          <FaPlay size={12} color="var(--deckify-accent, #1DB954)" />
          <span>Play</span>
        </InteractiveRow>

        <InteractiveRow
          onClick={() => {
            onTogglePin(collection);
            onClose();
          }}
          style={{
            gap: 10,
            color: isPinned ? "var(--deckify-accent, #1DB954)" : atLimit ? "rgba(255,255,255,0.55)" : "#fff",
          }}
        >
          <FaThumbtack size={12} color={isPinned ? "var(--deckify-accent, #1DB954)" : undefined} />
          <span>{pinLabel}</span>
        </InteractiveRow>

        <InteractiveRow onClick={onClose} style={{ justifyContent: "center", marginTop: 4 }}>
          <span>Close (B)</span>
        </InteractiveRow>
      </Focusable>
    </div>
  );
};
