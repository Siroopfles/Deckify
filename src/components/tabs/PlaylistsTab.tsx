import {
  Dispatch,
  FC,
  MutableRefObject,
  SetStateAction,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Focusable, TextField } from "@decky/ui";
import {
  FaCheck,
  FaEdit,
  FaFolder,
  FaFolderOpen,
  FaMagic,
  FaMusic,
  FaPlay,
  FaPlus,
  FaThumbtack,
  FaTimes,
  FaTrash,
} from "react-icons/fa";
import { assignStableRowKeys, useGrabMoveOrder } from "../../hooks/useGrabMoveOrder";
import { AudioBackend, FolderItem, PinnedPlaylistItem, PlaylistItem, TrackItem } from "../../types";
import { DeckifyImage } from "../common/DeckifyImage";
import { InteractiveRow } from "../common/InteractiveRow";
import { TrackRowItem } from "../common/TrackRowItem";

export interface PlaylistsTabProps {
  folders: FolderItem[];
  allUserPlaylists: PlaylistItem[];
  activePlaylist: PlaylistItem | null;
  playlistTracks: TrackItem[];
  loadingContent: boolean;
  audioBackend: AudioBackend;
  mixingBusy: boolean;
  onOpenPlaylist: (playlist: PlaylistItem) => void;
  onClosePlaylist: () => void;
  onPlayTrack: (uri: string, contextUri?: string, allUris?: string[], startIdx?: number) => void;
  onToggleMix: () => void;
  onToggleLike: (trackId?: string) => void;
  onOpenActions: (track: TrackItem) => void;
  onFocusTrack?: (track: TrackItem) => void;
  pinnedUris?: Set<string>;
  onTogglePin?: (item: PinnedPlaylistItem) => void;
  onFocusCollection?: (item: PinnedPlaylistItem | null) => void;
  onCreatePlaylist: (name: string, description?: string) => Promise<void>;
  onCreateFolder: (name: string) => Promise<void>;
  onRenameFolder: (folderId: string, newName: string) => Promise<void>;
  onDeleteFolder: (folderId: string, folderName: string) => Promise<void>;
  onUpdatePlaylistDetails?: (playlistId: string, name: string, description: string) => Promise<boolean>;
  onDeletePlaylist?: (playlist: PlaylistItem) => Promise<boolean>;
  onReorderPlaylistTrack?: (
    playlistId: string,
    fromIndex: number,
    toIndex: number,
    nextTracks: TrackItem[],
  ) => Promise<boolean>;
  onRemovePlaylistTrack?: (playlistId: string, track: TrackItem, originalIndex: number) => Promise<void>;
  setPlaylistTracks?: Dispatch<SetStateAction<TrackItem[]>>;
  onGrabStateChange?: (grabbing: boolean) => void;
  grabTriggerRef?: MutableRefObject<((track: TrackItem) => void) | null>;
  grabCancelRef?: MutableRefObject<(() => boolean) | null>;
  onModalStateChange?: (open: boolean) => void;
  pendingEditPlaylist?: PlaylistItem | null;
  pendingDeletePlaylist?: PlaylistItem | null;
  onClearPendingPlaylistAction?: () => void;
}

const MODAL_BACKDROP_STYLE = {
  position: "absolute" as const,
  top: 0,
  left: 0,
  right: 0,
  bottom: 38,
  background: "rgba(0,0,0,0.85)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 110,
};

const MODAL_CARD_STYLE = {
  background: "#1c1c1c",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 14,
  padding: 20,
  width: 380,
  maxWidth: "90%",
  display: "flex",
  flexDirection: "column" as const,
  gap: 12,
};

const PILL_BTN_STYLE = {
  padding: "8px 12px",
  borderRadius: 20,
  gap: 6,
  flexShrink: 0,
};

interface PlaylistFormPanelProps {
  title: string;
  submitLabel: string;
  initialName?: string;
  initialDescription?: string;
  onSubmit: (name: string, description: string) => Promise<void>;
  onCancel: () => void;
}

const PlaylistFormPanel: FC<PlaylistFormPanelProps> = ({
  title,
  submitLabel,
  initialName = "",
  initialDescription = "",
  onSubmit,
  onCancel,
}) => {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError("Playlist name cannot be empty. Enter a name to continue.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      await onSubmit(name.trim(), description.trim());
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      data-testid="playlist-form-panel"
      style={{
        marginBottom: 16,
        padding: 12,
        borderRadius: 8,
        background: "rgba(255,255,255,0.06)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700 }}>{title}</div>
      <TextField
        label="Playlist Name"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          if (error) setError("");
        }}
      />
      <TextField
        label="Description (Optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      {error && (
        <div data-testid="playlist-form-error" style={{ fontSize: 12, color: "#FF5555", fontWeight: 600 }}>
          {error}
        </div>
      )}
      <Focusable flow-children="horizontal" style={{ display: "flex", gap: 10, marginTop: 4 }}>
        <InteractiveRow
          onClick={() => void handleSubmit()}
          style={{
            background: "var(--deckify-accent, #1DB954)",
            color: "#000",
            fontWeight: 700,
            padding: "8px 14px",
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? "Saving..." : submitLabel}
        </InteractiveRow>
        <InteractiveRow onClick={onCancel} style={{ padding: "8px 12px" }}>
          Cancel
        </InteractiveRow>
      </Focusable>
    </div>
  );
};

