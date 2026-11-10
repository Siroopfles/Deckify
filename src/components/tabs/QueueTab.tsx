import { FC } from "react";
import { Focusable } from "@decky/ui";
import { FaHeart, FaRegHeart } from "react-icons/fa";
import { TrackItem } from "../../types";
import { DeckifyImage } from "../common/DeckifyImage";
import { InteractiveRow, formatMs } from "../common/InteractiveRow";

export interface QueueTabProps {
  queueTracks: TrackItem[];
  handlePlayTrack: (uri: string, contextUri?: string, allUris?: string[], startIdx?: number) => void;
  handleToggleLike: (trackId?: string) => void;
  onFocusTrack?: (track: TrackItem) => void;
}

export const QueueTab: FC<QueueTabProps> = ({
  queueTracks,
  handlePlayTrack,
  handleToggleLike,
  onFocusTrack,
}) => {
  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>Queue</h2>
      {queueTracks.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px", opacity: 0.6 }}>
          Queue is empty. Add songs from your library or search.
        </div>
      ) : (
        <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {queueTracks.map((t, idx) => (
            <InteractiveRow
              key={t.id || idx}
              onClick={() => {
                if (t.uri) {
                  const remaining = queueTracks.slice(idx).map((x) => x.uri).filter(Boolean) as string[];
                  handlePlayTrack(t.uri, undefined, remaining, 0);
                }
              }}
              onFocus={() => onFocusTrack?.(t)}
              style={{ gap: 12 }}
            >
              <span style={{ width: 22, fontSize: 12, opacity: 0.5 }}>{idx + 1}</span>
              {(t.artwork_url || t.image_url) && (
                <DeckifyImage
                  src={t.artwork_url || t.image_url || undefined}
                  width={32}
                  height={32}
                  style={{ borderRadius: 4 }}
                />
              )}
              <div style={{ flex: 1, overflow: "hidden" }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{t.name}</div>
                <div style={{ fontSize: 11, opacity: 0.6 }}>{t.artist}</div>
              </div>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  if (t.id) handleToggleLike(t.id);
                }}
                style={{ cursor: "pointer", padding: "4px 6px" }}
              >
                {t.is_liked ? <FaHeart size={13} color="#1db954" /> : <FaRegHeart size={13} color="#777" />}
              </span>
              <span style={{ fontSize: 12, opacity: 0.5 }}>{formatMs(t.duration_ms || 0)}</span>
            </InteractiveRow>
          ))}
        </Focusable>
      )}
    </div>
  );
};
