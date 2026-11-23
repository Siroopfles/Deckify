import { FC, MutableRefObject, useEffect, useRef } from "react";
import { Focusable } from "@decky/ui";
import {
  FaPlay,
  FaListUl,
  FaFolder,
  FaBroadcastTower,
  FaUser,
  FaCompactDisc,
  FaTrash,
  FaHeart,
} from "react-icons/fa";
import { PlaylistItem, TrackItem, ViewMode } from "../../types";
import { isSpokenContent } from "../../utils/playback";
import { DeckifyImage } from "./DeckifyImage";
import { InteractiveRow } from "./InteractiveRow";

export interface TrackActionModalProps {
  actionTrack: TrackItem | null;
  activePlaylist: PlaylistItem | null;
  showAddToPlaylistModal: boolean;
  allUserPlaylists: PlaylistItem[];
  onClose: () => void;
  onPlayTrack: (uri: string) => void;
  onAddToQueue: (track: TrackItem) => void;
  onOpenAddToPlaylist: () => void;
  onCloseAddToPlaylist: () => void;
  onAddTrackToPlaylist: (playlistId: string, playlistName: string) => void;
  onStartRadio: (track: TrackItem) => void;
  onOpenArtist: (artist: { id: string; name: string }) => void;
  onOpenAlbum: (album: { id: string; name: string; artist: string; uri: string }) => void;
  onRemoveFromPlaylist?: () => void;
  onToggleLike: (trackId?: string) => void;
  setMode?: (mode: ViewMode) => void;
}

export const TrackActionModal: FC<TrackActionModalProps> = ({
  actionTrack,
  activePlaylist,
  showAddToPlaylistModal,
  allUserPlaylists,
  onClose,
  onPlayTrack,
  onAddToQueue,
  onOpenAddToPlaylist,
  onCloseAddToPlaylist,
  onAddTrackToPlaylist,
  onStartRadio,
  onOpenArtist,
  onOpenAlbum,
  onRemoveFromPlaylist,
  onToggleLike,
}) => {
  const modalContainerRef = useRef<HTMLDivElement | null>(null);
  const pickerContainerRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const hasActionTrack = Boolean(actionTrack);

  useEffect(() => {
    if (hasActionTrack) {
      if (!previousFocusRef.current) {
        previousFocusRef.current = document.activeElement as HTMLElement | null;
      }
      const rafId = requestAnimationFrame(() => {
        const container = showAddToPlaylistModal
          ? pickerContainerRef.current
          : modalContainerRef.current;
        const target = container?.querySelector('[tabindex="0"]') as HTMLElement | null;
        target?.focus?.();
      });
      return () => cancelAnimationFrame(rafId);
    } else if (previousFocusRef.current) {
      previousFocusRef.current?.focus?.();
      previousFocusRef.current = null;
    }
    return undefined;
  }, [hasActionTrack, showAddToPlaylistModal]);

  useEffect(() => {
    return () => {
      if (previousFocusRef.current) {
        previousFocusRef.current?.focus?.();
        previousFocusRef.current = null;
      }
    };
  }, []);

  if (!actionTrack) return null;

  return (
    <>
      {!showAddToPlaylistModal &&
        renderTrackActionsOverlay({
          modalContainerRef,
          actionTrack,
          activePlaylist,
          onClose,
          onPlayTrack,
          onAddToQueue,
          onOpenAddToPlaylist,
          onStartRadio,
          onOpenArtist,
          onOpenAlbum,
          onRemoveFromPlaylist,
          onToggleLike,
        })}

      {showAddToPlaylistModal &&
        renderPlaylistPickerOverlay({
          pickerContainerRef,
          actionTrack,
          allUserPlaylists,
          onAddTrackToPlaylist,
          onCloseAddToPlaylist,
        })}
    </>
  );
};

interface TrackActionsOverlayArgs {
  modalContainerRef: MutableRefObject<HTMLDivElement | null>;
  actionTrack: TrackItem;
  activePlaylist: PlaylistItem | null;
  onClose: () => void;
  onPlayTrack: (uri: string) => void;
  onAddToQueue: (track: TrackItem) => void;
  onOpenAddToPlaylist: () => void;
  onStartRadio: (track: TrackItem) => void;
  onOpenArtist: (artist: { id: string; name: string }) => void;
  onOpenAlbum: (album: { id: string; name: string; artist: string; uri: string }) => void;
  onRemoveFromPlaylist?: () => void;
  onToggleLike: (trackId?: string) => void;
}

