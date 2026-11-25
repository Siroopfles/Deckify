import { FC, ReactNode, useState, useEffect, useRef, useCallback } from "react";
import { Focusable, TextField } from "@decky/ui";
import { callable } from "@decky/api";
import {
  FaBolt,
  FaCompactDisc,
  FaCoffee,
  FaFire,
  FaFolder,
  FaGamepad,
  FaHeadphones,
  FaHeart,
  FaLeaf,
  FaMoon,
  FaMusic,
  FaPodcast,
  FaRocket,
  FaStar,
} from "react-icons/fa";
import {
  AlbumItem,
  ArtistItem,
  EpisodeItem,
  PlaylistItem,
  SearchBrowseCategoriesResponse,
  SearchBrowseCategory,
  SearchFilterTab,
  SearchResults,
  ShowItem,
  TrackItem,
} from "../../types";
import { DeckifyImage } from "../common/DeckifyImage";
import { InteractiveRow } from "../common/InteractiveRow";
import { TrackRowItem } from "../common/TrackRowItem";
import { EpisodeRow } from "./PodcastsTab";

const backendSearchSpotify = callable<
  [string, string, number, number?],
  {
    ok: boolean;
    tracks?: TrackItem[];
    artists?: ArtistItem[];
    albums?: AlbumItem[];
    playlists?: PlaylistItem[];
    shows?: ShowItem[];
    episodes?: EpisodeItem[];
    error?: string;
  }
>("search_spotify");

const getSearchBrowseCategories = callable<[], SearchBrowseCategoriesResponse>(
  "get_search_browse_categories",
);

const SEARCH_TYPES = "track,artist,album,playlist,show,episode";
const SEARCH_PAGE_LIMIT = 10;

type SearchSectionKey = Exclude<SearchFilterTab, "all">;
type SearchApiEntityType = "track" | "playlist" | "artist" | "album" | "show" | "episode";

const SECTION_CONFIG: Record<
  SearchSectionKey,
  { apiType: SearchApiEntityType; resultKey: keyof SearchResults; label: string }
> = {
  tracks: { apiType: "track", resultKey: "tracks", label: "Load More Tracks" },
  playlists: { apiType: "playlist", resultKey: "playlists", label: "Load More Playlists" },
  artists: { apiType: "artist", resultKey: "artists", label: "Load More Artists" },
  albums: { apiType: "album", resultKey: "albums", label: "Load More Albums" },
  podcasts: { apiType: "show", resultKey: "shows", label: "Load More Podcasts" },
  episodes: { apiType: "episode", resultKey: "episodes", label: "Load More Episodes" },
};

const SEARCH_SECTIONS = Object.keys(SECTION_CONFIG) as SearchSectionKey[];

const FILTER_CHIPS: readonly SearchFilterTab[] = [
  "all",
  "tracks",
  "artists",
  "albums",
  "playlists",
  "podcasts",
  "episodes",
];

export interface GamingMoodTile {
  id: string;
  label: string;
  query: string;
  tint: string;
}

export const GAMING_MOOD_TILES: readonly GamingMoodTile[] = [
  { id: "epic_gaming", label: "Epic Gaming", query: "epic gaming soundtrack", tint: "rgba(29, 185, 84, 0.16)" },
  { id: "rpg_soundtracks", label: "RPG Soundtracks", query: "rpg video game soundtrack", tint: "rgba(139, 92, 246, 0.16)" },
  { id: "synthwave", label: "Synthwave", query: "synthwave", tint: "rgba(236, 72, 153, 0.16)" },
  { id: "lofi_beats", label: "Lo-Fi Beats", query: "lofi beats", tint: "rgba(59, 130, 246, 0.16)" },
  { id: "chill_vibes", label: "Chill Vibes", query: "chill vibes", tint: "rgba(20, 184, 166, 0.16)" },
  { id: "deep_focus", label: "Deep Focus", query: "deep focus instrumental", tint: "rgba(99, 102, 241, 0.16)" },
  { id: "workout", label: "Workout", query: "workout high energy", tint: "rgba(249, 115, 22, 0.16)" },
  { id: "boss_fight_metal", label: "Boss Fight Metal", query: "heavy metal gaming", tint: "rgba(239, 68, 68, 0.16)" },
  { id: "cyberpunk", label: "Cyberpunk", query: "cyberpunk electronic", tint: "rgba(234, 179, 8, 0.16)" },
  { id: "cozy_indie", label: "Cozy Indie", query: "cozy indie folk", tint: "rgba(16, 185, 129, 0.16)" },
  { id: "retro_8bit", label: "Retro 8-Bit", query: "chiptune 8-bit", tint: "rgba(168, 85, 247, 0.16)" },
  { id: "ambient", label: "Ambient", query: "ambient space", tint: "rgba(14, 165, 233, 0.16)" },
];