interface PlaylistDeleteConfirmModalProps {
  playlist: PlaylistItem;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

export const PlaylistDeleteConfirmModal: FC<PlaylistDeleteConfirmModalProps> = ({
  playlist,
  onConfirm,
  onCancel,
}) => {
  const modalRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const isEditable = playlist.is_editable !== false;
  const title = isEditable ? "Delete Playlist" : "Unfollow Playlist";
  const confirmLabel = isEditable ? "Delete" : "Unfollow";
  const body = isEditable
    ? `Are you sure you want to delete "${playlist.name}"? This cannot be undone.`
    : `Unfollow "${playlist.name}" from your library?`;

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const rafId = requestAnimationFrame(() => {
      const btn = modalRef.current?.querySelector('[data-testid="playlist-delete-cancel"]') as HTMLElement | null;
      btn?.focus?.();
    });
    return () => {
      cancelAnimationFrame(rafId);
      previousFocusRef.current?.focus?.();
      previousFocusRef.current = null;
    };
  }, []);

  return (
    <div ref={modalRef} data-testid="playlist-delete-modal" style={MODAL_BACKDROP_STYLE}>
      <Focusable flow-children="column" style={MODAL_CARD_STYLE}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{title}</h3>
        <p style={{ margin: 0, fontSize: 13, opacity: 0.8, lineHeight: 1.4 }}>{body}</p>
        <Focusable flow-children="horizontal" style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <InteractiveRow data-testid="playlist-delete-cancel" tabIndex={0} onClick={onCancel} style={{ padding: "8px 16px" }}>
            Cancel
          </InteractiveRow>
          <InteractiveRow
            data-testid="playlist-delete-confirm"
            onClick={() => void onConfirm()}
            style={{ padding: "8px 16px", background: "#FF5555", color: "#fff", fontWeight: 700 }}
          >
            {confirmLabel}
          </InteractiveRow>
        </Focusable>
      </Focusable>
    </div>
  );
};

function matchesQuery(text: string | undefined, query: string): boolean {
  if (!query) return true;
  return (text || "").toLowerCase().includes(query);
}

function filterFolderTree(folder: FolderItem, query: string): FolderItem | null {
  if (!query || matchesQuery(folder.name, query)) return folder;
  const matchingPlaylists = (folder.playlists || []).filter((pl) => matchesQuery(pl.name, query));
  const matchingSubfolders = (folder.subfolders || [])
    .map((sf) => filterFolderTree(sf, query))
    .filter((sf): sf is FolderItem => sf !== null);
  if (matchingPlaylists.length === 0 && matchingSubfolders.length === 0) return null;
  return { ...folder, playlists: matchingPlaylists, subfolders: matchingSubfolders };
}

function collectCategorizedIds(folders: FolderItem[]): Set<string> {
  const ids = new Set<string>();
  const walk = (list: FolderItem[]) => {
    for (const f of list) {
      for (const pl of f.playlists || []) ids.add(pl.id);
      if (f.subfolders) walk(f.subfolders);
    }
  };
  walk(folders);
  return ids;
}

const FolderPlaylistRow: FC<{
  pl: PlaylistItem;
  activePlaylistId?: string;
  pinnedUris?: Set<string>;
  onOpenPlaylist: (pl: PlaylistItem) => void;
  onFocusTrack?: (track: TrackItem) => void;
  onFocusCollection?: (item: PinnedPlaylistItem | null) => void;
}> = ({ pl, activePlaylistId, pinnedUris, onOpenPlaylist, onFocusTrack, onFocusCollection }) => (
  <InteractiveRow
    data-deckify-list-item="true"
    data-deckify-label={pl.name || ""}
    onClick={() => onOpenPlaylist(pl)}
    onFocus={() => {
      onFocusTrack?.(null as unknown as TrackItem);
      onFocusCollection?.({ uri: pl.uri, name: pl.name, type: "playlist", image_url: pl.image_url });
    }}
    active={activePlaylistId === pl.id}
    style={{ padding: "6px 10px" }}
  >
    {pl.image_url ? (
      <DeckifyImage src={pl.image_url} width={24} height={24} style={{ borderRadius: 4, marginRight: 8 }} />
    ) : (
      <FaMusic size={12} color="#888" style={{ marginRight: 8 }} />
    )}
    <span style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pl.name}</span>
    {pinnedUris?.has(pl.uri) && (
      <FaThumbtack size={12} color="var(--deckify-accent, #1DB954)" style={{ marginLeft: 8, flexShrink: 0 }} title="Pinned to QAM" />
    )}
    {pl.is_mixed && (
      <span
        style={{
          fontSize: 10,
          background: "var(--deckify-accent, #1DB954)",
          color: "#000",
          padding: "1px 5px",
          borderRadius: 4,
          fontWeight: 700,
          marginLeft: "auto",
        }}
      >
        MIX
      </span>
    )}
  </InteractiveRow>
);

