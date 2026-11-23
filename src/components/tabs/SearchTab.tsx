import { FC, useState, useEffect, useRef, useCallback } from "react";
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
  [string, string, number],
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

const SEARCH_TYPES = "track,artist,album,playlist,show,episode";

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
}

const RecentSearchesSection: FC<{
  searchHistory: string[];
  onSelectHistory: (q: string) => void;
  onRemoveHistory: (q: string) => void;
  onClearHistory: () => void;
}> = ({ searchHistory, onSelectHistory, onRemoveHistory, onClearHistory }) => {
  const visibleHistory = searchHistory.slice(0, 10);
  if (visibleHistory.length === 0) return null;

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Recent Searches</h3>
        <InteractiveRow
          onClick={onClearHistory}
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
            onClick={() => onSelectHistory(q)}
            onKeyDown={(e) => {
              if (e?.key === "Delete" || e?.key === "Backspace" || e?.key === "y" || e?.key === "Y") {
                e.preventDefault?.();
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

function renderPlaylistsSection(
  playlists: PlaylistItem[] | undefined,
  onOpenPlaylist: (playlist: PlaylistItem) => void,
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
      </Focusable>
    </div>
  );
}

function renderTracksSection(
  tracks: TrackItem[] | undefined,
  onPlayTrack: SearchTabProps["onPlayTrack"],
  onToggleLike: SearchTabProps["onToggleLike"],
  onOpenActions: SearchTabProps["onOpenActions"],
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
            onPlayTrack={onPlayTrack}
            onToggleLike={onToggleLike}
            onOpenActions={onOpenActions}
          />
        ))}
      </Focusable>
    </div>
  );
}

function renderArtistsSection(
  artists: ArtistItem[] | undefined,
  onOpenArtist: (artist: ArtistItem) => void,
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
      </Focusable>
    </div>
  );
}

function renderAlbumsSection(
  albums: AlbumItem[] | undefined,
  onOpenAlbum: (album: AlbumItem) => void,
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
      </Focusable>
    </div>
  );
}

function renderPodcastsSection(
  shows: ShowItem[] | undefined,
  onOpenShow?: (show: ShowItem) => void,
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
      </Focusable>
    </div>
  );
}

