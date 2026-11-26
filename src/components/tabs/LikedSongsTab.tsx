import { FC } from "react";
import { Focusable } from "@decky/ui";
import { FaPlay, FaThumbtack } from "react-icons/fa";
import { OfflineDownloadItem, PinnedPlaylistItem, TrackItem } from "../../types";
import { InteractiveRow } from "../common/InteractiveRow";
import { TravelModeBanner } from "../common/OfflineStatusUI";
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
  travelModeEnabled?: boolean;
  onExitTravelMode?: () => void;
  offlineDownloads?: Record<string, OfflineDownloadItem>;
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
  travelModeEnabled,
  onExitTravelMode,
  offlineDownloads,
}) => {
  const collectionDownloaded = offlineDownloads?.["spotify:collection:tracks"]?.offline_state === "downloaded";
  const visibleTracks = travelModeEnabled
    ? collectionDownloaded
      ? likedTracks
      : likedTracks.filter((t) => {
          const uri = t.uri || (t.id ? `spotify:track:${t.id}` : "");
          return uri ? offlineDownloads?.[uri]?.offline_state === "downloaded" : false;
        })
    : likedTracks;

  return (
    <div>
      {travelModeEnabled && <TravelModeBanner onExitTravelMode={onExitTravelMode} />}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Liked Songs</h2>
          <span style={{ fontSize: 12, opacity: 0.6 }}>
            {visibleTracks.length} of {travelModeEnabled ? visibleTracks.length : likedTotal || likedTracks.length} tracks
          </span>
        </div>
        <Focusable flow-children="horizontal" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {visibleTracks.length > 0 && (
            <InteractiveRow
              onClick={() => onPlayTrack("", undefined, visibleTracks.map((t) => t.uri).filter(Boolean) as string[], 0)}
              style={{ background: "var(--deckify-accent, #1DB954)", color: "#000", fontWeight: 700, padding: "8px 16px", borderRadius: 20, gap: 8 }}
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
              background: isPinned ? "rgba(var(--deckify-accent-rgb, 29, 185, 84), 0.16)" : "rgba(255,255,255,0.08)",
              color: isPinned ? "var(--deckify-accent, #1DB954)" : "#fff",
            }}
          >
            <FaThumbtack size={12} />
          </InteractiveRow>
        </Focusable>
      </div>

      {loadingContent && likedTracks.length === 0 ? (
        <p style={{ opacity: 0.5 }}>Loading liked songs...</p>
      ) : travelModeEnabled && visibleTracks.length === 0 ? (
        <div data-testid="travel-mode-empty" style={{ textAlign: "center", padding: "32px 16px", opacity: 0.7, fontSize: 13 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>No offline downloads yet</div>
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            Switch to Official Spotify Client and select &quot;Download for Offline&quot; on any playlist, album, or podcast episode to listen without Wi-Fi.
          </div>
        </div>
      ) : (
        <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {visibleTracks.map((t, idx) => (
            <TrackRowItem
              key={t.id || t.uri || idx}
              track={t}
              index={idx}
              allTracks={visibleTracks}
              onPlayTrack={onPlayTrack}
              onToggleLike={onToggleLike}
              onOpenActions={onOpenActions}
              onFocus={onFocusTrack}
            />
          ))}
          {!travelModeEnabled && likedTotal > likedTracks.length && (
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