const FolderRenameInline: FC<{
  value: string;
  onChange: (val: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ value, onChange, onConfirm, onCancel }) => (
  <div style={{ display: "flex", gap: 6, alignItems: "center", marginLeft: 8 }} onClick={(e) => e.stopPropagation()}>
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        background: "#222",
        border: "1px solid var(--deckify-accent, #1DB954)",
        color: "#fff",
        padding: "2px 6px",
        borderRadius: 4,
        fontSize: 12,
      }}
      autoFocus
    />
    <span onClick={onConfirm} style={{ cursor: "pointer", color: "var(--deckify-accent, #1DB954)" }}>
      <FaCheck size={12} />
    </span>
    <span onClick={onCancel} style={{ cursor: "pointer", color: "#888" }}>
      <FaTimes size={12} />
    </span>
  </div>
);

const FolderTreeItem: FC<{
  folder: FolderItem;
  depth: number;
  isOpen: boolean;
  isRenaming: boolean;
  renameFolderName: string;
  activePlaylistId?: string;
  pinnedUris?: Set<string>;
  expandedFolderIds: Set<string>;
  overviewQuery: string;
  renamingFolderId: string | null;
  onToggleFolder: (id: string) => void;
  onStartRename: (id: string, name: string) => void;
  onChangeRename: (val: string) => void;
  onConfirmRename: (id: string) => Promise<void>;
  onCancelRename: () => void;
  onDeleteFolder: (id: string, name: string) => Promise<void>;
  onOpenPlaylist: (pl: PlaylistItem) => void;
  onFocusTrack?: (track: TrackItem) => void;
  onFocusCollection?: (item: PinnedPlaylistItem | null) => void;
}> = (props) => {
  const { folder, depth, isOpen, isRenaming } = props;
  const isCustom = folder.id.startsWith("folder-");
  return (
    <div style={{ marginLeft: depth * 12, marginBottom: 4 }}>
      <InteractiveRow
        data-deckify-list-item="true"
        data-deckify-label={folder.name || ""}
        onClick={() => props.onToggleFolder(folder.id)}
        style={{ marginBottom: 2 }}
      >
        {isOpen ? <FaFolderOpen color="var(--deckify-accent, #1DB954)" size={14} /> : <FaFolder color="#aaa" size={14} />}
        {isRenaming ? (
          <FolderRenameInline
            value={props.renameFolderName}
            onChange={props.onChangeRename}
            onConfirm={() => void props.onConfirmRename(folder.id)}
            onCancel={props.onCancelRename}
          />
        ) : (
          <span style={{ fontSize: 13, fontWeight: 600, marginLeft: 8 }}>{folder.name}</span>
        )}
        <span style={{ fontSize: 11, opacity: 0.5, marginLeft: "auto" }}>{folder.playlists.length}</span>
        {isCustom && !isRenaming && (
          <div style={{ display: "flex", gap: 6, marginLeft: 8 }}>
            <span
              onClick={(e) => {
                e.stopPropagation();
                props.onStartRename(folder.id, folder.name);
              }}
              style={{ padding: "4px", opacity: 0.6, cursor: "pointer" }}
            >
              <FaEdit size={11} color="#aaa" />
            </span>
            <span
              onClick={(e) => {
                e.stopPropagation();
                void props.onDeleteFolder(folder.id, folder.name);
              }}
              style={{ padding: "4px", opacity: 0.6, cursor: "pointer" }}
            >
              <FaTrash size={11} color="#ff5555" />
            </span>
          </div>
        )}
      </InteractiveRow>
      {isOpen && (
        <Focusable flow-children="column" style={{ paddingLeft: 8, display: "flex", flexDirection: "column", gap: 2 }}>
          {folder.subfolders?.map((sf) => (
            <FolderTreeItem
              key={sf.id}
              {...props}
              folder={sf}
              depth={depth + 1}
              isOpen={props.expandedFolderIds.has(sf.id) || Boolean(props.overviewQuery)}
              isRenaming={props.renamingFolderId === sf.id}
            />
          ))}
          {folder.playlists.map((pl) => (
            <FolderPlaylistRow
              key={pl.id}
              pl={pl}
              activePlaylistId={props.activePlaylistId}
              pinnedUris={props.pinnedUris}
              onOpenPlaylist={props.onOpenPlaylist}
              onFocusTrack={props.onFocusTrack}
              onFocusCollection={props.onFocusCollection}
            />
          ))}
        </Focusable>
      )}
    </div>
  );
};

