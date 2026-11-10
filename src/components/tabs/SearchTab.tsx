import { FC, useState, useEffect } from "react";
import { Focusable, TextField } from "@decky/ui";
import { callable } from "@decky/api";
import { FaFolder } from "react-icons/fa";
import { AlbumItem, ArtistItem, PlaylistItem, TrackItem } from "../../types";
import { DeckifyImage } from "../common/DeckifyImage";
import { InteractiveRow } from "../common/InteractiveRow";
import { TrackRowItem } from "../common/TrackRowItem";

const backendSearchSpotify = callable<
  [string, string, number],
  {
    ok: boolean;
    tracks?: TrackItem[];
    artists?: ArtistItem[];
    albums?: AlbumItem[];
    playlists?: PlaylistItem[];
    error?: string;
  }
>("search_spotify");

export interface SearchTabProps {
  onPlayTrack: (uri: string, contextUri?: string, allUris?: string[], startIdx?: number) => void;
  onToggleLike: (trackId?: string) => void;
  onOpenActions: (track: TrackItem) => void;
  onOpenPlaylist: (playlist: PlaylistItem) => void;
  onOpenArtist: (artist: ArtistItem) => void;
  onOpenAlbum: (album: AlbumItem) => void;
}

export const SearchTab: FC<SearchTabProps> = ({
  onPlayTrack,
  onToggleLike,
  onOpenActions,
  onOpenPlaylist,
  onOpenArtist,
  onOpenAlbum,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchLimit, setSearchLimit] = useState(25);
  const [searchTab, setSearchTab] = useState<"all" | "tracks" | "artists" | "albums" | "playlists">("all");
  const [searchResults, setSearchResults] = useState<{
    tracks?: TrackItem[];
    artists?: ArtistItem[];
    albums?: AlbumItem[];
    playlists?: PlaylistItem[];
  }>({});

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults({});
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const types = "track,artist,album,playlist";
        const res = await backendSearchSpotify(searchQuery, types, searchLimit);
        if (res.ok) setSearchResults(res);
      } catch {}
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQuery, searchLimit]);

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 14 }}>Search</h2>
      <TextField
        label="Search tracks, artists, albums, playlists..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />

      {/* Filter Tabs */}
      <Focusable flow-children="horizontal" style={{ display: "flex", gap: 8, marginTop: 12, marginBottom: 16 }}>
        {(["all", "tracks", "artists", "albums", "playlists"] as const).map((tab) => (
          <InteractiveRow
            key={tab}
            onClick={() => setSearchTab(tab)}
            active={searchTab === tab}
            style={{ padding: "5px 12px", fontSize: 12, fontWeight: 700, textTransform: "capitalize" }}
          >
            {tab}
          </InteractiveRow>
        ))}
      </Focusable>

      {/* Results: Tracks */}
      {(searchTab === "all" || searchTab === "tracks") && searchResults.tracks && searchResults.tracks.length > 0 && (
        <div style={{ marginTop: 10, marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1db954", marginBottom: 8 }}>Tracks</h3>
          <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {searchResults.tracks.map((t, idx) => (
              <TrackRowItem
                key={t.id || t.uri || idx}
                track={t}
                index={idx}
                allTracks={searchResults.tracks}
                onPlayTrack={onPlayTrack}
                onToggleLike={onToggleLike}
                onOpenActions={onOpenActions}
              />
            ))}
          </Focusable>
        </div>
      )}

      {/* Results: Playlists */}
      {(searchTab === "all" || searchTab === "playlists") && searchResults.playlists && searchResults.playlists.length > 0 && (
        <div style={{ marginTop: 10, marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1db954", marginBottom: 8 }}>Playlists</h3>
          <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {searchResults.playlists.map((pl) => (
              <InteractiveRow key={pl.id} onClick={() => onOpenPlaylist(pl)} style={{ gap: 10 }}>
                {pl.image_url ? (
                  <DeckifyImage src={pl.image_url} width={30} height={30} style={{ borderRadius: 4 }} />
                ) : (
                  <FaFolder size={16} color="#1db954" />
                )}
                <div style={{ flex: 1, overflow: "hidden" }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{pl.name}</div>
                  <div style={{ fontSize: 11, opacity: 0.6 }}>{pl.track_count || 0} tracks</div>
                </div>
              </InteractiveRow>
            ))}
          </Focusable>
        </div>
      )}

      {/* Results: Artists */}
      {(searchTab === "all" || searchTab === "artists") && searchResults.artists && searchResults.artists.length > 0 && (
        <div style={{ marginTop: 10, marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1db954", marginBottom: 8 }}>Artists</h3>
          <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {searchResults.artists.map((art) => (
              <InteractiveRow key={art.id} onClick={() => onOpenArtist(art)} style={{ gap: 10 }}>
                {art.image_url && <DeckifyImage src={art.image_url} width={30} height={30} style={{ borderRadius: "50%" }} />}
                <span style={{ fontSize: 13, fontWeight: 600 }}>{art.name}</span>
              </InteractiveRow>
            ))}
          </Focusable>
        </div>
      )}

      {/* Results: Albums */}
      {(searchTab === "all" || searchTab === "albums") && searchResults.albums && searchResults.albums.length > 0 && (
        <div style={{ marginTop: 10, marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1db954", marginBottom: 8 }}>Albums</h3>
          <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {searchResults.albums.map((alb) => (
              <InteractiveRow key={alb.id} onClick={() => onOpenAlbum(alb)} style={{ gap: 10 }}>
                {alb.image_url && <DeckifyImage src={alb.image_url} width={30} height={30} style={{ borderRadius: 4 }} />}
                <div style={{ flex: 1, overflow: "hidden" }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{alb.name}</div>
                  <div style={{ fontSize: 11, opacity: 0.6 }}>{alb.artist}</div>
                </div>
              </InteractiveRow>
            ))}
          </Focusable>
        </div>
      )}

      {/* Load More Pagination Button */}
      {searchQuery.trim().length > 0 && (
        <InteractiveRow
          onClick={() => setSearchLimit((prev) => prev + 25)}
          style={{ justifyContent: "center", marginTop: 14, padding: "8px 16px", background: "rgba(255,255,255,0.08)", fontSize: 12, fontWeight: 700 }}
        >
          Load More Results
        </InteractiveRow>
      )}
    </div>
  );
};