function renderTileIcon(id: string) {
  switch (id) {
    case "epic_gaming":
      return <FaGamepad size={18} style={{ flexShrink: 0, color: "var(--deckify-accent, #1DB954)" }} />;
    case "rpg_soundtracks":
      return <FaStar size={16} style={{ flexShrink: 0, color: "#a78bfa" }} />;
    case "synthwave":
      return <FaCompactDisc size={16} style={{ flexShrink: 0, color: "#f472b6" }} />;
    case "lofi_beats":
      return <FaHeadphones size={16} style={{ flexShrink: 0, color: "#60a5fa" }} />;
    case "chill_vibes":
      return <FaLeaf size={16} style={{ flexShrink: 0, color: "#2dd4bf" }} />;
    case "deep_focus":
      return <FaCoffee size={16} style={{ flexShrink: 0, color: "#818cf8" }} />;
    case "workout":
      return <FaFire size={16} style={{ flexShrink: 0, color: "#fb923c" }} />;
    case "boss_fight_metal":
      return <FaBolt size={16} style={{ flexShrink: 0, color: "#f87171" }} />;
    case "cyberpunk":
      return <FaRocket size={16} style={{ flexShrink: 0, color: "#facc15" }} />;
    case "cozy_indie":
      return <FaHeart size={16} style={{ flexShrink: 0, color: "#34d399" }} />;
    case "retro_8bit":
      return <FaMusic size={16} style={{ flexShrink: 0, color: "#c084fc" }} />;
    default:
      return <FaMoon size={16} style={{ flexShrink: 0, color: "#38bdf8" }} />;
  }
}

export interface SearchTabProps {
  onPlayTrack: (uri: string, contextUri?: string, allUris?: string[], startIdx?: number) => void;
  onToggleLike: (trackId?: string) => void;
  onOpenActions: (track: TrackItem) => void;
  onOpenPlaylist: (playlist: PlaylistItem) => void;
  onOpenArtist: (artist: ArtistItem) => void;
  onOpenAlbum: (album: AlbumItem) => void;
  onOpenShow?: (show: ShowItem) => void;
  showToast?: (msg: string) => void;
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
  searchTab?: SearchFilterTab;
  onSearchTabChange?: (tab: SearchFilterTab) => void;
  searchResults?: SearchResults;
  onSearchResultsChange?: (results: SearchResults) => void;
  tileSearchMode?: boolean;
  onTileSearchModeChange?: (val: boolean) => void;
  searchHistory?: string[];
  onUpdateSearchHistory?: (next: string[]) => void;
  onFocusHistoryPill?: (query: string | null) => void;
}

const RecentSearchesSection: FC<{
  searchHistory: string[];
  onSelectHistory: (q: string) => void;
  onRemoveHistory: (q: string) => void;
  onClearHistory: () => void;
  onFocusHistoryPill?: (query: string | null) => void;
}> = ({ searchHistory, onSelectHistory, onRemoveHistory, onClearHistory, onFocusHistoryPill }) => {
  const visibleHistory = searchHistory.slice(0, 10);
  if (visibleHistory.length === 0) return null;

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Recent Searches</h3>
        <InteractiveRow
          onClick={() => {
            onFocusHistoryPill?.(null);
            onClearHistory();
          }}
          style={{ minHeight: 36, padding: "4px 16px", fontSize: 12, fontWeight: 700, width: "auto" }}
        >
          Clear All
        </InteractiveRow>
      </div>
      <Focusable flow-children="horizontal" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {visibleHistory.map((q) => (
          <InteractiveRow
            key={q}
            data-deckify-list-item="true"
            data-deckify-label={q}
            onFocus={() => onFocusHistoryPill?.(q)}
            onBlur={() => onFocusHistoryPill?.(null)}
            onClick={() => onSelectHistory(q)}
            onKeyDown={(e) => {
              if (
                e?.key === "Delete" ||
                e?.key === "Backspace" ||
                e?.key === "y" ||
                e?.key === "Y" ||
                e?.key === "x" ||
                e?.key === "X"
              ) {
                e.preventDefault?.();
                onFocusHistoryPill?.(null);
                onRemoveHistory(q);
              }
            }}
            style={{
              minHeight: 36,
              padding: "4px 16px",
              borderRadius: 18,
              background: "rgba(255,255,255,0.08)",
              maxWidth: 220,
              gap: 8,
              width: "auto",
            }}
          >
            <span
              style={{
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {q}
            </span>
            <span
              role="button"
              aria-label={`Remove ${q}`}
              onClick={(e) => {
                e.stopPropagation();
                onFocusHistoryPill?.(null);
                onRemoveHistory(q);
              }}
              style={{ cursor: "pointer", opacity: 0.7, fontWeight: 700, flexShrink: 0, fontSize: 13 }}
            >
              ×
            </span>
          </InteractiveRow>
        ))}
      </Focusable>
    </div>
  );
};

const GamingMoodGrid: FC<{ onSelectTile: (tile: GamingMoodTile) => void }> = ({ onSelectTile }) => {
  const tileRows = [
    GAMING_MOOD_TILES.slice(0, 4),
    GAMING_MOOD_TILES.slice(4, 8),
    GAMING_MOOD_TILES.slice(8, 12),
  ];

  return (
    <div>
      <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, marginTop: 0 }}>Browse Gaming &amp; Mood</h3>
      {tileRows.map((row, rowIdx) => (
        <Focusable key={rowIdx} flow-children="horizontal" style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          {row.map((tile) => (
            <InteractiveRow
              key={tile.id}
              data-deckify-list-item="true"
              data-deckify-label={tile.label}
              onClick={() => onSelectTile(tile)}
              style={{
                flex: 1,
                minWidth: 0,
                minHeight: 64,
                padding: "8px 16px",
                borderRadius: 10,
                background: tile.tint,
                gap: 10,
              }}
            >
              {renderTileIcon(tile.id)}
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {tile.label}
              </span>
            </InteractiveRow>
          ))}
        </Focusable>
      ))}
    </div>
  );
};

