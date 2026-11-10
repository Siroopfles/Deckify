import { FC, useState, useEffect, useCallback, useRef, ReactNode } from "react";
import {
  Focusable,
  ModalRoot,
  NavEntryPositionPreferences,
  TextField,
} from "@decky/ui";
import { callable } from "@decky/api";
import {
  FaSpotify,
  FaMusic,
  FaPlay,
  FaPause,
  FaStepBackward,
  FaStepForward,
  FaRandom,
  FaRedo,
  FaHeart,
  FaRegHeart,
  FaListUl,
  FaFolder,
  FaFolderOpen,
  FaSearch,
  FaTv,
  FaCog,
  FaTimes,
  FaMagic,
  FaCompactDisc,
  FaUser,
  FaHistory,
  FaPodcast,
  FaMicrophone,
  FaClock,
  FaVolumeUp,
  FaVolumeMute,
  FaPlus,
  FaTrash,
  FaBroadcastTower,
  FaPowerOff,
  FaCheck,
  FaSyncAlt,
  FaSlidersH,
  FaEdit,
  FaArrowLeft,
} from "react-icons/fa";
import type {
  TrackItem,
  PlaylistItem,
  AlbumItem,
  ArtistItem,
  EpisodeItem,
  FolderItem,
  SyncedLine,
  SpotifyDevice,
  AudioSinkInfo,
  SleepTimerStatus,
  StatusResponse,
} from "../types";

const ModalRootAny = ModalRoot as any;

const FULL_BLEED = {
  width: "96vw",
  marginLeft: "calc((100% - 96vw) / 2)",
  boxSizing: "border-box" as const,
};

type ViewMode =
  | "now_playing"
  | "lyrics"
  | "playlists"
  | "liked"
  | "albums"
  | "artists"
  | "recent"
  | "episodes"
  | "search"
  | "queue"
  | "devices"
  | "engine";

const ALL_MODES: ViewMode[] = [
  "now_playing",
  "lyrics",
  "playlists",
  "liked",
  "albums",
  "artists",
  "recent",
  "episodes",
  "search",
  "queue",
  "devices",
  "engine",
];

// Backend RPC callables
const backendGetImage = callable<[string], { ok: boolean; data_url?: string; error?: string }>("get_image");

const imgMemoryCache = new Map<string, string>();
const imgPending = new Map<string, Promise<string | null>>();

export function DeckifyImage({
  src,
  width,
  height,
  style,
  className,
  fallback,
}: {
  src?: string | null;
  width?: number | string;
  height?: number | string;
  style?: any;
  className?: string;
  fallback?: ReactNode;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(() => {
    if (!src) return null;
    if (src.startsWith("data:") || src.startsWith("http://127.0.0.1")) return src;
    return imgMemoryCache.get(src) || null;
  });

  useEffect(() => {
    if (!src) {
      setDataUrl(null);
      return;
    }
    if (src.startsWith("data:") || src.startsWith("http://127.0.0.1")) {
      setDataUrl(src);
      return;
    }
    const cached = imgMemoryCache.get(src);
    if (cached) {
      setDataUrl(cached);
      return;
    }

    let active = true;
    let promise = imgPending.get(src);
    if (!promise) {
      promise = backendGetImage(src)
        .then((res) => {
          if (res.ok && res.data_url) {
            imgMemoryCache.set(src, res.data_url);
            return res.data_url;
          }
          return null;
        })
        .finally(() => {
          imgPending.delete(src);
        });
      imgPending.set(src, promise);
    }

    promise.then((du) => {
      if (active && du) setDataUrl(du);
    });

    return () => {
      active = false;
    };
  }, [src]);

  if (!dataUrl) {
    if (fallback) {
      return (
        <div style={{ width, height, display: "flex", alignItems: "center", justifyContent: "center", ...style }}>
          {fallback}
        </div>
      );
    }
    return (
      <div
        style={{
          width,
          height,
          background: "rgba(255,255,255,0.06)",
          borderRadius: (style as any)?.borderRadius || 4,
          flexShrink: 0,
          ...style,
        }}
      />
    );
  }

  return <img src={dataUrl} width={width} height={height} style={{ objectFit: "cover", flexShrink: 0, ...style }} className={className} />;
}
const backendGetStatus = callable<[], StatusResponse>("get_status");
const backendControlPlayback = callable<[string, string], { ok: boolean; error?: string }>("control_playback");
const backendSetVolume = callable<[number], { ok: boolean; error?: string }>("set_volume");
const backendSeekPlayback = callable<[number, string], { ok: boolean; position_ms?: number; error?: string }>("seek_playback");
const backendSetShuffle = callable<[boolean, string], { ok: boolean; shuffle_state?: boolean; error?: string }>("set_shuffle");
const backendSetRepeat = callable<[string, string], { ok: boolean; repeat_state?: string; error?: string }>("set_repeat");
const backendToggleLike = callable<[string, boolean | null], { ok: boolean; is_liked?: boolean; error?: string }>("toggle_like_track");
const backendGetQueue = callable<[], { ok: boolean; currently_playing?: TrackItem | null; queue?: TrackItem[]; error?: string }>("get_queue");
const backendAddToQueue = callable<[string, string], { ok: boolean; error?: string }>("add_to_queue");
const backendAddTrackToPlaylist = callable<[string, string], { ok: boolean; error?: string }>("add_track_to_playlist");
const backendRemoveTrackFromPlaylist = callable<[string, string], { ok: boolean; error?: string }>("remove_track_from_playlist");
const backendCreatePlaylist = callable<[string, boolean], { ok: boolean; playlist?: any; error?: string }>("create_playlist");
const backendGetPlaylists = callable<[number], { ok: boolean; playlists?: PlaylistItem[]; total?: number; error?: string }>("get_playlists");
const backendGetPlaylistFolders = callable<[], { ok: boolean; folders?: FolderItem[]; error?: string }>("get_playlist_folders");
const backendGetPlaylistTracks = callable<[string, number, boolean, number?], { ok: boolean; tracks?: TrackItem[]; total?: number; is_mixed?: boolean; can_mix?: boolean; error?: string }>("get_playlist_tracks");
const backendSetNativeMix = callable<[string, boolean, boolean], { ok: boolean; is_mixed?: boolean; error?: string }>("set_native_playlist_mix");
const backendManagePlaylistFolder = callable<[string, string, string, string], { ok: boolean; error?: string }>("manage_playlist_folder");
const backendPlayTracks = callable<[string | null, string | null, string[] | null, number], { ok: boolean; error?: string }>("play_tracks");
const backendGetLikedTracks = callable<[number, boolean], { ok: boolean; tracks?: TrackItem[]; total?: number; error?: string }>("get_liked_tracks");
const backendGetSavedAlbums = callable<[number], { ok: boolean; albums?: AlbumItem[]; total?: number; error?: string }>("get_saved_albums");
const backendGetAlbumTracks = callable<[string, number], { ok: boolean; tracks?: TrackItem[]; total?: number; error?: string }>("get_album_tracks");
const backendGetFollowedArtists = callable<[], { ok: boolean; artists?: ArtistItem[]; error?: string }>("get_followed_artists");
const backendGetArtistTopTracks = callable<[string], { ok: boolean; tracks?: TrackItem[]; error?: string }>("get_artist_top_tracks");
const backendGetArtistAlbums = callable<[string, number], { ok: boolean; albums?: AlbumItem[]; total?: number; error?: string }>("get_artist_albums");
const backendGetRecentlyPlayed = callable<[number], { ok: boolean; tracks?: TrackItem[]; error?: string }>("get_recently_played");
const backendGetSavedEpisodes = callable<[number], { ok: boolean; episodes?: EpisodeItem[]; total?: number; error?: string }>("get_saved_episodes");
const backendGetSavedShows = callable<[number], { ok: boolean; shows?: any[]; total?: number; error?: string }>("get_saved_shows");
const backendSearchSpotify = callable<[string, string, number], { ok: boolean; tracks?: TrackItem[]; artists?: ArtistItem[]; albums?: AlbumItem[]; playlists?: PlaylistItem[]; error?: string }>("search_spotify");
const backendGetTrackRecommendations = callable<[string, number], { ok: boolean; tracks?: TrackItem[]; error?: string }>("get_track_recommendations");
const backendGetLyrics = callable<[string, string, number, number?], { ok: boolean; synced_lyrics?: string; plain_lyrics?: string; source?: string; error?: string }>("get_lyrics");
const backendGetDevices = callable<[], { ok: boolean; devices?: SpotifyDevice[]; error?: string }>("get_devices");
const backendTransferPlayback = callable<[string], { ok: boolean; error?: string }>("transfer_playback");
const backendSetSetting = callable<[string, unknown], { ok: boolean; settings?: any; error?: string }>("set_setting");
const backendGetAudioSinks = callable<[], { ok: boolean; sinks?: AudioSinkInfo[]; error?: string }>("get_audio_sinks");
const backendSetAudioSink = callable<[string], { ok: boolean; error?: string }>("set_audio_sink");
const backendGetSpotifyClientAuthStatus = callable<[], { ok: boolean; running: boolean; logged_in: boolean; auth_url?: string; error?: string }>("get_spotify_client_auth_status");
const backendSetSleepTimer = callable<[number | null, boolean, boolean], { ok: boolean; sleep_timer?: SleepTimerStatus; error?: string }>("set_sleep_timer");

function formatMs(ms: number): string {
  if (!ms || ms <= 0) return "0:00";
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

function parseLrc(lrcText: string): SyncedLine[] {
  if (!lrcText) return [];
  const lines = lrcText.split("\n");
  const result: SyncedLine[] = [];
  const regex = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\](.*)/;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = regex.exec(trimmed);
    if (match) {
      const min = parseInt(match[1], 10);
      const sec = parseInt(match[2], 10);
      const rawMs = match[3] || "0";
      const ms = parseInt(rawMs.padEnd(3, "0").substring(0, 3), 10);
      const timeMs = min * 60000 + sec * 1000 + ms;
      const text = match[4].trim();
      if (text) result.push({ timeMs, text });
    }
  }
  return result.sort((a, b) => a.timeMs - b.timeMs);
}

// Controller focus halo
function focusHalo(focused: boolean) {
  return {
    boxShadow: focused
      ? "0 0 0 2px #fff, 0 0 12px rgba(29, 185, 84, 0.7)"
      : "none",
    transform: focused ? "scale(1.02)" : "scale(1)",
    transition: "box-shadow 0.1s ease, transform 0.1s ease",
    position: "relative" as const,
    zIndex: focused ? 2 : 0,
    outline: "none",
  };
}

// Sidebar Button
function SidebarBtn({
  id,
  label,
  icon,
  active,
  onSelect,
}: {
  id: ViewMode;
  label: string;
  icon: ReactNode;
  active: boolean;
  onSelect: (id: ViewMode) => void;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <Focusable
      noFocusRing
      onClick={() => onSelect(id)}
      onActivate={() => onSelect(id)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onGamepadFocus={() => setFocused(true)}
      onGamepadBlur={() => setFocused(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "8px 12px",
        borderRadius: 8,
        marginBottom: 2,
        background: active
          ? "#1db954"
          : focused
          ? "rgba(255,255,255,0.18)"
          : "transparent",
        color: active ? "#000" : "#fff",
        fontWeight: active ? 700 : 500,
        cursor: "pointer",
        fontSize: 13,
        ...focusHalo(focused),
      }}
    >
      <span style={{ fontSize: 14 }}>{icon}</span>
      <span style={{ fontSize: 13 }}>{label}</span>
    </Focusable>
  );
}

// Generic interactive row
function InteractiveRow({
  children,
  onClick,
  onFocus,
  active,
  style,
  tabIndex,
  onKeyDown,
}: {
  children: ReactNode;
  onClick: () => void;
  onFocus?: () => void;
  active?: boolean;
  style?: any;
  tabIndex?: number;
  onKeyDown?: (e: any) => void;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <Focusable
      noFocusRing
      onClick={onClick}
      onActivate={onClick}
      onFocus={() => { setFocused(true); onFocus?.(); }}
      onBlur={() => setFocused(false)}
      onGamepadFocus={() => { setFocused(true); onFocus?.(); }}
      onGamepadBlur={() => setFocused(false)}
      onKeyDown={onKeyDown}
      tabIndex={tabIndex}
      style={{
        display: "flex",
        alignItems: "center",
        padding: "8px 12px",
        borderRadius: 8,
        background: active
          ? "rgba(29, 185, 84, 0.25)"
          : focused
          ? "rgba(255,255,255,0.18)"
          : "rgba(255,255,255,0.03)",
        cursor: "pointer",
        ...focusHalo(focused),
        ...style,
      }}
    >
      {children}
    </Focusable>
  );
}

// Round playback buttons
function RoundBtn({
  children,
  onClick,
  active,
  size = 46,
  accent,
}: {
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
  size?: number;
  accent?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <Focusable
      noFocusRing
      onClick={onClick}
      onActivate={onClick}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onGamepadFocus={() => setFocused(true)}
      onGamepadBlur={() => setFocused(false)}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: accent
          ? "#1db954"
          : active
          ? "rgba(29, 185, 84, 0.25)"
          : focused
          ? "rgba(255,255,255,0.22)"
          : "rgba(255,255,255,0.08)",
        color: accent ? "#000" : active ? "#1db954" : "#fff",
        boxShadow: focused
          ? "0 0 0 2px #fff, 0 0 14px rgba(29, 185, 84, 0.8)"
          : accent
          ? "0 4px 16px rgba(29, 185, 84, 0.4)"
          : "none",
        transform: focused ? "scale(1.1)" : "scale(1)",
        transition: "box-shadow 0.1s ease, transform 0.1s ease",
        cursor: "pointer",
        position: "relative",
      }}
    >
      {children}
    </Focusable>
  );
}

