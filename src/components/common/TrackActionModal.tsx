import { FC, MutableRefObject, useEffect, useRef, useState } from "react";
import { Focusable, TextField } from "@decky/ui";
import {
  FaArrowsAltV,
  FaBroadcastTower,
  FaCompactDisc,
  FaFolder,
  FaHeart,
  FaListUl,
  FaPlay,
  FaPlus,
  FaTimes,
  FaTrash,
  FaUser,
} from "react-icons/fa";
import { PlaylistItem, TrackItem, ViewMode } from "../../types";
import { isSpokenContent } from "../../utils/playback";
import { DeckifyImage } from "./DeckifyImage";
import { InteractiveRow } from "./InteractiveRow";

const PLAYLIST_ADD_COUNTS_KEY = "deckify_playlist_add_counts";

export function getPlaylistAddCounts(): Record<string, number> {
  try {
    if (typeof localStorage === "undefined") return {};
    const raw = localStorage.getItem(PLAYLIST_ADD_COUNTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const result: Record<string, number> = {};
    for (const [key, val] of Object.entries(parsed)) {
      if (typeof val === "number" && Number.isFinite(val) && val > 0) {
        result[key] = val;
      }
    }
    return result;
  } catch {
    return {};
  }
}

export function recordPlaylistAddCount(playlistId: string): void {
  if (!playlistId) return;
  try {
    if (typeof localStorage === "undefined") return;
    const counts = getPlaylistAddCounts();
    counts[playlistId] = (counts[playlistId] || 0) + 1;
    localStorage.setItem(PLAYLIST_ADD_COUNTS_KEY, JSON.stringify(counts));
  } catch {
    // Ignore storage errors in restricted environments
  }
}

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
  mode?: ViewMode;
  setMode?: (mode: ViewMode) => void;
  onMoveInQueue?: (track: TrackItem) => void;
  onRemoveFromQueue?: (track: TrackItem) => void;
  onMoveInPlaylist?: (track: TrackItem) => void;
  onCreatePlaylistWithTrack?: (name: string, description: string, trackUri: string) => Promise<void>;
  canReorderPlaylist?: boolean;
  isEditablePlaylist?: boolean;
}

const BACKDROP_STYLE = {
  position: "absolute" as const,
  top: 0,
  left: 0,
  right: 0,
  bottom: 38,
  background: "rgba(0,0,0,0.85)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const CARD_STYLE = {
  background: "#1c1c1c",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 14,
  padding: 20,
  width: 380,
  maxWidth: "90%",
  display: "flex",
  flexDirection: "column" as const,
};

function useTrackModalFocus(
  hasActionTrack: boolean,
  showAddToPlaylistModal: boolean,
  modalContainerRef: MutableRefObject<HTMLDivElement | null>,
  pickerContainerRef: MutableRefObject<HTMLDivElement | null>,
) {
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (hasActionTrack) {
      if (!previousFocusRef.current) {
        previousFocusRef.current = document.activeElement as HTMLElement | null;
      }
      const rafId = requestAnimationFrame(() => {
        const container = showAddToPlaylistModal ? pickerContainerRef.current : modalContainerRef.current;
        const target = container?.querySelector('[tabindex="0"]') as HTMLElement | null;
        target?.focus?.();
      });
      return () => cancelAnimationFrame(rafId);
    } else if (previousFocusRef.current) {
      previousFocusRef.current?.focus?.();
      previousFocusRef.current = null;
    }
    return undefined;
  }, [hasActionTrack, showAddToPlaylistModal, modalContainerRef, pickerContainerRef]);

  useEffect(() => {
    return () => {
      if (previousFocusRef.current) {
        previousFocusRef.current?.focus?.();
        previousFocusRef.current = null;
      }
    };
  }, []);
}