function renderPlaylistDetailHeader({
  activePlaylist,
  playlistUri,
  trackCount,
  audioBackend,
  mixingBusy,
  pinnedUris,
  onClosePlaylist,
  onPlayTrack,
  onTogglePin,
  onToggleMix,
}: {
  activePlaylist: PlaylistItem;
  playlistUri: string;
  trackCount: number;
  audioBackend: AudioBackend;
  mixingBusy: boolean;
  pinnedUris?: Set<string>;
  onClosePlaylist: () => void;
  onPlayTrack: (uri: string, contextUri?: string) => void;
  onTogglePin?: (item: PinnedPlaylistItem) => void;
  onToggleMix: () => void;
}) {
  const isPinned = Boolean(pinnedUris?.has(playlistUri));
  return (
    <Focusable flow-children="horizontal" style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 10 }}>
      <InteractiveRow onClick={onClosePlaylist} style={{ padding: "6px 12px", fontSize: 12, flexShrink: 0 }}>
        ← Back (B)
      </InteractiveRow>
      <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {activePlaylist.name}
        </h2>
        {activePlaylist.description && (
          <div style={{ fontSize: 12, fontWeight: 400, opacity: 0.75, marginTop: 2 }}>{activePlaylist.description}</div>
        )}
        <span style={{ fontSize: 12, opacity: 0.6 }}>{trackCount} tracks</span>
      </div>
      <InteractiveRow
        onClick={() => onPlayTrack("", playlistUri)}
        style={{ ...PILL_BTN_STYLE, marginLeft: "auto", background: "var(--deckify-accent, #1DB954)", color: "#000", fontWeight: 700, padding: "8px 16px" }}
      >
        <FaPlay size={11} /> Play
      </InteractiveRow>
      <InteractiveRow
        aria-label={isPinned ? "Unpin from QAM" : "Pin to QAM"}
        onClick={() => onTogglePin?.({ uri: playlistUri, name: activePlaylist.name, type: "playlist", image_url: activePlaylist.image_url })}
        style={{
          ...PILL_BTN_STYLE,
          background: isPinned ? "rgba(var(--deckify-accent-rgb, 29, 185, 84), 0.16)" : "rgba(255,255,255,0.08)",
          color: isPinned ? "var(--deckify-accent, #1DB954)" : "#fff",
        }}
      >
        <FaThumbtack size={12} />
      </InteractiveRow>
      {audioBackend === "spotify_client" && (
        <InteractiveRow
          onClick={onToggleMix}
          style={{
            ...PILL_BTN_STYLE,
            background: activePlaylist.is_mixed ? "var(--deckify-accent, #1DB954)" : "rgba(255,255,255,0.1)",
            color: activePlaylist.is_mixed ? "#000" : "#fff",
            fontWeight: 700,
            padding: "8px 14px",
          }}
        >
          <FaMagic size={11} /> {mixingBusy ? "Processing..." : activePlaylist.is_mixed ? "Mix Active" : "Enable Mix"}
        </InteractiveRow>
      )}
    </Focusable>
  );
}

function renderPlaylistManageBar(
  isEditable: boolean,
  onStartEdit: () => void,
  onRequestDelete: () => void,
) {
  return (
    <Focusable flow-children="horizontal" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
      {isEditable && (
        <InteractiveRow
          data-testid="edit-playlist-details-btn"
          onClick={onStartEdit}
          style={{ padding: "8px 12px", borderRadius: 20, gap: 6, background: "rgba(255,255,255,0.08)", fontSize: 12 }}
        >
          <FaEdit size={11} /> Edit Details
        </InteractiveRow>
      )}
      <InteractiveRow
        data-testid="delete-playlist-btn"
        onClick={onRequestDelete}
        style={{ padding: "8px 12px", borderRadius: 20, gap: 6, background: "rgba(255,85,85,0.14)", color: "#FF5555", fontSize: 12 }}
      >
        <FaTrash size={11} /> {isEditable ? "Delete Playlist" : "Unfollow Playlist"}
      </InteractiveRow>
    </Focusable>
  );
}

const OverviewHeader: FC<{
  onToggleCreatePlaylist: () => void;
  onToggleCreateFolder: () => void;
}> = ({ onToggleCreatePlaylist, onToggleCreateFolder }) => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
    <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Folders & Playlists</h2>
    <div style={{ display: "flex", gap: 8 }}>
      <InteractiveRow
        onClick={onToggleCreatePlaylist}
        style={{ padding: "6px 12px", background: "var(--deckify-accent, #1DB954)", color: "#000", fontWeight: 700, fontSize: 12, gap: 6 }}
      >
        <FaPlus size={10} /> New Playlist
      </InteractiveRow>
      <InteractiveRow
        onClick={onToggleCreateFolder}
        style={{ padding: "6px 12px", background: "rgba(255,255,255,0.12)", color: "#fff", fontWeight: 700, fontSize: 12, gap: 6 }}
      >
        <FaPlus size={10} /> New Folder
      </InteractiveRow>
    </div>
  </div>
);