function renderEpisodesSection(
  episodes: EpisodeItem[] | undefined,
  onPlayTrack: SearchTabProps["onPlayTrack"],
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

function buildOrderedSections(
  searchTab: SearchFilterTab,
  searchResults: SearchResults,
  tileSearchMode: boolean,
  handlers: SearchHandlers,
) {
  const byKey: Record<Exclude<SearchFilterTab, "all">, ReturnType<typeof renderTracksSection>> = {
    playlists: renderPlaylistsSection(searchResults.playlists, handlers.onOpenPlaylist),
    tracks: renderTracksSection(searchResults.tracks, handlers.onPlayTrack, handlers.onToggleLike, handlers.onOpenActions),
    artists: renderArtistsSection(searchResults.artists, handlers.onOpenArtist),
    albums: renderAlbumsSection(searchResults.albums, handlers.onOpenAlbum),
    podcasts: renderPodcastsSection(searchResults.shows, handlers.onOpenShow),
    episodes: renderEpisodesSection(searchResults.episodes, handlers.onPlayTrack),
  };
  if (searchTab !== "all") return [byKey[searchTab]];
  const order: Exclude<SearchFilterTab, "all">[] = tileSearchMode
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
  onLoadMore: () => void;
  handlers: SearchHandlers;
}> = ({
  searchQuery,
  searchTab,
  onSearchTabChange,
  searchResults,
  tileSearchMode,
  loadingSearch,
  onLoadMore,
  handlers,
}) => {
  const visibleAny = hasVisibleResults(searchTab, searchResults);
  const sections = buildOrderedSections(searchTab, searchResults, tileSearchMode, handlers);

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
      {sections}

      {!loadingSearch && !visibleAny && (
        <div style={{ padding: "24px 0", textAlign: "center" }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>No Results Found</h3>
          <div style={{ fontSize: 12, opacity: 0.65 }}>
            No matches found for &quot;{searchQuery}&quot;. Try another search or clear the active filter.
          </div>
        </div>
      )}

      {visibleAny && (
        <InteractiveRow
          onClick={onLoadMore}
          style={{
            justifyContent: "center",
            marginTop: 14,
            padding: "8px 16px",
            background: "rgba(255,255,255,0.08)",
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          Load More Results
        </InteractiveRow>
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

async function executeSearchQuery(
  query: string,
  limit: number,
  onSuccess: (res: SearchResults, trimmed: string) => void,
  onError: () => void,
) {
  const trimmed = query.trim();
  if (!trimmed) return;
  try {
    const res = await backendSearchSpotify(trimmed, SEARCH_TYPES, limit);
    if (res.ok) onSuccess(res, trimmed);
    else onError();
  } catch {
    onError();
  }
}

function useSearchController(props: SearchTabProps) {
  const [searchQuery, setSearchQuery] = useControlledState(props.searchQuery, props.onSearchQueryChange, "");
  const [searchLimit, setSearchLimit] = useState(25);
  const [searchTab, setSearchTab] = useControlledState<SearchFilterTab>(props.searchTab, props.onSearchTabChange, "all");
  const [searchResults, setSearchResults] = useControlledState<SearchResults>(props.searchResults, props.onSearchResultsChange, {});
  const [tileSearchMode, setTileSearchMode] = useControlledState(props.tileSearchMode, props.onTileSearchModeChange, false);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const { searchHistory, recordHistory, removeHistoryItem, clearHistory } = useSearchHistory(
    props.searchHistory,
    props.onUpdateSearchHistory,
  );

  const showToastRef = useRef(props.showToast);
  showToastRef.current = props.showToast;
  const setResultsRef = useRef(setSearchResults);
  setResultsRef.current = setSearchResults;
  const recordHistoryRef = useRef(recordHistory);
  recordHistoryRef.current = recordHistory;

  const runSearch = useCallback(async (query: string, limit: number) => {
    if (!query.trim()) return;
    setLoadingSearch(true);
    await executeSearchQuery(
      query,
      limit,
      (res, trimmed) => {
        setResultsRef.current(res);
        recordHistoryRef.current(trimmed);
      },
      () => showToastRef.current?.("Search failed — check your connection and try again."),
    );
    setLoadingSearch(false);
  }, []);

  const prevQueryRef = useRef(searchQuery);
  const prevLimitRef = useRef(searchLimit);
  const skipNextDebounceRef = useRef<string | null>(null);

  useEffect(() => {
    const queryChanged = searchQuery !== prevQueryRef.current;
    const limitChanged = searchLimit !== prevLimitRef.current;
    prevQueryRef.current = searchQuery;
    prevLimitRef.current = searchLimit;
    if (!queryChanged && !limitChanged) return;
    if (!searchQuery.trim()) {
      setResultsRef.current({});
      setLoadingSearch(false);
      return;
    }
    if (skipNextDebounceRef.current === searchQuery && !limitChanged) {
      skipNextDebounceRef.current = null;
      return;
    }
    const timer = setTimeout(() => void runSearch(searchQuery, searchLimit), 350);
    return () => clearTimeout(timer);
  }, [searchQuery, searchLimit, runSearch]);

  return {
    searchQuery, setSearchQuery, searchLimit, setSearchLimit,
    searchTab, setSearchTab, searchResults, tileSearchMode, setTileSearchMode,
    searchHistory, loadingSearch, removeHistoryItem, clearHistory,
    handleSelectHistory: (q: string) => {
      skipNextDebounceRef.current = q;
      setTileSearchMode(false);
      setSearchQuery(q);
      void runSearch(q, searchLimit);
    },
    handleSelectTile: (tile: GamingMoodTile) => {
      skipNextDebounceRef.current = tile.query;
      setTileSearchMode(true);
      setSearchTab("all");
      setSearchQuery(tile.query);
      void runSearch(tile.query, searchLimit);
    },
  };
}

export const SearchTab: FC<SearchTabProps> = (props) => {
  const ctrl = useSearchController(props);

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
          />
          <GamingMoodGrid onSelectTile={ctrl.handleSelectTile} />
        </div>
      ) : (
        <SearchResultsView
          searchQuery={ctrl.searchQuery}
          searchTab={ctrl.searchTab}
          onSearchTabChange={ctrl.setSearchTab}
          searchResults={ctrl.searchResults}
          tileSearchMode={ctrl.tileSearchMode}
          loadingSearch={ctrl.loadingSearch}
          onLoadMore={() => ctrl.setSearchLimit((prev) => prev + 25)}
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
