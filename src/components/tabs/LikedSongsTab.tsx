import { FC } from "react";
import { Focusable } from "@decky/ui";
import { FaPlay, FaThumbtack } from "react-icons/fa";
import { PinnedPlaylistItem, TrackItem } from "../../types";
import { InteractiveRow } from "../common/InteractiveRow";
import { TrackRowItem } from "../common/TrackRowItem";

export interface LikedSongsTabProps {
  likedTracks: TrackItem[];
  likedTotal: number;
  loadingContent: boolean;
  onPlayTrack: (uri: string, contextUri?: string, allUris?: string[], startIdx?: number) => void;
  onLoadMore: () => void;
  onToggleLike: (trackId?: string) => void;
  onOpenActions: (track: TrackItem) => void;
  onFocusTrack?: (track: TrackItem) => void;
  isPinned?: boolean;
  onTogglePin?: (item: PinnedPlaylistItem) => void;
}

export const LikedSongsTab: FC<LikedSongsTabProps> = ({
  likedTracks,
  likedTotal,
  loadingContent,
  onPlayTrack,
  onLoadMore,
  onToggleLike,
  onOpenActions,
  onFocusTrack,
  isPinned,
  onTogglePin,
}) => {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Liked Songs</h2>
          <span style={{ fontSize: 12, opacity: 0.6 }}>
            {likedTracks.length} of {likedTotal || likedTracks.length} tracks
          </span>
        </div>
        <Focusable flow-children="horizontal" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {likedTracks.length > 0 && (
            <InteractiveRow
              onClick={() => onPlayTrack("", undefined, likedTracks.map((t) => t.uri).filter(Boolean) as string[], 0)}
              style={{ background: "#1db954", color: "#000", fontWeight: 700, padding: "8px 16px", borderRadius: 20, gap: 8 }}
            >
              <FaPlay size={11} /> Play All
            </InteractiveRow>
          )}
          <InteractiveRow
            aria-label={isPinned ? "Unpin from QAM" : "Pin to QAM"}
            onClick={() =>
              onTogglePin?.({
                uri: "spotify:collection:tracks",
                name: "Liked Songs",
                type: "liked_songs",
                image_url: null,
              })
            }
            style={{
              padding: "8px 12px",
              borderRadius: 20,
              gap: 6,
              background: isPinned ? "rgba(29, 185, 84, 0.16)" : "rgba(255,255,255,0.08)",
              color: isPinned ? "#1db954" : "#fff",
            }}
          >
            <FaThumbtack size={12} />
          </InteractiveRow>
        </Focusable>
      </div>

      {loadingContent && likedTracks.length === 0 ? (
        <p style={{ opacity: 0.5 }}>Loading liked songs...</p>
      ) : (
        <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {likedTracks.map((t, idx) => (
            <TrackRowItem
              key={t.id || t.uri || idx}
              track={t}
              index={idx}
              allTracks={likedTracks}
              onPlayTrack={onPlayTrack}
              onToggleLike={onToggleLike}
              onOpenActions={onOpenActions}
              onFocus={onFocusTrack}
            />
          ))}
          {likedTotal > likedTracks.length && (
            <InteractiveRow
              onClick={onLoadMore}
              style={{ marginTop: 12, justifyContent: "center", padding: "12px", background: "rgba(255,255,255,0.06)", fontWeight: 700 }}
            >
              Load More Songs ({likedTracks.length} / {likedTotal})
            </InteractiveRow>
          )}
        </Focusable>
      )}
    </div>
  );
};
