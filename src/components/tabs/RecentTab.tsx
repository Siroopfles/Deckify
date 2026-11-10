import { FC } from "react";
import { Focusable } from "@decky/ui";
import { TrackItem } from "../../types";
import { TrackRowItem } from "../common/TrackRowItem";

export interface RecentTabProps {
  recentlyPlayed: TrackItem[];
  loadingContent: boolean;
  onPlayTrack: (uri: string, contextUri?: string, allUris?: string[], startIdx?: number) => void;
  onToggleLike: (trackId?: string) => void;
  onOpenActions: (track: TrackItem) => void;
  onFocusTrack?: (track: TrackItem) => void;
}

export const RecentTab: FC<RecentTabProps> = ({
  recentlyPlayed,
  loadingContent,
  onPlayTrack,
  onToggleLike,
  onOpenActions,
  onFocusTrack,
}) => {
  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>Recently Played</h2>
      {loadingContent && recentlyPlayed.length === 0 ? (
        <p style={{ opacity: 0.5 }}>Loading recently played tracks...</p>
      ) : recentlyPlayed.length === 0 ? (
        <p style={{ opacity: 0.5 }}>No recently played tracks found.</p>
      ) : (
        <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {recentlyPlayed.map((t, idx) => (
            <TrackRowItem
              key={t.id || t.uri || idx}
              track={t}
              index={idx}
              allTracks={recentlyPlayed}
              onPlayTrack={onPlayTrack}
              onToggleLike={onToggleLike}
              onOpenActions={onOpenActions}
              onFocus={onFocusTrack}
            />
          ))}
        </Focusable>
      )}
    </div>
  );
};