export const TrackActionModal: FC<TrackActionModalProps> = (props) => {
  const { actionTrack, showAddToPlaylistModal } = props;
  const modalContainerRef = useRef<HTMLDivElement | null>(null);
  const pickerContainerRef = useRef<HTMLDivElement | null>(null);
  const [pickerFilter, setPickerFilter] = useState("");
  const [creatingNew, setCreatingNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [createError, setCreateError] = useState("");

  useTrackModalFocus(Boolean(actionTrack), showAddToPlaylistModal, modalContainerRef, pickerContainerRef);

  useEffect(() => {
    if (!showAddToPlaylistModal) {
      setPickerFilter("");
      setCreatingNew(false);
      setNewName("");
      setNewDescription("");
      setCreateError("");
    }
  }, [showAddToPlaylistModal]);

  if (!actionTrack) return null;

  return (
    <>
      {!showAddToPlaylistModal &&
        renderTrackActionsOverlay({
          modalContainerRef, actionTrack, activePlaylist: props.activePlaylist, mode: props.mode,
          isEditablePlaylist: props.isEditablePlaylist, canReorderPlaylist: props.canReorderPlaylist,
          onClose: props.onClose, onPlayTrack: props.onPlayTrack, onAddToQueue: props.onAddToQueue,
          onOpenAddToPlaylist: props.onOpenAddToPlaylist, onStartRadio: props.onStartRadio,
          onOpenArtist: props.onOpenArtist, onOpenAlbum: props.onOpenAlbum,
          onRemoveFromPlaylist: props.onRemoveFromPlaylist, onToggleLike: props.onToggleLike,
          onMoveInQueue: props.onMoveInQueue, onRemoveFromQueue: props.onRemoveFromQueue,
          onMoveInPlaylist: props.onMoveInPlaylist,
        })}

      {showAddToPlaylistModal &&
        renderPlaylistPickerOverlay({
          pickerContainerRef, actionTrack, allUserPlaylists: props.allUserPlaylists,
          pickerFilter, creatingNew, newName, newDescription, createError,
          onPickerFilterChange: setPickerFilter, onToggleCreatingNew: setCreatingNew,
          onNewNameChange: (val) => { setNewName(val); if (createError) setCreateError(""); },
          onNewDescriptionChange: setNewDescription,
          onSubmitCreate: async () => {
            if (!newName.trim()) {
              setCreateError("Playlist name cannot be empty. Enter a name to continue.");
              return;
            }
            await props.onCreatePlaylistWithTrack?.(newName.trim(), newDescription.trim(), actionTrack.uri || "");
            setCreatingNew(false);
            setNewName("");
            setNewDescription("");
            props.onCloseAddToPlaylist();
          },
          onAddTrackToPlaylist: props.onAddTrackToPlaylist,
          onCloseAddToPlaylist: props.onCloseAddToPlaylist,
        })}
    </>
  );
};

interface TrackActionsOverlayArgs {
  modalContainerRef: MutableRefObject<HTMLDivElement | null>;
  actionTrack: TrackItem;
  activePlaylist: PlaylistItem | null;
  mode?: ViewMode;
  isEditablePlaylist?: boolean;
  canReorderPlaylist?: boolean;
  onClose: () => void;
  onPlayTrack: (uri: string) => void;
  onAddToQueue: (track: TrackItem) => void;
  onOpenAddToPlaylist: () => void;
  onStartRadio: (track: TrackItem) => void;
  onOpenArtist: (artist: { id: string; name: string }) => void;
  onOpenAlbum: (album: { id: string; name: string; artist: string; uri: string }) => void;
  onRemoveFromPlaylist?: () => void;
  onToggleLike: (trackId?: string) => void;
  onMoveInQueue?: (track: TrackItem) => void;
  onRemoveFromQueue?: (track: TrackItem) => void;
  onMoveInPlaylist?: (track: TrackItem) => void;
}

function renderTrackActionsHeader(actionTrack: TrackItem) {
  const coverSrc = actionTrack.artwork_url || actionTrack.image_url || undefined;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
      {coverSrc && <DeckifyImage src={coverSrc} width={44} height={44} style={{ borderRadius: 6 }} />}
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
  const artistLabel = isSpoken ? `Go to Show (${actionTrack.artist})` : `Go to Artist (${actionTrack.artist})`;
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

function renderContextualContextRows({
  actionTrack, activePlaylist, mode, isEditablePlaylist, canReorderPlaylist,
  onClose, onMoveInQueue, onRemoveFromQueue, onMoveInPlaylist, onRemoveFromPlaylist,
}: Pick<
  TrackActionsOverlayArgs,
  | "actionTrack" | "activePlaylist" | "mode" | "isEditablePlaylist" | "canReorderPlaylist"
  | "onClose" | "onMoveInQueue" | "onRemoveFromQueue" | "onMoveInPlaylist" | "onRemoveFromPlaylist"
>) {
  const editable = isEditablePlaylist ?? (activePlaylist?.is_editable !== false);
  return (
    <>
      {mode === "queue" && (
        <>
          <InteractiveRow onClick={() => { onClose(); onMoveInQueue?.(actionTrack); }} style={{ gap: 10 }}>
            <FaArrowsAltV size={12} color="var(--deckify-accent, #1DB954)" />
            <span>Move in Queue</span>
          </InteractiveRow>
          <InteractiveRow onClick={() => { onClose(); onRemoveFromQueue?.(actionTrack); }} style={{ gap: 10, color: "#ff5555" }}>
            <FaTimes size={12} color="#ff5555" />
            <span>Remove from Queue</span>
          </InteractiveRow>
        </>
      )}
      {mode === "playlists" && editable && (
        <>
          {canReorderPlaylist !== false && (
            <InteractiveRow onClick={() => { onClose(); onMoveInPlaylist?.(actionTrack); }} style={{ gap: 10 }}>
              <FaArrowsAltV size={12} color="var(--deckify-accent, #1DB954)" />
              <span>Move Track</span>
            </InteractiveRow>
          )}
          <InteractiveRow onClick={() => { onClose(); onRemoveFromPlaylist?.(); }} style={{ gap: 10, color: "#ff5555" }}>
            <FaTrash size={12} color="#ff5555" />
            <span>Remove from Playlist</span>
          </InteractiveRow>
        </>
      )}
      {mode !== "playlists" && activePlaylist && onRemoveFromPlaylist && (
        <InteractiveRow onClick={onRemoveFromPlaylist} style={{ gap: 10, color: "#ff5555" }}>
          <FaTrash size={12} color="#ff5555" />
          <span>Remove from &apos;{activePlaylist.name}&apos;</span>
        </InteractiveRow>
      )}
    </>
  );
}

function renderTrackActionsOverlay(args: TrackActionsOverlayArgs) {
  const { actionTrack } = args;
  const isSpoken = isSpokenContent(actionTrack);
  return (
    <div ref={args.modalContainerRef} data-testid="track-action-modal" style={{ ...BACKDROP_STYLE, zIndex: 100 }}>
      <Focusable flow-children="column" style={{ ...CARD_STYLE, gap: 8 }}>
        {renderTrackActionsHeader(actionTrack)}
        <InteractiveRow tabIndex={0} onClick={() => args.onPlayTrack(actionTrack.uri || "")} style={{ gap: 10 }}>
          <FaPlay size={12} color="var(--deckify-accent, #1DB954)" />
          <span>{isSpoken ? "Play Episode" : "Play Track"}</span>
        </InteractiveRow>
        <InteractiveRow onClick={() => args.onAddToQueue(actionTrack)} style={{ gap: 10 }}>
          <FaListUl size={12} />
          <span>Add to Queue</span>
        </InteractiveRow>
        <InteractiveRow onClick={args.onOpenAddToPlaylist} style={{ gap: 10 }}>
          <FaFolder size={12} />
          <span>Add to Playlist...</span>
        </InteractiveRow>
        {!isSpoken && (
          <InteractiveRow onClick={() => args.onStartRadio(actionTrack)} style={{ gap: 10 }}>
            <FaBroadcastTower size={12} color="var(--deckify-accent, #1DB954)" />
            <span>Start Song Radio</span>
          </InteractiveRow>
        )}
        {renderTrackNavigationRows({
          actionTrack,
          isSpoken,
          onClose: args.onClose,
          onOpenArtist: args.onOpenArtist,
          onOpenAlbum: args.onOpenAlbum,
        })}
        {renderContextualContextRows(args)}
        <InteractiveRow onClick={() => args.onToggleLike(actionTrack.id)} style={{ gap: 10 }}>
          <FaHeart size={12} color="var(--deckify-accent, #1DB954)" />
          <span>Toggle Favorite (Like)</span>
        </InteractiveRow>
        <InteractiveRow onClick={args.onClose} style={{ justifyContent: "center", marginTop: 4 }}>
          <span>Close (B)</span>
        </InteractiveRow>
      </Focusable>
    </div>
  );
}

function renderInlineNewPlaylistForm({
  newName,
  newDescription,
  createError,
  onNewNameChange,
  onNewDescriptionChange,
  onSubmitCreate,
  onCancel,
}: {
  newName: string;
  newDescription: string;
  createError: string;
  onNewNameChange: (val: string) => void;
  onNewDescriptionChange: (val: string) => void;
  onSubmitCreate: () => Promise<void>;
  onCancel: () => void;
}) {
  return (
    <div
      data-testid="picker-new-playlist-form"
      style={{
        padding: 10,
        borderRadius: 8,
        background: "rgba(255,255,255,0.06)",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        marginBottom: 8,
      }}
    >
      <TextField label="Playlist Name" value={newName} onChange={(e) => onNewNameChange(e.target.value)} />
      <TextField label="Description (Optional)" value={newDescription} onChange={(e) => onNewDescriptionChange(e.target.value)} />
      {createError && <div style={{ fontSize: 11, color: "#FF5555", fontWeight: 600 }}>{createError}</div>}
      <Focusable flow-children="horizontal" style={{ display: "flex", gap: 8 }}>
        <InteractiveRow
          onClick={() => void onSubmitCreate()}
          style={{ background: "var(--deckify-accent, #1DB954)", color: "#000", fontWeight: 700, padding: "6px 12px" }}
        >
          Create & Add
        </InteractiveRow>
        <InteractiveRow onClick={onCancel} style={{ padding: "6px 12px" }}>
          Back
        </InteractiveRow>
      </Focusable>
    </div>
  );
}

function renderPlaylistPickerOverlay(args: {
  pickerContainerRef: MutableRefObject<HTMLDivElement | null>;
  actionTrack: TrackItem;
  allUserPlaylists: PlaylistItem[];
  pickerFilter: string;
  creatingNew: boolean;
  newName: string;
  newDescription: string;
  createError: string;
  onPickerFilterChange: (val: string) => void;
  onToggleCreatingNew: (open: boolean) => void;
  onNewNameChange: (val: string) => void;
  onNewDescriptionChange: (val: string) => void;
  onSubmitCreate: () => Promise<void>;
  onAddTrackToPlaylist: (playlistId: string, playlistName: string) => void;
  onCloseAddToPlaylist: () => void;
}) {
  const query = args.pickerFilter.trim().toLowerCase();
  const counts = getPlaylistAddCounts();
  const editablePlaylists = args.allUserPlaylists
    .filter((pl) => pl.is_editable !== false && (!query || (pl.name || "").toLowerCase().includes(query)))
    .sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0));
  const hasPlaylists = editablePlaylists.length > 0;

  return (
    <div ref={args.pickerContainerRef} data-testid="playlist-picker-overlay" style={{ ...BACKDROP_STYLE, zIndex: 101 }}>
      <Focusable flow-children="column" style={{ ...CARD_STYLE, maxHeight: "75%" }}>
        <h3 style={{ margin: "0 0 6px 0", fontSize: 16, fontWeight: 800 }}>Add to Playlist</h3>
        <p style={{ fontSize: 12, opacity: 0.6, margin: "0 0 10px 0" }}>Add &apos;{args.actionTrack.name}&apos; to:</p>
        <div style={{ marginBottom: 8 }}>
          <TextField label="Search playlists" value={args.pickerFilter} onChange={(e) => args.onPickerFilterChange(e.target.value)} />
        </div>
        <InteractiveRow
          onClick={() => args.onToggleCreatingNew(!args.creatingNew)}
          style={{ gap: 10, marginBottom: 8, background: "rgba(var(--deckify-accent-rgb, 29, 185, 84), 0.14)", color: "var(--deckify-accent, #1DB954)", fontWeight: 700 }}
        >
          <FaPlus size={12} />
          <span>+ New Playlist with Track</span>
        </InteractiveRow>
        {args.creatingNew &&
          renderInlineNewPlaylistForm({
            newName: args.newName,
            newDescription: args.newDescription,
            createError: args.createError,
            onNewNameChange: args.onNewNameChange,
            onNewDescriptionChange: args.onNewDescriptionChange,
            onSubmitCreate: args.onSubmitCreate,
            onCancel: () => args.onToggleCreatingNew(false),
          })}
        <Focusable flow-children="column" style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 3, marginBottom: 12 }}>
          {editablePlaylists.map((pl, idx) => (
            <InteractiveRow key={pl.id} tabIndex={idx === 0 ? 0 : undefined} onClick={() => args.onAddTrackToPlaylist(pl.id, pl.name)} style={{ gap: 10 }}>
              <DeckifyImage
                src={pl.image_url}
                width={28}
                height={28}
                style={{ borderRadius: 4, flexShrink: 0 }}
                fallback={<FaFolder size={12} color="var(--deckify-accent, #1DB954)" />}
              />
              <span style={{ fontSize: 13, fontWeight: 600 }}>{pl.name}</span>
            </InteractiveRow>
          ))}
          {!hasPlaylists && (
            <div style={{ textAlign: "center", padding: 20, opacity: 0.5, fontSize: 12 }}>
              {query
                ? `No editable playlists match "${args.pickerFilter.trim()}". Select "+ New Playlist with Track" above to create one.`
                : "No editable playlists found"}
            </div>
          )}
        </Focusable>
        <InteractiveRow tabIndex={!hasPlaylists ? 0 : undefined} onClick={args.onCloseAddToPlaylist} style={{ justifyContent: "center" }}>
          <span>Cancel</span>
        </InteractiveRow>
      </Focusable>
    </div>
  );
}
