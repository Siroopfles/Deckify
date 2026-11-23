import { FC } from "react";
import { Focusable } from "@decky/ui";
import { FaBroadcastTower, FaCompactDisc, FaPlay, FaThumbtack } from "react-icons/fa";
import { AlbumItem, PinnedPlaylistItem, TrackItem } from "../../types";
import { DeckifyImage } from "../common/DeckifyImage";
import { InteractiveRow } from "../common/InteractiveRow";
import { TrackRowItem } from "../common/TrackRowItem";

export interface AlbumsTabProps {
  savedAlbums: AlbumItem[];
  activeAlbum: AlbumItem | null;
  albumTracks: TrackItem[];
  loadingContent: boolean;
  onOpenAlbum: (album: AlbumItem) => void;
  onCloseAlbum: () => void;
  onPlayTrack: (uri: string, contextUri?: string, allUris?: string[], startIdx?: number) => void;
  onToggleLike: (trackId?: string) => void;
  onOpenActions: (track: TrackItem) => void;
  onFocusTrack?: (track: TrackItem) => void;
  pinnedUris?: Set<string>;
  onTogglePin?: (item: PinnedPlaylistItem) => void;
  onFocusCollection?: (item: PinnedPlaylistItem | null) => void;
  onStartAlbumRadio?: (album: AlbumItem) => void;
}

export const AlbumsTab: FC<AlbumsTabProps> = ({
  savedAlbums,
  activeAlbum,
  albumTracks,
  loadingContent,
  onOpenAlbum,
  onCloseAlbum,
  onPlayTrack,
  onToggleLike,
  onOpenActions,
  onFocusTrack,
  pinnedUris,
  onTogglePin,
  onFocusCollection,
  onStartAlbumRadio,
}) => {
  if (activeAlbum) {
    return renderAlbumDetail({
      activeAlbum,
      albumTracks,
      loadingContent,
      onCloseAlbum,
      onPlayTrack,
      onToggleLike,
      onOpenActions,
      onFocusTrack,
      pinnedUris,
      onTogglePin,
      onStartAlbumRadio,
    });
  }

  return (
    <div>
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>Saved Albums</h2>
        {loadingContent && savedAlbums.length === 0 ? (
          <p style={{ opacity: 0.5 }}>Loading albums...</p>
        ) : (
          <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {savedAlbums.map((alb) => (
              <InteractiveRow
                key={alb.id}
                data-deckify-list-item="true"
                data-deckify-label={alb.name || ""}
                onClick={() => onOpenAlbum(alb)}
                onFocus={() =>
                  onFocusCollection?.({
                    uri: alb.uri,
                    name: alb.name,
                    type: "album",
                    image_url: alb.image_url,
                  })
                }
                style={{ gap: 12 }}
              >
                {alb.image_url ? (
                  <DeckifyImage src={alb.image_url} width={38} height={38} style={{ borderRadius: 4 }} />
                ) : (
                  <FaCompactDisc size={20} color="#888" />
                )}
                <div style={{ flex: 1, overflow: "hidden" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {alb.name}
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.6 }}>
                    {alb.artist} · {alb.track_count || 0} tracks
                  </div>
                </div>
                {pinnedUris?.has(alb.uri) && (
                  <FaThumbtack size={12} color="var(--deckify-accent, #1DB954)" style={{ flexShrink: 0 }} title="Pinned to QAM" />
                )}
              </InteractiveRow>
            ))}
          </Focusable>
        )}
      </div>
    </div>
  );
};

function renderAlbumHeader({
  activeAlbum,
  onCloseAlbum,
  onPlayTrack,
  pinnedUris,
  onTogglePin,
  onStartAlbumRadio,
}: Pick<
  AlbumsTabProps,
  "onCloseAlbum" | "onPlayTrack" | "pinnedUris" | "onTogglePin" | "onStartAlbumRadio"
> & { activeAlbum: AlbumItem }) {
  const isPinned = Boolean(pinnedUris?.has(activeAlbum.uri));
  return (
    <Focusable flow-children="horizontal" style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16, flexWrap: "wrap" }}>
      <InteractiveRow onClick={onCloseAlbum} style={{ minHeight: 36, padding: "4px 16px", fontSize: 12 }}>
        ← Back (B)
      </InteractiveRow>
      <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {activeAlbum.name}
        </h2>
        <span style={{ fontSize: 12, opacity: 0.6, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {activeAlbum.artist}
        </span>
      </div>
      <InteractiveRow
        onClick={() => onPlayTrack("", activeAlbum.uri)}
        style={{ marginLeft: "auto", background: "var(--deckify-accent, #1DB954)", color: "#000", fontWeight: 700, padding: "8px 16px", borderRadius: 20, gap: 8, flexShrink: 0 }}
      >
        <FaPlay size={11} /> Play Album
      </InteractiveRow>
      {onStartAlbumRadio && (
        <InteractiveRow
          onClick={() => onStartAlbumRadio(activeAlbum)}
          style={{ background: "rgba(255,255,255,0.08)", color: "#fff", fontWeight: 700, padding: "8px 16px", borderRadius: 20, gap: 6, flexShrink: 0 }}
        >
          <FaBroadcastTower size={12} /> Album Radio
        </InteractiveRow>
      )}
      <InteractiveRow
        aria-label={isPinned ? "Unpin from QAM" : "Pin to QAM"}
        onClick={() => onTogglePin?.({ uri: activeAlbum.uri, name: activeAlbum.name, type: "album", image_url: activeAlbum.image_url })}
        style={{
          padding: "8px 12px", borderRadius: 20, gap: 6, flexShrink: 0,
          background: isPinned ? "rgba(var(--deckify-accent-rgb, 29, 185, 84), 0.16)" : "rgba(255,255,255,0.08)",
          color: isPinned ? "var(--deckify-accent, #1DB954)" : "#fff",
        }}
      >
        <FaThumbtack size={12} />
      </InteractiveRow>
    </Focusable>
  );
}

function renderAlbumDetail({
  activeAlbum,
  albumTracks,
  loadingContent,
  onCloseAlbum,
  onPlayTrack,
  onToggleLike,
  onOpenActions,
  onFocusTrack,
  pinnedUris,
  onTogglePin,
  onStartAlbumRadio,
}: Omit<AlbumsTabProps, "savedAlbums" | "onOpenAlbum" | "onFocusCollection" | "activeAlbum"> & {
  activeAlbum: AlbumItem;
}) {
  return (
    <div>
      {renderAlbumHeader({ activeAlbum, onCloseAlbum, onPlayTrack, pinnedUris, onTogglePin, onStartAlbumRadio })}
      {albumTracks.length === 0 && !loadingContent ? (
        <p style={{ opacity: 0.6, fontSize: 14 }}>No Tracks Available</p>
      ) : (
        <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {albumTracks.map((t, idx) => (
            <TrackRowItem
              key={t.id || t.uri || idx}
              track={t}
              index={idx}
              contextUri={activeAlbum.uri}
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
}
