import { FC } from "react";
import { Focusable } from "@decky/ui";
import { FaBroadcastTower, FaUser } from "react-icons/fa";
import { AlbumItem, ArtistItem, TrackItem } from "../../types";
import { DeckifyImage } from "../common/DeckifyImage";
import { InteractiveRow } from "../common/InteractiveRow";
import { TrackRowItem } from "../common/TrackRowItem";

export interface ArtistsTabProps {
  followedArtists: ArtistItem[];
  activeArtist: ArtistItem | null;
  artistTopTracks: TrackItem[];
  artistAlbums: AlbumItem[];
  artistAllTracks?: TrackItem[];
  hasMoreAllTracks?: boolean;
  loadingAllTracks?: boolean;
  loadingContent: boolean;
  onOpenArtist: (artist: ArtistItem) => void;
  onCloseArtist: () => void;
  onOpenAlbum: (album: AlbumItem) => void;
  onPlayTrack: (uri: string, contextUri?: string, allUris?: string[], startIdx?: number) => void;
  onToggleLike: (trackId?: string) => void;
  onOpenActions: (track: TrackItem) => void;
  onFocusTrack?: (track: TrackItem) => void;
  onLoadMoreArtistTracks?: () => void;
  onStartArtistRadio?: (artist: ArtistItem) => void;
}

export const ArtistsTab: FC<ArtistsTabProps> = (props) => {
  const {
    followedArtists,
    activeArtist,
    loadingContent,
    onOpenArtist,
  } = props;

  if (!activeArtist) {
    return (
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>Followed Artists</h2>
        {loadingContent && followedArtists.length === 0 ? (
          <p style={{ opacity: 0.5 }}>Loading artists...</p>
        ) : (
          <Focusable flow-children="column" data-deckify-sorted="az" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {followedArtists.map((art) => (
              <InteractiveRow
                key={art.id}
                data-deckify-list-item="true"
                data-deckify-label={art.name || ""}
                onClick={() => onOpenArtist(art)}
                style={{ gap: 12 }}
              >
                {art.image_url ? (
                  <DeckifyImage src={art.image_url} width={38} height={38} style={{ borderRadius: "50%" }} />
                ) : (
                  <FaUser size={20} color="#888" />
                )}
                <span style={{ fontSize: 14, fontWeight: 700 }}>{art.name}</span>
              </InteractiveRow>
            ))}
          </Focusable>
        )}
      </div>
    );
  }

  return renderArtistDetail({ ...props, activeArtist });
};

function renderArtistHeader({
  activeArtist,
  onCloseArtist,
  onStartArtistRadio,
}: {
  activeArtist: ArtistItem;
  onCloseArtist: () => void;
  onStartArtistRadio?: (artist: ArtistItem) => void;
}) {
  return (
    <Focusable
      flow-children="horizontal"
      style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16, flexWrap: "wrap" }}
    >
      <InteractiveRow onClick={onCloseArtist} style={{ minHeight: 36, padding: "4px 16px", fontSize: 12 }}>
        ← Back (B)
      </InteractiveRow>
      {activeArtist.image_url && (
        <DeckifyImage src={activeArtist.image_url} width={42} height={42} style={{ borderRadius: "50%", flexShrink: 0 }} />
      )}
      <h2
        style={{
          fontSize: 20,
          fontWeight: 700,
          margin: 0,
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {activeArtist.name}
      </h2>
      {onStartArtistRadio && (
        <InteractiveRow
          onClick={() => onStartArtistRadio(activeArtist)}
          style={{
            marginLeft: "auto",
            background: "var(--deckify-accent, #1DB954)",
            color: "#000",
            fontWeight: 700,
            padding: "8px 16px",
            borderRadius: 20,
            gap: 8,
            flexShrink: 0,
          }}
        >
          <FaBroadcastTower size={12} /> Start Artist Radio
        </InteractiveRow>
      )}
    </Focusable>
  );
}