const CreateFolderBar: FC<{
  value: string;
  onChange: (val: string) => void;
  onSave: () => Promise<void>;
  onCancel: () => void;
}> = ({ value, onChange, onSave, onCancel }) => (
  <div style={{ marginBottom: 16, padding: 12, borderRadius: 8, background: "rgba(255,255,255,0.06)", display: "flex", gap: 10, alignItems: "center" }}>
    <TextField label="Folder Name" value={value} onChange={(e) => onChange(e.target.value)} />
    <InteractiveRow onClick={() => void onSave()} style={{ background: "var(--deckify-accent, #1DB954)", color: "#000", fontWeight: 700, padding: "8px 14px" }}>
      Save
    </InteractiveRow>
    <InteractiveRow onClick={onCancel} style={{ padding: "8px 12px" }}>
      Cancel
    </InteractiveRow>
  </div>
);

function useGrabWiring({
  activePlaylist,
  trackFilter,
  stableTracks,
  grabTriggerRef,
  grabCancelRef,
  enterGrabMode,
  cancelGrab,
  grabbedKey,
  onGrabStateChange,
}: {
  activePlaylist: PlaylistItem | null;
  trackFilter: string;
  stableTracks: TrackItem[];
  grabTriggerRef?: MutableRefObject<((track: TrackItem) => void) | null>;
  grabCancelRef?: MutableRefObject<(() => boolean) | null>;
  enterGrabMode: (rowKey: string) => void;
  cancelGrab: () => boolean;
  grabbedKey: string | null;
  onGrabStateChange?: (grabbing: boolean) => void;
}) {
  useEffect(() => {
    if (grabTriggerRef) {
      grabTriggerRef.current = (track: TrackItem) => {
        if (activePlaylist?.is_editable === false || trackFilter.trim() !== "") return;
        const match =
          stableTracks.find((item) => item === track || (track._rowKey && item._rowKey === track._rowKey)) ||
          stableTracks.find((item) => (track.uri && item.uri === track.uri) || (track.id && item.id === track.id));
        if (match?._rowKey) enterGrabMode(match._rowKey);
      };
    }
    if (grabCancelRef) grabCancelRef.current = cancelGrab;
  }, [grabTriggerRef, grabCancelRef, stableTracks, enterGrabMode, cancelGrab, activePlaylist, trackFilter]);

  useEffect(() => {
    onGrabStateChange?.(Boolean(grabbedKey));
  }, [grabbedKey, onGrabStateChange]);
}

function renderPlaylistDetailView(props: {
  activePlaylist: PlaylistItem;
  playlistUri: string;
  playlistTracks: TrackItem[];
  stableTracks: TrackItem[];
  loadingContent: boolean;
  audioBackend: AudioBackend;
  mixingBusy: boolean;
  pinnedUris?: Set<string>;
  trackFilter: string;
  editingPlaylist: PlaylistItem | null;
  grabbedKey: string | null;
  onTrackFilterChange: (val: string) => void;
  onClosePlaylist: () => void;
  onPlayTrack: (uri: string, contextUri?: string, allUris?: string[], startIdx?: number) => void;
  onTogglePin?: (item: PinnedPlaylistItem) => void;
  onToggleMix: () => void;
  onToggleLike: (trackId?: string) => void;
  onOpenActions: (track: TrackItem) => void;
  onFocusTrack?: (track: TrackItem) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onUpdatePlaylistDetails?: (playlistId: string, name: string, description: string) => Promise<boolean>;
  onRequestDelete: () => void;
  onGamepadDirection: (e: { detail?: { button?: number }; preventDefault?: () => void; stopPropagation?: () => void }) => boolean;
  onGrabTrack: (track: TrackItem) => void;
  onRemovePlaylistTrack?: (playlistId: string, track: TrackItem, originalIndex: number) => Promise<void>;
}) {
  const { activePlaylist, stableTracks, trackFilter } = props;
  const trackQuery = trackFilter.trim().toLowerCase();
  const isTrackFilterActive = trackQuery !== "";
  const isPlaylistEditable = activePlaylist.is_editable !== false;
  const indexedTracks = stableTracks
    .map((t, originalIndex) => ({ t, originalIndex }))
    .filter(({ t }) => matchesQuery(t.name, trackQuery) || matchesQuery(t.artist, trackQuery));

  return (
    <div>
      {renderPlaylistDetailHeader({
        activePlaylist, playlistUri: props.playlistUri, trackCount: props.playlistTracks.length,
        audioBackend: props.audioBackend, mixingBusy: props.mixingBusy, pinnedUris: props.pinnedUris,
        onClosePlaylist: props.onClosePlaylist, onPlayTrack: props.onPlayTrack, onTogglePin: props.onTogglePin, onToggleMix: props.onToggleMix,
      })}
      {renderPlaylistManageBar(isPlaylistEditable, props.onStartEdit, props.onRequestDelete)}
      {props.editingPlaylist && isPlaylistEditable && (
        <PlaylistFormPanel
          title="Edit Playlist Details" submitLabel="Save Details" initialName={props.editingPlaylist.name}
          initialDescription={props.editingPlaylist.description || ""}
          onSubmit={async (name, description) => { await props.onUpdatePlaylistDetails?.(props.editingPlaylist!.id, name, description); props.onCancelEdit(); }}
          onCancel={props.onCancelEdit}
        />
      )}
      <div style={{ marginBottom: 12 }}>
        <TextField label="Filter tracks" value={trackFilter} onChange={(e) => props.onTrackFilterChange(e.target.value)} />
      </div>
      {props.loadingContent ? (
        <p style={{ opacity: 0.5 }}>Loading...</p>
      ) : indexedTracks.length === 0 && isTrackFilterActive ? (
        <div data-testid="track-filter-empty" style={{ textAlign: "center", padding: "32px 16px", opacity: 0.6, fontSize: 13 }}>
          No tracks match &quot;{trackFilter.trim()}&quot;. Clear the track filter to view all songs.
        </div>
      ) : (
        <Focusable flow-children="column" onGamepadDirection={props.onGamepadDirection} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {indexedTracks.map(({ t, originalIndex }) => (
            <TrackRowItem
              key={t._rowKey || t.id || t.uri || originalIndex}
              track={t} index={originalIndex} contextUri={props.playlistUri} allTracks={props.playlistTracks}
              onPlayTrack={props.onPlayTrack} onToggleLike={props.onToggleLike} onOpenActions={props.onOpenActions}
              onFocus={props.onFocusTrack} isGrabbed={Boolean(props.grabbedKey && t._rowKey === props.grabbedKey)}
              canReorder={isPlaylistEditable && !isTrackFilterActive} canRemove={isPlaylistEditable}
              onGrabTrack={props.onGrabTrack}
              onRemoveTrack={(track, idx) => void props.onRemovePlaylistTrack?.(activePlaylist.id, track, idx)}
            />
          ))}
        </Focusable>
      )}
    </div>
  );
}