export const DeckifyExpandedModal: FC<{ closeModal?: () => void }> = ({ closeModal }) => {
  const [mode, setMode] = useState<ViewMode>("now_playing");
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [currentPositionMs, setCurrentPositionMs] = useState<number>(0);

  useEffect(() => {
    if (status?.position_ms !== undefined) {
      setCurrentPositionMs(status.position_ms);
    }
  }, [status?.position_ms]);

  useEffect(() => {
    if (!status?.is_playing) return;
    const interval = setInterval(() => {
      setCurrentPositionMs((prev) => {
        const duration = (status?.track || status?.track_meta)?.duration_ms || 0;
        if (duration > 0 && prev >= duration) return prev;
        return prev + 1000;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [status?.is_playing, status?.track, status?.track_meta]);


  // Drill-down states
  const [activePlaylist, setActivePlaylist] = useState<PlaylistItem | null>(null);
  const [playlistTracks, setPlaylistTracks] = useState<TrackItem[]>([]);
  const [activeAlbum, setActiveAlbum] = useState<AlbumItem | null>(null);
  const [albumTracks, setAlbumTracks] = useState<TrackItem[]>([]);
  const [activeArtist, setActiveArtist] = useState<ArtistItem | null>(null);
  const [artistTopTracks, setArtistTopTracks] = useState<TrackItem[]>([]);
  const [artistAlbums, setArtistAlbums] = useState<AlbumItem[]>([]);
  const [actionTrack, setActionTrack] = useState<TrackItem | null>(null);
  const [showAddToPlaylistModal, setShowAddToPlaylistModal] = useState(false);

  // Library data
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [likedTracks, setLikedTracks] = useState<TrackItem[]>([]);
  const [savedAlbums, setSavedAlbums] = useState<AlbumItem[]>([]);
  const [followedArtists, setFollowedArtists] = useState<ArtistItem[]>([]);
  const [recentlyPlayed, setRecentlyPlayed] = useState<TrackItem[]>([]);
  const [savedEpisodes, setSavedEpisodes] = useState<EpisodeItem[]>([]);
  const [savedShows, setSavedShows] = useState<any[]>([]);
  const [queueTracks, setQueueTracks] = useState<TrackItem[]>([]);
  const [likedTotal, setLikedTotal] = useState<number>(0);
  const [devices, setDevices] = useState<SpotifyDevice[]>([]);
  const [allUserPlaylists, setAllUserPlaylists] = useState<PlaylistItem[]>([]);

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchTab, setSearchTab] = useState<"all" | "tracks" | "artists" | "albums" | "playlists">("all");
  const [searchLimit, setSearchLimit] = useState(25);
  const [searchResults, setSearchResults] = useState<{
    tracks?: TrackItem[];
    artists?: ArtistItem[];
    albums?: AlbumItem[];
    playlists?: PlaylistItem[];
  }>({});

  // Lyrics
  const [syncedLyrics, setSyncedLyrics] = useState<SyncedLine[]>([]);
  const [plainLyrics, setPlainLyrics] = useState<string | null>(null);
  const [lyricsSource, setLyricsSource] = useState<string | null>(null);
  const [lyricsOffset, setLyricsOffset] = useState(0);
  const [loadingLyrics, setLoadingLyrics] = useState(false);
  const [currentLineIndex, setCurrentLineIndex] = useState(-1);
  const activeLineRef = useRef<HTMLDivElement | null>(null);

  // Settings & Audio Hardware
  const [audioSinks, setAudioSinks] = useState<AudioSinkInfo[]>([]);
  const [officialClientStatus, setOfficialClientStatus] = useState<{
    running: boolean;
    logged_in: boolean;
    auth_url?: string;
  } | null>(null);
  const [steamMenuPos, setSteamMenuPos] = useState<number>(() => {
    try {
      return parseInt(localStorage.getItem("DECKIFY_MENU_POSITION") || "3", 10);
    } catch {
      return 3;
    }
  });

  // Folder & Playlist Management
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameFolderName, setRenameFolderName] = useState("");
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set(["my_playlists"]));

  const [mixingBusy, setMixingBusy] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);

  const toastTimer = useRef<any>(null);
  const activePlaylistRef = useRef<PlaylistItem | null>(null);
  activePlaylistRef.current = activePlaylist;
  const activeAlbumRef = useRef<AlbumItem | null>(null);
  activeAlbumRef.current = activeAlbum;
  const activeArtistRef = useRef<ArtistItem | null>(null);
  activeArtistRef.current = activeArtist;
  const actionTrackRef = useRef<TrackItem | null>(null);
  actionTrackRef.current = actionTrack;
  const focusedTrackRef = useRef<TrackItem | null>(null);
  const modeRef = useRef<ViewMode>(mode);
  modeRef.current = mode;

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 3000);
  }, []);

  // Poll status
  const refreshStatus = useCallback(async () => {
    try {
      const s = await backendGetStatus();
      if (s) setStatus(s);
    } catch {}
  }, []);

  useEffect(() => {
    refreshStatus();
    const id = setInterval(refreshStatus, 1500);
    return () => clearInterval(id);
  }, [refreshStatus]);

  // Load Folders & Playlists
  const loadFolders = useCallback(async () => {
    try {
      const res = await backendGetPlaylistFolders();
      if (res.ok && res.folders) setFolders(res.folders);
      const plRes = await backendGetPlaylists(0);
      if (plRes.ok && plRes.playlists) setAllUserPlaylists(plRes.playlists);
    } catch {}
  }, []);

  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  // Load Liked Tracks
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

  // Load Albums
  const loadAlbums = useCallback(async () => {
    setLoadingContent(true);
    try {
      const res = await backendGetSavedAlbums(0);
      if (res.ok && res.albums) setSavedAlbums(res.albums);
    } catch {}
    setLoadingContent(false);
  }, []);

  // Load Artists
  const loadArtists = useCallback(async () => {
    setLoadingContent(true);
    try {
      const res = await backendGetFollowedArtists();
      if (res.ok && res.artists) setFollowedArtists(res.artists);
    } catch {}
    setLoadingContent(false);
  }, []);

  // Load Recent
  const loadRecent = useCallback(async () => {
    setLoadingContent(true);
    try {
      const res = await backendGetRecentlyPlayed(40);
      if (res.ok && res.tracks) setRecentlyPlayed(res.tracks);
    } catch {}
    setLoadingContent(false);
  }, []);

  // Load Episodes & Shows
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

  // Load Queue
  const loadQueue = useCallback(async () => {
    try {
      const res = await backendGetQueue();
      if (res.ok && res.queue) setQueueTracks(res.queue);
    } catch {}
  }, []);

  // Single-load on mode entry (no aggressive polling to prevent HTTP 429)


  // Load Devices
  const loadDevices = useCallback(async () => {
    try {
      const res = await backendGetDevices();
      if (res.ok && res.devices) setDevices(res.devices);
    } catch {}
  }, []);

  // Load Audio Sinks
  const loadAudioSinks = useCallback(async () => {
    try {
      const res = await backendGetAudioSinks();
      if (res.ok && res.sinks) setAudioSinks(res.sinks);
    } catch {}
  }, []);

  // Check Official Spotify Client Status
  const checkOfficialClient = useCallback(async () => {
    try {
      const res = await backendGetSpotifyClientAuthStatus();
      if (res.ok) {
        setOfficialClientStatus({
          running: res.running,
          logged_in: res.logged_in,
          auth_url: res.auth_url,
        });
      }
    } catch {}
  }, []);

  // Trigger loads on mode change
  useEffect(() => {
    if (mode === "liked") loadLikedTracks();
    if (mode === "albums") loadAlbums();
    if (mode === "artists") loadArtists();
    if (mode === "recent") loadRecent();
    if (mode === "episodes") loadEpisodes();
    if (mode === "queue") loadQueue();
    if (mode === "devices") loadDevices();
    if (mode === "engine") {
      loadAudioSinks();
      checkOfficialClient();
    }
  }, [mode, loadLikedTracks, loadAlbums, loadArtists, loadRecent, loadEpisodes, loadQueue, loadDevices, loadAudioSinks, checkOfficialClient]);

  // Load Lyrics with Waterfall & Provider Offset
  const track = status?.track_meta || status?.track;
  const trackName = track?.name;
  const artistName = track?.artist;
  const durationSec = Math.round((track?.duration_ms || 0) / 1000);

  const fetchLyrics = useCallback(async (offset = 0) => {
    if (!trackName || !artistName) return;
    setLoadingLyrics(true);
    try {
      const res = await backendGetLyrics(trackName, artistName, durationSec, offset);
      if (res.ok) {
        setLyricsSource(res.source || "Auto");
        if (res.synced_lyrics) {
          setSyncedLyrics(parseLrc(res.synced_lyrics));
          setPlainLyrics(null);
        } else if (res.plain_lyrics) {
          setPlainLyrics(res.plain_lyrics);
          setSyncedLyrics([]);
        } else {
          setSyncedLyrics([]);
          setPlainLyrics("No lyrics found from this provider.");
        }
      } else {
        setSyncedLyrics([]);
        setPlainLyrics("Lyrics could not be loaded.");
      }
    } catch {
      setSyncedLyrics([]);
      setPlainLyrics("Lyrics load error.");
    } finally {
      setLoadingLyrics(false);
    }
  }, [trackName, artistName, durationSec]);

  useEffect(() => {
    if (mode !== "lyrics") return;
    setLyricsOffset(0);
    fetchLyrics(0);
  }, [mode, trackName, artistName, durationSec, fetchLyrics]);

  const handleNextLyricsSource = useCallback(() => {
    const nextOffset = lyricsOffset + 1;
    setLyricsOffset(nextOffset);
    fetchLyrics(nextOffset);
    showToast("Trying next lyrics provider...");
  }, [lyricsOffset, fetchLyrics, showToast]);

  // Track active synced lyrics line
  const positionMs = currentPositionMs;
  useEffect(() => {
    if (!syncedLyrics.length) return;
    let idx = -1;
    for (let i = 0; i < syncedLyrics.length; i++) {
      if (positionMs >= syncedLyrics[i].timeMs) {
        idx = i;
      } else {
        break;
      }
    }
    setCurrentLineIndex(idx);
  }, [positionMs, syncedLyrics]);

  // Auto-scroll to active lyric line
  useEffect(() => {
    if (activeLineRef.current) {
      activeLineRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [currentLineIndex]);

  // Drill-in handlers
  const handleOpenPlaylist = useCallback(async (pl: PlaylistItem) => {
    setActivePlaylist(pl);
    setMode("playlists");
    setLoadingContent(true);
    try {
      const res = await backendGetPlaylistTracks(pl.id, 0, true);
      if (res.ok && res.tracks) {
        setPlaylistTracks(res.tracks);
        if (res.is_mixed !== undefined) {
          setActivePlaylist((prev) => (prev ? { ...prev, is_mixed: res.is_mixed } : null));
        }
      }
    } catch {}
    setLoadingContent(false);
  }, []);

  const handleOpenAlbum = useCallback(async (alb: AlbumItem) => {
    setActiveAlbum(alb);
    setMode("albums");
    setLoadingContent(true);
    try {
      const res = await backendGetAlbumTracks(alb.id, 0);
      if (res.ok && res.tracks) setAlbumTracks(res.tracks);
    } catch {}
    setLoadingContent(false);
  }, []);

  const handleOpenArtist = useCallback(async (art: ArtistItem) => {
    setActiveArtist(art);
    setMode("artists");
    setLoadingContent(true);
    try {
      const [topRes, albRes] = await Promise.all([
        backendGetArtistTopTracks(art.id),
        backendGetArtistAlbums(art.id, 0),
      ]);
      if (topRes.ok && topRes.tracks) setArtistTopTracks(topRes.tracks);
      if (albRes.ok && albRes.albums) setArtistAlbums(albRes.albums);
    } catch {}
    setLoadingContent(false);
  }, []);

  // Search query with debounce
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

  // Native Mix toggle
  const handleToggleMix = useCallback(async () => {
    if (!activePlaylist || mixingBusy) return;
    setMixingBusy(true);
    const targetMix = !activePlaylist.is_mixed;
    try {
      const res = await backendSetNativeMix(activePlaylist.uri, targetMix, true);
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

  const toggleFolder = (folderId: string) => {
    setExpandedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  // Playback control
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
    const res = await backendToggleLike(tid, null);
    if (res.ok) {
      showToast(res.is_liked ? "Added to Liked Songs" : "Removed from Liked Songs");
      refreshStatus();
    }
  }, [status, showToast, refreshStatus]);

  const handleToggleRepeat = useCallback(async () => {
    const current = status?.repeat_state || "off";
    const next = current === "off" ? "context" : current === "context" ? "track" : "off";
    await backendSetRepeat(next, "");
    showToast(next === "track" ? "Repeat: Track" : next === "context" ? "Repeat: Context" : "Repeat: Off");
    refreshStatus();
  }, [status, showToast, refreshStatus]);

  // Robust playback handler with context and tracklists
  const handlePlayTrack = useCallback(async (uri: string, contextUri?: string, allUris?: string[], startIdx?: number) => {
    if (contextUri) {
      await backendPlayTracks(contextUri, uri || null, null, 0);
    } else if (allUris && allUris.length > 0) {
      await backendPlayTracks(null, null, allUris, startIdx ?? 0);
    } else {
      await backendPlayTracks(null, uri || null, null, 0);
    }
    showToast("Playback started");
    refreshStatus();
  }, [showToast, refreshStatus]);

  const handleSeekDelta = useCallback(async (seconds: number) => {
    const cur = status?.position_ms || 0;
    const target = Math.max(0, cur + seconds * 1000);
    await backendSeekPlayback(target, "");
    refreshStatus();
  }, [status, refreshStatus]);

  const handleVolumeDelta = useCallback(async (delta: number) => {
    const cur = typeof status?.volume === "number" ? status.volume : 50;
    const target = Math.min(100, Math.max(0, cur + delta));
    await backendSetVolume(target);
    showToast(`Volume: ${target}%`);
    refreshStatus();
  }, [status, showToast, refreshStatus]);

  // Track Radio Generator
  const handleStartRadio = useCallback(async (t: TrackItem) => {
    const tid = t.id || t.uri?.replace("spotify:track:", "");
    if (!tid) return;
    showToast(`Starting radio for ${t.name}...`);
    try {
      const res = await backendGetTrackRecommendations(tid, 25);
      if (res.ok && res.tracks && res.tracks.length > 0) {
        const uris = res.tracks.map((x) => x.uri).filter(Boolean) as string[];
        if (uris.length) {
          await backendPlayTracks(null, uris[0], uris, 0);
          showToast(`Radio started (${uris.length} tracks)`);
          refreshStatus();
        }
      } else {
        showToast("No recommendations found.");
      }
    } catch {
      showToast("Error fetching recommendations.");
    }
    setActionTrack(null);
  }, [showToast, refreshStatus]);

  // Add to Queue
  const handleAddToQueue = useCallback(async (t: TrackItem) => {
    if (!t.uri) return;
    const res = await backendAddToQueue(t.uri, "");
    if (res.ok) {
      showToast(`Added to queue: ${t.name}`);
    } else {
      showToast(`Queue error: ${res.error || "Failed"}`);
    }
    setActionTrack(null);
  }, [showToast]);

  // Add to Playlist
  const handleAddTrackToPlaylist = useCallback(async (playlistId: string, playlistName: string) => {
    if (!actionTrack?.uri) return;
    const res = await backendAddTrackToPlaylist(playlistId, actionTrack.uri);
    if (res.ok) {
      showToast(`Added to ${playlistName}`);
    } else {
      showToast(`Error adding: ${res.error || "Failed"}`);
    }
    setShowAddToPlaylistModal(false);
    setActionTrack(null);
  }, [actionTrack, showToast]);

  // Remove from Playlist
  const handleRemoveTrackFromActivePlaylist = useCallback(async () => {
    if (!activePlaylist?.id || !actionTrack?.uri) return;
    const res = await backendRemoveTrackFromPlaylist(activePlaylist.id, actionTrack.uri);
    if (res.ok) {
      showToast("Removed from playlist");
      setPlaylistTracks((prev) => prev.filter((t) => t.uri !== actionTrack.uri));
    } else {
      showToast(`Error: ${res.error || "Failed"}`);
    }
    setActionTrack(null);
  }, [activePlaylist, actionTrack, showToast]);

  // Create Playlist
  const handleCreatePlaylist = useCallback(async () => {
    if (!newPlaylistName.trim()) return;
    const res = await backendCreatePlaylist(newPlaylistName.trim(), true);
    if (res.ok) {
      showToast(`Playlist '${newPlaylistName}' created!`);
      setNewPlaylistName("");
      setCreatingPlaylist(false);
      loadFolders();
    } else {
      showToast(`Error: ${res.error || "Failed"}`);
    }
  }, [newPlaylistName, showToast, loadFolders]);

  // Create Folder
  const handleCreateFolder = useCallback(async () => {
    if (!newFolderName.trim()) return;
    const res = await backendManagePlaylistFolder("create", "", newFolderName.trim(), "");
    if (res.ok) {
      showToast(`Folder '${newFolderName}' created`);
      setNewFolderName("");
      setCreatingFolder(false);
      loadFolders();
    } else {
      showToast(`Error: ${res.error || "Failed"}`);
    }
  }, [newFolderName, showToast, loadFolders]);

  // Rename Folder
  const handleRenameFolder = useCallback(async () => {
    if (!renamingFolderId || !renameFolderName.trim()) return;
    const res = await backendManagePlaylistFolder("rename", renamingFolderId, renameFolderName.trim(), "");
    if (res.ok) {
      showToast("Folder renamed");
      setRenamingFolderId(null);
      setRenameFolderName("");
      loadFolders();
    } else {
      showToast(`Error: ${res.error || "Failed"}`);
    }
  }, [renamingFolderId, renameFolderName, showToast, loadFolders]);

  const handleDeleteFolder = useCallback(async (folderId: string, folderName: string) => {
    const res = await backendManagePlaylistFolder("delete", folderId, "", "");
    if (res.ok) {
      showToast(`Folder '${folderName}' deleted`);
      loadFolders();
    }
  }, [showToast, loadFolders]);

  // Category switch
  const handleSelectMode = useCallback((id: ViewMode) => {
    setActivePlaylist(null);
    setActiveAlbum(null);
    setActiveArtist(null);
    setActionTrack(null);
    setShowAddToPlaylistModal(false);
    focusedTrackRef.current = null;
    setMode(id);
  }, []);

  // L1 / R1 cycle through views
  const cycleMode = useCallback((direction: 1 | -1) => {
    const curIdx = ALL_MODES.indexOf(modeRef.current);
    if (curIdx === -1) return;
    const nextIdx = (curIdx + direction + ALL_MODES.length) % ALL_MODES.length;
    handleSelectMode(ALL_MODES[nextIdx]);
  }, [handleSelectMode]);

  // Global Keydown & Gamepad listener with text-input guard & L1/R1 support
  useEffect(() => {
    const handleGamepadAction = (btn: any, e?: any) => {
      const activeTag = (document.activeElement as HTMLElement)?.tagName?.toUpperCase();
      if (activeTag === "INPUT" || activeTag === "TEXTAREA") return;

      const isL1 = btn === "L1" || btn === "LB" || btn === 5 || btn === "BUMPER_LEFT" || btn === "BUTTON_LEFT_BUMPER";
      const isR1 = btn === "R1" || btn === "RB" || btn === 6 || btn === "BUMPER_RIGHT" || btn === "BUTTON_RIGHT_BUMPER";
      const button = (btn === "Y" || btn === "y" || btn === 4 || btn === "OPTIONS" || btn === "BUTTON_Y")
        ? "Y"
        : (btn === "X" || btn === "x" || btn === 3 || btn === "SECONDARY" || btn === "BUTTON_X")
        ? "X"
        : btn;

      if (isL1) {
        cycleMode(-1);
      } else if (isR1) {
        cycleMode(1);
      } else if (button === "Y") { // Gamepad Y button opens action menu
        if (modeRef.current !== "engine" && modeRef.current !== "devices") {
          const candidate = focusedTrackRef.current || (modeRef.current === "now_playing" ? (track as any) : null);
          if (candidate && (candidate.id || candidate.track_id || candidate.uri)) {
            if (e) { e.preventDefault?.(); e.stopPropagation?.(); }
            setActionTrack(candidate);
          }
        }
      } else if (button === "X") { // Gamepad X button toggles track like status
        if (modeRef.current !== "engine" && modeRef.current !== "devices") {
          const t = (focusedTrackRef.current || (modeRef.current === "now_playing" ? track : null)) as any;
          if (t?.id || t?.track_id) {
            if (e) { e.preventDefault?.(); e.stopPropagation?.(); }
            handleToggleLike(t.id || t.track_id);
          }
        }
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement as HTMLElement)?.tagName?.toUpperCase();
      if (activeTag === "INPUT" || activeTag === "TEXTAREA") return;

      if (e.key === "PageUp" || e.key === "[" || (e as any).code === "GamepadBumperLeft") {
        cycleMode(-1);
        return;
      }
      if (e.key === "PageDown" || e.key === "]" || (e as any).code === "GamepadBumperRight") {
        cycleMode(1);
        return;
      }
      if (e.key === "y" || e.key === "Y") {
        handleGamepadAction("Y", e);
      } else if (e.key === "x" || e.key === "X") {
        handleGamepadAction("X", e);
      }
    };

    const handleVgpButton = (e: any) => {
      const btn = e.detail?.button ?? e.detail ?? e.button;
      handleGamepadAction(btn, e);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("vgp_onbuttondown", handleVgpButton);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("vgp_onbuttondown", handleVgpButton);
    };
  }, [track, handleToggleLike, cycleMode]);

  // Breadcrumb B navigation handler on modal element
  const attachNav = useCallback((el: HTMLDivElement | null) => {
    if (!el || (el as any).__deckifyNavAttached) return;
    (el as any).__deckifyNavAttached = true;

    el.addEventListener("vgp_oncancel", (e: Event) => {
      if (actionTrackRef.current) {
        e.preventDefault();
        e.stopPropagation();
        (e as any).stopImmediatePropagation?.();
        setActionTrack(null);
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
      // If at root, close modal
      closeModal?.();
    }, true);

    el.addEventListener("vgp_onbuttondown", (e: any) => {
      const activeTag = (document.activeElement as HTMLElement)?.tagName?.toUpperCase();
      if (activeTag === "INPUT" || activeTag === "TEXTAREA") return;

      const btn = e.detail?.button ?? e.detail ?? e.button;
      const isL1 = btn === "L1" || btn === "LB" || btn === 5 || btn === "BUMPER_LEFT" || btn === "BUTTON_LEFT_BUMPER";
      const isR1 = btn === "R1" || btn === "RB" || btn === 6 || btn === "BUMPER_RIGHT" || btn === "BUTTON_RIGHT_BUMPER";
      const isY = btn === "Y" || btn === "y" || btn === 4 || btn === "OPTIONS" || btn === "BUTTON_Y";
      const isX = btn === "X" || btn === "x" || btn === 3 || btn === "SECONDARY" || btn === "BUTTON_X";

      if (isL1) { cycleMode(-1); }
      if (isR1) { cycleMode(1); }
      if (isY) { setActionTrack(focusedTrackRef.current || (track as any) || null); }
      if (isX) {
        const t = (focusedTrackRef.current || track) as any;
        if (t?.id || t?.track_id) handleToggleLike(t.id || t.track_id);
      }
    });
  }, [track, handleToggleLike, cycleMode, closeModal]);

  const audioBackend = status?.audio_backend || status?.settings?.audio_backend || "librespot";
  const audioQuality = status?.settings?.audio_quality || "320";
  const isLossless = audioQuality === "lossless";
  const artwork = track?.artwork_url || track?.image_url;

  // Render uncategorized playlists
  const categorizedPlaylistIds = new Set<string>();
  const collectPlaylistIds = (fList: FolderItem[]) => {
    for (const f of fList) {
      for (const id of f.playlist_ids || []) categorizedPlaylistIds.add(id);
      for (const pl of f.playlists || []) categorizedPlaylistIds.add(pl.id);
      if (f.subfolders) collectPlaylistIds(f.subfolders);
    }
  };
  collectPlaylistIds(folders);
  const uncategorizedPlaylists = allUserPlaylists.filter((pl) => !categorizedPlaylistIds.has(pl.id));

  // Folder renderer
  const renderFolder = (folder: FolderItem, depth = 0) => {
    const isOpen = expandedFolderIds.has(folder.id);
    const isCustom = folder.id.startsWith("folder-");
    const isRenaming = renamingFolderId === folder.id;

    return (
      <div key={folder.id} style={{ marginLeft: depth * 12, marginBottom: 4 }}>
        <InteractiveRow
          onClick={() => toggleFolder(folder.id)}
          style={{ marginBottom: 2 }}
        >
          {isOpen ? <FaFolderOpen color="#1db954" size={14} /> : <FaFolder color="#aaa" size={14} />}
          {isRenaming ? (
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginLeft: 8 }} onClick={(e) => e.stopPropagation()}>
              <input
                value={renameFolderName}
                onChange={(e) => setRenameFolderName(e.target.value)}
                style={{ background: "#222", border: "1px solid #1db954", color: "#fff", padding: "2px 6px", borderRadius: 4, fontSize: 12 }}
                autoFocus
              />
              <span onClick={handleRenameFolder} style={{ cursor: "pointer", color: "#1db954" }}><FaCheck size={12} /></span>
              <span onClick={() => setRenamingFolderId(null)} style={{ cursor: "pointer", color: "#888" }}><FaTimes size={12} /></span>
            </div>
          ) : (
            <span style={{ fontSize: 13, fontWeight: 600, marginLeft: 8 }}>{folder.name}</span>
          )}
          <span style={{ fontSize: 11, opacity: 0.5, marginLeft: "auto" }}>
            {folder.playlists.length}
          </span>
          {isCustom && !isRenaming && (
            <div style={{ display: "flex", gap: 6, marginLeft: 8 }}>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  setRenamingFolderId(folder.id);
                  setRenameFolderName(folder.name);
                }}
                style={{ padding: "4px", opacity: 0.6, cursor: "pointer" }}
              >
                <FaEdit size={11} color="#aaa" />
              </span>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteFolder(folder.id, folder.name);
                }}
                style={{ padding: "4px", opacity: 0.6, cursor: "pointer" }}
              >
                <FaTrash size={11} color="#ff5555" />
              </span>
            </div>
          )}
        </InteractiveRow>
        {isOpen && (
          <Focusable flow-children="column" style={{ paddingLeft: 8, display: "flex", flexDirection: "column", gap: 2 }}>
            {folder.subfolders?.map((sf) => renderFolder(sf, depth + 1))}
            {folder.playlists.map((pl) => (
              <InteractiveRow
                key={pl.id}
                onClick={() => handleOpenPlaylist(pl)}
                active={activePlaylist?.id === pl.id}
                style={{ padding: "6px 10px" }}
              >
                {pl.image_url ? (
                  <DeckifyImage src={pl.image_url} width={24} height={24} style={{ borderRadius: 4, marginRight: 8 }} />
                ) : (
                  <FaMusic size={12} color="#888" style={{ marginRight: 8 }} />
                )}
                <span style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {pl.name}
                </span>
                {pl.is_mixed && (
                  <span style={{ fontSize: 10, background: "#1db954", color: "#000", padding: "1px 5px", borderRadius: 4, fontWeight: 700, marginLeft: "auto" }}>
                    MIX
                  </span>
                )}
              </InteractiveRow>
            ))}
          </Focusable>
        )}
      </div>
    );
  };

  // Track row component with quick Action Menu trigger and playback context
  const renderTrackItem = (t: TrackItem, idx: number, contextUri?: string, allTracks?: TrackItem[]) => {
    const img = t.artwork_url || t.image_url;
    const allUris = allTracks ? (allTracks.map((x) => x.uri).filter(Boolean) as string[]) : undefined;

    return (
      <InteractiveRow
        key={t.id || t.uri || idx}
        onClick={() => handlePlayTrack(t.uri || "", contextUri, allUris, idx)}
        onFocus={() => { focusedTrackRef.current = t; }}
        style={{ gap: 12 }}
      >
        <span style={{ width: 22, fontSize: 12, opacity: 0.5, textAlign: "right" }}>{idx + 1}</span>
        {img ? (
          <DeckifyImage src={img} width={32} height={32} style={{ borderRadius: 4 }} />
        ) : (
          <FaMusic size={14} color="#888" />
        )}
        <div style={{ flex: 1, overflow: "hidden" }}>
          <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {t.name}
          </div>
          <div style={{ fontSize: 11, opacity: 0.6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {t.artist}
          </div>
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

        {/* Action button */}
        <span
          onClick={(e) => {
            e.stopPropagation();
            setActionTrack(t);
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

  return (
    <ModalRootAny closeModal={closeModal} onCancel={closeModal} bAllowFullSize>
      <div ref={attachNav} style={{ display: "contents" }}>
        <div
          style={{
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
          {/* Ambient Glow background layer based on album art */}
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
            tabIndex={actionTrack ? -1 : undefined}
            style={{
              display: "flex",
              flex: 1,
              minHeight: 0,
              overflow: "hidden",
              position: "relative",
              zIndex: 1,
              pointerEvents: actionTrack ? "none" : "auto",
            }}
          >
            {/* Left Sidebar */}
            <Focusable
              flow-children="column"
              style={{
                width: 240,
                flexShrink: 0,
                background: "#161616",
                borderRight: "1px solid rgba(255,255,255,0.08)",
                display: "flex",
                flexDirection: "column",
                padding: "14px 10px",
                overflowY: "auto",
              }}
            >
              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 8px 12px", borderBottom: "1px solid rgba(255,255,255,0.08)", marginBottom: 10 }}>
                <FaSpotify size={26} color="#1db954" />
                <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: -0.5 }}>Deckify</span>
                <span style={{ fontSize: 10, background: "rgba(255,255,255,0.1)", padding: "2px 6px", borderRadius: 4, marginLeft: "auto", opacity: 0.7 }}>
                  L1/R1
                </span>
              </div>

              {/* Navigation Menu */}
              <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.4, padding: "4px 8px", textTransform: "uppercase", letterSpacing: 0.8 }}>Playback</div>
                <SidebarBtn id="now_playing" label="Now Playing" icon={<FaPlay size={12} />} active={mode === "now_playing"} onSelect={handleSelectMode} />
                <SidebarBtn id="lyrics" label="Lyrics" icon={<FaMicrophone size={12} />} active={mode === "lyrics"} onSelect={handleSelectMode} />

                <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.4, padding: "8px 8px 4px", textTransform: "uppercase", letterSpacing: 0.8 }}>Library</div>
                <SidebarBtn id="playlists" label="Playlists" icon={<FaFolder size={12} />} active={mode === "playlists"} onSelect={handleSelectMode} />
                <SidebarBtn id="liked" label="Liked Songs" icon={<FaHeart size={12} />} active={mode === "liked"} onSelect={handleSelectMode} />
                <SidebarBtn id="albums" label="Albums" icon={<FaCompactDisc size={12} />} active={mode === "albums"} onSelect={handleSelectMode} />
                <SidebarBtn id="artists" label="Artists" icon={<FaUser size={12} />} active={mode === "artists"} onSelect={handleSelectMode} />
                <SidebarBtn id="recent" label="Recently Played" icon={<FaHistory size={12} />} active={mode === "recent"} onSelect={handleSelectMode} />
                <SidebarBtn id="episodes" label="Podcasts" icon={<FaPodcast size={12} />} active={mode === "episodes"} onSelect={handleSelectMode} />

                <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.4, padding: "8px 8px 4px", textTransform: "uppercase", letterSpacing: 0.8 }}>Control</div>
                <SidebarBtn id="search" label="Search" icon={<FaSearch size={12} />} active={mode === "search"} onSelect={handleSelectMode} />
                <SidebarBtn id="queue" label="Queue" icon={<FaListUl size={12} />} active={mode === "queue"} onSelect={handleSelectMode} />
                <SidebarBtn id="devices" label="Devices" icon={<FaTv size={12} />} active={mode === "devices"} onSelect={handleSelectMode} />
                <SidebarBtn id="engine" label="Settings" icon={<FaCog size={12} />} active={mode === "engine"} onSelect={handleSelectMode} />
              </Focusable>

              {/* Now Playing Widget in Sidebar */}
              {track?.name && (
                <div
                  style={{
                    marginTop: "auto",
                    padding: 8,
                    borderRadius: 8,
                    background: "rgba(255,255,255,0.05)",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  {artwork ? (
                    <DeckifyImage src={artwork} width={34} height={34} style={{ borderRadius: 4 }} />
                  ) : (
                    <FaMusic size={18} color="#888" />
                  )}
                  <div style={{ overflow: "hidden", flex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {track.name}
                    </div>
                    <div style={{ fontSize: 10, opacity: 0.6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {track.artist}
                    </div>
                  </div>
                </div>
              )}

              {/* Back to Quick Menu (B) Button */}
              <InteractiveRow
                onClick={() => closeModal?.()}
                style={{
                  marginTop: 8,
                  justifyContent: "center",
                  background: "rgba(255,255,255,0.08)",
                  padding: "8px 10px",
                  fontSize: 12,
                  fontWeight: 600,
                  gap: 8,
                }}
              >
                <FaArrowLeft size={11} />
                <span>Back to Quick Menu (B)</span>
              </InteractiveRow>
            </Focusable>

            {/* Right Content Panel */}
            <Focusable
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
              {/* VIEW: NOW PLAYING */}
              {mode === "now_playing" && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", maxWidth: 640, margin: "0 auto", textAlign: "center" }}>
                  {/* Album Art */}
                  <div style={{ position: "relative", marginBottom: 18 }}>
                    {artwork ? (
                      <DeckifyImage
                        src={artwork}
                        width={240}
                        height={240}
                        style={{ borderRadius: 14, boxShadow: "0 16px 40px rgba(0,0,0,0.6)" }}
                      />
                    ) : (
                      <div style={{ width: 240, height: 240, borderRadius: 14, background: "#222", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <FaSpotify size={70} color="#1db954" />
                      </div>
                    )}

                    {/* Lossless badge */}
                    {isLossless && (
                      <div
                        style={{
                          position: "absolute",
                          top: 10,
                          right: 10,
                          background: "rgba(0,0,0,0.8)",
                          border: "1px solid #1db954",
                          color: "#1db954",
                          padding: "3px 8px",
                          borderRadius: 6,
                          fontSize: 10,
                          fontWeight: 800,
                        }}
                      >
                        LOSSLESS FLAC
                      </div>
                    )}
                  </div>

                  {/* Track Details */}
                  <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 4px 0", color: "#fff" }}>
                    {track?.name || "No active track"}
                  </h1>
                  <p style={{ fontSize: 15, opacity: 0.7, margin: "0 0 16px 0" }}>
                    {track?.artist || "Choose a playlist or album"}
                  </p>

                  {/* Progress Bar & Seek Scrubbing (D-Pad Left/Right enabled) */}
                  {track?.duration_ms && track.duration_ms > 0 && (
                    <div style={{ width: "100%", marginBottom: 16 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, opacity: 0.6, marginBottom: 4 }}>
                        <span>{formatMs(status?.position_ms || 0)}</span>
                        <span>{formatMs(track.duration_ms)}</span>
                      </div>
                      <InteractiveRow
                        onClick={() => {}}
                        onKeyDown={(e) => {
                          if (e.key === "ArrowLeft") handleSeekDelta(-10);
                          if (e.key === "ArrowRight") handleSeekDelta(10);
                        }}
                        style={{ width: "100%", height: 10, background: "rgba(255,255,255,0.15)", borderRadius: 5, padding: 0, overflow: "hidden" }}
                      >
                        <div
                          style={{
                            width: `${Math.min(100, ((status?.position_ms || 0) / track.duration_ms) * 100)}%`,
                            height: "100%",
                            background: "#1db954",
                          }}
                        />
                      </InteractiveRow>

                      {/* Scrub controls */}
                      <Focusable flow-children="horizontal" style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 8 }}>
                        <InteractiveRow onClick={() => handleSeekDelta(-15)} style={{ padding: "4px 10px", fontSize: 11 }}>
                          -15s
                        </InteractiveRow>
                        <InteractiveRow onClick={() => handleSeekDelta(15)} style={{ padding: "4px 10px", fontSize: 11 }}>
                          +15s
                        </InteractiveRow>
                      </Focusable>
                    </div>
                  )}

                  {/* Playback Controls */}
                  <Focusable
                    flow-children="horizontal"
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14 }}
                  >
                    <RoundBtn
                      onClick={() => backendSetShuffle(!status?.shuffle_state, "")}
                      active={status?.shuffle_state}
                      size={42}
                    >
                      <FaRandom size={16} />
                    </RoundBtn>

                    <RoundBtn onClick={handlePrev} size={46}>
                      <FaStepBackward size={18} />
                    </RoundBtn>

                    <RoundBtn onClick={handlePlayPause} size={54} accent>
                      {isPlaying ? <FaPause size={20} /> : <FaPlay size={20} style={{ marginLeft: 2 }} />}
                    </RoundBtn>

                    <RoundBtn onClick={handleNext} size={46}>
                      <FaStepForward size={18} />
                    </RoundBtn>

                    <RoundBtn
                      onClick={handleToggleRepeat}
                      active={status?.repeat_state && status?.repeat_state !== "off"}
                      size={42}
                    >
                      <FaRedo size={15} />
                      {status?.repeat_state === "track" && (
                        <span style={{ position: "absolute", fontSize: 8, top: 4, right: 4, fontWeight: 900 }}>1</span>
                      )}
                    </RoundBtn>

                    <RoundBtn onClick={() => handleToggleLike()} active={status?.is_liked} size={42}>
                      {status?.is_liked ? <FaHeart size={16} /> : <FaRegHeart size={16} />}
                    </RoundBtn>
                  </Focusable>

                  {/* Volume Slider Bar (Controllable with D-Pad Left/Right) */}
                  <div style={{ marginTop: 20, width: "100%", maxWidth: 360, display: "flex", alignItems: "center", gap: 10 }}>
                    <RoundBtn onClick={() => handleVolumeDelta(-5)} size={32}>
                      <FaVolumeMute size={12} />
                    </RoundBtn>
                    <InteractiveRow
                      onClick={() => {}}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowLeft") handleVolumeDelta(-5);
                        if (e.key === "ArrowRight") handleVolumeDelta(5);
                      }}
                      style={{ flex: 1, height: 10, background: "rgba(255,255,255,0.15)", borderRadius: 5, padding: 0, overflow: "hidden" }}
                    >
                      <div style={{ width: `${status?.volume || 50}%`, height: "100%", background: "#1db954" }} />
                    </InteractiveRow>
                    <RoundBtn onClick={() => handleVolumeDelta(5)} size={32}>
                      <FaVolumeUp size={12} />
                    </RoundBtn>
                  </div>
                </div>
              )}

              {/* VIEW: LIVE LYRICS */}
              {mode === "lyrics" && (
                <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <FaMicrophone size={18} color="#1db954" />
                      <div>
                        <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Lyrics</h2>
                        <span style={{ fontSize: 12, opacity: 0.6 }}>{trackName} — {artistName}</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 11, background: "rgba(29, 185, 84, 0.2)", color: "#1db954", padding: "4px 10px", borderRadius: 12, fontWeight: 700 }}>
                        Source: {lyricsSource || "Auto"}
                      </span>
                      <InteractiveRow
                        onClick={handleNextLyricsSource}
                        style={{ padding: "4px 10px", fontSize: 11, background: "rgba(255,255,255,0.08)" }}
                      >
                        <FaSyncAlt size={10} style={{ marginRight: 4 }} />
                        Try Next Source
                      </InteractiveRow>
                    </div>
                  </div>

                  {loadingLyrics ? (
                    <p style={{ opacity: 0.5 }}>Loading lyrics from waterfall...</p>
                  ) : syncedLyrics.length > 0 ? (
                    <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, padding: "20px 0" }}>
                      {syncedLyrics.map((line, idx) => {
                        const isCurrent = idx === currentLineIndex;
                        return (
                          <div
                            key={idx}
                            ref={isCurrent ? activeLineRef : undefined}
                          >
                            <InteractiveRow
                              onClick={() => backendSeekPlayback(line.timeMs, "")}
                              active={isCurrent}
                              style={{
                                fontSize: isCurrent ? 20 : 15,
                                fontWeight: isCurrent ? 800 : 500,
                                color: isCurrent ? "#1db954" : "rgba(255,255,255,0.45)",
                                background: isCurrent ? "rgba(29, 185, 84, 0.15)" : "transparent",
                                padding: "6px 12px",
                              }}
                            >
                              {line.text}
                            </InteractiveRow>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ whiteSpace: "pre-line", opacity: 0.7, fontSize: 15, lineHeight: 1.8 }}>
                      {plainLyrics || "No lyrics available for this track."}
                    </div>
                  )}
                </div>
              )}

              {/* VIEW: PLAYLISTS & FOLDERS */}
              {mode === "playlists" && !activePlaylist && (
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                    <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Folders & Playlists</h2>
                    <div style={{ display: "flex", gap: 8 }}>
                      <InteractiveRow
                        onClick={() => setCreatingPlaylist(!creatingPlaylist)}
                        style={{ padding: "6px 12px", background: "#1db954", color: "#000", fontWeight: 700, fontSize: 12, gap: 6 }}
                      >
                        <FaPlus size={10} /> New Playlist
                      </InteractiveRow>
                      <InteractiveRow
                        onClick={() => setCreatingFolder(!creatingFolder)}
                        style={{ padding: "6px 12px", background: "rgba(255,255,255,0.12)", color: "#fff", fontWeight: 700, fontSize: 12, gap: 6 }}
                      >
                        <FaPlus size={10} /> New Folder
                      </InteractiveRow>
                    </div>
                  </div>

                  {creatingPlaylist && (
                    <div style={{ marginBottom: 16, padding: 12, borderRadius: 8, background: "rgba(255,255,255,0.06)", display: "flex", gap: 10, alignItems: "center" }}>
                      <TextField
                        label="Playlist Name"
                        value={newPlaylistName}
                        onChange={(e) => setNewPlaylistName(e.target.value)}
                      />
                      <InteractiveRow onClick={handleCreatePlaylist} style={{ background: "#1db954", color: "#000", fontWeight: 700, padding: "8px 14px" }}>
                        Create
                      </InteractiveRow>
                      <InteractiveRow onClick={() => setCreatingPlaylist(false)} style={{ padding: "8px 12px" }}>
                        Cancel
                      </InteractiveRow>
                    </div>
                  )}

                  {creatingFolder && (
                    <div style={{ marginBottom: 16, padding: 12, borderRadius: 8, background: "rgba(255,255,255,0.06)", display: "flex", gap: 10, alignItems: "center" }}>
                      <TextField
                        label="Folder Name"
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                      />
                      <InteractiveRow onClick={handleCreateFolder} style={{ background: "#1db954", color: "#000", fontWeight: 700, padding: "8px 14px" }}>
                        Save
                      </InteractiveRow>
                      <InteractiveRow onClick={() => setCreatingFolder(false)} style={{ padding: "8px 12px" }}>
                        Cancel
                      </InteractiveRow>
                    </div>
                  )}

                  <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {folders.map((f) => renderFolder(f, 0))}

                    {/* Uncategorized Playlists Section */}
                    {uncategorizedPlaylists.length > 0 && (
                      <div style={{ marginTop: 14 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.5, textTransform: "uppercase", marginBottom: 6, letterSpacing: 0.8 }}>
                          Uncategorized Playlists ({uncategorizedPlaylists.length})
                        </div>
                        {uncategorizedPlaylists.map((pl) => (
                          <InteractiveRow
                            key={pl.id}
                            onClick={() => handleOpenPlaylist(pl)}
                            style={{ padding: "6px 10px", marginBottom: 2 }}
                          >
                            {pl.image_url ? (
                              <DeckifyImage src={pl.image_url} width={26} height={26} style={{ borderRadius: 4, marginRight: 8 }} />
                            ) : (
                              <FaMusic size={12} color="#888" style={{ marginRight: 8 }} />
                            )}
                            <span style={{ fontSize: 13, fontWeight: 600 }}>{pl.name}</span>
                            <span style={{ fontSize: 11, opacity: 0.5, marginLeft: "auto" }}>
                              {pl.track_count || 0} tracks
                            </span>
                          </InteractiveRow>
                        ))}
                      </div>
                    )}
                  </Focusable>
                </div>
              )}

              {/* VIEW: INSIDE A PLAYLIST */}
              {mode === "playlists" && activePlaylist && (
                <div>
                  <Focusable
                    flow-children="horizontal"
                    style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}
                  >
                    <InteractiveRow
                      onClick={() => setActivePlaylist(null)}
                      style={{ padding: "6px 12px", fontSize: 12 }}
                    >
                      ← Back (B)
                    </InteractiveRow>
                    <div>
                      <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>{activePlaylist.name}</h2>
                      <span style={{ fontSize: 12, opacity: 0.6 }}>{playlistTracks.length} tracks (Fully loaded)</span>
                    </div>

                    <InteractiveRow
                      onClick={() => handlePlayTrack("", activePlaylist.uri)}
                      style={{
                        marginLeft: "auto",
                        background: "#1db954",
                        color: "#000",
                        fontWeight: 700,
                        padding: "8px 16px",
                        borderRadius: 20,
                        gap: 8,
                      }}
                    >
                      <FaPlay size={11} /> Play
                    </InteractiveRow>

                    {audioBackend === "spotify_client" && (
                      <InteractiveRow
                        onClick={handleToggleMix}
                        style={{
                          background: activePlaylist.is_mixed ? "#1db954" : "rgba(255,255,255,0.1)",
                          color: activePlaylist.is_mixed ? "#000" : "#fff",
                          fontWeight: 700,
                          padding: "8px 14px",
                          borderRadius: 20,
                          gap: 8,
                        }}
                      >
                        <FaMagic size={11} /> {mixingBusy ? "Processing..." : activePlaylist.is_mixed ? "Mix Active" : "Enable Mix"}
                      </InteractiveRow>
                    )}
                  </Focusable>

                  {loadingContent ? (
                    <p style={{ opacity: 0.5 }}>Loading...</p>
                  ) : (
                    <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      {playlistTracks.map((t, idx) => renderTrackItem(t, idx, activePlaylist.uri))}
                    </Focusable>
                  )}
                </div>
              )}

              {/* VIEW: LIKED SONGS */}
              {mode === "liked" && (
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                    <div>
                      <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Liked Songs</h2>
                      <span style={{ fontSize: 12, opacity: 0.6 }}>{likedTracks.length} of {likedTotal || likedTracks.length} tracks</span>
                    </div>
                    {likedTracks.length > 0 && (
                      <InteractiveRow
                        onClick={() => handlePlayTrack("", undefined, likedTracks.map((t) => t.uri).filter(Boolean) as string[], 0)}
                        style={{ background: "#1db954", color: "#000", fontWeight: 700, padding: "8px 16px", borderRadius: 20, gap: 8 }}
                      >
                        <FaPlay size={11} /> Play All
                      </InteractiveRow>
                    )}
                  </div>
                  {loadingContent ? (
                    <p style={{ opacity: 0.5 }}>Loading liked songs...</p>
                  ) : (
                    <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      {likedTracks.map((t, idx) => renderTrackItem(t, idx, undefined, likedTracks))}
                      {likedTotal > likedTracks.length && (
                        <InteractiveRow
                          onClick={() => loadLikedTracks(true)}
                          style={{ marginTop: 12, justifyContent: "center", padding: "12px", background: "rgba(255,255,255,0.06)", fontWeight: 700 }}
                        >
                          Load More Songs ({likedTracks.length} / {likedTotal})
                        </InteractiveRow>
                      )}
                    </Focusable>
                  )}
                </div>
              )}

              {/* VIEW: ALBUMS */}
              {mode === "albums" && !activeAlbum && (
                <div>
                  <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>Saved Albums</h2>
                  {loadingContent ? (
                    <p style={{ opacity: 0.5 }}>Loading albums...</p>
                  ) : (
                    <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {savedAlbums.map((alb) => (
                        <InteractiveRow
                          key={alb.id}
                          onClick={() => handleOpenAlbum(alb)}
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
                        </InteractiveRow>
                      ))}
                    </Focusable>
                  )}
                </div>
              )}

              {/* VIEW: INSIDE AN ALBUM */}
              {mode === "albums" && activeAlbum && (
                <div>
                  <Focusable flow-children="horizontal" style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
                    <InteractiveRow onClick={() => setActiveAlbum(null)} style={{ padding: "6px 12px", fontSize: 12 }}>
                      ← Back (B)
                    </InteractiveRow>
                    <div>
                      <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>{activeAlbum.name}</h2>
                      <span style={{ fontSize: 12, opacity: 0.6 }}>{activeAlbum.artist}</span>
                    </div>
                    <InteractiveRow
                      onClick={() => handlePlayTrack("", activeAlbum.uri)}
                      style={{ marginLeft: "auto", background: "#1db954", color: "#000", fontWeight: 700, padding: "8px 16px", borderRadius: 20, gap: 8 }}
                    >
                      <FaPlay size={11} /> Play Album
                    </InteractiveRow>
                  </Focusable>
                  <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {albumTracks.map((t, idx) => renderTrackItem(t, idx, activeAlbum.uri))}
                  </Focusable>
                </div>
              )}

              {/* VIEW: ARTISTS */}
              {mode === "artists" && !activeArtist && (
                <div>
                  <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>Followed Artists</h2>
                  {loadingContent ? (
                    <p style={{ opacity: 0.5 }}>Loading artists...</p>
                  ) : (
                    <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {followedArtists.map((art) => (
                        <InteractiveRow
                          key={art.id}
                          onClick={() => handleOpenArtist(art)}
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
              )}

              {/* VIEW: INSIDE AN ARTIST */}
              {mode === "artists" && activeArtist && (
                <div>
                  <Focusable flow-children="horizontal" style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
                    <InteractiveRow onClick={() => setActiveArtist(null)} style={{ padding: "6px 12px", fontSize: 12 }}>
                      ← Back (B)
                    </InteractiveRow>
                    <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>{activeArtist.name}</h2>
                  </Focusable>

                  <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1db954", marginBottom: 10 }}>Top Tracks</h3>
                  <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 20 }}>
                    {artistTopTracks.map((t, idx) => renderTrackItem(t, idx, undefined, artistTopTracks))}
                  </Focusable>

                  <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1db954", marginBottom: 10 }}>Albums & Singles</h3>
                  <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {artistAlbums.map((alb) => (
                      <InteractiveRow key={alb.id} onClick={() => handleOpenAlbum(alb)} style={{ gap: 10 }}>
                        {alb.image_url && <DeckifyImage src={alb.image_url} width={30} height={30} style={{ borderRadius: 4 }} />}
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{alb.name}</span>
                      </InteractiveRow>
                    ))}
                  </Focusable>
                </div>
              )}

              {/* VIEW: RECENTLY PLAYED */}
              {mode === "recent" && (
                <div>
                  <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>Recently Played</h2>
                  <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {recentlyPlayed.map((t, idx) => renderTrackItem(t, idx, undefined, recentlyPlayed))}
                  </Focusable>
                </div>
              )}

              {/* VIEW: PODCASTS */}
              {mode === "episodes" && (
                <div>
                  <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>Podcasts & Shows</h2>

                  {/* Followed Shows */}
                  {savedShows.length > 0 && (
                    <div style={{ marginBottom: 24 }}>
                      <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1db954", marginBottom: 10 }}>Followed Podcasts ({savedShows.length})</h3>
                      <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {savedShows.map((s) => (
                          <InteractiveRow
                            key={s.id}
                            onClick={() => handlePlayTrack(s.uri)}
                            style={{ gap: 12 }}
                          >
                            {s.image_url ? (
                              <DeckifyImage src={s.image_url} width={38} height={38} style={{ borderRadius: 6 }} />
                            ) : (
                              <FaPodcast size={20} color="#888" />
                            )}
                            <div style={{ flex: 1, overflow: "hidden" }}>
                              <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {s.name}
                              </div>
                              <div style={{ fontSize: 11, opacity: 0.6 }}>
                                {s.publisher} · {s.total_episodes} episodes
                              </div>
                            </div>
                          </InteractiveRow>
                        ))}
                      </Focusable>
                    </div>
                  )}

                  {/* Saved Episodes */}
                  <div>
                    <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1db954", marginBottom: 10 }}>Saved Episodes ({savedEpisodes.length})</h3>
                    {savedEpisodes.length === 0 && savedShows.length === 0 ? (
                      <p style={{ opacity: 0.5 }}>No podcasts or episodes found in your library.</p>
                    ) : (
                      <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {savedEpisodes.map((ep) => {
                          const resumeMs = ep.resume_position_ms || 0;
                          const durationMs = ep.duration_ms || 1;
                          const pct = Math.min(100, Math.round((resumeMs / durationMs) * 100));

                          return (
                            <InteractiveRow
                              key={ep.id}
                              onClick={() => handlePlayTrack(ep.uri)}
                              style={{ gap: 12 }}
                            >
                              {ep.image_url ? (
                                <DeckifyImage src={ep.image_url} width={42} height={42} style={{ borderRadius: 6 }} />
                              ) : (
                                <FaPodcast size={22} color="#888" />
                              )}
                              <div style={{ flex: 1, overflow: "hidden" }}>
                                <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {ep.name}
                                </div>
                                <div style={{ fontSize: 11, opacity: 0.6, marginBottom: resumeMs > 0 ? 4 : 0 }}>
                                  {ep.show_name} · {formatMs(ep.duration_ms || 0)}
                                </div>
                                {resumeMs > 0 && (
                                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,0.15)", borderRadius: 2, overflow: "hidden" }}>
                                      <div style={{ width: `${pct}%`, height: "100%", background: "#1db954" }} />
                                    </div>
                                    <span style={{ fontSize: 10, color: "#1db954", fontWeight: 700 }}>
                                      Resume {formatMs(resumeMs)}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </InteractiveRow>
                          );
                        })}
                      </Focusable>
                    )}
                  </div>
                </div>
              )}

              {/* VIEW: SEARCH */}
              {mode === "search" && (
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
                        {searchResults.tracks.map((t, idx) => renderTrackItem(t, idx, undefined, searchResults.tracks))}
                      </Focusable>
                    </div>
                  )}

                  {/* Results: Playlists */}
                  {(searchTab === "all" || searchTab === "playlists") && searchResults.playlists && searchResults.playlists.length > 0 && (
                    <div style={{ marginTop: 10, marginBottom: 16 }}>
                      <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1db954", marginBottom: 8 }}>Playlists</h3>
                      <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        {searchResults.playlists.map((pl) => (
                          <InteractiveRow key={pl.id} onClick={() => handleOpenPlaylist(pl)} style={{ gap: 10 }}>
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
                          <InteractiveRow key={art.id} onClick={() => handleOpenArtist(art)} style={{ gap: 10 }}>
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
                          <InteractiveRow key={alb.id} onClick={() => handleOpenAlbum(alb)} style={{ gap: 10 }}>
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
              )}

              {/* VIEW: QUEUE */}
              {mode === "queue" && (
                <div>
                  <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>Queue</h2>
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
                        onFocus={() => { focusedTrackRef.current = t; }}
                        style={{ gap: 12 }}
                      >
                        <span style={{ width: 22, fontSize: 12, opacity: 0.5 }}>{idx + 1}</span>
                        {(t.artwork_url || t.image_url) && <DeckifyImage src={(t.artwork_url || t.image_url) || undefined} width={32} height={32} style={{ borderRadius: 4 }} />}
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
                </div>
              )}

              {/* VIEW: DEVICES */}
              {mode === "devices" && (
                <div>
                  <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>Spotify Connect Devices</h2>
                  <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {devices.map((d) => (
                      <InteractiveRow
                        key={d.id}
                        onClick={async () => {
                          await backendTransferPlayback(d.id);
                          showToast(`Transferred to ${d.name}`);
                          loadDevices();
                        }}
                        active={d.is_active}
                        style={{ justifyContent: "space-between", padding: "12px 16px" }}
                      >
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: d.is_active ? "#1db954" : "#fff" }}>{d.name}</div>
                          <div style={{ fontSize: 11, opacity: 0.5 }}>{d.type} {d.is_active ? "· Active" : ""}</div>
                        </div>
                        {d.is_active && <span style={{ fontSize: 12, color: "#1db954", fontWeight: 700 }}>Active</span>}
                      </InteractiveRow>
                    ))}
                  </Focusable>
                </div>
              )}

              {/* VIEW: SETTINGS & NATIVE DECKIFY CONFIG */}
              {mode === "engine" && (
                <div style={{ maxWidth: 640 }}>
                  <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>Settings & Engine Features</h2>

                  {/* Backend & Quality */}
                  <div style={{ marginBottom: 20, padding: 14, borderRadius: 10, background: "rgba(255,255,255,0.04)" }}>
                    <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1db954", marginBottom: 8 }}>Playback Engine</h3>
                    <Focusable flow-children="horizontal" style={{ display: "flex", gap: 10, marginBottom: 14 }}>
                      <InteractiveRow
                        onClick={async () => {
                          await backendSetSetting("audio_backend", "librespot");
                          showToast("Switched to Librespot");
                          refreshStatus();
                        }}
                        active={audioBackend === "librespot"}
                        style={{ flex: 1, justifyContent: "center", padding: "10px", fontWeight: 700 }}
                      >
                        Librespot (Built-in)
                      </InteractiveRow>

                      <InteractiveRow
                        onClick={async () => {
                          await backendSetSetting("audio_backend", "spotify_client");
                          showToast("Switched to Official Spotify Client");
                          refreshStatus();
                          checkOfficialClient();
                        }}
                        active={audioBackend === "spotify_client"}
                        style={{ flex: 1, justifyContent: "center", padding: "10px", fontWeight: 700 }}
                      >
                        Official Spotify Client
                      </InteractiveRow>
                    </Focusable>

                    {/* Official Spotify Client Connection Status */}
                    {audioBackend === "spotify_client" && (
                      <div style={{ marginBottom: 14, padding: 10, borderRadius: 8, background: "rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 700 }}>Official Client Link</div>
                          <div style={{ fontSize: 11, opacity: 0.6 }}>
                            {officialClientStatus?.logged_in
                              ? "Connected & Logged In via Spotify Connect"
                              : officialClientStatus?.running
                              ? "Running (Awaiting Login/Zeroconf link)"
                              : "Not detected / starting"}
                          </div>
                        </div>
                        <InteractiveRow
                          onClick={checkOfficialClient}
                          style={{ padding: "5px 12px", fontSize: 11, background: "#1db954", color: "#000", fontWeight: 700 }}
                        >
                          Check Status
                        </InteractiveRow>
                      </div>
                    )}

                    <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1db954", marginBottom: 8 }}>Audio Quality</h3>
                    <Focusable flow-children="horizontal" style={{ display: "flex", gap: 8 }}>
                      {["96", "160", "320", "lossless"].map((q) => {
                        const active = audioQuality === q;
                        const disabled = q === "lossless" && audioBackend !== "spotify_client";
                        return (
                          <InteractiveRow
                            key={q}
                            onClick={async () => {
                              if (disabled) return;
                              await backendSetSetting("audio_quality", q);
                              showToast(`Quality set to ${q === "lossless" ? "FLAC Lossless" : q + " kbps"}`);
                              refreshStatus();
                            }}
                            active={active}
                            style={{
                              flex: 1,
                              justifyContent: "center",
                              padding: "8px",
                              fontWeight: 700,
                              fontSize: 12,
                              opacity: disabled ? 0.35 : 1,
                            }}
                          >
                            {q === "lossless" ? "FLAC Lossless" : `${q}k`}
                          </InteractiveRow>
                        );
                      })}
                    </Focusable>
                  </div>

                  {/* Advanced Playback Settings (Bit-Perfect, Gapless, Normalisation, Autoplay) */}
                  <div style={{ marginBottom: 20, padding: 14, borderRadius: 10, background: "rgba(255,255,255,0.04)" }}>
                    <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1db954", marginBottom: 10 }}>
                      Playback & Audiophile Features
                    </h3>

                    {/* Bit-Perfect Clock */}
                    <InteractiveRow
                      onClick={async () => {
                        const cur = status?.settings?.bit_perfect_clock ?? true;
                        await backendSetSetting("bit_perfect_clock", !cur);
                        showToast(!cur ? "Bit-Perfect Clock enabled" : "Bit-Perfect Clock disabled");
                        refreshStatus();
                      }}
                      active={status?.settings?.bit_perfect_clock ?? true}
                      style={{ justifyContent: "space-between", marginBottom: 10 }}
                    >
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>Bit-Perfect Output Clock</div>
                        <div style={{ fontSize: 11, opacity: 0.6 }}>Direct sample rate sync (44.1/48kHz), prevents ALSA jitter</div>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: (status?.settings?.bit_perfect_clock ?? true) ? "#1db954" : "#888" }}>
                        {(status?.settings?.bit_perfect_clock ?? true) ? "ON" : "OFF"}
                      </span>
                    </InteractiveRow>

                    {/* Gapless Playback */}
                    <InteractiveRow
                      onClick={async () => {
                        const cur = status?.settings?.gapless ?? true;
                        await backendSetSetting("gapless", !cur);
                        showToast(!cur ? "Gapless playback enabled" : "Gapless playback disabled");
                        refreshStatus();
                      }}
                      active={status?.settings?.gapless ?? true}
                      style={{ justifyContent: "space-between", marginBottom: 10 }}
                    >
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>Gapless Playback</div>
                        <div style={{ fontSize: 11, opacity: 0.6 }}>Seamless transition between consecutive album tracks</div>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: (status?.settings?.gapless ?? true) ? "#1db954" : "#888" }}>
                        {(status?.settings?.gapless ?? true) ? "ON" : "OFF"}
                      </span>
                    </InteractiveRow>

                    {/* Autoplay */}
                    <InteractiveRow
                      onClick={async () => {
                        const cur = status?.settings?.autoplay ?? true;
                        await backendSetSetting("autoplay", !cur);
                        showToast(!cur ? "Autoplay enabled" : "Autoplay disabled");
                        refreshStatus();
                      }}
                      active={status?.settings?.autoplay ?? true}
                      style={{ justifyContent: "space-between", marginBottom: 10 }}
                    >
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>Autoplay Similar Music</div>
                        <div style={{ fontSize: 11, opacity: 0.6 }}>Keep music streaming automatically when queue finishes</div>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: (status?.settings?.autoplay ?? true) ? "#1db954" : "#888" }}>
                        {(status?.settings?.autoplay ?? true) ? "ON" : "OFF"}
                      </span>
                    </InteractiveRow>

                    {/* Volume Normalisation */}
                    <InteractiveRow
                      onClick={async () => {
                        const cur = status?.settings?.normalisation ?? true;
                        await backendSetSetting("normalisation", !cur);
                        showToast(!cur ? "Volume Normalisation enabled" : "Volume Normalisation disabled");
                        refreshStatus();
                      }}
                      active={status?.settings?.normalisation ?? true}
                      style={{ justifyContent: "space-between", marginBottom: (status?.settings?.normalisation ?? true) ? 8 : 0 }}
                    >
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>Volume Normalisation</div>
                        <div style={{ fontSize: 11, opacity: 0.6 }}>Equalize track volumes (ReplayGain)</div>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: (status?.settings?.normalisation ?? true) ? "#1db954" : "#888" }}>
                        {(status?.settings?.normalisation ?? true) ? "ON" : "OFF"}
                      </span>
                    </InteractiveRow>

                    {(status?.settings?.normalisation ?? true) && (
                      <div style={{ paddingLeft: 12, borderLeft: "2px solid rgba(29, 185, 84, 0.4)", marginTop: 6 }}>
                        <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 6 }}>Normalisation Pre-Gain:</div>
                        <Focusable flow-children="horizontal" style={{ display: "flex", gap: 6 }}>
                          {[-5.0, 0.0, 3.0, 6.0].map((gain) => (
                            <InteractiveRow
                              key={gain}
                              onClick={async () => {
                                await backendSetSetting("normalisation_pregain", gain);
                                showToast(`Pre-gain: ${gain > 0 ? "+" : ""}${gain} dB`);
                                refreshStatus();
                              }}
                              active={(status?.settings?.normalisation_pregain ?? 0.0) === gain}
                              style={{ flex: 1, justifyContent: "center", fontSize: 11, fontWeight: 700, padding: "6px" }}
                            >
                              {gain > 0 ? `+${gain}` : gain} dB
                            </InteractiveRow>
                          ))}
                        </Focusable>
                      </div>
                    )}
                  </div>

                  {/* Equalizer & Audio Presets */}
                  <div style={{ marginBottom: 20, padding: 14, borderRadius: 10, background: "rgba(255,255,255,0.04)" }}>
                    <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1db954", marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
                      <FaSlidersH /> Equalizer & Audio Presets
                    </h3>
                    <Focusable flow-children="horizontal" style={{ display: "flex", gap: 8 }}>
                      {[
                        { id: "flat", label: "Flat" },
                        { id: "bass", label: "Bass Boost" },
                        { id: "vocal", label: "Vocal Clarity" },
                        { id: "gaming", label: "Gaming Balance" },
                      ].map((eq) => {
                        const curEq = status?.settings?.eq_preset || "flat";
                        return (
                          <InteractiveRow
                            key={eq.id}
                            onClick={async () => {
                              await backendSetSetting("eq_preset", eq.id);
                              showToast(`Audio preset: ${eq.label}`);
                              refreshStatus();
                            }}
                            active={curEq === eq.id}
                            style={{ flex: 1, justifyContent: "center", fontSize: 12, fontWeight: 700 }}
                          >
                            {eq.label}
                          </InteractiveRow>
                        );
                      })}
                    </Focusable>
                  </div>

                  {/* PipeWire Audio Output Sink Selector */}
                  {audioSinks.length > 0 && (
                    <div style={{ marginBottom: 20, padding: 14, borderRadius: 10, background: "rgba(255,255,255,0.04)" }}>
                      <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1db954", marginBottom: 8 }}>
                        Audio Output Sink (PipeWire)
                      </h3>
                      <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {audioSinks.map((s) => (
                          <InteractiveRow
                            key={s.name}
                            onClick={async () => {
                              await backendSetAudioSink(s.name);
                              showToast(`Output set to ${s.description || s.name}`);
                              loadAudioSinks();
                            }}
                            active={s.is_default}
                            style={{ justifyContent: "space-between" }}
                          >
                            <span style={{ fontSize: 12, fontWeight: 600 }}>{s.description || s.name}</span>
                            {s.is_default && <span style={{ fontSize: 11, color: "#1db954", fontWeight: 700 }}>Default</span>}
                          </InteractiveRow>
                        ))}
                      </Focusable>
                    </div>
                  )}

                  {/* Backend Sleep Timer */}
                  <div style={{ marginBottom: 20, padding: 14, borderRadius: 10, background: "rgba(255,255,255,0.04)" }}>
                    <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1db954", marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
                      <FaClock /> Backend Sleep Timer
                    </h3>
                    <p style={{ fontSize: 12, opacity: 0.6, marginBottom: 10 }}>
                      Timer runs reliably in Python background even if Steam Deck goes into sleep/standby.
                      {status?.sleep_timer?.active && (
                        <b style={{ color: "#1db954", marginLeft: 6 }}>
                          Remaining: {Math.ceil((status.sleep_timer.remaining_seconds || 0) / 60)} min
                        </b>
                      )}
                    </p>
                    <Focusable flow-children="horizontal" style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                      {[15, 30, 45, 60].map((mins) => (
                        <InteractiveRow
                          key={mins}
                          onClick={async () => {
                            await backendSetSleepTimer(mins, status?.sleep_timer?.shutdown_on_finish || false, false);
                            showToast(`Sleep timer set to ${mins} minutes`);
                            refreshStatus();
                          }}
                          style={{ flex: 1, justifyContent: "center", fontSize: 12, fontWeight: 700 }}
                        >
                          {mins}m
                        </InteractiveRow>
                      ))}
                      <InteractiveRow
                        onClick={async () => {
                          await backendSetSleepTimer(null, false, true);
                          showToast("Sleep timer: End of track");
                          refreshStatus();
                        }}
                        style={{ padding: "8px 12px", fontSize: 11, fontWeight: 700 }}
                      >
                        End of Track
                      </InteractiveRow>
                      <InteractiveRow
                        onClick={async () => {
                          await backendSetSleepTimer(null, false, false);
                          showToast("Sleep timer cancelled");
                          refreshStatus();
                        }}
                        style={{ padding: "8px 12px", fontSize: 12 }}
                      >
                        Off
                      </InteractiveRow>
                    </Focusable>

                    {/* Shutdown deck toggle */}
                    <InteractiveRow
                      onClick={async () => {
                        const curShutdown = status?.sleep_timer?.shutdown_on_finish || false;
                        const remaining = status?.sleep_timer?.active ? Math.ceil((status.sleep_timer.remaining_seconds || 0) / 60) : 30;
                        await backendSetSleepTimer(remaining, !curShutdown, false);
                        showToast(!curShutdown ? "Power off Deck enabled" : "Power off Deck disabled");
                        refreshStatus();
                      }}
                      active={status?.sleep_timer?.shutdown_on_finish}
                      style={{ justifyContent: "space-between", marginTop: 8 }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <FaPowerOff color={status?.sleep_timer?.shutdown_on_finish ? "#1db954" : "#888"} />
                        <span style={{ fontSize: 13, fontWeight: 600 }}>Power off Steam Deck when timer finishes</span>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: status?.sleep_timer?.shutdown_on_finish ? "#1db954" : "#888" }}>
                        {status?.sleep_timer?.shutdown_on_finish ? "ON" : "OFF"}
                      </span>
                    </InteractiveRow>
                  </div>

                  {/* Auto-Ducking (Game Audio Balance) */}
                  <div style={{ marginBottom: 20, padding: 14, borderRadius: 10, background: "rgba(255,255,255,0.04)" }}>
                    <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1db954", marginBottom: 6 }}>
                      Auto-Ducking (Game Audio Balance)
                    </h3>
                    <p style={{ fontSize: 12, opacity: 0.6, marginBottom: 10 }}>
                      Automatically ducks game audio volume when Spotify is playing.
                    </p>
                    <InteractiveRow
                      onClick={async () => {
                        const cur = status?.settings?.auto_ducking || false;
                        await backendSetSetting("auto_ducking", !cur);
                        showToast(!cur ? "Auto-Ducking enabled" : "Auto-Ducking disabled");
                        refreshStatus();
                      }}
                      active={status?.settings?.auto_ducking}
                      style={{ justifyContent: "space-between", marginBottom: 10 }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 600 }}>Game Audio Ducking</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: status?.settings?.auto_ducking ? "#1db954" : "#888" }}>
                        {status?.settings?.auto_ducking ? "ON" : "OFF"}
                      </span>
                    </InteractiveRow>
                    {status?.settings?.auto_ducking && (
                      <Focusable flow-children="horizontal" style={{ display: "flex", gap: 8 }}>
                        {[30, 50, 70].map((pct) => (
                          <InteractiveRow
                            key={pct}
                            onClick={async () => {
                              await backendSetSetting("auto_ducking_volume", pct);
                              showToast(`Ducking volume: ${pct}%`);
                              refreshStatus();
                            }}
                            active={(status?.settings?.auto_ducking_volume || 50) === pct}
                            style={{ flex: 1, justifyContent: "center", fontSize: 12, fontWeight: 700 }}
                          >
                            Game -{pct}%
                          </InteractiveRow>
                        ))}
                      </Focusable>
                    )}
                  </div>

                  {/* In-Game Mini Overlay HUD */}
                  <div style={{ marginBottom: 20, padding: 14, borderRadius: 10, background: "rgba(255,255,255,0.04)" }}>
                    <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1db954", marginBottom: 6 }}>
                      In-Game Mini Overlay (HUD)
                    </h3>
                    <p style={{ fontSize: 12, opacity: 0.6, marginBottom: 10 }}>
                      Display a compact Now Playing overlay badge while gaming.
                    </p>
                    <InteractiveRow
                      onClick={async () => {
                        const cur = status?.settings?.overlay_enabled || false;
                        await backendSetSetting("overlay_enabled", !cur);
                        showToast(!cur ? "Overlay HUD enabled" : "Overlay HUD disabled");
                        refreshStatus();
                      }}
                      active={status?.settings?.overlay_enabled}
                      style={{ justifyContent: "space-between", marginBottom: status?.settings?.overlay_enabled ? 10 : 0 }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 600 }}>Mini Overlay HUD</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: status?.settings?.overlay_enabled ? "#1db954" : "#888" }}>
                        {status?.settings?.overlay_enabled ? "ON" : "OFF"}
                      </span>
                    </InteractiveRow>
                    {status?.settings?.overlay_enabled && (
                      <Focusable flow-children="horizontal" style={{ display: "flex", gap: 6, marginTop: 8 }}>
                        {["top-left", "top-right", "bottom-left", "bottom-right"].map((pos) => (
                          <InteractiveRow
                            key={pos}
                            onClick={async () => {
                              await backendSetSetting("overlay_position", pos);
                              showToast(`Overlay position: ${pos}`);
                              refreshStatus();
                            }}
                            active={(status?.settings?.overlay_position || "top-right") === pos}
                            style={{ flex: 1, justifyContent: "center", fontSize: 11, fontWeight: 700, textTransform: "capitalize", padding: "6px" }}
                          >
                            {pos.replace("-", " ")}
                          </InteractiveRow>
                        ))}
                      </Focusable>
                    )}
                  </div>

                  {/* Toasts & Gamepad Quick Chords */}
                  <div style={{ marginBottom: 20, padding: 14, borderRadius: 10, background: "rgba(255,255,255,0.04)" }}>
                    <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1db954", marginBottom: 6 }}>
                      Notifications & Controller Shortcuts
                    </h3>

                    {/* Track Change Toasts */}
                    <InteractiveRow
                      onClick={async () => {
                        const cur = status?.settings?.toast_enabled ?? true;
                        await backendSetSetting("toast_enabled", !cur);
                        showToast(!cur ? "Track change toasts enabled" : "Track change toasts disabled");
                        refreshStatus();
                      }}
                      active={status?.settings?.toast_enabled ?? true}
                      style={{ justifyContent: "space-between", marginBottom: 8 }}
                    >
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>Track Change Notifications</div>
                        <div style={{ fontSize: 11, opacity: 0.6 }}>Shows a brief Steam toast whenever the song changes</div>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: (status?.settings?.toast_enabled ?? true) ? "#1db954" : "#888" }}>
                        {(status?.settings?.toast_enabled ?? true) ? "ON" : "OFF"}
                      </span>
                    </InteractiveRow>

                    {/* Gamepad Quick Chords */}
                    <InteractiveRow
                      onClick={async () => {
                        const cur = status?.settings?.gamepad_chords_enabled ?? true;
                        await backendSetSetting("gamepad_chords_enabled", !cur);
                        showToast(!cur ? "Gamepad chords enabled" : "Gamepad chords disabled");
                        refreshStatus();
                      }}
                      active={status?.settings?.gamepad_chords_enabled ?? true}
                      style={{ justifyContent: "space-between" }}
                    >
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>Gamepad Quick Chords</div>
                        <div style={{ fontSize: 11, opacity: 0.6 }}>Hold STEAM or (...) + D-Pad: Left/Right (Skip), Up/Down (Volume), A (Play/Pause)</div>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: (status?.settings?.gamepad_chords_enabled ?? true) ? "#1db954" : "#888" }}>
                        {(status?.settings?.gamepad_chords_enabled ?? true) ? "ON" : "OFF"}
                      </span>
                    </InteractiveRow>
                  </div>

                  {/* Steam Menu Position */}
                  <div style={{ marginBottom: 20, padding: 14, borderRadius: 10, background: "rgba(255,255,255,0.04)" }}>
                    <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1db954", marginBottom: 6 }}>
                      Steam Main Menu Position
                    </h3>
                    <p style={{ fontSize: 12, opacity: 0.6, marginBottom: 10 }}>
                      Customize where Deckify appears in the Steam Side Menu (1 = top, 9 = bottom).
                    </p>
                    <Focusable flow-children="horizontal" style={{ display: "flex", gap: 6 }}>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((pos) => (
                        <InteractiveRow
                          key={pos}
                          onClick={() => {
                            setSteamMenuPos(pos);
                            try {
                              localStorage.setItem("DECKIFY_MENU_POSITION", String(pos));
                            } catch {}
                            showToast(`Menu position set to #${pos}`);
                          }}
                          active={steamMenuPos === pos}
                          style={{ flex: 1, justifyContent: "center", fontSize: 12, fontWeight: 700 }}
                        >
                          {pos}
                        </InteractiveRow>
                      ))}
                    </Focusable>
                  </div>
                </div>
              )}
            </Focusable>
          </Focusable>

          {/* Track Context Action Modal (Triggered by Options (Y)) */}
          {actionTrack && !showAddToPlaylistModal && (
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 38,
                background: "rgba(0,0,0,0.75)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 90,
              }}
              onKeyDown={(e) => {
                if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
                  e.stopPropagation();
                }
              }}
            >
              <Focusable
                flow-children="column"
                autoFocus
                navEntryPreferPosition={NavEntryPositionPreferences.FIRST}
                style={{
                  width: 380,
                  background: "#1e1e1e",
                  borderRadius: 14,
                  padding: "20px 24px",
                  border: "1px solid rgba(255,255,255,0.12)",
                  boxShadow: "0 20px 50px rgba(0,0,0,0.8)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                  {(actionTrack.artwork_url || actionTrack.image_url) && (
                    <DeckifyImage src={(actionTrack.artwork_url || actionTrack.image_url) || undefined} width={44} height={44} style={{ borderRadius: 6 }} />
                  )}
                  <div style={{ overflow: "hidden", flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {actionTrack.name}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.6 }}>{actionTrack.artist}</div>
                  </div>
                </div>

                <InteractiveRow onClick={() => handlePlayTrack(actionTrack.uri || "")} style={{ gap: 10 }}>
                  <FaPlay size={12} color="#1db954" />
                  <span>Play Track</span>
                </InteractiveRow>

                <InteractiveRow onClick={() => handleAddToQueue(actionTrack)} style={{ gap: 10 }}>
                  <FaListUl size={12} />
                  <span>Add to Queue</span>
                </InteractiveRow>

                <InteractiveRow onClick={() => setShowAddToPlaylistModal(true)} style={{ gap: 10 }}>
                  <FaFolder size={12} />
                  <span>Add to Playlist...</span>
                </InteractiveRow>

                <InteractiveRow onClick={() => handleStartRadio(actionTrack)} style={{ gap: 10 }}>
                  <FaBroadcastTower size={12} color="#1db954" />
                  <span>Start Track Radio</span>
                </InteractiveRow>

                {/* Go to Artist */}
                {(actionTrack.artist_id || actionTrack.artist) && (
                  <InteractiveRow
                    onClick={() => {
                      setActionTrack(null);
                      setMode("artists");
                      handleOpenArtist({ id: actionTrack.artist_id || "", name: actionTrack.artist || "" });
                    }}
                    style={{ gap: 10 }}
                  >
                    <FaUser size={12} />
                    <span>Go to Artist ({actionTrack.artist})</span>
                  </InteractiveRow>
                )}

                {/* Go to Album */}
                {actionTrack.album_id && (
                  <InteractiveRow
                    onClick={() => {
                      setActionTrack(null);
                      setMode("albums");
                      handleOpenAlbum({
                        id: actionTrack.album_id || "",
                        name: actionTrack.album || "",
                        artist: actionTrack.artist || "",
                        uri: `spotify:album:${actionTrack.album_id}`,
                      });
                    }}
                    style={{ gap: 10 }}
                  >
                    <FaCompactDisc size={12} />
                    <span>Go to Album</span>
                  </InteractiveRow>
                )}

                {/* Remove from this Playlist (if inside active playlist) */}
                {activePlaylist && (
                  <InteractiveRow onClick={handleRemoveTrackFromActivePlaylist} style={{ gap: 10, color: "#ff5555" }}>
                    <FaTrash size={12} color="#ff5555" />
                    <span>Remove from &apos;{activePlaylist.name}&apos;</span>
                  </InteractiveRow>
                )}

                <InteractiveRow onClick={() => handleToggleLike(actionTrack.id)} style={{ gap: 10 }}>
                  <FaHeart size={12} color="#1db954" />
                  <span>Toggle Favorite (Like)</span>
                </InteractiveRow>

                <InteractiveRow onClick={() => setActionTrack(null)} style={{ justifyContent: "center", marginTop: 4 }}>
                  <span>Close (B)</span>
                </InteractiveRow>
              </Focusable>
            </div>
          )}

          {/* Add to Playlist Picker Modal */}
          {actionTrack && showAddToPlaylistModal && (
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 38,
                background: "rgba(0,0,0,0.85)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 95,
              }}
            >
              <Focusable
                flow-children="column"
                navEntryPreferPosition={NavEntryPositionPreferences.FIRST}
                style={{
                  width: 420,
                  maxHeight: "70vh",
                  background: "#1e1e1e",
                  borderRadius: 14,
                  padding: "20px 24px",
                  border: "1px solid rgba(255,255,255,0.12)",
                  boxShadow: "0 20px 50px rgba(0,0,0,0.8)",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <h3 style={{ fontSize: 16, fontWeight: 800, margin: "0 0 4px 0" }}>Choose Playlist</h3>
                <p style={{ fontSize: 12, opacity: 0.6, margin: "0 0 14px 0" }}>Add &apos;{actionTrack.name}&apos; to:</p>

                <Focusable flow-children="column" style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 3, marginBottom: 12 }}>
                  {allUserPlaylists.map((pl) => (
                    <InteractiveRow
                      key={pl.id}
                      onClick={() => handleAddTrackToPlaylist(pl.id, pl.name)}
                      style={{ gap: 10 }}
                    >
                      <FaFolder size={12} color="#1db954" />
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{pl.name}</span>
                    </InteractiveRow>
                  ))}
                </Focusable>

                <InteractiveRow onClick={() => setShowAddToPlaylistModal(false)} style={{ justifyContent: "center" }}>
                  <span>Back</span>
                </InteractiveRow>
              </Focusable>
            </div>
          )}

          {/* Toast Notification */}
          {toastMsg && (
            <div
              style={{
                position: "absolute",
                bottom: 48,
                left: "50%",
                transform: "translateX(-50%)",
                background: "#1db954",
                color: "#000",
                fontWeight: 800,
                fontSize: 13,
                padding: "6px 16px",
                borderRadius: 20,
                boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
                zIndex: 100,
              }}
            >
              {toastMsg}
            </div>
          )}

          {/* Bottom Gamepad HUD Legenda */}
          <div
            style={{
              height: 38,
              flexShrink: 0,
              background: "#0c0c0c",
              borderTop: "1px solid rgba(255,255,255,0.08)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 16,
              fontSize: 11,
              color: "#aaa",
              fontWeight: 600,
            }}
          >
            <span><b style={{ color: "#fff", background: "rgba(255,255,255,0.15)", padding: "1px 6px", borderRadius: 4 }}>L1 / R1</b> Cycle Views</span>
            <span><b style={{ color: "#fff", background: "rgba(255,255,255,0.15)", padding: "1px 6px", borderRadius: 4 }}>D-Pad</b> Navigate</span>
            <span><b style={{ color: "#1db954", background: "rgba(29, 185, 84, 0.2)", padding: "1px 6px", borderRadius: 4 }}>A</b> Select / Play</span>
            <span><b style={{ color: "#ff5555", background: "rgba(255, 85, 85, 0.2)", padding: "1px 6px", borderRadius: 4 }}>B</b> Back / Close</span>
            <span><b style={{ color: "#ffaa00", background: "rgba(255, 170, 0, 0.2)", padding: "1px 6px", borderRadius: 4 }}>Y</b> Options</span>
            <span><b style={{ color: "#55aaff", background: "rgba(85, 170, 255, 0.2)", padding: "1px 6px", borderRadius: 4 }}>X</b> Like</span>
            {status?.sleep_timer?.active && (
              <span style={{ color: "#1db954" }}>
                <FaClock size={10} style={{ marginRight: 4 }} />
                Timer: {Math.ceil((status.sleep_timer.remaining_seconds || 0) / 60)}m
              </span>
            )}
          </div>
        </div>
      </div>
    </ModalRootAny>
  );
};