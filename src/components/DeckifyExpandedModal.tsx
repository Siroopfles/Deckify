import { FC, useState, useEffect, useCallback, useRef, useMemo } from "react";
import { DialogButton, Focusable, ModalRoot, NavEntryPositionPreferences } from "@decky/ui";
import { addEventListener, callable, removeEventListener, toaster } from "@decky/api";
import { FaPlane } from "react-icons/fa";
// Note: Child views render heart icons: FaHeart, FaRegHeart
import {
  AlbumItem,
  ArtistItem,
  EpisodeItem,
  FolderItem,
  JamSessionStatus,
  NavHistoryEntry,
  OfflineDownloadItem,
  PinnedPlaylistItem,
  PlaylistItem,
  SearchFilterTab,
  SearchResults,
  ShowItem,
  SyncedLine,
  TrackItem,
  TrackMeta,
  StatusResponse,
  ViewMode,
  ALL_MODES,
} from "../types";
import { parseLrc } from "../utils";
import { computeListJump } from "../utils/listNavigation";
import { isSpokenContent } from "../utils/playback";
import { assignStableRowKeys } from "../hooks/useGrabMoveOrder";
import { usePlaybackStatus } from "../hooks/usePlaybackStatus";
import { useTriggerNavigation } from "../hooks/useTriggerNavigation";
import { Sidebar } from "./common/Sidebar";
import { TrackActionModal, recordPlaylistAddCount } from "./common/TrackActionModal";
import { CollectionActionItem, CollectionActionModal } from "./common/CollectionActionModal";
import { JamQrModal } from "./common/JamQrModal";
import { OfflineTogglePayload } from "./common/OfflineStatusUI";

// Modular tab components
import { NowPlayingTab } from "./tabs/NowPlayingTab";
import { LyricsTab } from "./tabs/LyricsTab";
import { DiscoveryTab } from "./tabs/DiscoveryTab";
import { PlaylistsTab } from "./tabs/PlaylistsTab";
import { LikedSongsTab } from "./tabs/LikedSongsTab";
import { AlbumsTab } from "./tabs/AlbumsTab";
import { ArtistsTab } from "./tabs/ArtistsTab";
import { RecentTab } from "./tabs/RecentTab";
import { PodcastsTab } from "./tabs/PodcastsTab";
import { SearchTab } from "./tabs/SearchTab";
import { QueueTab } from "./tabs/QueueTab";
import { DevicesTab } from "./tabs/DevicesTab";
import { SoundtracksTab } from "./tabs/SoundtracksTab";
import { SettingsTab } from "./tabs/SettingsTab";
import { getThemeCssVars, useAccentTheme } from "../utils/themeBus";

// Backward-compatible re-exports
export { DeckifyImage } from "./common/DeckifyImage";
export { InteractiveRow } from "./common/InteractiveRow";

const ModalRootAny = ModalRoot as any;

export const SEEK_ACCUMULATION_WINDOW_MS = 600;

const FULL_BLEED = {
  width: "96vw",
  marginLeft: "calc((100% - 96vw) / 2)",
  boxSizing: "border-box" as const,
};

// RPC Callables
const backendPlayTracks = callable<[string | null, string | null, string[] | null, number], { ok: boolean; error?: string }>("play_tracks");
const backendControlPlayback = callable<[string, string], { ok: boolean; error?: string }>("control_playback");
const backendSetVolume = callable<[number], { ok: boolean; error?: string }>("set_volume");
const backendSetRepeat = callable<[string, string], { ok: boolean; error?: string }>("set_repeat");
const backendSetShuffle = callable<[boolean, string], { ok: boolean; error?: string }>("set_shuffle");
const backendToggleLike = callable<[string, string | null], { ok: boolean; is_liked?: boolean; error?: string }>("toggle_like");
const backendStartRadio = callable<[string, string, string, string, string], { ok: boolean; count?: number; error?: string }>("start_radio");
const backendGetArtistAllTracks = callable<[string, number, number], { ok: boolean; tracks?: TrackItem[]; next_album_offset?: number; has_more?: boolean; error?: string }>("get_artist_all_tracks");
const backendGetArtistInfo = callable<[string], { ok: boolean; artist?: ArtistItem; error?: string }>("get_artist_info");
const backendAddToQueue = callable<[string, string], { ok: boolean; error?: string }>("add_to_queue");
const backendReorderQueueTrack = callable<[number, number, TrackItem[]], { ok: boolean; error?: string }>("reorder_queue_track");
const backendRemoveQueueTrack = callable<[number, string, string, TrackItem[]], { ok: boolean; error?: string }>("remove_queue_track");
const backendClearQueue = callable<[], { ok: boolean; error?: string }>("clear_queue");
const backendAddTrackToPlaylist = callable<[string, string], { ok: boolean; error?: string }>("add_track_to_playlist");
const backendRemoveTrackFromPlaylist = callable<[string, string, number | null, string], { ok: boolean; error?: string }>("remove_track_from_playlist");
const backendCreatePlaylist = callable<[string, boolean, string], { ok: boolean; playlist?: PlaylistItem; error?: string }>("create_playlist");
const backendUpdatePlaylistDetails = callable<[string, string, string], { ok: boolean; error?: string }>("update_playlist_details");
const backendDeletePlaylist = callable<[string], { ok: boolean; playlist_id?: string; pinned_playlists?: PinnedPlaylistItem[]; folders?: FolderItem[]; error?: string }>("delete_playlist");
const backendReorderPlaylistTracks = callable<[string, number, number, number, string, string, string], { ok: boolean; error?: string }>("reorder_playlist_tracks");
const backendManagePlaylistFolder = callable<[string, string, string, string], { ok: boolean; error?: string }>("manage_playlist_folder");
const backendGetPlaylistFolders = callable<[], { ok: boolean; folders?: FolderItem[]; error?: string }>("get_playlist_folders");
const backendGetPlaylists = callable<[number], { ok: boolean; playlists?: PlaylistItem[]; total?: number; error?: string }>("get_playlists");
const backendGetPlaylistTracks = callable<[string, number, boolean], { ok: boolean; tracks?: TrackItem[]; is_mixed?: boolean; playlist_name?: string; playlist_description?: string; error?: string }>("get_playlist_tracks");
const backendPlayAiDj = callable<[string?], { ok: boolean; requires_spotify_client?: boolean; error?: string }>("play_ai_dj");
const backendGetSavedAlbums = callable<[number], { ok: boolean; albums?: AlbumItem[]; total?: number; error?: string }>("get_saved_albums");
const backendGetAlbumTracks = callable<[string, number], { ok: boolean; tracks?: TrackItem[]; error?: string }>("get_album_tracks");
const backendGetFollowedArtists = callable<[], { ok: boolean; artists?: ArtistItem[]; total?: number; error?: string }>("get_followed_artists");
const backendGetArtistTopTracks = callable<[string], { ok: boolean; tracks?: TrackItem[]; error?: string }>("get_artist_top_tracks");
const backendGetArtistAlbums = callable<[string, number], { ok: boolean; albums?: AlbumItem[]; error?: string }>("get_artist_albums");
const backendGetLikedTracks = callable<[number, boolean], { ok: boolean; tracks?: TrackItem[]; total?: number; error?: string }>("get_liked_tracks");
const backendGetRecentlyPlayed = callable<[number], { ok: boolean; tracks?: TrackItem[]; error?: string }>("get_recently_played");
const backendGetSavedEpisodes = callable<[number], { ok: boolean; episodes?: EpisodeItem[]; total?: number; error?: string }>("get_saved_episodes");
const backendGetSavedShows = callable<[number], { ok: boolean; shows?: any[]; total?: number; error?: string }>("get_saved_shows");
const backendGetQueue = callable<[], { ok: boolean; queue?: TrackItem[]; error?: string }>("get_queue");
const backendGetLyrics = callable<
  [string, string, number, number?, string?, boolean?],
  {
    ok: boolean;
    synced_lyrics?: string;
    plain_lyrics?: string;
    source?: string;
    cached?: boolean;
    romanized_lines?: SyncedLine[];
    romanized_plain?: (string | null)[];
    error?: string;
  }
>("get_lyrics");
const backendGetTrackLyricsOffset = callable<[string], { ok: boolean; offset_ms?: number }>("get_track_lyrics_offset");
const backendSetTrackLyricsOffset = callable<[string, number], { ok: boolean; offset_ms?: number; error?: string }>("set_track_lyrics_offset");
const backendSetNativeMix = callable<[string, boolean, boolean], { ok: boolean; error?: string }>("set_native_mix");
const backendSetSetting = callable<[string, unknown], { ok: boolean; settings?: any; error?: string }>("set_setting");
const backendSetPlaybackSpeed = callable<[number], { ok: boolean; speed?: number; unsupported_backend?: boolean; error?: string }>("set_playback_speed");
const backendGetShowEpisodes = callable<[string, number], { ok: boolean; episodes?: EpisodeItem[]; total?: number; error?: string }>("get_show_episodes");
const backendGetOfflineDownloadsList = callable<[], { ok: boolean; items?: OfflineDownloadItem[]; error?: string }>("get_offline_downloads_list");
const backendToggleOfflineDownload = callable<
  [string, boolean, { name?: string; type?: string; image_url?: string | null }?],
  { ok: boolean; success?: boolean; low_disk_space?: boolean; min_free_gb?: number; error?: string }
>("toggle_offline_download");
const backendSetTravelMode = callable<
  [boolean, boolean?, boolean?],
  { ok: boolean; travel_mode_enabled?: boolean; travel_mode_auto_enabled?: boolean; error?: string }
>("set_travel_mode");
const backendStartSpotifyJam = callable<[], { ok: boolean; active?: boolean; join_url?: string | null; guest_count?: number; is_host?: boolean; error?: string }>("start_spotify_jam");
const backendEndSpotifyJam = callable<[], { ok: boolean; error?: string }>("end_spotify_jam");
const backendSwitchAudioBackend = callable<[string], { ok: boolean; error?: string }>("switch_audio_backend");