const PlaylistsOverview: FC<{
  folders: FolderItem[];
  allUserPlaylists: PlaylistItem[];
  pinnedUris?: Set<string>;
  editingPlaylist: PlaylistItem | null;
  onClearEditing: () => void;
  onCreatePlaylist: (name: string, description?: string) => Promise<void>;
  onUpdatePlaylistDetails?: (playlistId: string, name: string, description: string) => Promise<boolean>;
  onCreateFolder: (name: string) => Promise<void>;
  onRenameFolder: (folderId: string, newName: string) => Promise<void>;
  onDeleteFolder: (folderId: string, folderName: string) => Promise<void>;
  onOpenPlaylist: (playlist: PlaylistItem) => void;
  onFocusTrack?: (track: TrackItem) => void;
  onFocusCollection?: (item: PinnedPlaylistItem | null) => void;
}> = (props) => {
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set());
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameFolderName, setRenameFolderName] = useState("");
  const [overviewFilter, setOverviewFilter] = useState("");

  const overviewQuery = overviewFilter.trim().toLowerCase();
  const categorizedIds = useMemo(() => collectCategorizedIds(props.folders), [props.folders]);
  const filteredFolders = useMemo(
    () => props.folders.map((f) => filterFolderTree(f, overviewQuery)).filter((f): f is FolderItem => f !== null),
    [props.folders, overviewQuery],
  );
  const uncategorized = useMemo(
    () => props.allUserPlaylists.filter((pl) => !categorizedIds.has(pl.id) && matchesQuery(pl.name, overviewQuery)),
    [props.allUserPlaylists, categorizedIds, overviewQuery],
  );

  const toggleFolder = (id: string) =>
    setExpandedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div>
      <OverviewHeader onToggleCreatePlaylist={() => setCreatingPlaylist((v) => !v)} onToggleCreateFolder={() => setCreatingFolder((v) => !v)} />
      <div style={{ marginBottom: 12 }}>
        <TextField label="Filter playlists & folders" value={overviewFilter} onChange={(e) => setOverviewFilter(e.target.value)} />
      </div>
      {creatingPlaylist && (
        <PlaylistFormPanel
          title="New Playlist"
          submitLabel="Create"
          onSubmit={async (name, description) => { await props.onCreatePlaylist(name, description); setCreatingPlaylist(false); }}
          onCancel={() => setCreatingPlaylist(false)}
        />
      )}
      {props.editingPlaylist && (
        <PlaylistFormPanel
          title={`Edit "${props.editingPlaylist.name}"`}
          submitLabel="Save Details"
          initialName={props.editingPlaylist.name}
          initialDescription={props.editingPlaylist.description || ""}
          onSubmit={async (name, description) => { await props.onUpdatePlaylistDetails?.(props.editingPlaylist!.id, name, description); props.onClearEditing(); }}
          onCancel={props.onClearEditing}
        />
      )}
      {creatingFolder && (
        <CreateFolderBar
          value={newFolderName}
          onChange={setNewFolderName}
          onSave={async () => { if (!newFolderName.trim()) return; await props.onCreateFolder(newFolderName.trim()); setNewFolderName(""); setCreatingFolder(false); }}
          onCancel={() => setCreatingFolder(false)}
        />
      )}
      <OverviewLists
        filteredFolders={filteredFolders} uncategorized={uncategorized} overviewFilter={overviewFilter} overviewQuery={overviewQuery}
        expandedFolderIds={expandedFolderIds} renamingFolderId={renamingFolderId} renameFolderName={renameFolderName} pinnedUris={props.pinnedUris}
        onToggleFolder={toggleFolder}
        onStartRename={(id, name) => { setRenamingFolderId(id); setRenameFolderName(name); }}
        onChangeRename={setRenameFolderName}
        onConfirmRename={async (id) => { if (renameFolderName.trim()) await props.onRenameFolder(id, renameFolderName.trim()); setRenamingFolderId(null); }}
        onCancelRename={() => setRenamingFolderId(null)}
        onDeleteFolder={props.onDeleteFolder} onOpenPlaylist={props.onOpenPlaylist} onFocusTrack={props.onFocusTrack} onFocusCollection={props.onFocusCollection}
      />
    </div>
  );
};

