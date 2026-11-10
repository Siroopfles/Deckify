import { FC } from "react";
import { FaMusic, FaHeart, FaRegHeart } from "react-icons/fa";
import { TrackItem } from "../../types";
import { DeckifyImage } from "./DeckifyImage";
import { InteractiveRow, formatMs } from "./InteractiveRow";

export interface TrackRowItemProps {
  track: TrackItem;
  index: number;
  contextUri?: string;
  allTracks?: TrackItem[];
  onPlayTrack: (uri: string, contextUri?: string, allUris?: string[], startIdx?: number) => void;
  onToggleLike: (trackId?: string) => void;
  onOpenActions: (track: TrackItem) => void;
  onFocus?: (track: TrackItem) => void;
}

export const TrackRowItem: FC<TrackRowItemProps> = ({
  track,
  index,
  contextUri,
  allTracks,
  onPlayTrack,
  onToggleLike,
  onOpenActions,
  onFocus,
}) => {
  const img = track.artwork_url || track.image_url;
  const allUris = allTracks ? (allTracks.map((x) => x.uri).filter(Boolean) as string[]) : undefined;

  return (
    <InteractiveRow
      key={track.id || track.uri || index}
      onClick={() => onPlayTrack(track.uri || "", contextUri, allUris, index)}
      onFocus={() => onFocus?.(track)}
      style={{ gap: 12 }}
    >
      <span style={{ width: 22, fontSize: 12, opacity: 0.5, textAlign: "right" }}>{index + 1}</span>
      {img ? (
        <DeckifyImage src={img} width={32} height={32} style={{ borderRadius: 4 }} />
      ) : (
        <FaMusic size={14} color="#888" />
      )}
      <div style={{ flex: 1, overflow: "hidden" }}>
        <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {track.name}
        </div>
        <div style={{ fontSize: 11, opacity: 0.6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {track.artist}
        </div>
      </div>
      <span
        onClick={(e) => {
          e.stopPropagation();
          if (track.id) onToggleLike(track.id);
        }}
        style={{ cursor: "pointer", padding: "4px 6px" }}
      >
        {track.is_liked ? <FaHeart size={13} color="#1db954" /> : <FaRegHeart size={13} color="#777" />}
      </span>
      <span style={{ fontSize: 12, opacity: 0.5 }}>{formatMs(track.duration_ms || 0)}</span>

      {/* Action button */}
      <span
        onClick={(e) => {
          e.stopPropagation();
          onOpenActions(track);
        }}
        style={{
          padding: "4px 8px",
          borderRadius: 4,
          background: "rgba(255,255,255,0.08)",
          fontSize: 11,
          color: "#aaa",
        }}
      >
        Options (Y)
      </span>
    </InteractiveRow>
  );
};
