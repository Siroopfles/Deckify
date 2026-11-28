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
import { stripHtmlTags } from "./DiscoveryTab";
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
import { AudioBackend, FolderItem, OfflineDownloadItem, PinnedPlaylistItem, PlaylistItem, TrackItem } from "../../types";
import { DeckifyImage } from "../common/DeckifyImage";
import { InteractiveRow } from "../common/InteractiveRow";
import {
  OfflineBadge,
  OfflineDownloadButton,
  OfflineProgressBar,
  OfflineTogglePayload,
  TravelModeBanner,
  getItemOfflineInfo,
} from "../common/OfflineStatusUI";
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
    preGrabTracks?: TrackItem[],
  ) => Promise<boolean>;
  onRemovePlaylistTrack?: (playlistId: string, track: TrackItem, originalIndex: number) => Promise<void>;
  setPlaylistTracks?: Dispatch<SetStateAction<TrackItem[]>>;
  onGrabStateChange?: (grabbing: boolean) => void;
  grabTriggerRef?: MutableRefObject<((track: TrackItem) => void) | null>;
  grabCancelRef?: MutableRefObject<(() => boolean) | null>;
  grabCommitRef?: MutableRefObject<(() => Promise<void> | void) | null>;
  onModalStateChange?: (open: boolean) => void;
  pendingEditPlaylist?: PlaylistItem | null;
  pendingDeletePlaylist?: PlaylistItem | null;
  onClearPendingPlaylistAction?: () => void;
  travelModeEnabled?: boolean;
  onExitTravelMode?: () => void;
  offlineDownloads?: Record<string, OfflineDownloadItem>;
  onToggleOfflineDownload?: (item: OfflineTogglePayload) => void;
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
  const latestOnCancelRef = useRef(onCancel);
  latestOnCancelRef.current = onCancel;
  const isEditable = playlist.is_editable !== false;
  const title = isEditable ? "Delete Playlist" : "Unfollow Playlist";
  const confirmLabel = isEditable ? "Delete" : "Unfollow";
  const body = isEditable
    ? `Are you sure you want to delete "${playlist.name}"? This cannot be undone.`
    : `Unfollow "${playlist.name}" from your library?`;

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const el = modalRef.current;
    const handleCancel = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      (e as unknown as { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.();
      latestOnCancelRef.current();
    };
    el?.addEventListener?.("vgp_oncancel", handleCancel);
    const rafId = requestAnimationFrame(() => {
      const btn = modalRef.current?.querySelector('[data-testid="playlist-delete-cancel"]') as HTMLElement | null;
      btn?.focus?.();
    });
    return () => {
      el?.removeEventListener?.("vgp_oncancel", handleCancel);
      cancelAnimationFrame(rafId);
      previousFocusRef.current?.focus?.();
      previousFocusRef.current = null;
    };
  }, []);

  return (
    <div ref={modalRef} data-testid="playlist-delete-modal" style={MODAL_BACKDROP_STYLE}>
      <Focusable flow-children="column" style={MODAL_CARD_STYLE} onCancelButton={() => latestOnCancelRef.current()}>
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

type PlaylistMetaFilter = "all" | "editable" | "followed" | "collaborative" | "pinned";
type TrackMetaFilter = "all" | "liked";
export type PlaylistTrackSort = "custom" | "title" | "artist" | "album" | "duration" | "added_at";

const OVERVIEW_META_CHIPS: ReadonlyArray<{ id: PlaylistMetaFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "editable", label: "Editable" },
  { id: "followed", label: "Followed" },
  { id: "collaborative", label: "Collaborative" },
  { id: "pinned", label: "Pinned" },
];

const TRACK_META_CHIPS: ReadonlyArray<{ id: TrackMetaFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "liked", label: "Liked" },
];

const TRACK_SORT_CHIPS: ReadonlyArray<{ id: PlaylistTrackSort; label: string }> = [
  { id: "custom", label: "Custom Order" },
  { id: "title", label: "Title" },
  { id: "artist", label: "Artist" },
  { id: "album", label: "Album" },
  { id: "duration", label: "Duration" },
  { id: "added_at", label: "Date Added" },
];