const OverviewLists: FC<{
  filteredFolders: FolderItem[];
  uncategorized: PlaylistItem[];
  overviewFilter: string;
  overviewQuery: string;
  expandedFolderIds: Set<string>;
  renamingFolderId: string | null;
  renameFolderName: string;
  pinnedUris?: Set<string>;
  onToggleFolder: (id: string) => void;
  onStartRename: (id: string, name: string) => void;
  onChangeRename: (val: string) => void;
  onConfirmRename: (id: string) => Promise<void>;
  onCancelRename: () => void;
  onDeleteFolder: (id: string, name: string) => Promise<void>;
  onOpenPlaylist: (pl: PlaylistItem) => void;
  onFocusTrack?: (track: TrackItem) => void;
  onFocusCollection?: (item: PinnedPlaylistItem | null) => void;
}> = (props) => (
  <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
    {props.filteredFolders.map((f) => (
      <FolderTreeItem
        key={f.id}
        folder={f}
        depth={0}
        isOpen={props.expandedFolderIds.has(f.id) || Boolean(props.overviewQuery)}
        isRenaming={props.renamingFolderId === f.id}
        renameFolderName={props.renameFolderName}
        pinnedUris={props.pinnedUris}
        expandedFolderIds={props.expandedFolderIds}
        overviewQuery={props.overviewQuery}
        renamingFolderId={props.renamingFolderId}
        onToggleFolder={props.onToggleFolder}
        onStartRename={props.onStartRename}
        onChangeRename={props.onChangeRename}
        onConfirmRename={props.onConfirmRename}
        onCancelRename={props.onCancelRename}
        onDeleteFolder={props.onDeleteFolder}
        onOpenPlaylist={props.onOpenPlaylist}
        onFocusTrack={props.onFocusTrack}
        onFocusCollection={props.onFocusCollection}
      />
    ))}
    {props.uncategorized.length > 0 && (
      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.5, textTransform: "uppercase", marginBottom: 6, letterSpacing: 0.8 }}>
          Uncategorized Playlists ({props.uncategorized.length})
        </div>
        {props.uncategorized.map((pl) => (
          <FolderPlaylistRow
            key={pl.id}
            pl={pl}
            pinnedUris={props.pinnedUris}
            onOpenPlaylist={props.onOpenPlaylist}
            onFocusTrack={props.onFocusTrack}
            onFocusCollection={props.onFocusCollection}
          />
        ))}
      </div>
    )}
    {props.overviewQuery && props.filteredFolders.length === 0 && props.uncategorized.length === 0 && (
      <div data-testid="overview-filter-empty" style={{ textAlign: "center", padding: "32px 16px", opacity: 0.6, fontSize: 13 }}>
        No playlists or folders match &quot;{props.overviewFilter.trim()}&quot;. Clear the filter to view all playlists.
      </div>
    )}
  </Focusable>
);

function usePendingPlaylistEffects({
  activePlaylistId,
  pendingEditPlaylist,
  pendingDeletePlaylist,
  onClearPendingPlaylistAction,
  onModalStateChange,
  confirmDeletePlaylist,
  setEditingPlaylist,
  setConfirmDeletePlaylist,
  setTrackFilter,
}: {
  activePlaylistId?: string;
  pendingEditPlaylist?: PlaylistItem | null;
  pendingDeletePlaylist?: PlaylistItem | null;
  onClearPendingPlaylistAction?: () => void;
  onModalStateChange?: (open: boolean) => void;
  confirmDeletePlaylist: PlaylistItem | null;
  setEditingPlaylist: Dispatch<SetStateAction<PlaylistItem | null>>;
  setConfirmDeletePlaylist: Dispatch<SetStateAction<PlaylistItem | null>>;
  setTrackFilter: Dispatch<SetStateAction<string>>;
}) {
  useEffect(() => {
    if (pendingEditPlaylist && pendingEditPlaylist.is_editable !== false) {
      setEditingPlaylist(pendingEditPlaylist);
      onClearPendingPlaylistAction?.();
    }
  }, [pendingEditPlaylist, onClearPendingPlaylistAction, setEditingPlaylist]);

  useEffect(() => {
    if (pendingDeletePlaylist) {
      setConfirmDeletePlaylist(pendingDeletePlaylist);
      onClearPendingPlaylistAction?.();
    }
  }, [pendingDeletePlaylist, onClearPendingPlaylistAction, setConfirmDeletePlaylist]);

  useEffect(() => {
    onModalStateChange?.(Boolean(confirmDeletePlaylist));
  }, [confirmDeletePlaylist, onModalStateChange]);

  useEffect(() => {
    setTrackFilter("");
    setEditingPlaylist(null);
  }, [activePlaylistId, setTrackFilter, setEditingPlaylist]);
}