function escapeCssAttr(val: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(val);
  }
  return val.replace(/["\\]/g, "\\$&");
}

function restoreScrollAndFocus(
  container: HTMLDivElement | null,
  entry: NavHistoryEntry,
) {
  if (typeof requestAnimationFrame !== "function") return;
  requestAnimationFrame(() => {
    if (!container) return;
    container.scrollTop = entry.scrollTop;
    let target: HTMLElement | null = null;
    if (entry.focusLabel) {
      const escaped = escapeCssAttr(entry.focusLabel);
      target = container.querySelector(
        `[data-deckify-list-item="true"][data-deckify-label="${escaped}"]`,
      ) as HTMLElement | null;
    }
    if (!target) {
      target = container.querySelector(
        '[data-deckify-list-item="true"], [tabindex="0"]',
      ) as HTMLElement | null;
    }
    target?.focus?.();
  });
}

function mergeQueueRowKeys(prev: TrackItem[], incoming: TrackItem[]): TrackItem[] {
  const used = new Set<number>();
  return incoming.map((item) => {
    if (item._rowKey) return item;
    if (item.uid) {
      const uidIdx = prev.findIndex((p, idx) => !used.has(idx) && p.uid === item.uid && Boolean(p._rowKey));
      if (uidIdx >= 0) {
        used.add(uidIdx);
        return { ...item, _rowKey: prev[uidIdx]._rowKey };
      }
    }
    const ident = item.uri || item.id || "";
    if (ident) {
      const identIdx = prev.findIndex(
        (p, idx) => !used.has(idx) && (p.uri || p.id || "") === ident && Boolean(p._rowKey),
      );
      if (identIdx >= 0) {
        used.add(identIdx);
        return { ...item, _rowKey: prev[identIdx]._rowKey };
      }
    }
    return item;
  });
}

export const DeckifyExpandedModal: FC<{ closeModal?: () => void }> = ({ closeModal }) => {
  const closeModalRef = useRef(closeModal);
  closeModalRef.current = closeModal;
  useEffect(() => () => { closeModalRef.current?.(); }, []);

  const [mode, setMode] = useState<ViewMode>("now_playing");
  const { status, setStatus, currentPositionMs, refreshStatus, clock } = usePlaybackStatus();
  const hasResolvedInitialModeRef = useRef(false);

  useEffect(() => {
    if (hasResolvedInitialModeRef.current || !status) return;
    hasResolvedInitialModeRef.current = true;
    const activeTrack = status.track_meta || status.track;
    if (!activeTrack?.name) {
      setMode((prev) => (prev === "now_playing" ? "discovery" : prev));
    }
  }, [status]);

  // Drill-down states
  const [activePlaylist, setActivePlaylist] = useState<PlaylistItem | null>(null);
  const [playlistTracks, setPlaylistTracks] = useState<TrackItem[]>([]);
  const [activeAlbum, setActiveAlbum] = useState<AlbumItem | null>(null);
  const [albumTracks, setAlbumTracks] = useState<TrackItem[]>([]);
  const [activeArtist, setActiveArtist] = useState<ArtistItem | null>(null);
  const [artistTopTracks, setArtistTopTracks] = useState<TrackItem[]>([]);
  const [artistAlbums, setArtistAlbums] = useState<AlbumItem[]>([]);
  const [actionTrack, setActionTrack] = useState<TrackItem | null>(null);
  const [actionCollection, setActionCollection] = useState<PinnedPlaylistItem | null>(null);
  const [showAddToPlaylistModal, setShowAddToPlaylistModal] = useState(false);
  const [playlistPickerOpen, setPlaylistPickerOpen] = useState(false);

  // Library & Data states
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [allUserPlaylists, setAllUserPlaylists] = useState<PlaylistItem[]>([]);
  const [likedTracks, setLikedTracks] = useState<TrackItem[]>([]);
  const [likedTotal, setLikedTotal] = useState(0);
  const [savedAlbums, setSavedAlbums] = useState<AlbumItem[]>([]);
  const [followedArtists, setFollowedArtists] = useState<ArtistItem[]>([]);
  const [recentlyPlayed, setRecentlyPlayed] = useState<TrackItem[]>([]);
  const [savedEpisodes, setSavedEpisodes] = useState<EpisodeItem[]>([]);
  const [savedShows, setSavedShows] = useState<any[]>([]);
  const [queueTracks, setQueueTracks] = useState<TrackItem[]>([]);
  const [loadingContent, setLoadingContent] = useState(false);
  const [mixingBusy, setMixingBusy] = useState(false);

  // Lyrics states
  const [syncedLyrics, setSyncedLyrics] = useState<SyncedLine[]>([]);
  const [plainLyrics, setPlainLyrics] = useState<string | null>(null);
  const [plainRomanizedLines, setPlainRomanizedLines] = useState<(string | null)[] | null>(null);
  const [lyricsSource, setLyricsSource] = useState<string | null>(null);
  const [lyricsCached, setLyricsCached] = useState(false);
  const [lyricsOffset, setLyricsOffset] = useState(0);
  const [trackOffsetMs, setTrackOffsetMs] = useState(0);
  const [loadingLyrics, setLoadingLyrics] = useState(false);
  const [currentLineIndex, setCurrentLineIndex] = useState(-1);
  const activeLineRef = useRef<HTMLDivElement | null>(null);
  const hasLyricsRef = useRef(false);
  hasLyricsRef.current = syncedLyrics.length > 0 || Boolean(plainLyrics);
  const trackOffsetMsRef = useRef(trackOffsetMs);
  trackOffsetMsRef.current = trackOffsetMs;

  // UI state & refs
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<any>(null);
  const [pillMsg, setPillMsg] = useState<string | null>(null);
  const [activeShow, setActiveShow] = useState<ShowItem | null>(null);
  const [showEpisodes, setShowEpisodes] = useState<EpisodeItem[]>([]);
  const [loadingShowEpisodes, setLoadingShowEpisodes] = useState(false);
  const [artistAllTracks, setArtistAllTracks] = useState<TrackItem[]>([]);
  const [artistAllTracksOffset, setArtistAllTracksOffset] = useState(0);
  const [artistAllTracksHasMore, setArtistAllTracksHasMore] = useState(false);
  const [loadingAllTracks, setLoadingAllTracks] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFilter, setSearchFilter] = useState<SearchFilterTab>("all");
  const [searchResults, setSearchResults] = useState<SearchResults>({});
  const [tileSearchMode, setTileSearchMode] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [focusedHistoryQuery, setFocusedHistoryQuery] = useState<string | null>(null);
  const [isGrabbing, setIsGrabbing] = useState(false);
  const isGrabbingRef = useRef(isGrabbing);
  isGrabbingRef.current = isGrabbing;
  const [isCrudModalOpen, setIsCrudModalOpen] = useState(false);
  const isCrudModalOpenRef = useRef(isCrudModalOpen);
  isCrudModalOpenRef.current = isCrudModalOpen;
  const [pendingEditPlaylist, setPendingEditPlaylist] = useState<PlaylistItem | null>(null);
  const [pendingDeletePlaylist, setPendingDeletePlaylist] = useState<PlaylistItem | null>(null);
  const [travelModeEnabled, setTravelModeEnabled] = useState(false);
  const [travelModeAutoEnabled, setTravelModeAutoEnabled] = useState(true);
  const [offlineDownloads, setOfflineDownloads] = useState<Record<string, OfflineDownloadItem>>({});
  const [jamSession, setJamSession] = useState<JamSessionStatus | null>(null);
  const [jamModalOpen, setJamModalOpen] = useState(false);
  const [jamLoading, setJamLoading] = useState(false);
  const [pendingEngineSwitchDownload, setPendingEngineSwitchDownload] = useState<{
    uri: string;
    name: string;
    type: "playlist" | "album" | "episode" | "show";
    image_url?: string | null;
  } | null>(null);
  const jamModalOpenRef = useRef(jamModalOpen);
  jamModalOpenRef.current = jamModalOpen;
  const pendingEngineSwitchDownloadRef = useRef(pendingEngineSwitchDownload);
  pendingEngineSwitchDownloadRef.current = pendingEngineSwitchDownload;
  const grabCancelRef = useRef<(() => boolean) | null>(null);
  const grabCommitRef = useRef<(() => Promise<void> | void) | null>(null);
  const queueGrabTriggerRef = useRef<((track: TrackItem) => void) | null>(null);
  const playlistGrabTriggerRef = useRef<((track: TrackItem) => void) | null>(null);

  useEffect(() => {
    const persisted = status?.settings?.search_history;
    if (Array.isArray(persisted)) {
      setSearchHistory(persisted);
    }
  }, [status?.settings?.search_history]);

  const handleUpdateSearchHistory = useCallback(async (next: string[]) => {
    setSearchHistory(next);
    try {
      await backendSetSetting("search_history", next);
    } catch (err) {
      console.error("Failed to persist search_history:", err);
    }
  }, []);

  const handleFocusHistoryPill = useCallback((q: string | null) => {
    focusedHistoryQueryRef.current = q;
    setFocusedHistoryQuery(q);
  }, []);

  const handleRemoveHistoryQuery = useCallback(
    (q: string) => {
      const next = searchHistoryRef.current.filter((item) => item !== q);
      focusedHistoryQueryRef.current = null;
      setFocusedHistoryQuery(null);
      void handleUpdateSearchHistory(next);
    },
    [handleUpdateSearchHistory],
  );
  const pillTimerRef = useRef<any>(null);
  const pendingSeekDeltaSecRef = useRef(0);
  const seekDebounceTimerRef = useRef<any>(null);
  const seekBaseMsRef = useRef(0);
  const currentPositionMsRef = useRef(currentPositionMs);
  currentPositionMsRef.current = currentPositionMs;
  const activePlaylistRef = useRef<PlaylistItem | null>(null);
  activePlaylistRef.current = activePlaylist;
  const activeAlbumRef = useRef<AlbumItem | null>(null);
  activeAlbumRef.current = activeAlbum;
  const activeArtistRef = useRef<ArtistItem | null>(null);
  activeArtistRef.current = activeArtist;
  const activeShowRef = useRef<ShowItem | null>(null);
  activeShowRef.current = activeShow;
  const isSpokenRef = useRef(false);
  const actionTrackRef = useRef<TrackItem | null>(null);
  actionTrackRef.current = actionTrack;
  const actionCollectionRef = useRef<PinnedPlaylistItem | null>(null);
  actionCollectionRef.current = actionCollection;
  const focusedTrackRef = useRef<TrackItem | null>(null);
  const focusedCollectionRef = useRef<PinnedPlaylistItem | null>(null);
  const contentPaneRef = useRef<HTMLDivElement | null>(null);
  const navigationHistoryRef = useRef<NavHistoryEntry[]>([]);
  const focusedHistoryQueryRef = useRef<string | null>(null);
  focusedHistoryQueryRef.current = focusedHistoryQuery;
  const searchHistoryRef = useRef<string[]>(searchHistory);
  searchHistoryRef.current = searchHistory;
  const modeRef = useRef<ViewMode>(mode);
  modeRef.current = mode;
  const searchQueryRef = useRef(searchQuery);
  searchQueryRef.current = searchQuery;

  const pushNavHistory = useCallback(() => {
    const focusLabel =
      typeof document !== "undefined"
        ? document.activeElement?.getAttribute?.("data-deckify-label") || undefined
        : undefined;
    const entry: NavHistoryEntry = {
      mode: modeRef.current,
      activeAlbum: activeAlbumRef.current,
      activeArtist: activeArtistRef.current,
      activePlaylist: activePlaylistRef.current,
      activeShow: activeShowRef.current,
      scrollTop: contentPaneRef.current?.scrollTop || 0,
      focusLabel,
    };
    const current = Array.isArray(navigationHistoryRef.current)
      ? navigationHistoryRef.current
      : [];
    navigationHistoryRef.current = [...current.slice(-9), entry];
  }, []);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 3000);
  }, []);

  const showPill = useCallback((msg: string) => {
    setPillMsg(msg);
    if (pillTimerRef.current) clearTimeout(pillTimerRef.current);
    pillTimerRef.current = setTimeout(() => setPillMsg(null), 1000);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      if (pillTimerRef.current) clearTimeout(pillTimerRef.current);
      if (seekDebounceTimerRef.current) clearTimeout(seekDebounceTimerRef.current);
    };
  }, []);

  // Library Loaders
  const loadFolders = useCallback(async () => {
    try {
      const res = await backendGetPlaylistFolders();
      if (res.ok && res.folders) setFolders(res.folders);
      const plRes = await backendGetPlaylists(0);
      if (plRes.ok && plRes.playlists) setAllUserPlaylists(plRes.playlists);
    } catch {}
  }, []);

  const loadLikedTracks = useCallback(async (more = false) => {
    setLoadingContent(true);
    try {
      const offset = more ? likedTracks.length : 0;
      const res = await backendGetLikedTracks(offset, false);
      if (res.ok && res.tracks) {
        setLikedTracks((prev) => (more ? [...prev, ...res.tracks!] : res.tracks!));
        if (res.total) setLikedTotal(res.total);
      }
    } catch {}
    setLoadingContent(false);
  }, [likedTracks.length]);

  const loadAlbums = useCallback(async () => {
    setLoadingContent(true);
    try {
      const res = await backendGetSavedAlbums(0);
      if (res.ok && res.albums) setSavedAlbums(res.albums);
    } catch {}
    setLoadingContent(false);
  }, []);

  const loadArtists = useCallback(async () => {
    setLoadingContent(true);
    try {
      const res = await backendGetFollowedArtists();
      if (res.ok && res.artists) setFollowedArtists(res.artists);
    } catch {}
    setLoadingContent(false);
  }, []);

  const loadRecent = useCallback(async (silent = false) => {
    if (!silent) setLoadingContent(true);
    try {
      const res = await backendGetRecentlyPlayed(40);
      if (res.ok && res.tracks) setRecentlyPlayed(res.tracks);
    } catch {}
    if (!silent) setLoadingContent(false);
  }, []);

  const loadEpisodes = useCallback(async () => {
    setLoadingContent(true);
    try {
      const [epRes, showRes] = await Promise.all([
        backendGetSavedEpisodes(0),
        backendGetSavedShows(0),
      ]);
      if (epRes.ok && epRes.episodes) setSavedEpisodes(epRes.episodes);
      if (showRes.ok && showRes.shows) setSavedShows(showRes.shows);
    } catch {}
    setLoadingContent(false);
  }, []);

  const loadQueue = useCallback(async () => {
    if (isGrabbingRef.current) return;
    try {
      const res = await backendGetQueue();
      if (isGrabbingRef.current) return;
      if (res.ok && res.queue) {
        setQueueTracks((prev) => assignStableRowKeys(mergeQueueRowKeys(prev, res.queue!), "q"));
      }
    } catch {}
  }, []);

  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  useEffect(() => {
    if (mode === "liked") loadLikedTracks();
    else if (mode === "albums") loadAlbums();
    else if (mode === "artists") loadArtists();
    else if (mode === "recent") loadRecent();
    else if (mode === "episodes") loadEpisodes();
  }, [mode, loadLikedTracks, loadAlbums, loadArtists, loadRecent, loadEpisodes]);

  useEffect(() => {
    if (mode !== "queue") return undefined;
    loadQueue();
    if (!status?.is_playing) return undefined;
    const interval = setInterval(loadQueue, 30000);
    return () => clearInterval(interval);
  }, [mode, loadQueue, status?.is_playing]);

  // Drill-down open handlers
  const handleOpenPlaylist = useCallback(async (pl: PlaylistItem) => {
    pushNavHistory();
    focusedCollectionRef.current = null;
    setActivePlaylist(pl);
    setPlaylistTracks([]);
    setMode("playlists");
    setLoadingContent(true);
    try {
      const res = await backendGetPlaylistTracks(pl.id, 0, true);
      if (res.ok && res.tracks) {
        setPlaylistTracks(assignStableRowKeys(res.tracks, "pl"));
        setActivePlaylist((prev) =>
          prev
            ? {
                ...prev,
                name: res.playlist_name || prev.name,
                description: res.playlist_description ?? prev.description,
                is_mixed: res.is_mixed !== undefined ? res.is_mixed : prev.is_mixed,
              }
            : null
        );
      } else {
        showToast(res?.error || "Failed to load playlist tracks");
      }
    } catch {
      showToast("Failed to load playlist tracks");
    }
    setLoadingContent(false);
  }, [pushNavHistory, showToast]);

  const handleOpenAlbum = useCallback(async (alb: AlbumItem) => {
    pushNavHistory();
    focusedCollectionRef.current = null;
    setActiveAlbum(alb);
    setMode("albums");
    setLoadingContent(true);
    try {
      const res = await backendGetAlbumTracks(alb.id, 0);
      if (res.ok && res.tracks) setAlbumTracks(res.tracks);
    } catch {}
    setLoadingContent(false);
  }, [pushNavHistory]);

  const handleOpenArtist = useCallback(async (art: ArtistItem) => {
    pushNavHistory();
    setActiveArtist(art);
    setArtistTopTracks([]);
    setArtistAlbums([]);
    setArtistAllTracks([]);
    setArtistAllTracksOffset(0);
    setArtistAllTracksHasMore(false);
    setMode("artists");
    setLoadingContent(true);
    try {
      const [topRes, albRes, allRes] = await Promise.all([
        backendGetArtistTopTracks(art.id),
        backendGetArtistAlbums(art.id, 0),
        backendGetArtistAllTracks(art.id, 0, 3),
      ]);
      if (topRes.ok && topRes.tracks) setArtistTopTracks(topRes.tracks);
      if (albRes.ok && albRes.albums) setArtistAlbums(albRes.albums);
      if (allRes.ok) {
        if (allRes.tracks) setArtistAllTracks(allRes.tracks);
        setArtistAllTracksOffset(allRes.next_album_offset ?? 3);
        setArtistAllTracksHasMore(Boolean(allRes.has_more));
      }
      if (!topRes.ok && !albRes.ok && !allRes.ok) {
        showToast("Failed to load artist details — check your connection and try again.");
      }
      if (!art.image_url && art.id) {
        backendGetArtistInfo(art.id)
          .then((infoRes) => {
            if (infoRes?.ok && infoRes.artist) {
              setActiveArtist((prev) => (prev && prev.id === art.id ? { ...prev, ...infoRes.artist } : prev));
            }
          })
          .catch(() => {});
      }
    } catch {
      showToast("Failed to load artist details — check your connection and try again.");
    }
    setLoadingContent(false);
  }, [pushNavHistory, showToast]);

  const handleLoadMoreArtistTracks = useCallback(async () => {
    const art = activeArtistRef.current;
    if (!art?.id || loadingAllTracks) return;
    setLoadingAllTracks(true);
    try {
      const res = await backendGetArtistAllTracks(art.id, artistAllTracksOffset, 3);
      if (res?.ok) {
        if (Array.isArray(res.tracks) && res.tracks.length > 0) {
          setArtistAllTracks((prev) => [...prev, ...res.tracks!]);
        }
        setArtistAllTracksOffset(res.next_album_offset ?? artistAllTracksOffset + 3);
        setArtistAllTracksHasMore(Boolean(res.has_more));
      } else {
        showToast("Failed to load artist details — check your connection and try again.");
      }
    } catch {
      showToast("Failed to load artist details — check your connection and try again.");
    }
    setLoadingAllTracks(false);
  }, [artistAllTracksOffset, loadingAllTracks, showToast]);

  const handleOpenShow = useCallback(async (show: ShowItem) => {
    pushNavHistory();
    focusedCollectionRef.current = null;
    setActiveShow(show);
    setShowEpisodes([]);
    setMode("episodes");
    setLoadingShowEpisodes(true);
    try {
      const res = await backendGetShowEpisodes(show.id, 0);
      if (res.ok && res.episodes) {
        setShowEpisodes(res.episodes);
      } else {
        showToast(res?.error || "Failed to load show episodes — check your connection and try again.");
      }
    } catch {
      showToast("Failed to load show episodes — check your connection and try again.");
    }
    setLoadingShowEpisodes(false);
  }, [pushNavHistory, showToast]);

  const handleSetPlaybackSpeed = useCallback(async (speed: number) => {
    try {
      const res = await backendSetPlaybackSpeed(speed);
      if (res?.ok) {
        refreshStatus();
      } else if (res?.unsupported_backend) {
        showToast("Playback speed requires the Official Spotify Client engine.");
      } else {
        showToast(res?.error || "Failed to change playback speed — please try again.");
      }
    } catch {
      showToast("Failed to change playback speed — please try again.");
    }
  }, [refreshStatus, showToast]);

  const handlePlayAiDj = useCallback(async () => {
    if (status?.audio_backend !== "spotify_client") {
      showToast("Requires Official Spotify Client");
      return;
    }
    try {
      const res = await backendPlayAiDj("spotify:playlist:37i9dQZF1EYkqdzj48dyYq");
      if (res?.ok) {
        showToast("Starting AI DJ");
      } else if (res?.requires_spotify_client) {
        showToast("Requires Official Spotify Client");
      } else {
        showToast(res?.error || "Failed to start AI DJ");
      }
    } catch {
      showToast("Failed to start AI DJ");
    }
  }, [status?.audio_backend, showToast]);

  const loadOfflineDownloads = useCallback(async () => {
    try {
      const res = await backendGetOfflineDownloadsList();
      if (res?.ok && Array.isArray(res.items)) {
        const next: Record<string, OfflineDownloadItem> = {};
        for (const item of res.items) {
          if (item?.uri) next[item.uri] = item;
        }
        setOfflineDownloads(next);
      }
    } catch {
      // Non-fatal
    }
  }, []);

  useEffect(() => {
    void loadOfflineDownloads();
  }, [loadOfflineDownloads]);

  useEffect(() => {
    if (!status) return;
    if (typeof status.travel_mode_enabled === "boolean") {
      setTravelModeEnabled(status.travel_mode_enabled);
    }
    const autoVal = status.travel_mode_auto_enabled ?? status.settings?.travel_mode_auto_enabled;
    if (typeof autoVal === "boolean") {
      setTravelModeAutoEnabled(autoVal);
    }
    if (status.jam_session !== undefined) {
      setJamSession(status.jam_session ?? null);
    }
  }, [status]);

  useEffect(() => {
    if (typeof addEventListener !== "function" || typeof removeEventListener !== "function") return;
    const onTravelModeChanged = (payload: {
      travel_mode_enabled?: boolean;
      travel_mode_auto_enabled?: boolean;
    }) => {
      if (typeof payload?.travel_mode_enabled === "boolean") {
        setTravelModeEnabled(payload.travel_mode_enabled);
      }
      if (typeof payload?.travel_mode_auto_enabled === "boolean") {
        setTravelModeAutoEnabled(payload.travel_mode_auto_enabled);
      }
    };
    const onLowDiskSpace = (payload: { min_free_gb?: number }) => {
      const minGb = typeof payload?.min_free_gb === "number" ? payload.min_free_gb : 3.0;
      showToast(
        `Low disk space: Free up storage above the ${minGb} GB threshold or change your offline storage path in Settings to resume downloads.`,
      );
      void loadOfflineDownloads();
    };
    addEventListener("travel_mode_changed", onTravelModeChanged);
    addEventListener("low_disk_space", onLowDiskSpace);
    return () => {
      removeEventListener("travel_mode_changed", onTravelModeChanged);
      removeEventListener("low_disk_space", onLowDiskSpace);
    };
  }, [showToast, loadOfflineDownloads]);

  const handleToggleTravelMode = useCallback(
    async (enabled: boolean, manual = true, autoEnabled?: boolean) => {
      try {
        const res = await backendSetTravelMode(enabled, manual, autoEnabled);
        if (res?.ok) {
          setTravelModeEnabled(Boolean(res.travel_mode_enabled ?? enabled));
          if (typeof res.travel_mode_auto_enabled === "boolean") {
            setTravelModeAutoEnabled(res.travel_mode_auto_enabled);
          }
          refreshStatus();
        } else {
          showToast(res?.error || "Failed to update Offline Travel Mode.");
        }
      } catch {
        showToast("Failed to update Offline Travel Mode.");
      }
    },
    [refreshStatus, showToast],
  );

  const handleExitTravelMode = useCallback(() => {
    void handleToggleTravelMode(false, true);
  }, [handleToggleTravelMode]);

  const handleToggleOfflineDownload = useCallback(
    async (item: OfflineTogglePayload) => {
      const currentBackend = status?.audio_backend || status?.settings?.audio_backend || "librespot";
      if (item.isDownloaded) {
        try {
          const res = await backendToggleOfflineDownload(item.uri, false);
          if (res?.ok) {
            await loadOfflineDownloads();
            showToast("Removed offline download");
          } else {
            showToast(res?.error || "Failed to remove offline download.");
          }
        } catch {
          showToast("Failed to remove offline download.");
        }
        return;
      }
      if (currentBackend !== "spotify_client") {
        setPendingEngineSwitchDownload({
          uri: item.uri,
          name: item.name,
          type: item.type,
          image_url: item.image_url,
        });
        return;
      }
      try {
        const res = await backendToggleOfflineDownload(item.uri, true, {
          name: item.name,
          type: item.type,
          image_url: item.image_url,
        });
        if (res?.low_disk_space) {
          const minGb = typeof res.min_free_gb === "number" ? res.min_free_gb : 3.0;
          showToast(
            `Low disk space: Free up storage above the ${minGb} GB threshold or change your offline storage path in Settings to resume downloads.`,
          );
        } else if (res?.ok) {
          await loadOfflineDownloads();
        } else {
          showToast(res?.error || "Failed to start offline download.");
        }
      } catch {
        showToast("Failed to start offline download.");
      }
    },
    [status?.audio_backend, status?.settings?.audio_backend, loadOfflineDownloads, showToast],
  );

  const handleConfirmEngineSwitchDownload = useCallback(async () => {
    const pending = pendingEngineSwitchDownloadRef.current;
    if (!pending) return;
    setPendingEngineSwitchDownload(null);
    try {
      const switchRes = await backendSwitchAudioBackend("spotify_client");
      if (!switchRes?.ok) {
        showToast(switchRes?.error || "Failed to switch to Official Spotify Client.");
        return;
      }
      refreshStatus();
      const dlRes = await backendToggleOfflineDownload(pending.uri, true, {
        name: pending.name,
        type: pending.type,
        image_url: pending.image_url,
      });
      if (dlRes?.low_disk_space) {
        const minGb = typeof dlRes.min_free_gb === "number" ? dlRes.min_free_gb : 3.0;
        showToast(
          `Low disk space: Free up storage above the ${minGb} GB threshold or change your offline storage path in Settings to resume downloads.`,
        );
      } else if (dlRes?.ok) {
        await loadOfflineDownloads();
        showToast(`Downloading ${pending.name} for offline`);
      } else {
        showToast(dlRes?.error || "Failed to start offline download.");
      }
    } catch {
      showToast("Failed to switch to Official Spotify Client.");
    }
  }, [refreshStatus, loadOfflineDownloads, showToast]);

  const handleOpenJamModal = useCallback(async () => {
    setJamModalOpen(true);
    const currentBackend = status?.audio_backend || status?.settings?.audio_backend || "librespot";
    if (currentBackend !== "spotify_client") return;
    setJamLoading(true);
    try {
      const res = await backendStartSpotifyJam();
      if (res?.ok) {
        setJamSession({
          active: Boolean(res.active ?? true),
          join_url: res.join_url,
          guest_count: res.guest_count,
          is_host: res.is_host,
          error: res.error,
        });
      } else if (res?.error) {
        setJamSession({ active: false, error: res.error });
      }
    } catch {
      setJamSession({ active: false, error: "Failed to start Spotify Jam." });
    } finally {
      setJamLoading(false);
    }
  }, [status?.audio_backend, status?.settings?.audio_backend]);

  const handleEndJam = useCallback(async () => {
    try {
      const res = await backendEndSpotifyJam();
      if (res?.ok) {
        setJamSession({ active: false });
        setJamModalOpen(false);
        showToast("Ended Spotify Jam");
      } else {
        showToast(res?.error || "Failed to end Spotify Jam.");
      }
    } catch {
      showToast("Failed to end Spotify Jam.");
    }
  }, [showToast]);

  const handleSwitchToSpotifyClientAndStartJam = useCallback(async () => {
    setJamLoading(true);
    try {
      const switchRes = await backendSwitchAudioBackend("spotify_client");
      if (!switchRes?.ok) {
        showToast(switchRes?.error || "Failed to switch to Official Spotify Client.");
        return;
      }
      refreshStatus();
      const jamRes = await backendStartSpotifyJam();
      if (jamRes?.ok) {
        setJamSession({
          active: Boolean(jamRes.active ?? true),
          join_url: jamRes.join_url,
          guest_count: jamRes.guest_count,
          is_host: jamRes.is_host,
          error: jamRes.error,
        });
      } else if (jamRes?.error) {
        showToast(jamRes.error);
      }
    } catch {
      showToast("Failed to start Spotify Jam.");
    } finally {
      setJamLoading(false);
    }
  }, [refreshStatus, showToast]);

  // Lyrics Loader
  const track = status?.track_meta || status?.track;
  isSpokenRef.current = isSpokenContent(track);
  const activeTrackId = track?.track_id || track?.id || "";
  const lastRecentTrackIdRef = useRef<string>(activeTrackId);

  useEffect(() => {
    if (mode !== "recent") {
      lastRecentTrackIdRef.current = activeTrackId;
      return undefined;
    }
    const interval = setInterval(() => loadRecent(true), 30000);
    if (!activeTrackId || lastRecentTrackIdRef.current === activeTrackId) {
      return () => clearInterval(interval);
    }
    lastRecentTrackIdRef.current = activeTrackId;
    const t1 = setTimeout(() => loadRecent(true), 5000);
    return () => {
      clearInterval(interval);
      clearTimeout(t1);
    };
  }, [mode, activeTrackId, loadRecent]);
  const trackName = track?.name;
  const artistName = track?.artist;
  const durationSec = Math.round((track?.duration_ms || 0) / 1000);

  const romanizeEnabled = Boolean(status?.settings?.romanize_lyrics_enabled);
  const romanizeDisplayStyle: "dual" | "romanized_only" =
    status?.settings?.romanize_display_style === "romanized_only" ? "romanized_only" : "dual";

  const fetchLyrics = useCallback(async (offset = 0, forceRefresh = false) => {
    if (!trackName || !artistName) return;
    setLoadingLyrics(true);
    const keepExistingOnFailure = (forceRefresh || offset > 0) && hasLyricsRef.current;
    try {
      const res = await backendGetLyrics(
        trackName,
        artistName,
        durationSec,
        offset,
        activeTrackId || "",
        forceRefresh,
      );
      if (res.ok) {
        setLyricsSource(res.source || "Auto");
        setLyricsCached(Boolean(res.cached));
        if (res.synced_lyrics) {
          const lines =
            res.romanized_lines && res.romanized_lines.length > 0
              ? res.romanized_lines
              : parseLrc(res.synced_lyrics);
          setSyncedLyrics(lines);
          setPlainLyrics(null);
          setPlainRomanizedLines(null);
        } else if (res.plain_lyrics) {
          setPlainLyrics(res.plain_lyrics);
          setPlainRomanizedLines(res.romanized_plain ?? null);
          setSyncedLyrics([]);
        } else if (keepExistingOnFailure) {
          showToast("Offline or source unavailable — keeping cached lyrics.");
        } else {
          setSyncedLyrics([]);
          setPlainLyrics(null);
          setPlainRomanizedLines(null);
        }
      } else if (keepExistingOnFailure) {
        showToast("Offline or source unavailable — keeping cached lyrics.");
      } else {
        setSyncedLyrics([]);
        setPlainLyrics(null);
        setPlainRomanizedLines(null);
        setLyricsCached(false);
      }
    } catch {
      if (keepExistingOnFailure) {
        showToast("Offline or source unavailable — keeping cached lyrics.");
      } else {
        setSyncedLyrics([]);
        setPlainLyrics(null);
        setPlainRomanizedLines(null);
        setLyricsCached(false);
      }
    } finally {
      setLoadingLyrics(false);
    }
  }, [trackName, artistName, durationSec, activeTrackId, showToast]);

  useEffect(() => {
    if (mode !== "lyrics") return;
    setLyricsOffset(0);
    fetchLyrics(0, false);
  }, [mode, trackName, artistName, durationSec, romanizeEnabled, fetchLyrics]);

  useEffect(() => {
    if (!activeTrackId) {
      setTrackOffsetMs(0);
      return;
    }
    let cancelled = false;
    backendGetTrackLyricsOffset(activeTrackId)
      .then((res) => {
        if (!cancelled && res.ok && typeof res.offset_ms === "number") {
          setTrackOffsetMs(Math.max(-10000, Math.min(10000, res.offset_ms)));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [activeTrackId]);

  useEffect(() => {
    if (typeof addEventListener !== "function" || typeof removeEventListener !== "function") return;
    const handler = (payload: { track_id?: string; offset_ms?: number }) => {
      if (payload?.track_id && payload.track_id === activeTrackId && typeof payload.offset_ms === "number") {
        setTrackOffsetMs(Math.max(-10000, Math.min(10000, payload.offset_ms)));
      }
    };
    addEventListener("lyrics_offset_changed", handler);
    return () => {
      removeEventListener("lyrics_offset_changed", handler);
    };
  }, [activeTrackId]);

  const saveTrackOffset = useCallback(
    async (nextOffset: number) => {
      const clamped = Math.max(-10000, Math.min(10000, nextOffset));
      setTrackOffsetMs(clamped);
      if (!activeTrackId) return;
      try {
        const res = await backendSetTrackLyricsOffset(activeTrackId, clamped);
        if (!res.ok) {
          showToast("Failed to save lyric sync offset — please try again.");
        }
      } catch {
        showToast("Failed to save lyric sync offset — please try again.");
      }
    },
    [activeTrackId, showToast],
  );

  const handleNudgeOffset = useCallback(
    (deltaMs: number) => {
      saveTrackOffset(trackOffsetMsRef.current + deltaMs);
    },
    [saveTrackOffset],
  );

  const handleResetOffset = useCallback(() => {
    saveTrackOffset(0);
  }, [saveTrackOffset]);

  const handleToggleRomanize = useCallback(async () => {
    try {
      await backendSetSetting("romanize_lyrics_enabled", !romanizeEnabled);
      refreshStatus();
    } catch {
      showToast("Failed to update romanization setting.");
    }
  }, [romanizeEnabled, refreshStatus, showToast]);

  const handleNextLyricsSource = useCallback(() => {
    const nextOffset = (lyricsOffset + 1) % 5;
    setLyricsOffset(nextOffset);
    fetchLyrics(nextOffset, true);
    showToast("Trying next lyrics provider...");
  }, [lyricsOffset, fetchLyrics, showToast]);

  const handleSelectLyricsSource = useCallback(
    (offset: number, label: string) => {
      setLyricsOffset(offset);
      fetchLyrics(offset, true);
      showToast(`Loading lyrics from ${label}...`);
    },
    [fetchLyrics, showToast]
  );

  useEffect(() => {
    if (!syncedLyrics.length) return;
    const effectivePosMs = currentPositionMs - trackOffsetMs;
    let idx = -1;
    for (let i = 0; i < syncedLyrics.length; i++) {
      if (effectivePosMs >= syncedLyrics[i].timeMs) idx = i;
      else break;
    }
    setCurrentLineIndex(idx);
  }, [currentPositionMs, trackOffsetMs, syncedLyrics]);

  useEffect(() => {
    if (activeLineRef.current) {
      activeLineRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [currentLineIndex]);

  // Native Mix toggle
  const handleToggleMix = useCallback(async () => {
    if (!activePlaylist || mixingBusy) return;
    setMixingBusy(true);
    const targetMix = !activePlaylist.is_mixed;
    const pid = activePlaylist.uri || activePlaylist.id || "";
    try {
      const res = await backendSetNativeMix(pid, targetMix, true);
      if (res.ok) {
        setActivePlaylist((prev) => (prev ? { ...prev, is_mixed: targetMix } : null));
        showToast(targetMix ? "Native Mix activated!" : "Native Mix deactivated.");
      } else {
        showToast(`Mix error: ${res.error || "Failed"}`);
      }
    } catch {
      showToast("Error applying mix.");
    } finally {
      setMixingBusy(false);
    }
  }, [activePlaylist, mixingBusy, showToast]);

  // Playback Control Handlers
  const isPlaying = status?.is_playing;
  const handlePlayPause = useCallback(async () => {
    await backendControlPlayback(isPlaying ? "pause" : "play", "");
    refreshStatus();
  }, [isPlaying, refreshStatus]);

  const handleNext = useCallback(async () => {
    await backendControlPlayback("next", "");
    refreshStatus();
  }, [refreshStatus]);

  const handlePrev = useCallback(async () => {
    await backendControlPlayback("previous", "");
    refreshStatus();
  }, [refreshStatus]);

  const handleToggleLike = useCallback(async (trackId?: string) => {
    const tid = trackId || (status?.track_meta || status?.track)?.track_id || (status?.track_meta || status?.track)?.id;
    if (!tid) return;
    try {
      const res = await backendToggleLike(tid, null);
      if (res?.ok) {
        showToast(res.is_liked ? "Added to Liked Songs" : "Removed from Liked Songs");
        refreshStatus();
      } else {
        showToast(res?.error || "Failed to update Liked Songs");
      }
    } catch {
      showToast("Failed to update Liked Songs");
    }
  }, [status, showToast, refreshStatus]);

  const handleToggleRepeat = useCallback(async () => {
    const current = status?.repeat_state || "off";
    const next = current === "off" ? "context" : current === "context" ? "track" : "off";
    await backendSetRepeat(next, "");
    showToast(next === "track" ? "Repeat: Track" : next === "context" ? "Repeat: Context" : "Repeat: Off");
    refreshStatus();
  }, [status, showToast, refreshStatus]);

  const handleSetShuffle = useCallback(async (state: boolean) => {
    await backendSetShuffle(state, "");
    showToast(state ? "Shuffle: On" : "Shuffle: Off");
    refreshStatus();
  }, [showToast, refreshStatus]);

  const handlePlayTrack = useCallback(async (uri: string, contextUri?: string, allUris?: string[], startIdx?: number) => {
    let res;
    if (contextUri) {
      res = await backendPlayTracks(contextUri, uri || null, null, startIdx ?? 0);
    } else if (allUris && allUris.length > 0) {
      res = await backendPlayTracks(null, uri || null, allUris, startIdx ?? 0);
    } else {
      res = await backendPlayTracks(null, uri || null, null, 0);
    }
    if (res && res.ok === false) {
      showToast(res.error || "Playback failed");
      return;
    }
    showToast("Playback started");
    refreshStatus();
  }, [showToast, refreshStatus]);

  const handlePlayQueueTrack = useCallback(async (clickedTrack: TrackItem, idx: number) => {
    const remaining = queueTracks.slice(idx + 1);
    setQueueTracks(remaining);

    setStatus((prev) => {
      const promotedMeta: TrackMeta = {
        name: clickedTrack.name || "",
        artist: clickedTrack.artist || "",
        album: clickedTrack.album || "",
        artwork_url: clickedTrack.artwork_url || clickedTrack.image_url || null,
        image_url: clickedTrack.image_url || clickedTrack.artwork_url || null,
        duration_ms: clickedTrack.duration_ms || 0,
        uri: clickedTrack.uri,
        id: clickedTrack.id,
        track_id: clickedTrack.id,
        is_liked: clickedTrack.is_liked,
      };
      return prev
        ? {
            ...prev,
            is_playing: true,
            position_ms: 0,
            track: promotedMeta,
            track_meta: promotedMeta,
          }
        : ({
            is_playing: true,
            position_ms: 0,
            track: promotedMeta,
            track_meta: promotedMeta,
          } as StatusResponse);
    });

    const uris = queueTracks.slice(idx).map((x) => x.uri).filter(Boolean) as string[];
    try {
      const res = await backendPlayTracks(null, null, uris, 0);
      if (res && !res.ok && res.error) {
        showToast(res.error);
      } else {
        showToast("Playback started");
      }
    } catch {
      showToast("Failed to start playback");
    }

    refreshStatus();

    setTimeout(async () => {
      await loadQueue();
      await refreshStatus();
    }, 600);
  }, [queueTracks, setStatus, showToast, refreshStatus, loadQueue]);

  const handleReorderQueueTrack = useCallback(
    async (fromIndex: number, toIndex: number, nextTracks: TrackItem[]): Promise<boolean> => {
      const prevTracks = queueTracks;
      setQueueTracks(nextTracks);
      try {
        const res = await backendReorderQueueTrack(fromIndex, toIndex, nextTracks);
        if (!res?.ok) {
          setQueueTracks(prevTracks);
          showToast(res?.error || "Failed to reorder queue");
          return false;
        }
        return true;
      } catch {
        setQueueTracks(prevTracks);
        showToast("Failed to reorder queue");
        return false;
      }
    },
    [queueTracks, showToast],
  );

  const handleRemoveQueueTrack = useCallback(
    async (track: TrackItem, index: number): Promise<void> => {
      const prevTracks = queueTracks;
      const remaining = prevTracks.filter((q, i) =>
        track._rowKey && q._rowKey ? q._rowKey !== track._rowKey : i !== index,
      );
      setQueueTracks(remaining);
      try {
        const res = await backendRemoveQueueTrack(index, track.uri || "", track.uid || "", prevTracks);
        if (!res?.ok) {
          setQueueTracks(prevTracks);
          showToast(res?.error || "Failed to remove from queue");
          return;
        }
        showToast("Removed from queue");
      } catch {
        setQueueTracks(prevTracks);
        showToast("Failed to remove from queue");
      }
    },
    [queueTracks, showToast],
  );

  const handleClearQueue = useCallback(async (): Promise<void> => {
    const prevTracks = queueTracks;
    setQueueTracks([]);
    try {
      const res = await backendClearQueue();
      if (!res?.ok) {
        setQueueTracks(prevTracks);
        showToast(res?.error || "Failed to clear queue");
        return;
      }
      showToast("Queue cleared");
    } catch {
      setQueueTracks(prevTracks);
      showToast("Failed to clear queue");
    }
  }, [queueTracks, showToast]);

  const handleSeekDelta = useCallback((seconds: number) => {
    clock.scrubDelta(seconds * 1000);
  }, [clock]);

  const handleSeekPlayback = useCallback((timeMs: number) => {
    clock.scrubTo(timeMs);
  }, [clock]);

  const handleVolumeDelta = useCallback(async (delta: number) => {
    const cur = typeof status?.volume === "number" ? status.volume : 50;
    const target = Math.min(100, Math.max(0, cur + delta));
    await backendSetVolume(target);
    showToast(`Volume: ${target}%`);
    refreshStatus();
  }, [status, showToast, refreshStatus]);

  // Track Action Handlers
  const runStartRadio = useCallback(async (
    seedType: "track" | "artist" | "album",
    seedId: string,
    seedUri: string,
    seedName: string,
    seedArtist: string,
    successMsg: string,
  ) => {
    if (!seedId && !seedUri) return;
    try {
      const res = await backendStartRadio(seedType, seedId, seedUri, seedName, seedArtist);
      if (res?.ok) {
        showToast(successMsg);
        refreshStatus();
      } else {
        showToast("Could not start radio — please try again.");
      }
    } catch {
      showToast("Could not start radio — please try again.");
    }
  }, [showToast, refreshStatus]);

  const handleStartRadio = useCallback(async (t: TrackItem) => {
    const tid = t.id || t.uri?.replace("spotify:track:", "") || "";
    setActionTrack(null);
    await runStartRadio("track", tid, t.uri || "", t.name || "", t.artist || "", "Song Radio started");
  }, [runStartRadio]);

  const handleStartArtistRadio = useCallback(async (art: ArtistItem) => {
    await runStartRadio("artist", art.id || "", `spotify:artist:${art.id}`, art.name || "", art.name || "", "Artist Radio started");
  }, [runStartRadio]);

  const handleStartAlbumRadio = useCallback(async (alb: AlbumItem) => {
    await runStartRadio("album", alb.id || "", alb.uri || `spotify:album:${alb.id}`, alb.name || "", alb.artist || "", "Album Radio started");
  }, [runStartRadio]);

  const handleAddToQueue = useCallback(async (t: TrackItem) => {
    if (!t.uri) return;
    const res = await backendAddToQueue(t.uri, "");
    if (res.ok) showToast(`Added to queue: ${t.name}`);
    else showToast(`Queue error: ${res.error || "Failed"}`);
    setActionTrack(null);
  }, [showToast]);

  const handleAddTrackToPlaylist = useCallback(async (playlistId: string, playlistName: string) => {
    if (!actionTrack?.uri) return;
    const res = await backendAddTrackToPlaylist(playlistId, actionTrack.uri);
    if (res.ok) {
      recordPlaylistAddCount(playlistId);
      showToast(`Added to ${playlistName}`);
    } else showToast(`Error adding: ${res.error || "Failed"}`);
    setShowAddToPlaylistModal(false);
    setActionTrack(null);
  }, [actionTrack, showToast]);

  const handleRemovePlaylistTrack = useCallback(
    async (playlistId: string, track: TrackItem, originalIndex: number): Promise<void> => {
      const prevTracks = playlistTracks;
      setPlaylistTracks((prev) =>
        prev.filter((t, idx) =>
          track._rowKey && t._rowKey ? t._rowKey !== track._rowKey : idx !== originalIndex,
        ),
      );
      try {
        const res = await backendRemoveTrackFromPlaylist(
          playlistId,
          track.uri || "",
          originalIndex,
          track.uid || "",
        );
        if (!res?.ok) {
          setPlaylistTracks(prevTracks);
          showToast(`Error: ${res?.error || "Failed"}`);
          return;
        }
        showToast("Removed from playlist");
      } catch {
        setPlaylistTracks(prevTracks);
        showToast("Error: Failed to remove track");
      }
    },
    [playlistTracks, showToast],
  );

  const handleRemoveTrackFromActivePlaylist = useCallback(async () => {
    if (!activePlaylist?.id || !actionTrack?.uri) return;
    const idx = playlistTracks.findIndex(
      (t) => (actionTrack._rowKey && t._rowKey === actionTrack._rowKey) || t.uri === actionTrack.uri,
    );
    if (idx >= 0) {
      await handleRemovePlaylistTrack(activePlaylist.id, actionTrack, idx);
    }
    setActionTrack(null);
  }, [activePlaylist, actionTrack, playlistTracks, handleRemovePlaylistTrack]);

  // Playlist/Folder Management
  const handleCreatePlaylist = useCallback(async (name: string, description?: string) => {
    const res = await backendCreatePlaylist(name, false, description || "");
    if (res?.ok) {
      if (res.playlist) {
        setAllUserPlaylists((prev) => [res.playlist!, ...prev]);
      }
      showToast(`Playlist '${name}' created!`);
    } else {
      showToast(`Error: ${res?.error || "Failed"}`);
    }
  }, [showToast]);

  const handleCreatePlaylistWithTrack = useCallback(
    async (name: string, description: string, trackUri: string): Promise<void> => {
      const res = await backendCreatePlaylist(name, false, description || "");
      if (!res?.ok || !res.playlist) {
        showToast(`Error: ${res?.error || "Failed to create playlist"}`);
        return;
      }
      setAllUserPlaylists((prev) => [res.playlist!, ...prev]);
      const addRes = await backendAddTrackToPlaylist(res.playlist.id, trackUri);
      if (addRes?.ok) {
        recordPlaylistAddCount(res.playlist.id);
        showToast(`Created '${name}' and added track`);
      } else {
        showToast(`Created '${name}', but failed to add track: ${addRes?.error || "Failed"}`);
      }
    },
    [showToast],
  );

  const handleUpdatePlaylistDetails = useCallback(
    async (playlistId: string, name: string, description: string): Promise<boolean> => {
      const res = await backendUpdatePlaylistDetails(playlistId, name, description);
      if (!res?.ok) {
        showToast(res?.error || "Failed to update playlist");
        return false;
      }
      setAllUserPlaylists((prev) =>
        prev.map((p) => (p.id === playlistId ? { ...p, name, description } : p)),
      );
      setActivePlaylist((prev) =>
        prev && prev.id === playlistId ? { ...prev, name, description } : prev,
      );
      showToast("Playlist updated");
      return true;
    },
    [showToast],
  );

  const handleDeletePlaylist = useCallback(
    async (playlist: PlaylistItem): Promise<boolean> => {
      const res = await backendDeletePlaylist(playlist.id);
      if (!res?.ok) {
        showToast(res?.error || "Failed to delete playlist");
        return false;
      }
      setAllUserPlaylists((prev) => prev.filter((p) => p.id !== playlist.id));
      if (res.folders) {
        setFolders(res.folders);
      }
      if (res.pinned_playlists) {
        setStatus((prev) =>
          prev?.settings
            ? {
                ...prev,
                settings: {
                  ...prev.settings,
                  pinned_playlists: res.pinned_playlists,
                },
              }
            : prev,
        );
      }
      if (activePlaylist?.id === playlist.id) {
        setActivePlaylist(null);
        setPlaylistTracks([]);
      }
      showToast(`Deleted '${playlist.name}'`);
      return true;
    },
    [activePlaylist, setStatus, showToast],
  );

  const handleReorderPlaylistTrack = useCallback(
    async (
      playlistId: string,
      fromIndex: number,
      toIndex: number,
      nextTracks: TrackItem[],
      preGrabTracks?: TrackItem[],
    ): Promise<boolean> => {
      const prevTracks = preGrabTracks && preGrabTracks.length > 0 ? preGrabTracks : playlistTracks;
      const uid = prevTracks[fromIndex]?.uid || "";
      const targetUid = prevTracks[toIndex]?.uid || "";
      setPlaylistTracks(nextTracks);
      try {
        const res = await backendReorderPlaylistTracks(
          playlistId,
          fromIndex,
          toIndex,
          1,
          "",
          uid,
          targetUid,
        );
        if (!res?.ok) {
          setPlaylistTracks(prevTracks);
          showToast(res?.error || "Failed to reorder playlist");
          return false;
        }
        return true;
      } catch {
        setPlaylistTracks(prevTracks);
        showToast("Failed to reorder playlist");
        return false;
      }
    },
    [playlistTracks, showToast],
  );

  const handleCreateFolder = useCallback(async (name: string) => {
    const res = await backendManagePlaylistFolder("create", "", name, "");
    if (res.ok) {
      showToast(`Folder '${name}' created`);
      loadFolders();
    } else {
      showToast(`Error: ${res.error || "Failed"}`);
    }
  }, [showToast, loadFolders]);

  const handleRenameFolder = useCallback(async (folderId: string, newName: string) => {
    const res = await backendManagePlaylistFolder("rename", folderId, newName, "");
    if (res.ok) {
      showToast("Folder renamed");
      loadFolders();
    } else {
      showToast(`Error: ${res.error || "Failed"}`);
    }
  }, [showToast, loadFolders]);

  const handleDeleteFolder = useCallback(async (folderId: string, folderName: string) => {
    const res = await backendManagePlaylistFolder("delete", folderId, "", "");
    if (res.ok) {
      showToast(`Folder '${folderName}' deleted`);
      loadFolders();
    }
  }, [showToast, loadFolders]);

  const pinnedPlaylists: PinnedPlaylistItem[] = status?.settings?.pinned_playlists || [];
  const pinnedUris = useMemo(
    () => new Set(pinnedPlaylists.map((p) => p.uri)),
    [pinnedPlaylists]
  );

  const handleTogglePin = useCallback(
    async (item: PinnedPlaylistItem) => {
      const exists = pinnedPlaylists.some((p) => p.uri === item.uri);
      if (exists) {
        const next = pinnedPlaylists.filter((p) => p.uri !== item.uri);
        const res = await backendSetSetting("pinned_playlists", next);
        if (res?.ok) {
          setStatus((prev) =>
            prev
              ? {
                  ...prev,
                  settings: res.settings
                    ? { ...prev.settings, ...res.settings }
                    : { ...(prev.settings || {}), pinned_playlists: next },
                }
              : prev
          );
          toaster.toast({ title: "Deckify", body: "Unpinned from QAM", duration: 2500 });
        }
        return;
      }

      if (pinnedPlaylists.length >= 4) {
        toaster.toast({
          title: "Deckify",
          body: "Max 4 pinned items — unpin one first",
          duration: 3000,
        });
        return;
      }

      const next = [...pinnedPlaylists, item];
      const res = await backendSetSetting("pinned_playlists", next);
      if (res?.ok) {
        setStatus((prev) =>
          prev
            ? {
                ...prev,
                settings: res.settings
                  ? { ...prev.settings, ...res.settings }
                  : { ...(prev.settings || {}), pinned_playlists: next },
              }
            : prev
        );
        toaster.toast({ title: "Deckify", body: "Pinned to QAM", duration: 2500 });
      }
    },
    [pinnedPlaylists, setStatus]
  );

  // Mode Selection & Gamepad Cycle
  const handleSelectMode = useCallback((id: ViewMode) => {
    navigationHistoryRef.current = [];
    setActivePlaylist(null);
    setActiveAlbum(null);
    setActiveArtist(null);
    setActionTrack(null);
    setActionCollection(null);
    setShowAddToPlaylistModal(false);
    setPlaylistPickerOpen(false);
    setIsGrabbing(false);
    setIsCrudModalOpen(false);
    setPendingEditPlaylist(null);
    setPendingDeletePlaylist(null);
    focusedTrackRef.current = null;
    focusedCollectionRef.current = null;
    focusedHistoryQueryRef.current = null;
    setFocusedHistoryQuery(null);
    setMode(id);
  }, []);

  const handleFocusTrack = useCallback((t: TrackItem | null) => {
    focusedTrackRef.current = t;
  }, []);

  const cycleMode = useCallback((direction: 1 | -1) => {
    const curIdx = ALL_MODES.indexOf(modeRef.current);
    if (curIdx === -1) return;
    const nextIdx = (curIdx + direction + ALL_MODES.length) % ALL_MODES.length;
    handleSelectMode(ALL_MODES[nextIdx]);
  }, [handleSelectMode]);

  // Modal-scoped Gamepad, Analog Trigger & Keyboard Navigation
  const triggerNavEnabled = (status?.settings as any)?.trigger_nav_enabled !== false;
  useTriggerNavigation({
    enabled: triggerNavEnabled,
    suppressed: Boolean(
      isGrabbing ||
        isCrudModalOpen ||
        actionTrack ||
        showAddToPlaylistModal ||
        actionCollection ||
        playlistPickerOpen,
    ),
    onTrigger: useCallback(
      (side) => {
        if (!triggerNavEnabled) return;
        if (modeRef.current === "now_playing" || modeRef.current === "lyrics") {
          const durationMs = (status as any)?.duration_ms || track?.duration_ms || 0;
          if (!track || durationMs <= 0) return;

          const seekStepSec = isSpokenRef.current
            ? 15
            : Math.min(
                30,
                Math.max(5, Number((status?.settings as any)?.trigger_seek_seconds ?? 10))
              );

          if (pendingSeekDeltaSecRef.current === 0) {
            seekBaseMsRef.current = currentPositionMsRef.current;
          }
          pendingSeekDeltaSecRef.current += side === "R2" ? seekStepSec : -seekStepSec;

          const maxSeekMs = Math.max(0, durationMs - 1000);
          const targetMs = Math.min(
            maxSeekMs,
            Math.max(0, seekBaseMsRef.current + pendingSeekDeltaSecRef.current * 1000)
          );

          clock.scrubTo?.(targetMs);
          showPill(
            (pendingSeekDeltaSecRef.current >= 0 ? "+" : "") +
              pendingSeekDeltaSecRef.current +
              "s"
          );

          if (seekDebounceTimerRef.current) {
            clearTimeout(seekDebounceTimerRef.current);
          }
          seekDebounceTimerRef.current = setTimeout(() => {
            seekDebounceTimerRef.current = null;
            pendingSeekDeltaSecRef.current = 0;
            handleSeekPlayback(targetMs);
          }, SEEK_ACCUMULATION_WINDOW_MS);
          return;
        }

        const listModes: ViewMode[] = [
          "playlists",
          "liked",
          "albums",
          "artists",
          "recent",
          "episodes",
          "search",
          "queue",
          "soundtracks",
        ];
        if (!listModes.includes(modeRef.current)) return;
        const paneEl = contentPaneRef.current;
        if (!paneEl) return;
        const domFocusedInPane = Boolean(paneEl.contains(document.activeElement));
        const virtualFocusedEl = paneEl.querySelector(
          '[data-deckify-focused="true"], .gpfocus'
        ) as HTMLElement | null;
        if (!domFocusedInPane && !virtualFocusedEl) return;

        const rows = Array.from(
          paneEl.querySelectorAll('[data-deckify-list-item="true"]')
        ) as HTMLElement[];
        if (rows.length === 0) return;

        const labels = rows.map((el) => el.getAttribute("data-deckify-label") || "");
        const activeEl = domFocusedInPane
          ? (document.activeElement as HTMLElement | null)
          : virtualFocusedEl;
        const foundIdx = activeEl
          ? rows.findIndex((el) => el === activeEl || el.contains(activeEl))
          : -1;
        const currentIndex = foundIdx >= 0 ? foundIdx : 0;
        const sortedAz = Boolean(
          paneEl.querySelector('[data-deckify-sorted="az"]')
        );
        const pageSize = Math.min(
          50,
          Math.max(5, Number((status?.settings as any)?.trigger_page_size ?? 15))
        );
        const direction: -1 | 1 = side === "R2" ? 1 : -1;
        const result = computeListJump(labels, currentIndex, direction, pageSize, sortedAz);
        if (!result) return;

        if (
          result.shouldLoadMore &&
          modeRef.current === "liked" &&
          likedTotal > likedTracks.length
        ) {
          loadLikedTracks(true);
        } else {
          const targetEl = rows[result.targetIndex];
          if (targetEl) {
            targetEl.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
            targetEl.focus?.();
          }
        }
        showPill(result.badge);
      },
      [
        triggerNavEnabled,
        status,
        track,
        clock,
        showPill,
        handleSeekPlayback,
        likedTotal,
        likedTracks.length,
        loadLikedTracks,
      ]
    ),
    onAction: useCallback(
      (action, e) => {
        if (action === "L1") {
          cycleMode(-1);
        } else if (action === "R1") {
          cycleMode(1);
        } else if (modeRef.current === "lyrics" && (action === "X" || action === "Y")) {
          if (e) {
            e.preventDefault?.();
            e.stopPropagation?.();
          }
          handleNudgeOffset(action === "X" ? -500 : 500);
        } else if (modeRef.current === "search" && focusedHistoryQueryRef.current && (action === "X" || action === "Y")) {
          if (e) {
            e.preventDefault?.();
            e.stopPropagation?.();
          }
          handleRemoveHistoryQuery(focusedHistoryQueryRef.current);
        } else if (action === "Y") { // Gamepad Y button opens action menu
          if (focusedTrackRef.current || (modeRef.current !== "engine" && modeRef.current !== "devices")) {
            const isActiveTrackMode = modeRef.current === "now_playing";
            const candidate =
              focusedTrackRef.current || (isActiveTrackMode ? (track as any) : null);
            if (candidate && (candidate.id || candidate.track_id || candidate.uri)) {
              if (e) {
                e.preventDefault?.();
                e.stopPropagation?.();
              }
              setActionTrack(candidate);
            } else if (focusedCollectionRef.current) {
              if (e) {
                e.preventDefault?.();
                e.stopPropagation?.();
              }
              setActionCollection(focusedCollectionRef.current);
            }
          }
        } else if (action === "X") { // Gamepad X button toggles track like status
          if (focusedTrackRef.current || (modeRef.current !== "engine" && modeRef.current !== "devices")) {
            const isActiveTrackMode = modeRef.current === "now_playing";
            const t = (focusedTrackRef.current ||
              (isActiveTrackMode ? track : null)) as any;
            if (t?.id || t?.track_id) {
              if (e) {
                e.preventDefault?.();
                e.stopPropagation?.();
              }
              handleToggleLike(t.id || t.track_id);
            }
          }
        }
      },
      [track, handleToggleLike, cycleMode, handleNudgeOffset, handleRemoveHistoryQuery]
    ),
  });

  // Breadcrumb B navigation handler
  const attachNav = useCallback((el: HTMLDivElement | null) => {
    if (!el || (el as any).__deckifyNavAttached) return;
    (el as any).__deckifyNavAttached = true;

    el.addEventListener(
      "vgp_onok",
      (e: Event) => {
        if (isGrabbingRef.current && typeof grabCommitRef.current === "function") {
          void grabCommitRef.current();
          e.preventDefault();
          e.stopPropagation();
          (e as unknown as { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.();
        }
      },
      true,
    );

    el.addEventListener("vgp_oncancel", (e: Event) => {
      if (typeof grabCancelRef.current === "function" && grabCancelRef.current()) {
        e.preventDefault();
        e.stopPropagation();
        (e as unknown as { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.();
        return;
      }
      if (jamModalOpenRef.current) {
        e.preventDefault();
        e.stopPropagation();
        (e as unknown as { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.();
        setJamModalOpen(false);
        return;
      }
      if (pendingEngineSwitchDownloadRef.current) {
        e.preventDefault();
        e.stopPropagation();
        (e as unknown as { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.();
        setPendingEngineSwitchDownload(null);
        return;
      }
      if (isCrudModalOpenRef.current) {
        e.preventDefault();
        e.stopPropagation();
        (e as unknown as { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.();
        return;
      }
      if (actionTrackRef.current) {
        e.preventDefault();
        e.stopPropagation();
        (e as any).stopImmediatePropagation?.();
        setActionTrack(null);
        return;
      }
      if (actionCollectionRef.current) {
        e.preventDefault();
        e.stopPropagation();
        (e as any).stopImmediatePropagation?.();
        setActionCollection(null);
        return;
      }
      if (Array.isArray(navigationHistoryRef.current) && navigationHistoryRef.current.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        (e as any).stopImmediatePropagation?.();
        const entry = navigationHistoryRef.current.pop()!;
        setMode(entry.mode);
        setActiveAlbum(entry.activeAlbum);
        setActiveArtist(entry.activeArtist);
        setActivePlaylist(entry.activePlaylist);
        setActiveShow(entry.activeShow);
        restoreScrollAndFocus(contentPaneRef.current, entry);
        return;
      }
      if (activeAlbumRef.current) {
        e.preventDefault();
        e.stopPropagation();
        (e as any).stopImmediatePropagation?.();
        setActiveAlbum(null);
        return;
      }
      if (activeArtistRef.current) {
        e.preventDefault();
        e.stopPropagation();
        (e as any).stopImmediatePropagation?.();
        setActiveArtist(null);
        return;
      }
      if (activePlaylistRef.current) {
        e.preventDefault();
        e.stopPropagation();
        (e as any).stopImmediatePropagation?.();
        setActivePlaylist(null);
        return;
      }
      if (activeShowRef.current) {
        e.preventDefault();
        e.stopPropagation();
        (e as any).stopImmediatePropagation?.();
        setActiveShow(null);
        return;
      }
      if (modeRef.current === "search" && searchQueryRef.current.trim().length > 0) {
        e.preventDefault();
        e.stopPropagation();
        (e as any).stopImmediatePropagation?.();
        setSearchQuery("");
        setSearchResults({});
        setTileSearchMode(false);
        return;
      }
    }, false);
  }, []);

  const audioBackend = status?.audio_backend || status?.settings?.audio_backend || "librespot";
  const { accent, animationsSuspended } = useAccentTheme();
  const artwork = track?.artwork_url || track?.image_url;
  const showHints = (status?.settings as any)?.show_controller_hints !== false;
  const hintText = isGrabbing
    ? "↑/↓ Move · A Drop · B Cancel"
    : mode === "now_playing"
      ? "L2/R2 Seek · X Like · Y Options · L1/R1 Tabs"
      : mode === "lyrics"
      ? "L2/R2 Seek · X -0.5s · Y +0.5s · L1/R1 Tabs"
      : mode === "discovery"
      ? "A Play/Open · Y Options · L1/R1 Tabs"
      : mode === "devices" || mode === "engine"
      ? "L1/R1 Tabs · B Back"
      : mode === "search" && focusedHistoryQuery
      ? "A Search · X/Y Remove · L1/R1 Tabs"
      : mode === "search" && searchQuery.trim().length > 0
      ? "A Select · B Clear Search · L1/R1 Tabs"
      : mode === "search"
      ? "A Select · B Close · L1/R1 Tabs"
      : "L2/R2 Page · X Like · Y Options · L1/R1 Tabs";

  return (
    <ModalRootAny closeModal={closeModal} onCancel={closeModal} bAllowFullSize>
      <div ref={attachNav} style={{ display: "contents" }}>
        <div
          style={{
            ...getThemeCssVars(accent, animationsSuspended),
            ...FULL_BLEED,
            height: "84vh",
            display: "flex",
            flexDirection: "column",
            borderRadius: 14,
            background: "#121212",
            color: "#fff",
            overflow: "hidden",
            boxShadow: "0 24px 64px rgba(0,0,0,0.85)",
            border: "1px solid rgba(255,255,255,0.08)",
            position: "relative",
          }}
        >
          {/* Ambient Glow */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(circle at top right, rgba(var(--deckify-accent-rgb, 29, 185, 84), 0.18), transparent 65%)",
              transition: "var(--deckify-accent-transition, background 350ms ease)",
              pointerEvents: "none",
              zIndex: 0,
            }}
          />
          {artwork && (
            <div
              style={{
                position: "absolute",
                top: -80,
                right: -80,
                width: 480,
                height: 480,
                borderRadius: "50%",
                backgroundImage: `url(${artwork})`,
                backgroundSize: "cover",
                filter: "blur(90px) saturate(200%)",
                opacity: 0.22,
                pointerEvents: "none",
                zIndex: 0,
              }}
            />
          )}

          {/* Main Body */}
          <Focusable
            flow-children="horizontal"
            tabIndex={actionTrack || actionCollection || jamModalOpen || pendingEngineSwitchDownload ? -1 : undefined}
            style={{
              display: "flex",
              flex: 1,
              minHeight: 0,
              overflow: "hidden",
              position: "relative",
              zIndex: 1,
              pointerEvents: actionTrack || actionCollection || jamModalOpen || pendingEngineSwitchDownload ? "none" : "auto",
            }}
          >
            {/* Left Sidebar */}
            <Sidebar
              mode={mode}
              status={status}
              onSelectMode={handleSelectMode}
              closeModal={closeModal}
              onFocusTrack={handleFocusTrack}
              onOpenActions={setActionTrack}
            />

            {/* Right Content Panel */}
            <div
              ref={contentPaneRef}
              data-testid="content-pane"
              style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex" }}
            >
              <Focusable
                data-testid="content-pane-focusable"
                flow-children="column"
                navEntryPreferPosition={NavEntryPositionPreferences.FIRST}
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: "20px 28px",
                  display: "flex",
                  flexDirection: "column",
                  overflowY: "auto",
                }}
              >
              <Focusable
                flow-children="horizontal"
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 8,
                  flexShrink: 0,
                }}
              >
                <DialogButton
                  data-testid="travel-mode-header-pill"
                  onClick={() => void handleToggleTravelMode(!travelModeEnabled, true)}
                  style={{
                    width: "auto",
                    minWidth: "auto",
                    flexShrink: 0,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "4px 12px",
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 700,
                    background: travelModeEnabled
                      ? "rgba(var(--deckify-accent-rgb, 29, 185, 84), 0.22)"
                      : "rgba(255,255,255,0.08)",
                    color: travelModeEnabled ? "var(--deckify-accent, #1DB954)" : "#ffffff",
                    border: travelModeEnabled
                      ? "1px solid var(--deckify-accent, #1DB954)"
                      : "1px solid rgba(255,255,255,0.14)",
                  }}
                >
                  <FaPlane size={11} />
                  <span>{travelModeEnabled ? "Offline Travel Mode: ON" : "Offline Travel Mode"}</span>
                </DialogButton>
              </Focusable>
              {mode === "now_playing" && (
                <NowPlayingTab
                  status={status}
                  currentPositionMs={currentPositionMs}
                  handlePlayPause={handlePlayPause}
                  handleNext={handleNext}
                  handlePrev={handlePrev}
                  handleToggleRepeat={handleToggleRepeat}
                  handleToggleLike={handleToggleLike}
                  handleSeekDelta={handleSeekDelta}
                  handleVolumeDelta={handleVolumeDelta}
                  onSetShuffle={handleSetShuffle}
                  onSeekPlayback={handleSeekPlayback}
                  onOpenActions={setActionTrack}
                  playbackSpeed={status?.playback_speed ?? 1.0}
                  onSetPlaybackSpeed={handleSetPlaybackSpeed}
                  onPlayAiDj={handlePlayAiDj}
                  jamSession={jamSession}
                  onOpenJamModal={handleOpenJamModal}
                  onEndJam={handleEndJam}
                />
              )}

              {mode === "lyrics" && (
                <LyricsTab
                  trackName={trackName}
                  artistName={artistName}
                  lyricsSource={lyricsSource || undefined}
                  lyricsCached={lyricsCached}
                  handleNextLyricsSource={handleNextLyricsSource}
                  onSelectLyricsSource={handleSelectLyricsSource}
                  loadingLyrics={loadingLyrics}
                  syncedLyrics={syncedLyrics}
                  plainLyrics={plainLyrics}
                  plainRomanizedLines={plainRomanizedLines}
                  currentLineIndex={currentLineIndex}
                  activeLineRef={activeLineRef}
                  onSeekPlayback={handleSeekPlayback}
                  trackOffsetMs={trackOffsetMs}
                  onNudgeOffset={handleNudgeOffset}
                  onResetOffset={handleResetOffset}
                  romanizeEnabled={romanizeEnabled}
                  romanizeDisplayStyle={romanizeDisplayStyle}
                  onToggleRomanize={handleToggleRomanize}
                  travelModeEnabled={travelModeEnabled}
                />
              )}

              {mode === "discovery" && (
                <DiscoveryTab
                  onPlayTrack={handlePlayTrack}
                  onOpenPlaylist={handleOpenPlaylist}
                  onOpenAlbum={handleOpenAlbum}
                  onOpenArtist={handleOpenArtist}
                  onOpenActions={(t) => setActionTrack(t)}
                  onFocusTrack={(t) => {
                    focusedTrackRef.current = t;
                    if (t) focusedCollectionRef.current = null;
                  }}
                  onFocusCollection={(c) => {
                    focusedCollectionRef.current = c;
                    if (c) focusedTrackRef.current = null;
                  }}
                  onReauthenticate={() => {
                    showToast("Open Quick Access Menu to re-authenticate Spotify");
                  }}
                  travelModeEnabled={travelModeEnabled}
                  onExitTravelMode={handleExitTravelMode}
                />
              )}

              {mode === "playlists" && (
                <PlaylistsTab
                  folders={folders}
                  allUserPlaylists={allUserPlaylists}
                  activePlaylist={activePlaylist}
                  playlistTracks={playlistTracks}
                  loadingContent={loadingContent}
                  audioBackend={audioBackend}
                  mixingBusy={mixingBusy}
                  onOpenPlaylist={handleOpenPlaylist}
                  onClosePlaylist={() => setActivePlaylist(null)}
                  onPlayTrack={handlePlayTrack}
                  onToggleMix={handleToggleMix}
                  onToggleLike={handleToggleLike}
                  onOpenActions={(t) => setActionTrack(t)}
                  onFocusTrack={(t) => { focusedTrackRef.current = t; }}
                  pinnedUris={pinnedUris}
                  onTogglePin={handleTogglePin}
                  onFocusCollection={(c) => {
                    focusedCollectionRef.current = c;
                    if (c) focusedTrackRef.current = null;
                  }}
                  onCreatePlaylist={handleCreatePlaylist}
                  onCreateFolder={handleCreateFolder}
                  onRenameFolder={handleRenameFolder}
                  onDeleteFolder={handleDeleteFolder}
                  onUpdatePlaylistDetails={handleUpdatePlaylistDetails}
                  onDeletePlaylist={handleDeletePlaylist}
                  onReorderPlaylistTrack={handleReorderPlaylistTrack}
                  onRemovePlaylistTrack={handleRemovePlaylistTrack}
                  setPlaylistTracks={setPlaylistTracks}
                  onGrabStateChange={setIsGrabbing}
                  grabTriggerRef={playlistGrabTriggerRef}
                  grabCancelRef={grabCancelRef}
                  grabCommitRef={grabCommitRef}
                  onModalStateChange={setIsCrudModalOpen}
                  pendingEditPlaylist={pendingEditPlaylist}
                  pendingDeletePlaylist={pendingDeletePlaylist}
                  onClearPendingPlaylistAction={() => {
                    setPendingEditPlaylist(null);
                    setPendingDeletePlaylist(null);
                  }}
                  travelModeEnabled={travelModeEnabled}
                  onExitTravelMode={handleExitTravelMode}
                  offlineDownloads={offlineDownloads}
                  onToggleOfflineDownload={handleToggleOfflineDownload}
                />
              )}

              {mode === "liked" && (
                <LikedSongsTab
                  likedTracks={likedTracks}
                  likedTotal={likedTotal}
                  loadingContent={loadingContent}
                  onPlayTrack={handlePlayTrack}
                  onLoadMore={() => loadLikedTracks(true)}
                  onToggleLike={handleToggleLike}
                  onOpenActions={(t) => setActionTrack(t)}
                  onFocusTrack={(t) => { focusedTrackRef.current = t; }}
                  isPinned={pinnedUris.has("spotify:collection:tracks")}
                  onTogglePin={handleTogglePin}
                  travelModeEnabled={travelModeEnabled}
                  onExitTravelMode={handleExitTravelMode}
                  offlineDownloads={offlineDownloads}
                />
              )}

              {mode === "albums" && (
                <AlbumsTab
                  savedAlbums={savedAlbums}
                  activeAlbum={activeAlbum}
                  albumTracks={albumTracks}
                  loadingContent={loadingContent}
                  onOpenAlbum={handleOpenAlbum}
                  onCloseAlbum={() => setActiveAlbum(null)}
                  onPlayTrack={handlePlayTrack}
                  onToggleLike={handleToggleLike}
                  onOpenActions={(t) => setActionTrack(t)}
                  onFocusTrack={(t) => { focusedTrackRef.current = t; }}
                  pinnedUris={pinnedUris}
                  onTogglePin={handleTogglePin}
                  onFocusCollection={(c) => {
                    focusedCollectionRef.current = c;
                    if (c) focusedTrackRef.current = null;
                  }}
                  onStartAlbumRadio={handleStartAlbumRadio}
                  travelModeEnabled={travelModeEnabled}
                  onExitTravelMode={handleExitTravelMode}
                  offlineDownloads={offlineDownloads}
                  onToggleOfflineDownload={handleToggleOfflineDownload}
                />
              )}

              {mode === "artists" && (
                <ArtistsTab
                  followedArtists={followedArtists}
                  activeArtist={activeArtist}
                  artistTopTracks={artistTopTracks}
                  artistAlbums={artistAlbums}
                  artistAllTracks={artistAllTracks}
                  hasMoreAllTracks={artistAllTracksHasMore}
                  loadingAllTracks={loadingAllTracks}
                  loadingContent={loadingContent}
                  onOpenArtist={handleOpenArtist}
                  onCloseArtist={() => setActiveArtist(null)}
                  onOpenAlbum={handleOpenAlbum}
                  onPlayTrack={handlePlayTrack}
                  onToggleLike={handleToggleLike}
                  onOpenActions={(t) => setActionTrack(t)}
                  onFocusTrack={(t) => { focusedTrackRef.current = t; }}
                  onLoadMoreArtistTracks={handleLoadMoreArtistTracks}
                  onStartArtistRadio={handleStartArtistRadio}
                />
              )}

              {mode === "recent" && (
                <RecentTab
                  recentlyPlayed={recentlyPlayed}
                  loadingContent={loadingContent}
                  onPlayTrack={handlePlayTrack}
                  onToggleLike={handleToggleLike}
                  onOpenActions={(t) => setActionTrack(t)}
                  onFocusTrack={(t) => { focusedTrackRef.current = t; }}
                />
              )}

              {mode === "episodes" && (
                <PodcastsTab
                  savedShows={savedShows}
                  savedEpisodes={savedEpisodes}
                  activeShow={activeShow}
                  showEpisodes={showEpisodes}
                  loadingShowEpisodes={loadingShowEpisodes}
                  onOpenShow={handleOpenShow}
                  onCloseShow={() => setActiveShow(null)}
                  onPlayTrack={handlePlayTrack}
                  travelModeEnabled={travelModeEnabled}
                  onExitTravelMode={handleExitTravelMode}
                  offlineDownloads={offlineDownloads}
                  onToggleOfflineDownload={handleToggleOfflineDownload}
                />
              )}

              {mode === "search" && (
                <SearchTab
                  onPlayTrack={handlePlayTrack}
                  onToggleLike={handleToggleLike}
                  onOpenActions={(t) => setActionTrack(t)}
                  onOpenPlaylist={handleOpenPlaylist}
                  onOpenArtist={handleOpenArtist}
                  onOpenAlbum={handleOpenAlbum}
                  onOpenShow={handleOpenShow}
                  showToast={showToast}
                  searchQuery={searchQuery}
                  onSearchQueryChange={setSearchQuery}
                  searchTab={searchFilter}
                  onSearchTabChange={setSearchFilter}
                  searchResults={searchResults}
                  onSearchResultsChange={setSearchResults}
                  tileSearchMode={tileSearchMode}
                  onTileSearchModeChange={setTileSearchMode}
                  searchHistory={searchHistory}
                  onUpdateSearchHistory={handleUpdateSearchHistory}
                  onFocusHistoryPill={handleFocusHistoryPill}
                  travelModeEnabled={travelModeEnabled}
                  onExitTravelMode={handleExitTravelMode}
                  offlineDownloads={offlineDownloads}
                />
              )}

              {mode === "queue" && (
                <QueueTab
                  queueTracks={queueTracks}
                  currentlyPlaying={status?.track_meta || status?.track}
                  isPlaying={Boolean(status?.is_playing)}
                  handlePlayQueueTrack={handlePlayQueueTrack}
                  handlePlayTrack={handlePlayTrack}
                  handleToggleLike={handleToggleLike}
                  onFocusTrack={(t) => { focusedTrackRef.current = t; }}
                  onOpenActions={(t) => setActionTrack(t)}
                  onReorderQueueTrack={handleReorderQueueTrack}
                  onRemoveQueueTrack={handleRemoveQueueTrack}
                  onClearQueue={handleClearQueue}
                  onGrabStateChange={setIsGrabbing}
                  grabTriggerRef={queueGrabTriggerRef}
                  grabCancelRef={grabCancelRef}
                  grabCommitRef={grabCommitRef}
                  setQueueTracks={setQueueTracks}
                />
              )}

              {mode === "devices" && (
                <DevicesTab
                  showToast={showToast}
                  jamSession={jamSession}
                  onOpenJamModal={handleOpenJamModal}
                  onEndJam={handleEndJam}
                />
              )}

              {mode === "soundtracks" && (
                <SoundtracksTab
                  runningAppId={status?.active_game_app_id ?? null}
                  globalEqPreset={status?.settings?.eq_preset ?? "flat"}
                  globalEqCustomBands={status?.settings?.eq_custom_bands}
                  globalDuckingPct={status?.settings?.ducking_proportional_pct ?? 50}
                  showToast={showToast}
                  onPickerOpenChange={setPlaylistPickerOpen}
                />
              )}

              {mode === "engine" && (
                <SettingsTab
                  status={status}
                  refreshStatus={refreshStatus}
                  showToast={showToast}
                  travelModeEnabled={travelModeEnabled}
                  travelModeAutoEnabled={travelModeAutoEnabled}
                  onToggleTravelMode={handleToggleTravelMode}
                  offlineMinFreeGb={status?.offline_min_free_gb ?? status?.settings?.offline_min_free_gb}
                  offlineStoragePath={status?.offline_storage_path ?? status?.settings?.offline_storage_path}
                  onReloadOfflineDownloads={loadOfflineDownloads}
                />
              )}
              </Focusable>
            </div>
          </Focusable>

          {/* Context-Aware Controller Hint Bar */}
          {showHints && (
            <div
              data-testid="controller-hint-bar"
              style={{
                padding: "8px 24px",
                background: "rgba(0,0,0,0.65)",
                borderTop: "1px solid rgba(255,255,255,0.08)",
                fontSize: 12,
                fontWeight: 700,
                color: "rgba(255,255,255,0.7)",
                textAlign: "center",
                flexShrink: 0,
                position: "relative",
                zIndex: 1,
              }}
            >
              {hintText}
            </div>
          )}

          {/* Context Modal for Track Actions & Playlist Selection */}
          <TrackActionModal
            actionTrack={actionTrack}
            activePlaylist={activePlaylist}
            showAddToPlaylistModal={showAddToPlaylistModal}
            allUserPlaylists={allUserPlaylists}
            onClose={() => setActionTrack(null)}
            onPlayTrack={handlePlayTrack}
            onAddToQueue={handleAddToQueue}
            onOpenAddToPlaylist={() => setShowAddToPlaylistModal(true)}
            onCloseAddToPlaylist={() => setShowAddToPlaylistModal(false)}
            onAddTrackToPlaylist={handleAddTrackToPlaylist}
            onStartRadio={handleStartRadio}
            onOpenArtist={handleOpenArtist}
            onOpenAlbum={handleOpenAlbum}
            onRemoveFromPlaylist={handleRemoveTrackFromActivePlaylist}
            onToggleLike={handleToggleLike}
            mode={mode}
            setMode={handleSelectMode}
            onMoveInQueue={(t) => queueGrabTriggerRef.current?.(t)}
            onRemoveFromQueue={(t) => {
              const idx = queueTracks.findIndex(
                (q) => (t._rowKey && q._rowKey === t._rowKey) || q.uri === t.uri,
              );
              if (idx >= 0) void handleRemoveQueueTrack(t, idx);
            }}
            onMoveInPlaylist={(t) => playlistGrabTriggerRef.current?.(t)}
            onCreatePlaylistWithTrack={handleCreatePlaylistWithTrack}
            isEditablePlaylist={activePlaylist ? activePlaylist.is_editable !== false : undefined}
            canReorderPlaylist={activePlaylist ? activePlaylist.is_editable !== false : undefined}
          />

          {/* Context Modal for Collection Actions (Play / Pin to QAM) */}
          {actionCollection && (
            <CollectionActionModal
              collection={actionCollection}
              isPinned={pinnedUris.has(actionCollection.uri)}
              atLimit={pinnedPlaylists.length >= 4}
              offlineState={offlineDownloads[actionCollection.uri]?.offline_state}
              offlineProgress={offlineDownloads[actionCollection.uri]?.offline_progress}
              onClose={() => setActionCollection(null)}
              onPlay={(c) => handlePlayTrack("", c.uri)}
              onTogglePin={handleTogglePin}
              onToggleOfflineDownload={(collection: CollectionActionItem) => {
                const offlineItem = offlineDownloads[collection.uri];
                const isDownloaded = offlineItem?.offline_state === "downloaded";
                void handleToggleOfflineDownload({
                  uri: collection.uri,
                  name: collection.name,
                  type: collection.type === "album" ? "album" : "playlist",
                  image_url: collection.image_url,
                  isDownloaded,
                });
              }}
              onEditPlaylist={(collection: CollectionActionItem) => {
                const target =
                  allUserPlaylists.find(
                    (p) =>
                      (collection.id && p.id === collection.id) ||
                      (collection.uri && p.uri === collection.uri),
                  ) ||
                  (collection.type === "playlist"
                    ? {
                        id: collection.id || collection.uri.split(":").pop() || "",
                        name: collection.name,
                        uri: collection.uri,
                        description: collection.description,
                        is_editable: collection.is_editable,
                      }
                    : null);
                setActionCollection(null);
                setMode("playlists");
                if (target) setPendingEditPlaylist(target);
              }}
              onDeletePlaylist={(collection: CollectionActionItem) => {
                const target =
                  allUserPlaylists.find(
                    (p) =>
                      (collection.id && p.id === collection.id) ||
                      (collection.uri && p.uri === collection.uri),
                  ) ||
                  (collection.type === "playlist"
                    ? {
                        id: collection.id || collection.uri.split(":").pop() || "",
                        name: collection.name,
                        uri: collection.uri,
                        description: collection.description,
                        is_editable: collection.is_editable,
                      }
                    : null);
                setActionCollection(null);
                setMode("playlists");
                if (target) setPendingDeletePlaylist(target);
              }}
            />
          )}

          {/* Spotify Jam QR Modal */}
          {jamModalOpen && (
            <JamQrModal
              audioBackend={audioBackend}
              jamSession={jamSession}
              shareUri={
                track?.uri || (track?.id ? `spotify:track:${track.id}` : null)
              }
              shareLabel={
                track?.name
                  ? `${track.name}${track.artist ? ` — ${track.artist}` : ""}`
                  : null
              }
              loading={jamLoading}
              onClose={() => setJamModalOpen(false)}
              onEndJam={handleEndJam}
              onLeaveJam={handleEndJam}
              onSwitchAndStartJam={handleSwitchToSpotifyClientAndStartJam}
            />
          )}

          {/* Engine Switch Confirmation Modal for Offline Downloads */}
          {pendingEngineSwitchDownload && (
            <div
              data-testid="engine-switch-download-modal"
              style={{
                position: "absolute",
                inset: 0,
                background: "rgba(0,0,0,0.82)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 250,
                padding: 24,
              }}
            >
              <Focusable
                flow-children="column"
                style={{
                  background: "#1C1C1C",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 12,
                  padding: 24,
                  maxWidth: 460,
                  width: "100%",
                  display: "flex",
                  flexDirection: "column",
                  gap: 16,
                }}
              >
                <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>
                  Switch to Official Spotify Client?
                </div>
                <div style={{ fontSize: 14, color: "rgba(255,255,255,0.8)", lineHeight: 1.5 }}>
                  Offline downloads require the Official Spotify Client.
                </div>
                <Focusable
                  flow-children="horizontal"
                  style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}
                >
                  <DialogButton
                    data-testid="engine-switch-stay-btn"
                    onClick={() => setPendingEngineSwitchDownload(null)}
                    style={{ width: "auto", minWidth: "auto", flexShrink: 0 }}
                  >
                    Stay on librespot
                  </DialogButton>
                  <DialogButton
                    data-testid="engine-switch-download-btn"
                    onClick={() => void handleConfirmEngineSwitchDownload()}
                    style={{
                      width: "auto",
                      minWidth: "auto",
                      flexShrink: 0,
                      background: "var(--deckify-accent, #1DB954)",
                      color: "#000",
                      fontWeight: 700,
                    }}
                  >
                    Switch to Spotify Client & Download
                  </DialogButton>
                </Focusable>
              </Focusable>
            </div>
          )}

          {/* Floating Trigger Indicator Pill */}
          {pillMsg && (
            <div
              data-testid="trigger-indicator-pill"
              style={{
                position: "absolute",
                bottom: showHints ? 48 : 24,
                left: "50%",
                transform: "translateX(-50%)",
                background: "rgba(0,0,0,0.88)",
                border: "1px solid rgba(var(--deckify-accent-rgb, 29, 185, 84), 0.6)",
                borderRadius: 20,
                padding: "8px 16px",
                fontSize: 12,
                fontWeight: 700,
                color: "var(--deckify-accent, #1DB954)",
                pointerEvents: "none",
                boxShadow: "0 8px 24px rgba(0,0,0,0.7)",
                zIndex: 201,
              }}
            >
              {pillMsg}
            </div>
          )}

          {/* Toast Notification */}
          {toastMsg && (
            <div
              style={{
                position: "absolute",
                bottom: 24,
                left: "50%",
                transform: "translateX(-50%)",
                background: "rgba(0, 0, 0, 0.88)",
                border: "1px solid rgba(var(--deckify-accent-rgb, 29, 185, 84), 0.6)",
                borderRadius: 20,
                padding: "8px 20px",
                fontSize: 13,
                fontWeight: 700,
                color: "var(--deckify-accent, #1DB954)",
                boxShadow: "0 8px 24px rgba(0,0,0,0.7)",
                zIndex: 200,
              }}
            >
              {toastMsg}
            </div>
          )}
        </div>
      </div>
    </ModalRootAny>
  );
};