function compareTracksBySort(
  a: { t: TrackItem; originalIndex: number },
  b: { t: TrackItem; originalIndex: number },
  sortBy: PlaylistTrackSort,
): number {
  let cmp = 0;
  if (sortBy === "title") {
    cmp = (a.t.name || "").localeCompare(b.t.name || "", undefined, { sensitivity: "base" });
  } else if (sortBy === "artist") {
    cmp = (a.t.artist || "").localeCompare(b.t.artist || "", undefined, { sensitivity: "base" });
  } else if (sortBy === "album") {
    cmp = (a.t.album || "").localeCompare(b.t.album || "", undefined, { sensitivity: "base" });
  } else if (sortBy === "duration") {
    cmp = (a.t.duration_ms || 0) - (b.t.duration_ms || 0);
  } else if (sortBy === "added_at") {
    const aTime = a.t.added_at ? Date.parse(a.t.added_at) || 0 : 0;
    const bTime = b.t.added_at ? Date.parse(b.t.added_at) || 0 : 0;
    cmp = bTime - aTime;
  }
  return cmp !== 0 ? cmp : a.originalIndex - b.originalIndex;
}

function renderMetaFilterBar<T extends string>({
  chips,
  activeId,
  onSelect,
  testId,
  onClear,
}: {
  chips: ReadonlyArray<{ id: T; label: string }>;
  activeId: T;
  onSelect: (id: T) => void;
  testId: string;
  onClear?: () => void;
}) {
  return (
    <Focusable
      flow-children="horizontal"
      data-testid={testId}
      style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}
    >
      {chips.map((chip) => {
        const active = activeId === chip.id;
        return (
          <InteractiveRow
            key={chip.id}
            active={active}
            onClick={() => onSelect(chip.id)}
            style={{
              width: "auto",
              minWidth: "auto",
              minHeight: 32,
              padding: "4px 12px",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: active ? 700 : 500,
              color: active ? "var(--deckify-accent, #1DB954)" : "#fff",
            }}
          >
            {chip.label}
          </InteractiveRow>
        );
      })}
      {onClear && (
        <InteractiveRow
          onClick={onClear}
          style={{
            width: "auto",
            minWidth: "auto",
            minHeight: 32,
            padding: "4px 12px",
            borderRadius: 6,
            fontSize: 12,
            color: "#ccc",
          }}
        >
          Clear
        </InteractiveRow>
      )}
    </Focusable>
  );
}

function matchesQuery(text: string | undefined, query: string): boolean {
  if (!query) return true;
  return (text || "").toLowerCase().includes(query);
}

function matchesPlaylistMeta(
  pl: PlaylistItem,
  metaFilter: PlaylistMetaFilter,
  pinnedUris?: Set<string>,
): boolean {
  if (metaFilter === "editable") return pl.is_editable !== false;
  if (metaFilter === "followed") return pl.is_editable === false;
  if (metaFilter === "collaborative") return Boolean(pl.collaborative);
  if (metaFilter === "pinned") {
    const uri = pl.uri || (pl.id ? `spotify:playlist:${pl.id}` : "");
    return Boolean(pinnedUris?.has(uri));
  }
  return true;
}

interface PlaylistFilterOptions {
  query: string;
  metaFilter: PlaylistMetaFilter;
  pinnedUris?: Set<string>;
  travelModeEnabled?: boolean;
  offlineDownloads?: Record<string, OfflineDownloadItem>;
}

function matchesPlaylist(pl: PlaylistItem, opts: PlaylistFilterOptions): boolean {
  if (opts.travelModeEnabled && getItemOfflineInfo(pl, opts.offlineDownloads).state !== "downloaded") {
    return false;
  }
  if (!matchesPlaylistMeta(pl, opts.metaFilter, opts.pinnedUris)) return false;
  if (!opts.query) return true;
  return matchesQuery(pl.name, opts.query) || matchesQuery(pl.description, opts.query) || matchesQuery(pl.owner_id, opts.query);
}