function renderSectionLoadMore(
  section: SearchSectionKey,
  hasMore: boolean,
  isLoading: boolean,
  onLoadMore: (section: SearchSectionKey) => void,
) {
  if (!hasMore) return null;
  return (
    <InteractiveRow
      key={`load-more-${section}`}
      data-testid={`search-load-more-${section}`}
      onClick={() => {
        if (!isLoading) onLoadMore(section);
      }}
      style={{
        justifyContent: "center",
        marginTop: 6,
        padding: "8px 16px",
        background: "rgba(255,255,255,0.08)",
        fontSize: 12,
        fontWeight: 700,
        opacity: isLoading ? 0.6 : 1,
      }}
    >
      {isLoading ? "Loading..." : SECTION_CONFIG[section].label}
    </InteractiveRow>
  );
}

function renderPlaylistsSection(
  playlists: PlaylistItem[] | undefined,
  onOpenPlaylist: (playlist: PlaylistItem) => void,
  loadMoreNode?: ReactNode,
) {
  if (!playlists || playlists.length === 0) return null;
  return (
    <div key="playlists" style={{ marginTop: 10, marginBottom: 16 }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--deckify-accent, #1DB954)", marginBottom: 8 }}>Playlists</h3>
      <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {playlists.map((pl) => (
          <InteractiveRow
            key={pl.id}
            data-deckify-list-item="true"
            data-deckify-label={pl.name || ""}
            onClick={() => onOpenPlaylist(pl)}
            style={{ gap: 10 }}
          >
            {pl.image_url ? (
              <DeckifyImage src={pl.image_url} width={30} height={30} style={{ borderRadius: 4, flexShrink: 0 }} />
            ) : (
              <FaFolder size={16} color="var(--deckify-accent, #1DB954)" style={{ flexShrink: 0 }} />
            )}
            <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
              <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {pl.name}
              </div>
              <div style={{ fontSize: 11, opacity: 0.6 }}>{pl.track_count || 0} tracks</div>
            </div>
          </InteractiveRow>
        ))}
        {loadMoreNode}
      </Focusable>
    </div>
  );
}

function renderTracksSection(
  tracks: TrackItem[] | undefined,
  handlers: Pick<SearchTabProps, "onPlayTrack" | "onToggleLike" | "onOpenActions">,
  loadMoreNode?: ReactNode,
) {
  if (!tracks || tracks.length === 0) return null;
  return (
    <div key="tracks" style={{ marginTop: 10, marginBottom: 16 }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--deckify-accent, #1DB954)", marginBottom: 8 }}>Tracks</h3>
      <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {tracks.map((t, idx) => (
          <TrackRowItem
            key={t.id || t.uri || idx}
            track={t}
            index={idx}
            allTracks={tracks}
            onPlayTrack={handlers.onPlayTrack}
            onToggleLike={handlers.onToggleLike}
            onOpenActions={handlers.onOpenActions}
          />
        ))}
        {loadMoreNode}
      </Focusable>
    </div>
  );
}

function renderArtistsSection(
  artists: ArtistItem[] | undefined,
  onOpenArtist: (artist: ArtistItem) => void,
  loadMoreNode?: ReactNode,
) {
  if (!artists || artists.length === 0) return null;
  return (
    <div key="artists" style={{ marginTop: 10, marginBottom: 16 }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--deckify-accent, #1DB954)", marginBottom: 8 }}>Artists</h3>
      <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {artists.map((art) => (
          <InteractiveRow
            key={art.id}
            data-deckify-list-item="true"
            data-deckify-label={art.name || ""}
            onClick={() => onOpenArtist(art)}
            style={{ gap: 10 }}
          >
            {art.image_url && <DeckifyImage src={art.image_url} width={30} height={30} style={{ borderRadius: "50%", flexShrink: 0 }} />}
            <span style={{ fontSize: 13, fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {art.name}
            </span>
          </InteractiveRow>
        ))}
        {loadMoreNode}
      </Focusable>
    </div>
  );
}

function renderAlbumsSection(
  albums: AlbumItem[] | undefined,
  onOpenAlbum: (album: AlbumItem) => void,
  loadMoreNode?: ReactNode,
) {
  if (!albums || albums.length === 0) return null;
  return (
    <div key="albums" style={{ marginTop: 10, marginBottom: 16 }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--deckify-accent, #1DB954)", marginBottom: 8 }}>Albums</h3>
      <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {albums.map((alb) => (
          <InteractiveRow
            key={alb.id}
            data-deckify-list-item="true"
            data-deckify-label={alb.name || ""}
            onClick={() => onOpenAlbum(alb)}
            style={{ gap: 10 }}
          >
            {alb.image_url && <DeckifyImage src={alb.image_url} width={30} height={30} style={{ borderRadius: 4, flexShrink: 0 }} />}
            <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
              <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {alb.name}
              </div>
              <div style={{ fontSize: 11, opacity: 0.6 }}>{alb.artist}</div>
            </div>
          </InteractiveRow>
        ))}
        {loadMoreNode}
      </Focusable>
    </div>
  );
}

function renderPodcastsSection(
  shows: ShowItem[] | undefined,
  onOpenShow?: (show: ShowItem) => void,
  loadMoreNode?: ReactNode,
) {
  if (!shows || shows.length === 0) return null;
  return (
    <div key="podcasts" style={{ marginTop: 10, marginBottom: 16 }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--deckify-accent, #1DB954)", marginBottom: 8 }}>Podcasts</h3>
      <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {shows.map((show) => (
          <InteractiveRow
            key={show.id}
            data-deckify-list-item="true"
            data-deckify-label={show.name || ""}
            onClick={() => onOpenShow?.(show)}
            style={{ minHeight: 44, gap: 8 }}
          >
            {show.image_url ? (
              <DeckifyImage src={show.image_url} width={36} height={36} style={{ borderRadius: 4, flexShrink: 0 }} />
            ) : (
              <FaPodcast size={20} color="var(--deckify-accent, #1DB954)" style={{ flexShrink: 0 }} />
            )}
            <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
              <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {show.name}
              </div>
              {show.publisher && (
                <div style={{ fontSize: 11, opacity: 0.6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {show.publisher}
                </div>
              )}
            </div>
          </InteractiveRow>
        ))}
        {loadMoreNode}
      </Focusable>
    </div>
  );
}

function renderEpisodesSection(
  episodes: EpisodeItem[] | undefined,
  onPlayTrack: SearchTabProps["onPlayTrack"],
  loadMoreNode?: ReactNode,
) {
  if (!episodes || episodes.length === 0) return null;
  return (
    <div key="episodes" style={{ marginTop: 10, marginBottom: 16 }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--deckify-accent, #1DB954)", marginBottom: 8 }}>Episodes</h3>
      <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {episodes.map((ep, idx) => (
          <EpisodeRow
            key={ep.id || ep.uri || idx}
            episode={ep}
            onPlayTrack={(uri) => onPlayTrack(uri)}
          />
        ))}
        {loadMoreNode}
      </Focusable>
    </div>
  );
}

function hasVisibleResults(searchTab: SearchFilterTab, res: SearchResults): boolean {
  const counts: Record<Exclude<SearchFilterTab, "all">, number> = {
    tracks: res.tracks?.length ?? 0,
    artists: res.artists?.length ?? 0,
    albums: res.albums?.length ?? 0,
    playlists: res.playlists?.length ?? 0,
    podcasts: res.shows?.length ?? 0,
    episodes: res.episodes?.length ?? 0,
  };
  if (searchTab !== "all") return counts[searchTab] > 0;
  return Object.values(counts).some((c) => c > 0);
}

type SearchHandlers = Pick<
  SearchTabProps,
  "onPlayTrack" | "onToggleLike" | "onOpenActions" | "onOpenPlaylist" | "onOpenArtist" | "onOpenAlbum" | "onOpenShow"
>;

type SectionLoadMoreControl = {
  isSectionHasMore: (section: SearchSectionKey) => boolean;
  loadingSection: SearchSectionKey | null;
  onLoadMoreSection: (section: SearchSectionKey) => void;
};

function buildOrderedSections(
  searchTab: SearchFilterTab,
  searchResults: SearchResults,
  tileSearchMode: boolean,
  context: { handlers: SearchHandlers; loadMoreControl?: SectionLoadMoreControl },
) {
  const { handlers, loadMoreControl } = context;
  const loadMoreFor = (section: SearchSectionKey) =>
    loadMoreControl
      ? renderSectionLoadMore(
          section,
          loadMoreControl.isSectionHasMore(section),
          loadMoreControl.loadingSection === section,
          loadMoreControl.onLoadMoreSection,
        )
      : null;

  const byKey: Record<SearchSectionKey, ReturnType<typeof renderTracksSection>> = {
    playlists: renderPlaylistsSection(searchResults.playlists, handlers.onOpenPlaylist, loadMoreFor("playlists")),
    tracks: renderTracksSection(searchResults.tracks, handlers, loadMoreFor("tracks")),
    artists: renderArtistsSection(searchResults.artists, handlers.onOpenArtist, loadMoreFor("artists")),
    albums: renderAlbumsSection(searchResults.albums, handlers.onOpenAlbum, loadMoreFor("albums")),
    podcasts: renderPodcastsSection(searchResults.shows, handlers.onOpenShow, loadMoreFor("podcasts")),
    episodes: renderEpisodesSection(searchResults.episodes, handlers.onPlayTrack, loadMoreFor("episodes")),
  };
  if (searchTab !== "all") return [byKey[searchTab]];
  const order: SearchSectionKey[] = tileSearchMode
    ? ["playlists", "tracks", "artists", "albums", "podcasts", "episodes"]
    : ["tracks", "playlists", "artists", "albums", "podcasts", "episodes"];
  return order.map((key) => byKey[key]);
}

const SearchResultsView: FC<{
  searchQuery: string;
  searchTab: SearchFilterTab;
  onSearchTabChange: (tab: SearchFilterTab) => void;
  searchResults: SearchResults;
  tileSearchMode: boolean;
  loadingSearch: boolean;
  searchError?: string | null;
  sectionHasMore: Partial<Record<SearchSectionKey, boolean>>;
  loadingSection: SearchSectionKey | null;
  onLoadMoreSection: (section: SearchSectionKey) => void;
  handlers: SearchHandlers;
}> = ({
  searchQuery,
  searchTab,
  onSearchTabChange,
  searchResults,
  tileSearchMode,
  loadingSearch,
  searchError,
  sectionHasMore,
  loadingSection,
  onLoadMoreSection,
  handlers,
}) => {
  const visibleAny = hasVisibleResults(searchTab, searchResults);
  const isSectionHasMore = (section: SearchSectionKey): boolean => {
    const explicit = sectionHasMore[section];
    if (explicit !== undefined) return explicit;
    const { resultKey } = SECTION_CONFIG[section];
    return (searchResults[resultKey]?.length ?? 0) >= SEARCH_PAGE_LIMIT;
  };
  const sections = buildOrderedSections(searchTab, searchResults, tileSearchMode, {
    handlers,
    loadMoreControl: {
      isSectionHasMore,
      loadingSection,
      onLoadMoreSection,
    },
  });

  return (
    <>
      <Focusable
        flow-children="horizontal"
        style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8, marginBottom: 16 }}
      >
        {FILTER_CHIPS.map((tab) => {
          const isActive = searchTab === tab;
          return (
            <InteractiveRow
              key={tab}
              onClick={() => onSearchTabChange(tab)}
              active={isActive}
              style={{
                minHeight: 36,
                padding: "4px 16px",
                fontSize: 12,
                fontWeight: 700,
                textTransform: "capitalize",
                width: "auto",
                background: isActive ? "rgba(var(--deckify-accent-rgb, 29, 185, 84), 0.18)" : undefined,
                color: isActive ? "var(--deckify-accent, #1DB954)" : undefined,
                border: isActive ? "1px solid var(--deckify-accent, #1DB954)" : undefined,
              }}
            >
              {tab}
            </InteractiveRow>
          );
        })}
      </Focusable>

      {loadingSearch && <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 12 }}>Searching...</div>}
      {!loadingSearch && searchError && (
        <div
          style={{
            padding: "14px 16px",
            marginBottom: 12,
            borderRadius: 8,
            background: "rgba(255, 80, 80, 0.12)",
            border: "1px solid rgba(255, 80, 80, 0.35)",
          }}
        >
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, color: "#ff7b7b" }}>Search Error</h3>
          <div style={{ fontSize: 12, opacity: 0.85 }}>{searchError}</div>
        </div>
      )}
      {sections}

      {!loadingSearch && !searchError && !visibleAny && (
        <div style={{ padding: "24px 0", textAlign: "center" }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>No Results Found</h3>
          <div style={{ fontSize: 12, opacity: 0.65 }}>
            No matches found for &quot;{searchQuery}&quot;. Try another search or clear the active filter.
          </div>
        </div>
      )}
    </>
  );
};

function useSearchHistory(
  controlledHistory: string[] | undefined,
  onUpdateSearchHistory: ((next: string[]) => void) | undefined,
) {
  const [localHistory, setLocalHistory] = useState<string[]>([]);
  const searchHistory = controlledHistory !== undefined ? controlledHistory : localHistory;
  const historyRef = useRef(searchHistory);
  historyRef.current = searchHistory;

  const updateHistory = useCallback(
    (next: string[]) => (onUpdateSearchHistory ? onUpdateSearchHistory(next) : setLocalHistory(next)),
    [onUpdateSearchHistory],
  );
  const recordHistory = useCallback(
    (q: string) => {
      const trimmed = q.trim();
      if (trimmed) updateHistory([trimmed, ...historyRef.current.filter((item) => item !== trimmed)].slice(0, 10));
    },
    [updateHistory],
  );
  const removeHistoryItem = useCallback((q: string) => updateHistory(historyRef.current.filter((i) => i !== q)), [updateHistory]);
  const clearHistory = useCallback(() => updateHistory([]), [updateHistory]);

  return { searchHistory, recordHistory, removeHistoryItem, clearHistory };
}

function useControlledState<T>(controlled: T | undefined, onChange: ((v: T) => void) | undefined, initial: T) {
  const [local, setLocal] = useState<T>(initial);
  return [controlled !== undefined ? controlled : local, onChange ?? setLocal] as const;
}

function dedupeByKey<T extends { id?: string; uri?: string }>(prev: T[] = [], next: T[] = []): T[] {
  const seen = new Set<string>();
  const merged: T[] = [];
  for (const item of [...prev, ...next]) {
    const key = item.id || item.uri;
    if (key) {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    merged.push(item);
  }
  return merged;
}

async function executeSearchQuery(
  query: string,
  types: string,
  offset: number,
) {
  const trimmed = query.trim();
  if (!trimmed) return null;
  try {
    const res = await backendSearchSpotify(trimmed, types, SEARCH_PAGE_LIMIT, offset);
    if (res.ok) return { ok: true as const, res, trimmed };
    return { ok: false as const, error: res.error || "Search failed — check your connection and try again." };
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error && err.message ? err.message : "Search failed — check your connection and try again.",
    };
  }
}

function buildInitialHasMore(res: SearchResults): Partial<Record<SearchSectionKey, boolean>> {
  const next: Partial<Record<SearchSectionKey, boolean>> = {};
  for (const section of SEARCH_SECTIONS) {
    const { resultKey } = SECTION_CONFIG[section];
    next[section] = (res[resultKey]?.length ?? 0) >= SEARCH_PAGE_LIMIT;
  }
  return next;
}

function useSearchController(props: SearchTabProps) {
  const [searchQuery, setSearchQuery] = useControlledState(props.searchQuery, props.onSearchQueryChange, "");
  const [sectionOffsets, setSectionOffsets] = useState<Partial<Record<SearchSectionKey, number>>>({});
  const [sectionHasMore, setSectionHasMore] = useState<Partial<Record<SearchSectionKey, boolean>>>({});
  const [loadingSection, setLoadingSection] = useState<SearchSectionKey | null>(null);
  const [searchTab, setSearchTab] = useControlledState<SearchFilterTab>(props.searchTab, props.onSearchTabChange, "all");
  const [searchResults, setSearchResults] = useControlledState<SearchResults>(props.searchResults, props.onSearchResultsChange, {});
  const [tileSearchMode, setTileSearchMode] = useControlledState(props.tileSearchMode, props.onTileSearchModeChange, false);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const { searchHistory, recordHistory, removeHistoryItem, clearHistory } = useSearchHistory(
    props.searchHistory,
    props.onUpdateSearchHistory,
  );

  const showToastRef = useRef(props.showToast);
  showToastRef.current = props.showToast;
  const setResultsRef = useRef(setSearchResults);
  setResultsRef.current = setSearchResults;
  const resultsRef = useRef(searchResults);
  resultsRef.current = searchResults;
  const recordHistoryRef = useRef(recordHistory);
  recordHistoryRef.current = recordHistory;
  const searchEpochRef = useRef(0);

  const resetPaging = useCallback(() => {
    searchEpochRef.current += 1;
    setSectionOffsets({});
    setSectionHasMore({});
    setLoadingSection(null);
  }, []);

  const runSearch = useCallback(async (query: string) => {
    if (!query.trim()) return;
    const epoch = searchEpochRef.current;
    setLoadingSearch(true);
    setSearchError(null);
    const outcome = await executeSearchQuery(query, SEARCH_TYPES, 0);
    if (searchEpochRef.current !== epoch || !outcome) {
      setLoadingSearch(false);
      return;
    }
    if (outcome.ok) {
      resultsRef.current = outcome.res;
      setResultsRef.current(outcome.res);
      setSectionOffsets({});
      setSectionHasMore(buildInitialHasMore(outcome.res));
      recordHistoryRef.current(outcome.trimmed);
    } else {
      setSearchError(outcome.error);
      showToastRef.current?.(outcome.error);
    }
    setLoadingSearch(false);
  }, []);

  const handleLoadMoreSection = useCallback(async (section: SearchSectionKey) => {
    const trimmed = searchQuery.trim();
    if (!trimmed || loadingSection === section) return;
    const epoch = searchEpochRef.current;
    const { apiType, resultKey } = SECTION_CONFIG[section];
    const nextOffset = (sectionOffsets[section] ?? 0) + SEARCH_PAGE_LIMIT;
    setLoadingSection(section);
    setSearchError(null);
    const outcome = await executeSearchQuery(trimmed, apiType, nextOffset);
    if (searchEpochRef.current !== epoch || !outcome) {
      setLoadingSection((prev) => (prev === section ? null : prev));
      return;
    }
    if (outcome.ok) {
      const prevItems = (resultsRef.current[resultKey] ?? []) as Array<{ id?: string; uri?: string }>;
      const nextItems = (outcome.res[resultKey] ?? []) as Array<{ id?: string; uri?: string }>;
      const nextResults: SearchResults = {
        ...resultsRef.current,
        [resultKey]: dedupeByKey(prevItems, nextItems),
      };
      resultsRef.current = nextResults;
      setResultsRef.current(nextResults);
      setSectionOffsets((prev) => ({ ...prev, [section]: nextOffset }));
      setSectionHasMore((prev) => ({
        ...prev,
        [section]: (outcome.res[resultKey]?.length ?? 0) >= SEARCH_PAGE_LIMIT,
      }));
    } else {
      setSearchError(outcome.error);
      showToastRef.current?.(outcome.error);
    }
    setLoadingSection((prev) => (prev === section ? null : prev));
  }, [searchQuery, loadingSection, sectionOffsets]);

  const prevQueryRef = useRef(searchQuery);
  const skipNextDebounceRef = useRef<string | null>(null);

  useEffect(() => {
    const queryChanged = searchQuery !== prevQueryRef.current;
    prevQueryRef.current = searchQuery;
    if (!queryChanged) return;
    resetPaging();
    if (!searchQuery.trim()) {
      setResultsRef.current({});
      setSearchError(null);
      setLoadingSearch(false);
      return;
    }
    if (skipNextDebounceRef.current === searchQuery) {
      skipNextDebounceRef.current = null;
      return;
    }
    const timer = setTimeout(() => void runSearch(searchQuery), 350);
    return () => clearTimeout(timer);
  }, [searchQuery, runSearch, resetPaging]);

  return {
    searchQuery, setSearchQuery,
    searchTab, setSearchTab, searchResults, tileSearchMode, setTileSearchMode,
    searchHistory, loadingSearch, searchError, sectionHasMore, loadingSection,
    removeHistoryItem, clearHistory,
    handleLoadMoreSection,
    handleSelectHistory: (q: string) => {
      skipNextDebounceRef.current = q;
      setTileSearchMode(false);
      resetPaging();
      setSearchQuery(q);
      void runSearch(q);
    },
    handleSelectTile: (tile: GamingMoodTile) => {
      skipNextDebounceRef.current = tile.query;
      setTileSearchMode(true);
      setSearchTab("all");
      resetPaging();
      setSearchQuery(tile.query);
      void runSearch(tile.query);
    },
  };
}

const BrowseCategoriesSection: FC<{
  categories: SearchBrowseCategory[];
  onSelectCategory: (cat: SearchBrowseCategory) => void;
}> = ({ categories, onSelectCategory }) => {
  if (categories.length === 0) return null;
  const rows: SearchBrowseCategory[][] = [];
  for (let i = 0; i < categories.length; i += 4) {
    rows.push(categories.slice(i, i + 4));
  }
  return (
    <div style={{ marginTop: 24 }}>
      <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, marginTop: 0 }}>
        Browse Categories
      </h3>
      {rows.map((row, rowIdx) => (
        <Focusable
          key={rowIdx}
          flow-children="horizontal"
          style={{ display: "flex", gap: 8, marginBottom: 8 }}
        >
          {row.map((cat) => (
            <InteractiveRow
              key={cat.id || cat.name}
              data-deckify-list-item="true"
              data-deckify-label={cat.name}
              onClick={() => onSelectCategory(cat)}
              style={{
                flex: 1,
                minWidth: 0,
                minHeight: 64,
                padding: "8px 16px",
                borderRadius: 10,
                background: "rgba(255,255,255,0.08)",
                gap: 10,
              }}
            >
              {cat.image_url && (
                <DeckifyImage
                  src={cat.image_url}
                  width={40}
                  height={40}
                  style={{ borderRadius: 6, flexShrink: 0 }}
                />
              )}
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {cat.name}
              </span>
            </InteractiveRow>
          ))}
        </Focusable>
      ))}
    </div>
  );
};

export const SearchTab: FC<SearchTabProps> = (props) => {
  const ctrl = useSearchController(props);
  const { onFocusHistoryPill } = props;
  const hasQuery = Boolean(ctrl.searchQuery.trim());
  const [browseCategories, setBrowseCategories] = useState<SearchBrowseCategory[]>([]);
  const fetchedBrowseRef = useRef(false);

  useEffect(() => {
    if (hasQuery) {
      onFocusHistoryPill?.(null);
    }
    return () => {
      onFocusHistoryPill?.(null);
    };
  }, [hasQuery, onFocusHistoryPill]);

  useEffect(() => {
    if (hasQuery || fetchedBrowseRef.current) return;
    fetchedBrowseRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const res = await getSearchBrowseCategories?.();
        if (!cancelled && res?.ok && Array.isArray(res.categories)) {
          setBrowseCategories(res.categories);
        }
      } catch {
        if (!cancelled) setBrowseCategories([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasQuery]);

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 14 }}>Search</h2>
      <TextField
        label="Search tracks, artists, albums, playlists..."
        value={ctrl.searchQuery}
        onChange={(e) => {
          ctrl.setTileSearchMode(false);
          ctrl.setSearchQuery(e.target.value);
        }}
      />
      {!ctrl.searchQuery.trim() ? (
        <div style={{ marginTop: 16 }}>
          <RecentSearchesSection
            searchHistory={ctrl.searchHistory}
            onSelectHistory={ctrl.handleSelectHistory}
            onRemoveHistory={ctrl.removeHistoryItem}
            onClearHistory={ctrl.clearHistory}
            onFocusHistoryPill={onFocusHistoryPill}
          />
          <GamingMoodGrid onSelectTile={ctrl.handleSelectTile} />
          <BrowseCategoriesSection
            categories={browseCategories}
            onSelectCategory={(cat) =>
              ctrl.handleSelectTile({
                id: cat.id,
                label: cat.name,
                query: cat.name,
                tint: "rgba(255,255,255,0.08)",
              })
            }
          />
        </div>
      ) : (
        <SearchResultsView
          searchQuery={ctrl.searchQuery}
          searchTab={ctrl.searchTab}
          onSearchTabChange={ctrl.setSearchTab}
          searchResults={ctrl.searchResults}
          tileSearchMode={ctrl.tileSearchMode}
          loadingSearch={ctrl.loadingSearch}
          searchError={ctrl.searchError}
          sectionHasMore={ctrl.sectionHasMore}
          loadingSection={ctrl.loadingSection}
          onLoadMoreSection={ctrl.handleLoadMoreSection}
          handlers={{
            onPlayTrack: props.onPlayTrack,
            onToggleLike: props.onToggleLike,
            onOpenActions: props.onOpenActions,
            onOpenPlaylist: props.onOpenPlaylist,
            onOpenArtist: props.onOpenArtist,
            onOpenAlbum: props.onOpenAlbum,
            onOpenShow: props.onOpenShow,
          }}
        />
      )}
    </div>
  );
};
