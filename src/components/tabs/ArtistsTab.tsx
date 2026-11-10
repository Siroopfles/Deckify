import { FC } from "react";
import { Focusable } from "@decky/ui";
import { FaUser } from "react-icons/fa";
import { AlbumItem, ArtistItem, TrackItem } from "../../types";
import { DeckifyImage } from "../common/DeckifyImage";
import { InteractiveRow } from "../common/InteractiveRow";
import { TrackRowItem } from "../common/TrackRowItem";

export interface ArtistsTabProps {
  followedArtists: ArtistItem[];
  activeArtist: ArtistItem | null;
  artistTopTracks: TrackItem[];
  artistAlbums: AlbumItem[];
  loadingContent: boolean;
  onOpenArtist: (artist: ArtistItem) => void;
  onCloseArtist: () => void;
  onOpenAlbum: (album: AlbumItem) => void;
  onPlayTrack: (uri: string, contextUri?: string, allUris?: string[], startIdx?: number) => void;
  onToggleLike: (trackId?: string) => void;
  onOpenActions: (track: TrackItem) => void;
  onFocusTrack?: (track: TrackItem) => void;
}

export const ArtistsTab: FC<ArtistsTabProps> = ({
  followedArtists,
  activeArtist,
  artistTopTracks,
  artistAlbums,
  loadingContent,
  onOpenArtist,
  onCloseArtist,
  onOpenAlbum,
  onPlayTrack,
  onToggleLike,
  onOpenActions,
  onFocusTrack,
}) => {
  return (
    <div>
      {!activeArtist ? (
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>Followed Artists</h2>
          {loadingContent && followedArtists.length === 0 ? (
            <p style={{ opacity: 0.5 }}>Loading artists...</p>
          ) : (
            <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {followedArtists.map((art) => (
                <InteractiveRow
                  key={art.id}
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
      ) : (
        <div>
          <Focusable flow-children="horizontal" style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
            <InteractiveRow onClick={onCloseArtist} style={{ padding: "6px 12px", fontSize: 12 }}>
              ← Back (B)
            </InteractiveRow>
            <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>{activeArtist.name}</h2>
          </Focusable>

          <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1db954", marginBottom: 10 }}>Top Tracks</h3>
          <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 20 }}>
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

          <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1db954", marginBottom: 10 }}>Albums & Singles</h3>
          <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {artistAlbums.map((alb) => (
              <InteractiveRow key={alb.id} onClick={() => onOpenAlbum(alb)} style={{ gap: 10 }}>
                {alb.image_url && <DeckifyImage src={alb.image_url} width={30} height={30} style={{ borderRadius: 4 }} />}
                <span style={{ fontSize: 13, fontWeight: 600 }}>{alb.name}</span>
              </InteractiveRow>
            ))}
          </Focusable>
        </div>
      )}
    </div>
  );
};