function renderTrackActionsHeader(actionTrack: TrackItem) {
  const coverSrc = actionTrack.artwork_url || actionTrack.image_url || undefined;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
      {coverSrc && (
        <DeckifyImage src={coverSrc} width={44} height={44} style={{ borderRadius: 6 }} />
      )}
      <div style={{ overflow: "hidden", flex: 1 }}>
        <div style={{ fontSize: 15, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {actionTrack.name}
        </div>
        <div style={{ fontSize: 12, opacity: 0.6 }}>{actionTrack.artist}</div>
      </div>
    </div>
  );
}

function renderTrackNavigationRows({
  actionTrack,
  isSpoken,
  onClose,
  onOpenArtist,
  onOpenAlbum,
}: {
  actionTrack: TrackItem;
  isSpoken: boolean;
  onClose: () => void;
  onOpenArtist: (artist: { id: string; name: string }) => void;
  onOpenAlbum: (album: { id: string; name: string; artist: string; uri: string }) => void;
}) {
  const artistLabel = isSpoken
    ? `Go to Show (${actionTrack.artist})`
    : `Go to Artist (${actionTrack.artist})`;
  return (
    <>
      {(actionTrack.artist_id || actionTrack.artist) && (
        <InteractiveRow
          onClick={() => {
            onClose();
            onOpenArtist({ id: actionTrack.artist_id || "", name: actionTrack.artist || "" });
          }}
          style={{ gap: 10 }}
        >
          <FaUser size={12} />
          <span>{artistLabel}</span>
        </InteractiveRow>
      )}
      {!isSpoken && actionTrack.album_id && (
        <InteractiveRow
          onClick={() => {
            onClose();
            onOpenAlbum({
              id: actionTrack.album_id || "",
              name: actionTrack.album || "",
              artist: actionTrack.artist || "",
              uri: `spotify:album:${actionTrack.album_id}`,
            });
          }}
          style={{ gap: 10 }}
        >
          <FaCompactDisc size={12} />
          <span>Go to Album</span>
        </InteractiveRow>
      )}
    </>
  );
}

function renderTrackActionsOverlay({
  modalContainerRef,
  actionTrack,
  activePlaylist,
  onClose,
  onPlayTrack,
  onAddToQueue,
  onOpenAddToPlaylist,
  onStartRadio,
  onOpenArtist,
  onOpenAlbum,
  onRemoveFromPlaylist,
  onToggleLike,
}: TrackActionsOverlayArgs) {
  const isSpoken = isSpokenContent(actionTrack);
  return (
    <div
      ref={modalContainerRef}
      data-testid="track-action-modal"
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
        {renderTrackActionsHeader(actionTrack)}

        <InteractiveRow tabIndex={0} onClick={() => onPlayTrack(actionTrack.uri || "")} style={{ gap: 10 }}>
          <FaPlay size={12} color="var(--deckify-accent, #1DB954)" />
          <span>{isSpoken ? "Play Episode" : "Play Track"}</span>
        </InteractiveRow>

        <InteractiveRow onClick={() => onAddToQueue(actionTrack)} style={{ gap: 10 }}>
          <FaListUl size={12} />
          <span>Add to Queue</span>
        </InteractiveRow>

        <InteractiveRow onClick={onOpenAddToPlaylist} style={{ gap: 10 }}>
          <FaFolder size={12} />
          <span>Add to Playlist...</span>
        </InteractiveRow>

        {!isSpoken && (
          <InteractiveRow onClick={() => onStartRadio(actionTrack)} style={{ gap: 10 }}>
            <FaBroadcastTower size={12} color="var(--deckify-accent, #1DB954)" />
            <span>Start Song Radio</span>
          </InteractiveRow>
        )}

        {renderTrackNavigationRows({ actionTrack, isSpoken, onClose, onOpenArtist, onOpenAlbum })}

        {activePlaylist && onRemoveFromPlaylist && (
          <InteractiveRow onClick={onRemoveFromPlaylist} style={{ gap: 10, color: "#ff5555" }}>
            <FaTrash size={12} color="#ff5555" />
            <span>Remove from &apos;{activePlaylist.name}&apos;</span>
          </InteractiveRow>
        )}

        <InteractiveRow onClick={() => onToggleLike(actionTrack.id)} style={{ gap: 10 }}>
          <FaHeart size={12} color="var(--deckify-accent, #1DB954)" />
          <span>Toggle Favorite (Like)</span>
        </InteractiveRow>

        <InteractiveRow onClick={onClose} style={{ justifyContent: "center", marginTop: 4 }}>
          <span>Close (B)</span>
        </InteractiveRow>
      </Focusable>
    </div>
  );
}

function renderPlaylistPickerOverlay({
  pickerContainerRef,
  actionTrack,
  allUserPlaylists,
  onAddTrackToPlaylist,
  onCloseAddToPlaylist,
}: {
  pickerContainerRef: MutableRefObject<HTMLDivElement | null>;
  actionTrack: TrackItem;
  allUserPlaylists: PlaylistItem[];
  onAddTrackToPlaylist: (playlistId: string, playlistName: string) => void;
  onCloseAddToPlaylist: () => void;
}) {
  return (
    <div
      ref={pickerContainerRef}
      data-testid="playlist-picker-overlay"
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
        zIndex: 101,
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
          maxHeight: "75%",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <h3 style={{ margin: "0 0 6px 0", fontSize: 16, fontWeight: 800 }}>Add to Playlist</h3>
        <p style={{ fontSize: 12, opacity: 0.6, margin: "0 0 14px 0" }}>Add &apos;{actionTrack.name}&apos; to:</p>

        <Focusable flow-children="column" style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 3, marginBottom: 12 }}>
          {allUserPlaylists.map((pl, idx) => (
            <InteractiveRow
              key={pl.id}
              tabIndex={idx === 0 ? 0 : undefined}
              onClick={() => onAddTrackToPlaylist(pl.id, pl.name)}
              style={{ gap: 10 }}
            >
              <FaFolder size={12} color="var(--deckify-accent, #1DB954)" />
              <span style={{ fontSize: 13, fontWeight: 600 }}>{pl.name}</span>
            </InteractiveRow>
          ))}
          {allUserPlaylists.length === 0 && (
            <div style={{ textAlign: "center", padding: 20, opacity: 0.5, fontSize: 12 }}>
              No editable playlists found
            </div>
          )}
        </Focusable>

        <InteractiveRow tabIndex={allUserPlaylists.length === 0 ? 0 : undefined} onClick={onCloseAddToPlaylist} style={{ justifyContent: "center" }}>
          <span>Cancel</span>
        </InteractiveRow>
      </Focusable>
    </div>
  );
}