function filterFolderTree(folder: FolderItem, opts: PlaylistFilterOptions): FolderItem | null {
  if (!opts.query && opts.metaFilter === "all" && !opts.travelModeEnabled) return folder;
  if (!opts.travelModeEnabled && opts.query && opts.metaFilter === "all" && matchesQuery(folder.name, opts.query)) {
    return folder;
  }
  const matchingPlaylists = (folder.playlists || []).filter((pl) => matchesPlaylist(pl, opts));
  const matchingSubfolders = (folder.subfolders || [])
    .map((sf) => filterFolderTree(sf, opts))
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
  offlineDownloads?: Record<string, OfflineDownloadItem>;
  onOpenPlaylist: (pl: PlaylistItem) => void;
  onFocusTrack?: (track: TrackItem) => void;
  onFocusCollection?: (item: PinnedPlaylistItem | null) => void;
}> = ({ pl, activePlaylistId, pinnedUris, offlineDownloads, onOpenPlaylist, onFocusTrack, onFocusCollection }) => {
  const offlineInfo = getItemOfflineInfo(pl, offlineDownloads);
  return (
    <InteractiveRow
      data-deckify-list-item="true"
      data-deckify-label={pl.name || ""}
      onClick={() => onOpenPlaylist(pl)}
      onFocus={() => {
        onFocusTrack?.(null as unknown as TrackItem);
        onFocusCollection?.({ uri: pl.uri, name: pl.name, type: "playlist", image_url: pl.image_url });
      }}
      active={activePlaylistId === pl.id}
      style={{ padding: "6px 10px", gap: 6 }}
    >
      {pl.image_url ? (
        <DeckifyImage src={pl.image_url} width={24} height={24} style={{ borderRadius: 4, marginRight: 2, flexShrink: 0 }} />
      ) : (
        <FaMusic size={12} color="#888" style={{ marginRight: 2, flexShrink: 0 }} />
      )}
      <span style={{ fontSize: 12, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {pl.name}
      </span>
      <OfflineBadge state={offlineInfo.state} progress={offlineInfo.progress} />
      {pinnedUris?.has(pl.uri) && (
        <FaThumbtack size={12} color="var(--deckify-accent, #1DB954)" style={{ flexShrink: 0 }} title="Pinned to QAM" />
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
            flexShrink: 0,
          }}
        >
          MIX
        </span>
      )}
    </InteractiveRow>
  );
};

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
  offlineDownloads?: Record<string, OfflineDownloadItem>;
  expandedFolderIds: Set<string>;
  isOverviewFiltered: boolean;
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
            <InteractiveRow
              aria-label="Rename folder"
              onClick={(e) => {
                e?.stopPropagation?.();
                props.onStartRename(folder.id, folder.name);
              }}
              style={{ width: "auto", minWidth: "auto", padding: "4px 6px", borderRadius: 4 }}
            >
              <FaEdit size={11} color="#aaa" />
            </InteractiveRow>
            <InteractiveRow
              aria-label="Delete folder"
              onClick={(e) => {
                e?.stopPropagation?.();
                void props.onDeleteFolder(folder.id, folder.name);
              }}
              style={{ width: "auto", minWidth: "auto", padding: "4px 6px", borderRadius: 4 }}
            >
              <FaTrash size={11} color="#ff5555" />
            </InteractiveRow>
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
              isOpen={props.expandedFolderIds.has(sf.id) || props.isOverviewFiltered}
              isRenaming={props.renamingFolderId === sf.id}
            />
          ))}
          {folder.playlists.map((pl) => (
            <FolderPlaylistRow
              key={pl.id}
              pl={pl}
              activePlaylistId={props.activePlaylistId}
              pinnedUris={props.pinnedUris}
              offlineDownloads={props.offlineDownloads}
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
  offlineInfo,
  onClosePlaylist,
  onPlayTrack,
  onTogglePin,
  onToggleMix,
  onToggleOfflineDownload,
}: {
  activePlaylist: PlaylistItem;
  playlistUri: string;
  trackCount: number;
  audioBackend: AudioBackend;
  mixingBusy: boolean;
  pinnedUris?: Set<string>;
  offlineInfo: ReturnType<typeof getItemOfflineInfo>;
  onClosePlaylist: () => void;
  onPlayTrack: (uri: string, contextUri?: string) => void;
  onTogglePin?: (item: PinnedPlaylistItem) => void;
  onToggleMix: () => void;
  onToggleOfflineDownload?: (item: OfflineTogglePayload) => void;
}) {
  const isPinned = Boolean(pinnedUris?.has(playlistUri));
  return (
    <div>
      <Focusable flow-children="horizontal" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        <InteractiveRow onClick={onClosePlaylist} style={{ padding: "6px 12px", fontSize: 12, flexShrink: 0 }}>
          ← Back (B)
        </InteractiveRow>
        <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>
              {activePlaylist.name}
            </h2>
            <OfflineBadge state={offlineInfo.state} progress={offlineInfo.progress} />
          </div>
          {activePlaylist.description && (
            <div style={{ fontSize: 12, fontWeight: 400, opacity: 0.75, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {stripHtmlTags(activePlaylist.description)}
            </div>
          )}
          <span style={{ fontSize: 12, opacity: 0.6 }}>{trackCount} tracks</span>
        </div>
        <InteractiveRow
          onClick={() => onPlayTrack("", playlistUri)}
          style={{ ...PILL_BTN_STYLE, marginLeft: "auto", background: "var(--deckify-accent, #1DB954)", color: "#000", fontWeight: 700, padding: "8px 16px" }}
        >
          <FaPlay size={11} /> Play
        </InteractiveRow>
        {onToggleOfflineDownload && (
          <OfflineDownloadButton
            state={offlineInfo.state}
            progress={offlineInfo.progress}
            onClick={() =>
              onToggleOfflineDownload({
                uri: playlistUri,
                name: activePlaylist.name,
                type: "playlist",
                image_url: activePlaylist.image_url,
                isDownloaded: offlineInfo.state === "downloaded",
              })
            }
          />
        )}
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
      {offlineInfo.state === "downloading" && <OfflineProgressBar progress={offlineInfo.progress} />}
    </div>
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
  isTrackFilterActive,
  trackSortBy,
  stableTracks,
  grabTriggerRef,
  grabCancelRef,
  grabCommitRef,
  enterGrabMode,
  cancelGrab,
  commitGrab,
  grabbedKey,
  onGrabStateChange,
}: {
  activePlaylist: PlaylistItem | null;
  isTrackFilterActive: boolean;
  trackSortBy: PlaylistTrackSort;
  stableTracks: TrackItem[];
  grabTriggerRef?: MutableRefObject<((track: TrackItem) => void) | null>;
  grabCancelRef?: MutableRefObject<(() => boolean) | null>;
  grabCommitRef?: MutableRefObject<(() => Promise<void> | void) | null>;
  enterGrabMode: (rowKey: string) => void;
  cancelGrab: () => boolean;
  commitGrab: () => Promise<void>;
  grabbedKey: string | null;
  onGrabStateChange?: (grabbing: boolean) => void;
}) {
  useEffect(() => {
    if (grabTriggerRef) {
      grabTriggerRef.current = (track: TrackItem) => {
        if (activePlaylist?.is_editable === false || isTrackFilterActive || trackSortBy !== "custom") return;
        const match =
          stableTracks.find((item) => item === track || (track._rowKey && item._rowKey === track._rowKey)) ||
          stableTracks.find((item) => (track.uri && item.uri === track.uri) || (track.id && item.id === track.id));
        if (match?._rowKey) enterGrabMode(match._rowKey);
      };
    }
    if (grabCancelRef) grabCancelRef.current = cancelGrab;
    if (grabCommitRef) grabCommitRef.current = commitGrab;
  }, [grabTriggerRef, grabCancelRef, grabCommitRef, stableTracks, enterGrabMode, cancelGrab, commitGrab, activePlaylist, isTrackFilterActive, trackSortBy]);

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
  trackMetaFilter: TrackMetaFilter;
  trackSortBy: PlaylistTrackSort;
  editingPlaylist: PlaylistItem | null;
  grabbedKey: string | null;
  onTrackFilterChange: (val: string) => void;
  onTrackMetaFilterChange: (val: TrackMetaFilter) => void;
  onTrackSortChange: (val: PlaylistTrackSort) => void;
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
  onCommitGrab: () => void;
  onRemovePlaylistTrack?: (playlistId: string, track: TrackItem, originalIndex: number) => Promise<void>;
  offlineDownloads?: Record<string, OfflineDownloadItem>;
  onToggleOfflineDownload?: (item: OfflineTogglePayload) => void;
}) {
  const { activePlaylist, stableTracks, trackFilter, trackMetaFilter, trackSortBy } = props;
  const offlineInfo = getItemOfflineInfo({ ...activePlaylist, uri: props.playlistUri }, props.offlineDownloads);
  const trackQuery = trackFilter.trim().toLowerCase();
  const isTrackFilterActive = trackQuery !== "" || trackMetaFilter !== "all";
  const isPlaylistEditable = activePlaylist.is_editable !== false;
  const filteredTracks = stableTracks
    .map((t, originalIndex) => ({ t, originalIndex }))
    .filter(({ t }) => {
      if (trackMetaFilter === "liked" && !t.is_liked) return false;
      return matchesQuery(t.name, trackQuery) || matchesQuery(t.artist, trackQuery) || matchesQuery(t.album, trackQuery);
    });
  const indexedTracks =
    trackSortBy === "custom"
      ? filteredTracks
      : [...filteredTracks].sort((a, b) => compareTracksBySort(a, b, trackSortBy));

  return (
    <div>
      {renderPlaylistDetailHeader({
        activePlaylist, playlistUri: props.playlistUri, trackCount: props.playlistTracks.length,
        audioBackend: props.audioBackend, mixingBusy: props.mixingBusy, pinnedUris: props.pinnedUris,
        offlineInfo, onClosePlaylist: props.onClosePlaylist, onPlayTrack: props.onPlayTrack,
        onTogglePin: props.onTogglePin, onToggleMix: props.onToggleMix, onToggleOfflineDownload: props.onToggleOfflineDownload,
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
      <div style={{ marginBottom: 8 }}>
        <TextField label="Filter tracks" value={trackFilter} onChange={(e) => props.onTrackFilterChange(e.target.value)} />
      </div>
      {renderMetaFilterBar({
        chips: TRACK_META_CHIPS,
        activeId: trackMetaFilter,
        onSelect: props.onTrackMetaFilterChange,
        testId: "track-meta-filter-bar",
        onClear: isTrackFilterActive
          ? () => {
              props.onTrackFilterChange("");
              props.onTrackMetaFilterChange("all");
            }
          : undefined,
      })}
      {renderMetaFilterBar({
        chips: TRACK_SORT_CHIPS,
        activeId: trackSortBy,
        onSelect: props.onTrackSortChange,
        testId: "track-sort-bar",
      })}
      {props.loadingContent ? (
        <p style={{ opacity: 0.5 }}>Loading...</p>
      ) : indexedTracks.length === 0 && isTrackFilterActive ? (
        <div data-testid="track-filter-empty" style={{ textAlign: "center", padding: "32px 16px", opacity: 0.6, fontSize: 13 }}>
          No tracks match{trackFilter.trim() ? ` "${trackFilter.trim()}"` : " this filter"}. Clear the track filter to view all songs.
        </div>
      ) : (
        <Focusable flow-children="column" onGamepadDirection={props.onGamepadDirection} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {indexedTracks.map(({ t, originalIndex }) => (
            <TrackRowItem
              key={t._rowKey || t.id || t.uri || originalIndex}
              track={t} index={originalIndex} contextUri={props.playlistUri} allTracks={props.playlistTracks}
              onPlayTrack={props.onPlayTrack} onToggleLike={props.onToggleLike} onOpenActions={props.onOpenActions}
              onFocus={props.onFocusTrack}
              hasActiveGrab={Boolean(props.grabbedKey)}
              isGrabbed={Boolean(props.grabbedKey && t._rowKey === props.grabbedKey)}
              canReorder={isPlaylistEditable && !isTrackFilterActive && trackSortBy === "custom"}
              canRemove={isPlaylistEditable}
              onGrabTrack={props.onGrabTrack}
              onCommitGrab={props.onCommitGrab}
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
  travelModeEnabled?: boolean;
  offlineDownloads?: Record<string, OfflineDownloadItem>;
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
  const [overviewMetaFilter, setOverviewMetaFilter] = useState<PlaylistMetaFilter>("all");

  const overviewQuery = overviewFilter.trim().toLowerCase();
  const isOverviewFiltered = overviewQuery !== "" || overviewMetaFilter !== "all";
  const filterOpts: PlaylistFilterOptions = useMemo(
    () => ({
      query: overviewQuery,
      metaFilter: overviewMetaFilter,
      pinnedUris: props.pinnedUris,
      travelModeEnabled: props.travelModeEnabled,
      offlineDownloads: props.offlineDownloads,
    }),
    [overviewQuery, overviewMetaFilter, props.pinnedUris, props.travelModeEnabled, props.offlineDownloads],
  );
  const categorizedIds = useMemo(() => collectCategorizedIds(props.folders), [props.folders]);
  const filteredFolders = useMemo(
    () => props.folders.map((f) => filterFolderTree(f, filterOpts)).filter((f): f is FolderItem => f !== null),
    [props.folders, filterOpts],
  );
  const uncategorized = useMemo(
    () => props.allUserPlaylists.filter((pl) => !categorizedIds.has(pl.id) && matchesPlaylist(pl, filterOpts)),
    [props.allUserPlaylists, categorizedIds, filterOpts],
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
      <div style={{ marginBottom: 8 }}>
        <TextField label="Filter playlists & folders" value={overviewFilter} onChange={(e) => setOverviewFilter(e.target.value)} />
      </div>
      {renderMetaFilterBar({
        chips: OVERVIEW_META_CHIPS,
        activeId: overviewMetaFilter,
        onSelect: setOverviewMetaFilter,
        testId: "overview-meta-filter-bar",
        onClear: isOverviewFiltered
          ? () => {
              setOverviewFilter("");
              setOverviewMetaFilter("all");
            }
          : undefined,
      })}
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
        filteredFolders={filteredFolders} uncategorized={uncategorized} overviewFilter={overviewFilter} isOverviewFiltered={isOverviewFiltered}
        travelModeEnabled={props.travelModeEnabled} offlineDownloads={props.offlineDownloads}
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
  isOverviewFiltered: boolean;
  travelModeEnabled?: boolean;
  offlineDownloads?: Record<string, OfflineDownloadItem>;
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
        isOpen={props.expandedFolderIds.has(f.id) || props.isOverviewFiltered || Boolean(props.travelModeEnabled)}
        isRenaming={props.renamingFolderId === f.id}
        renameFolderName={props.renameFolderName}
        pinnedUris={props.pinnedUris}
        offlineDownloads={props.offlineDownloads}
        expandedFolderIds={props.expandedFolderIds}
        isOverviewFiltered={props.isOverviewFiltered}
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
            offlineDownloads={props.offlineDownloads}
            onOpenPlaylist={props.onOpenPlaylist}
            onFocusTrack={props.onFocusTrack}
            onFocusCollection={props.onFocusCollection}
          />
        ))}
      </div>
    )}
    {props.travelModeEnabled && props.filteredFolders.length === 0 && props.uncategorized.length === 0 && (
      <div data-testid="travel-mode-empty" style={{ textAlign: "center", padding: "32px 16px", opacity: 0.7, fontSize: 13 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>No offline downloads yet</div>
        <div style={{ fontSize: 12, opacity: 0.75 }}>
          Switch to Official Spotify Client and select &quot;Download for Offline&quot; on any playlist, album, or podcast episode to listen without Wi-Fi.
        </div>
      </div>
    )}
    {!props.travelModeEnabled && props.isOverviewFiltered && props.filteredFolders.length === 0 && props.uncategorized.length === 0 && (
      <div data-testid="overview-filter-empty" style={{ textAlign: "center", padding: "32px 16px", opacity: 0.6, fontSize: 13 }}>
        No playlists or folders match{props.overviewFilter.trim() ? ` "${props.overviewFilter.trim()}"` : " this filter"}. Clear the filter to view all playlists.
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
  setTrackMetaFilter,
  setTrackSortBy,
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
  setTrackMetaFilter: Dispatch<SetStateAction<TrackMetaFilter>>;
  setTrackSortBy: Dispatch<SetStateAction<PlaylistTrackSort>>;
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
    setTrackMetaFilter("all");
    setTrackSortBy("custom");
    setEditingPlaylist(null);
  }, [activePlaylistId, setTrackFilter, setTrackMetaFilter, setTrackSortBy, setEditingPlaylist]);
}

export const PlaylistsTab: FC<PlaylistsTabProps> = (props) => {
  const { activePlaylist, playlistTracks, folders, allUserPlaylists } = props;
  const [editingPlaylist, setEditingPlaylist] = useState<PlaylistItem | null>(null);
  const [confirmDeletePlaylist, setConfirmDeletePlaylist] = useState<PlaylistItem | null>(null);
  const [trackFilter, setTrackFilter] = useState("");
  const [trackMetaFilter, setTrackMetaFilter] = useState<TrackMetaFilter>("all");
  const [trackSortBy, setTrackSortBy] = useState<PlaylistTrackSort>("custom");
  const isTrackFilterActive = trackFilter.trim() !== "" || trackMetaFilter !== "all";

  const playlistUri = activePlaylist ? activePlaylist.uri || (activePlaylist.id ? `spotify:playlist:${activePlaylist.id}` : "") : "";
  const stableTracks = useMemo(() => assignStableRowKeys(playlistTracks, "pl"), [playlistTracks]);
  const { grabbedKey, enterGrabMode, commitGrab, cancelGrab, handleGamepadDirection } = useGrabMoveOrder({
    items: stableTracks,
    setItems: props.setPlaylistTracks,
    onCommit: (fromIndex, toIndex, nextTracks, preGrabSnapshot) =>
      !activePlaylist || !props.onReorderPlaylistTrack
        ? true
        : props.onReorderPlaylistTrack(activePlaylist.id, fromIndex, toIndex, nextTracks, preGrabSnapshot),
  });

  useGrabWiring({
    activePlaylist, isTrackFilterActive, trackSortBy, stableTracks, grabTriggerRef: props.grabTriggerRef,
    grabCancelRef: props.grabCancelRef, grabCommitRef: props.grabCommitRef, enterGrabMode, cancelGrab, commitGrab, grabbedKey, onGrabStateChange: props.onGrabStateChange,
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
    setTrackMetaFilter,
    setTrackSortBy,
  });

  return (
    <div>
      {props.travelModeEnabled && <TravelModeBanner onExitTravelMode={props.onExitTravelMode} />}
      {!activePlaylist ? (
        <PlaylistsOverview
          folders={folders} allUserPlaylists={allUserPlaylists} pinnedUris={props.pinnedUris}
          editingPlaylist={editingPlaylist} onClearEditing={() => setEditingPlaylist(null)}
          travelModeEnabled={props.travelModeEnabled} offlineDownloads={props.offlineDownloads}
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
          trackMetaFilter,
          trackSortBy,
          editingPlaylist,
          grabbedKey,
          onTrackFilterChange: setTrackFilter,
          onTrackMetaFilterChange: setTrackMetaFilter,
          onTrackSortChange: setTrackSortBy,
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
          onCommitGrab: () => { void commitGrab(); },
          onRemovePlaylistTrack: props.onRemovePlaylistTrack,
          offlineDownloads: props.offlineDownloads,
          onToggleOfflineDownload: props.onToggleOfflineDownload,
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
