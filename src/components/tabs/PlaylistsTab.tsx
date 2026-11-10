import { FC, useState } from "react";
import { Focusable, TextField } from "@decky/ui";
import {
  FaFolder,
  FaFolderOpen,
  FaPlus,
  FaMusic,
  FaPlay,
  FaMagic,
  FaEdit,
  FaTrash,
  FaCheck,
  FaTimes,
} from "react-icons/fa";
import { FolderItem, PlaylistItem, TrackItem, AudioBackend } from "../../types";
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
  onCreatePlaylist: (name: string) => Promise<void>;
  onCreateFolder: (name: string) => Promise<void>;
  onRenameFolder: (folderId: string, newName: string) => Promise<void>;
  onDeleteFolder: (folderId: string, folderName: string) => Promise<void>;
}

export const PlaylistsTab: FC<PlaylistsTabProps> = ({
  folders,
  allUserPlaylists,
  activePlaylist,
  playlistTracks,
  loadingContent,
  audioBackend,
  mixingBusy,
  onOpenPlaylist,
  onClosePlaylist,
  onPlayTrack,
  onToggleMix,
  onToggleLike,
  onOpenActions,
  onFocusTrack,
  onCreatePlaylist,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
}) => {
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set());
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameFolderName, setRenameFolderName] = useState("");

  const toggleFolder = (id: string) => {
    setExpandedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const categorizedPlaylistIds = new Set<string>();
  const collectPlaylistIds = (fl: FolderItem[]) => {
    for (const f of fl) {
      for (const pl of f.playlists || []) categorizedPlaylistIds.add(pl.id);
      if (f.subfolders) collectPlaylistIds(f.subfolders);
    }
  };
  collectPlaylistIds(folders);
  const uncategorizedPlaylists = allUserPlaylists.filter((pl) => !categorizedPlaylistIds.has(pl.id));

  const renderFolder = (folder: FolderItem, depth = 0) => {
    const isOpen = expandedFolderIds.has(folder.id);
    const isCustom = folder.id.startsWith("folder-");
    const isRenaming = renamingFolderId === folder.id;

    return (
      <div key={folder.id} style={{ marginLeft: depth * 12, marginBottom: 4 }}>
        <InteractiveRow onClick={() => toggleFolder(folder.id)} style={{ marginBottom: 2 }}>
          {isOpen ? <FaFolderOpen color="#1db954" size={14} /> : <FaFolder color="#aaa" size={14} />}
          {isRenaming ? (
            <div
              style={{ display: "flex", gap: 6, alignItems: "center", marginLeft: 8 }}
              onClick={(e) => e.stopPropagation()}
            >
              <input
                value={renameFolderName}
                onChange={(e) => setRenameFolderName(e.target.value)}
                style={{ background: "#222", border: "1px solid #1db954", color: "#fff", padding: "2px 6px", borderRadius: 4, fontSize: 12 }}
                autoFocus
              />
              <span
                onClick={async () => {
                  if (renameFolderName.trim()) {
                    await onRenameFolder(folder.id, renameFolderName.trim());
                  }
                  setRenamingFolderId(null);
                }}
                style={{ cursor: "pointer", color: "#1db954" }}
              >
                <FaCheck size={12} />
              </span>
              <span onClick={() => setRenamingFolderId(null)} style={{ cursor: "pointer", color: "#888" }}>
                <FaTimes size={12} />
              </span>
            </div>
          ) : (
            <span style={{ fontSize: 13, fontWeight: 600, marginLeft: 8 }}>{folder.name}</span>
          )}
          <span style={{ fontSize: 11, opacity: 0.5, marginLeft: "auto" }}>{folder.playlists.length}</span>
          {isCustom && !isRenaming && (
            <div style={{ display: "flex", gap: 6, marginLeft: 8 }}>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  setRenamingFolderId(folder.id);
                  setRenameFolderName(folder.name);
                }}
                style={{ padding: "4px", opacity: 0.6, cursor: "pointer" }}
              >
                <FaEdit size={11} color="#aaa" />
              </span>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteFolder(folder.id, folder.name);
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
            {folder.subfolders?.map((sf) => renderFolder(sf, depth + 1))}
            {folder.playlists.map((pl) => (
              <InteractiveRow
                key={pl.id}
                onClick={() => onOpenPlaylist(pl)}
                active={activePlaylist?.id === pl.id}
                style={{ padding: "6px 10px" }}
              >
                {pl.image_url ? (
                  <DeckifyImage src={pl.image_url} width={24} height={24} style={{ borderRadius: 4, marginRight: 8 }} />
                ) : (
                  <FaMusic size={12} color="#888" style={{ marginRight: 8 }} />
                )}
                <span style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {pl.name}
                </span>
                {pl.is_mixed && (
                  <span style={{ fontSize: 10, background: "#1db954", color: "#000", padding: "1px 5px", borderRadius: 4, fontWeight: 700, marginLeft: "auto" }}>
                    MIX
                  </span>
                )}
              </InteractiveRow>
            ))}
          </Focusable>
        )}
      </div>
    );
  };

  return (
    <div>
      {!activePlaylist ? (
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Folders & Playlists</h2>
            <div style={{ display: "flex", gap: 8 }}>
              <InteractiveRow
                onClick={() => setCreatingPlaylist(!creatingPlaylist)}
                style={{ padding: "6px 12px", background: "#1db954", color: "#000", fontWeight: 700, fontSize: 12, gap: 6 }}
              >
                <FaPlus size={10} /> New Playlist
              </InteractiveRow>
              <InteractiveRow
                onClick={() => setCreatingFolder(!creatingFolder)}
                style={{ padding: "6px 12px", background: "rgba(255,255,255,0.12)", color: "#fff", fontWeight: 700, fontSize: 12, gap: 6 }}
              >
                <FaPlus size={10} /> New Folder
              </InteractiveRow>
            </div>
          </div>

          {creatingPlaylist && (
            <div style={{ marginBottom: 16, padding: 12, borderRadius: 8, background: "rgba(255,255,255,0.06)", display: "flex", gap: 10, alignItems: "center" }}>
              <TextField
                label="Playlist Name"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
              />
              <InteractiveRow
                onClick={async () => {
                  if (newPlaylistName.trim()) {
                    await onCreatePlaylist(newPlaylistName.trim());
                    setNewPlaylistName("");
                    setCreatingPlaylist(false);
                  }
                }}
                style={{ background: "#1db954", color: "#000", fontWeight: 700, padding: "8px 14px" }}
              >
                Create
              </InteractiveRow>
              <InteractiveRow onClick={() => setCreatingPlaylist(false)} style={{ padding: "8px 12px" }}>
                Cancel
              </InteractiveRow>
            </div>
          )}

          {creatingFolder && (
            <div style={{ marginBottom: 16, padding: 12, borderRadius: 8, background: "rgba(255,255,255,0.06)", display: "flex", gap: 10, alignItems: "center" }}>
              <TextField
                label="Folder Name"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
              />
              <InteractiveRow
                onClick={async () => {
                  if (newFolderName.trim()) {
                    await onCreateFolder(newFolderName.trim());
                    setNewFolderName("");
                    setCreatingFolder(false);
                  }
                }}
                style={{ background: "#1db954", color: "#000", fontWeight: 700, padding: "8px 14px" }}
              >
                Save
              </InteractiveRow>
              <InteractiveRow onClick={() => setCreatingFolder(false)} style={{ padding: "8px 12px" }}>
                Cancel
              </InteractiveRow>
            </div>
          )}

          <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {folders.map((f) => renderFolder(f, 0))}

            {uncategorizedPlaylists.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.5, textTransform: "uppercase", marginBottom: 6, letterSpacing: 0.8 }}>
                  Uncategorized Playlists ({uncategorizedPlaylists.length})
                </div>
                {uncategorizedPlaylists.map((pl) => (
                  <InteractiveRow
                    key={pl.id}
                    onClick={() => onOpenPlaylist(pl)}
                    style={{ padding: "6px 10px", marginBottom: 2 }}
                  >
                    {pl.image_url ? (
                      <DeckifyImage src={pl.image_url} width={26} height={26} style={{ borderRadius: 4, marginRight: 8 }} />
                    ) : (
                      <FaMusic size={12} color="#888" style={{ marginRight: 8 }} />
                    )}
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{pl.name}</span>
                    <span style={{ fontSize: 11, opacity: 0.5, marginLeft: "auto" }}>
                      {pl.track_count || 0} tracks
                    </span>
                  </InteractiveRow>
                ))}
              </div>
            )}
          </Focusable>
        </div>
      ) : (
        <div>
          <Focusable
            flow-children="horizontal"
            style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}
          >
            <InteractiveRow onClick={onClosePlaylist} style={{ padding: "6px 12px", fontSize: 12 }}>
              ← Back (B)
            </InteractiveRow>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>{activePlaylist.name}</h2>
              <span style={{ fontSize: 12, opacity: 0.6 }}>{playlistTracks.length} tracks (Fully loaded)</span>
            </div>

            <InteractiveRow
              onClick={() => onPlayTrack("", activePlaylist.uri)}
              style={{
                marginLeft: "auto",
                background: "#1db954",
                color: "#000",
                fontWeight: 700,
                padding: "8px 16px",
                borderRadius: 20,
                gap: 8,
              }}
            >
              <FaPlay size={11} /> Play
            </InteractiveRow>

            {audioBackend === "spotify_client" && (
              <InteractiveRow
                onClick={onToggleMix}
                style={{
                  background: activePlaylist.is_mixed ? "#1db954" : "rgba(255,255,255,0.1)",
                  color: activePlaylist.is_mixed ? "#000" : "#fff",
                  fontWeight: 700,
                  padding: "8px 14px",
                  borderRadius: 20,
                  gap: 8,
                }}
              >
                <FaMagic size={11} /> {mixingBusy ? "Processing..." : activePlaylist.is_mixed ? "Mix Active" : "Enable Mix"}
              </InteractiveRow>
            )}
          </Focusable>

          {loadingContent ? (
            <p style={{ opacity: 0.5 }}>Loading...</p>
          ) : (
            <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {playlistTracks.map((t, idx) => (
                <TrackRowItem
                  key={t.id || t.uri || idx}
                  track={t}
                  index={idx}
                  contextUri={activePlaylist.uri}
                  onPlayTrack={onPlayTrack}
                  onToggleLike={onToggleLike}
                  onOpenActions={onOpenActions}
                  onFocus={onFocusTrack}
                />
              ))}
            </Focusable>
          )}
        </div>
      )}
    </div>
  );
};