export const PlaylistsTab: FC<PlaylistsTabProps> = (props) => {
  const { activePlaylist, playlistTracks, folders, allUserPlaylists } = props;
  const [editingPlaylist, setEditingPlaylist] = useState<PlaylistItem | null>(null);
  const [confirmDeletePlaylist, setConfirmDeletePlaylist] = useState<PlaylistItem | null>(null);
  const [trackFilter, setTrackFilter] = useState("");

  const playlistUri = activePlaylist ? activePlaylist.uri || (activePlaylist.id ? `spotify:playlist:${activePlaylist.id}` : "") : "";
  const stableTracks = useMemo(() => assignStableRowKeys(playlistTracks, "pl"), [playlistTracks]);
  const { grabbedKey, enterGrabMode, commitGrab, cancelGrab, handleGamepadDirection } = useGrabMoveOrder({
    items: stableTracks,
    setItems: props.setPlaylistTracks,
    onCommit: (fromIndex, toIndex, nextTracks) =>
      !activePlaylist || !props.onReorderPlaylistTrack ? true : props.onReorderPlaylistTrack(activePlaylist.id, fromIndex, toIndex, nextTracks),
  });

  useGrabWiring({
    activePlaylist, trackFilter, stableTracks, grabTriggerRef: props.grabTriggerRef,
    grabCancelRef: props.grabCancelRef, enterGrabMode, cancelGrab, grabbedKey, onGrabStateChange: props.onGrabStateChange,
  });

  usePendingPlaylistEffects({
    activePlaylistId: activePlaylist?.id,
    pendingEditPlaylist: props.pendingEditPlaylist,
    pendingDeletePlaylist: props.pendingDeletePlaylist,
    onClearPendingPlaylistAction: props.onClearPendingPlaylistAction,
    onModalStateChange: props.onModalStateChange,
    confirmDeletePlaylist,
    setEditingPlaylist,
    setConfirmDeletePlaylist,
    setTrackFilter,
  });

  return (
    <div>
      {!activePlaylist ? (
        <PlaylistsOverview
          folders={folders} allUserPlaylists={allUserPlaylists} pinnedUris={props.pinnedUris}
          editingPlaylist={editingPlaylist} onClearEditing={() => setEditingPlaylist(null)}
          onCreatePlaylist={props.onCreatePlaylist} onUpdatePlaylistDetails={props.onUpdatePlaylistDetails}
          onCreateFolder={props.onCreateFolder} onRenameFolder={props.onRenameFolder}
          onDeleteFolder={props.onDeleteFolder} onOpenPlaylist={props.onOpenPlaylist}
          onFocusTrack={props.onFocusTrack} onFocusCollection={props.onFocusCollection}
        />
      ) : (
        renderPlaylistDetailView({
          activePlaylist,
          playlistUri,
          playlistTracks,
          stableTracks,
          loadingContent: props.loadingContent,
          audioBackend: props.audioBackend,
          mixingBusy: props.mixingBusy,
          pinnedUris: props.pinnedUris,
          trackFilter,
          editingPlaylist,
          grabbedKey,
          onTrackFilterChange: setTrackFilter,
          onClosePlaylist: props.onClosePlaylist,
          onPlayTrack: props.onPlayTrack,
          onTogglePin: props.onTogglePin,
          onToggleMix: props.onToggleMix,
          onToggleLike: props.onToggleLike,
          onOpenActions: props.onOpenActions,
          onFocusTrack: props.onFocusTrack,
          onStartEdit: () => setEditingPlaylist(activePlaylist),
          onCancelEdit: () => setEditingPlaylist(null),
          onUpdatePlaylistDetails: props.onUpdatePlaylistDetails,
          onRequestDelete: () => setConfirmDeletePlaylist(activePlaylist),
          onGamepadDirection: handleGamepadDirection,
          onGrabTrack: (track) => (grabbedKey === track._rowKey ? void commitGrab() : enterGrabMode(track._rowKey || "")),
          onRemovePlaylistTrack: props.onRemovePlaylistTrack,
        })
      )}
      {confirmDeletePlaylist && (
        <PlaylistDeleteConfirmModal
          playlist={confirmDeletePlaylist}
          onConfirm={async () => { await props.onDeletePlaylist?.(confirmDeletePlaylist); setConfirmDeletePlaylist(null); }}
          onCancel={() => setConfirmDeletePlaylist(null)}
        />
      )}
    </div>
  );
};