function renderArtistDetail({
  activeArtist,
  artistTopTracks,
  artistAlbums,
  artistAllTracks = [],
  hasMoreAllTracks = false,
  loadingAllTracks = false,
  loadingContent,
  onCloseArtist,
  onOpenAlbum,
  onPlayTrack,
  onToggleLike,
  onOpenActions,
  onFocusTrack,
  onLoadMoreArtistTracks,
  onStartArtistRadio,
}: Omit<ArtistsTabProps, "activeArtist"> & { activeArtist: ArtistItem }) {
  return (
    <div>
      {renderArtistHeader({ activeArtist, onCloseArtist, onStartArtistRadio })}

      <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--deckify-accent, #1DB954)", marginBottom: 10 }}>
        Top Tracks
      </h3>
      {artistTopTracks.length === 0 && !loadingContent ? (
        <p style={{ opacity: 0.6, fontSize: 14, marginBottom: 20 }}>No Tracks Available</p>
      ) : (
        <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 24 }}>
          {artistTopTracks.map((t, idx) => (
            <TrackRowItem
              key={t.id || t.uri || idx}
              track={t}
              index={idx}
              allTracks={artistTopTracks}
              onPlayTrack={onPlayTrack}
              onToggleLike={onToggleLike}
              onOpenActions={onOpenActions}
              onFocus={onFocusTrack}
            />
          ))}
        </Focusable>
      )}

      <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--deckify-accent, #1DB954)", marginBottom: 10 }}>
        Albums & Singles
      </h3>
      <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {artistAlbums.map((alb) => (
          <InteractiveRow
            key={alb.id}
            data-deckify-list-item="true"
            data-deckify-label={alb.name || ""}
            onClick={() => onOpenAlbum(alb)}
            style={{ gap: 10 }}
          >
            {alb.image_url && <DeckifyImage src={alb.image_url} width={30} height={30} style={{ borderRadius: 4 }} />}
            <span style={{ fontSize: 14, fontWeight: 700 }}>{alb.name}</span>
          </InteractiveRow>
        ))}
      </Focusable>

      {renderArtistAllTracks({
        artistAllTracks,
        hasMoreAllTracks,
        loadingAllTracks,
        loadingContent,
        onPlayTrack,
        onToggleLike,
        onOpenActions,
        onFocusTrack,
        onLoadMoreArtistTracks,
      })}
    </div>
  );
}

function renderArtistAllTracks({
  artistAllTracks,
  hasMoreAllTracks,
  loadingAllTracks,
  loadingContent,
  onPlayTrack,
  onToggleLike,
  onOpenActions,
  onFocusTrack,
  onLoadMoreArtistTracks,
}: {
  artistAllTracks: TrackItem[];
  hasMoreAllTracks: boolean;
  loadingAllTracks: boolean;
  loadingContent: boolean;
  onPlayTrack: (uri: string, contextUri?: string, allUris?: string[], startIdx?: number) => void;
  onToggleLike: (trackId?: string) => void;
  onOpenActions: (track: TrackItem) => void;
  onFocusTrack?: (track: TrackItem) => void;
  onLoadMoreArtistTracks?: () => void;
}) {
  return (
    <div style={{ marginTop: 24 }}>
      <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--deckify-accent, #1DB954)", marginBottom: 10 }}>
        All Tracks
      </h3>
      {artistAllTracks.length === 0 && !loadingContent && !loadingAllTracks ? (
        <p style={{ opacity: 0.6, fontSize: 14 }}>No Tracks Available</p>
      ) : (
        <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {artistAllTracks.map((t, idx) => (
            <TrackRowItem
              key={t.id || t.uri || `all-${idx}`}
              track={t}
              index={idx}
              allTracks={artistAllTracks}
              onPlayTrack={onPlayTrack}
              onToggleLike={onToggleLike}
              onOpenActions={onOpenActions}
              onFocus={onFocusTrack}
            />
          ))}
          {hasMoreAllTracks && onLoadMoreArtistTracks && (
            <InteractiveRow
              onClick={onLoadMoreArtistTracks}
              style={{ minHeight: 44, justifyContent: "center", marginTop: 8, fontWeight: 700, fontSize: 12 }}
            >
              <span>{loadingAllTracks ? "Loading more tracks..." : "Load More Tracks"}</span>
            </InteractiveRow>
          )}
        </Focusable>
      )}
    </div>
  );
}
