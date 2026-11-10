import { FC } from "react";
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
  setMode: (mode: ViewMode) => void;
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
  setMode,
}) => {
  if (!actionTrack) return null;

  return (
    <>
      {/* Track Actions Modal */}
      {!showAddToPlaylistModal && (
        <div
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
              {(actionTrack.artwork_url || actionTrack.image_url) && (
                <DeckifyImage
                  src={actionTrack.artwork_url || actionTrack.image_url || undefined}
                  width={44}
                  height={44}
                  style={{ borderRadius: 6 }}
                />
              )}
              <div style={{ overflow: "hidden", flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {actionTrack.name}
                </div>
                <div style={{ fontSize: 12, opacity: 0.6 }}>{actionTrack.artist}</div>
              </div>
            </div>

            <InteractiveRow onClick={() => onPlayTrack(actionTrack.uri || "")} style={{ gap: 10 }}>
              <FaPlay size={12} color="#1db954" />
              <span>Play Track</span>
            </InteractiveRow>

            <InteractiveRow onClick={() => onAddToQueue(actionTrack)} style={{ gap: 10 }}>
              <FaListUl size={12} />
              <span>Add to Queue</span>
            </InteractiveRow>

            <InteractiveRow onClick={onOpenAddToPlaylist} style={{ gap: 10 }}>
              <FaFolder size={12} />
              <span>Add to Playlist...</span>
            </InteractiveRow>

            <InteractiveRow onClick={() => onStartRadio(actionTrack)} style={{ gap: 10 }}>
              <FaBroadcastTower size={12} color="#1db954" />
              <span>Start Track Radio</span>
            </InteractiveRow>

            {/* Go to Artist */}
            {(actionTrack.artist_id || actionTrack.artist) && (
              <InteractiveRow
                onClick={() => {
                  onClose();
                  setMode("artists");
                  onOpenArtist({ id: actionTrack.artist_id || "", name: actionTrack.artist || "" });
                }}
                style={{ gap: 10 }}
              >
                <FaUser size={12} />
                <span>Go to Artist ({actionTrack.artist})</span>
              </InteractiveRow>
            )}

            {/* Go to Album */}
            {actionTrack.album_id && (
              <InteractiveRow
                onClick={() => {
                  onClose();
                  setMode("albums");
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

            {/* Remove from this Playlist (if inside active playlist) */}
            {activePlaylist && onRemoveFromPlaylist && (
              <InteractiveRow onClick={onRemoveFromPlaylist} style={{ gap: 10, color: "#ff5555" }}>
                <FaTrash size={12} color="#ff5555" />
                <span>Remove from &apos;{activePlaylist.name}&apos;</span>
              </InteractiveRow>
            )}

            <InteractiveRow onClick={() => onToggleLike(actionTrack.id)} style={{ gap: 10 }}>
              <FaHeart size={12} color="#1db954" />
              <span>Toggle Favorite (Like)</span>
            </InteractiveRow>

            <InteractiveRow onClick={onClose} style={{ justifyContent: "center", marginTop: 4 }}>
              <span>Close (B)</span>
            </InteractiveRow>
          </Focusable>
        </div>
      )}

      {/* Add to Playlist Picker Modal */}
      {showAddToPlaylistModal && (
        <div
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
              {allUserPlaylists.map((pl) => (
                <InteractiveRow
                  key={pl.id}
                  onClick={() => onAddTrackToPlaylist(pl.id, pl.name)}
                  style={{ gap: 10 }}
                >
                  <FaFolder size={12} color="#1db954" />
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{pl.name}</span>
                </InteractiveRow>
              ))}
              {allUserPlaylists.length === 0 && (
                <div style={{ textAlign: "center", padding: 20, opacity: 0.5, fontSize: 12 }}>
                  No editable playlists found
                </div>
              )}
            </Focusable>

            <InteractiveRow onClick={onCloseAddToPlaylist} style={{ justifyContent: "center" }}>
              <span>Cancel</span>
            </InteractiveRow>
          </Focusable>
        </div>
      )}
    </>
  );
};
