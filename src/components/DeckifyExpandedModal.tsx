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
} from "react-icons/fa";

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

interface TrackItem {
  id?: string;
  uri?: string;
  name?: string;
  artist?: string;
  album?: string;
  image_url?: string;
  artwork_url?: string;
  duration_ms?: number;
  is_liked?: boolean;
}

interface PlaylistItem {
  id: string;
  name: string;
  uri: string;
  image_url?: string;
  track_count?: number;
  can_mix?: boolean;
  is_mixed?: boolean;
}

interface AlbumItem {
  id: string;
  name: string;
  artist: string;
  image_url?: string;
  track_count?: number;
  uri: string;
}

interface ArtistItem {
  id: string;
  name: string;
  image_url?: string;
}

interface EpisodeItem {
  id: string;
  name: string;
  show_name: string;
  uri: string;
  duration_ms: number;
  image_url?: string;
}

interface FolderItem {
  id: string;
  name: string;
  uri?: string;
  source?: string;
  playlist_ids: string[];
  playlists: PlaylistItem[];
  subfolders?: FolderItem[];
}

interface SpotifyDevice {
  id: string;
  name: string;
  type: string;
  is_active: boolean;
  volume_percent: number;
}

interface SyncedLine {
  timeMs: number;
  text: string;
}

// Backend RPC callables
const backendGetStatus = callable<[], any>("get_status");
const backendControlPlayback = callable<[string, string], { ok: boolean; error?: string }>("control_playback");
const backendSetVolume = callable<[number], { ok: boolean; error?: string }>("set_volume");
const backendSeekPlayback = callable<[number, string], { ok: boolean; position_ms?: number; error?: string }>("seek_playback");
const backendSetShuffle = callable<[boolean, string], { ok: boolean; shuffle_state?: boolean; error?: string }>("set_shuffle");
const backendSetRepeat = callable<[string, string], { ok: boolean; repeat_state?: string; error?: string }>("set_repeat");
const backendToggleLike = callable<[string, boolean | null], { ok: boolean; is_liked?: boolean; error?: string }>("toggle_like_track");
const backendGetQueue = callable<[], { ok: boolean; currently_playing?: TrackItem | null; queue?: TrackItem[]; error?: string }>("get_queue");
const backendAddToQueue = callable<[string, string], { ok: boolean; error?: string }>("add_to_queue");
const backendAddTrackToPlaylist = callable<[string, string], { ok: boolean; error?: string }>("add_track_to_playlist");
const backendGetPlaylists = callable<[number], { ok: boolean; playlists?: PlaylistItem[]; total?: number; error?: string }>("get_playlists");
const backendGetPlaylistFolders = callable<[], { ok: boolean; folders?: FolderItem[]; error?: string }>("get_playlist_folders");
const backendGetPlaylistTracks = callable<[string, number, boolean], { ok: boolean; tracks?: TrackItem[]; total?: number; is_mixed?: boolean; can_mix?: boolean; error?: string }>("get_playlist_tracks");
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
const backendSearchSpotify = callable<[string, string, number], { ok: boolean; tracks?: TrackItem[]; artists?: ArtistItem[]; albums?: AlbumItem[]; playlists?: PlaylistItem[]; error?: string }>("search_spotify");
const backendGetTrackRecommendations = callable<[string, number], { ok: boolean; tracks?: TrackItem[]; error?: string }>("get_track_recommendations");
const backendGetLyrics = callable<[string, string, number], { ok: boolean; synced_lyrics?: string; plain_lyrics?: string; error?: string }>("get_lyrics");
const backendGetDevices = callable<[], { ok: boolean; devices?: SpotifyDevice[]; error?: string }>("get_devices");
const backendTransferPlayback = callable<[string], { ok: boolean; error?: string }>("transfer_playback");
const backendSetSetting = callable<[string, unknown], { ok: boolean; settings?: any; error?: string }>("set_setting");
const backendShutdownSystem = callable<[], { ok: boolean; error?: string }>("shutdown_system");

function formatMs(ms: number): string {
  if (!ms || ms <= 0) return "0:00";
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

function parseLrc(lrcText: string): SyncedLine[] {
  const lines = lrcText.split("\n");
  const result: SyncedLine[] = [];
  const regex = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/;
  for (const line of lines) {
    const match = regex.exec(line.trim());
    if (match) {
      const min = parseInt(match[1], 10);
      const sec = parseInt(match[2], 10);
      const ms = parseInt(match[3].padEnd(3, "0").substring(0, 3), 10);
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
  active,
  style,
}: {
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
  style?: any;
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
  const [status, setStatus] = useState<any>(null);

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
  const [queueTracks, setQueueTracks] = useState<TrackItem[]>([]);
  const [devices, setDevices] = useState<SpotifyDevice[]>([]);
  const [allUserPlaylists, setAllUserPlaylists] = useState<PlaylistItem[]>([]);

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{
    tracks?: TrackItem[];
    artists?: ArtistItem[];
    albums?: AlbumItem[];
    playlists?: PlaylistItem[];
  }>({});

  // Lyrics
  const [syncedLyrics, setSyncedLyrics] = useState<SyncedLine[]>([]);
  const [plainLyrics, setPlainLyrics] = useState<string | null>(null);
  const [loadingLyrics, setLoadingLyrics] = useState(false);
  const [currentLineIndex, setCurrentLineIndex] = useState(-1);

  // Sleep Timer
  const [sleepTimerRemaining, setSleepTimerRemaining] = useState<number | null>(null);
  const [sleepTimerShutdownDeck, setSleepTimerShutdownDeck] = useState(false);

  // Settings
  const [autoDuckingEnabled, setAutoDuckingEnabled] = useState(false);
  const [autoDuckingPercent, setAutoDuckingPercent] = useState(50);
  const [toastNotificationEnabled, setToastNotificationEnabled] = useState(true);
  const [toastPosition, setToastPosition] = useState<"top_left" | "top_right" | "bottom_left" | "bottom_right">("bottom_right");
  const [eqPreset, setEqPreset] = useState("flat");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

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

  // Load Liked Tracks (all up to 1000)
  const loadLikedTracks = useCallback(async () => {
    setLoadingContent(true);
    try {
      const res = await backendGetLikedTracks(0, true);
      if (res.ok && res.tracks) setLikedTracks(res.tracks);
    } catch {}
    setLoadingContent(false);
  }, []);

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

  // Load Episodes
  const loadEpisodes = useCallback(async () => {
    setLoadingContent(true);
    try {
      const res = await backendGetSavedEpisodes(0);
      if (res.ok && res.episodes) setSavedEpisodes(res.episodes);
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

  // Load Devices
  const loadDevices = useCallback(async () => {
    try {
      const res = await backendGetDevices();
      if (res.ok && res.devices) setDevices(res.devices);
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
  }, [mode, loadLikedTracks, loadAlbums, loadArtists, loadRecent, loadEpisodes, loadQueue, loadDevices]);

  // Load Lyrics
  const track = status?.track_meta;
  const trackName = track?.name;
  const artistName = track?.artist;
  const durationSec = Math.round((track?.duration_ms || 0) / 1000);

  useEffect(() => {
    if (mode !== "lyrics" || !trackName || !artistName) return;
    setLoadingLyrics(true);
    backendGetLyrics(trackName, artistName, durationSec).then((res) => {
      if (res.ok) {
        if (res.synced_lyrics) {
          setSyncedLyrics(parseLrc(res.synced_lyrics));
          setPlainLyrics(null);
        } else if (res.plain_lyrics) {
          setPlainLyrics(res.plain_lyrics);
          setSyncedLyrics([]);
        } else {
          setSyncedLyrics([]);
          setPlainLyrics("Geen songtekst gevonden.");
        }
      } else {
        setSyncedLyrics([]);
        setPlainLyrics("Songtekst kon niet worden geladen.");
      }
      setLoadingLyrics(false);
    });
  }, [mode, trackName, artistName, durationSec]);

  // Track active synced lyrics line
  const positionMs = status?.position_ms || 0;
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

  // Sleep Timer Interval
  useEffect(() => {
    if (sleepTimerRemaining === null || sleepTimerRemaining <= 0) return;
    const timer = setInterval(() => {
      setSleepTimerRemaining((prev) => {
        if (prev === null || prev <= 1) {
          // Timer finished! Pause playback
          backendControlPlayback("pause", "");
          showToast("Slaaptimer verstreken: Muziek gepauzeerd.");
          if (sleepTimerShutdownDeck) {
            backendShutdownSystem();
          }
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [sleepTimerRemaining, sleepTimerShutdownDeck, showToast]);

  // Drill-in handlers
  const handleOpenPlaylist = useCallback(async (pl: PlaylistItem) => {
    setActivePlaylist(pl);
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
    setLoadingContent(true);
    try {
      const res = await backendGetAlbumTracks(alb.id, 0);
      if (res.ok && res.tracks) setAlbumTracks(res.tracks);
    } catch {}
    setLoadingContent(false);
  }, []);

  const handleOpenArtist = useCallback(async (art: ArtistItem) => {
    setActiveArtist(art);
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

  // Search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults({});
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await backendSearchSpotify(searchQuery, "track,artist,album,playlist", 25);
        if (res.ok) setSearchResults(res);
      } catch {}
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Native Mix toggle
  const handleToggleMix = useCallback(async () => {
    if (!activePlaylist || mixingBusy) return;
    setMixingBusy(true);
    const targetMix = !activePlaylist.is_mixed;
    try {
      const res = await backendSetNativeMix(activePlaylist.uri, targetMix, true);
      if (res.ok) {
        setActivePlaylist((prev) => (prev ? { ...prev, is_mixed: targetMix } : null));
        showToast(targetMix ? "Native Mix geactiveerd!" : "Native Mix uitgeschakeld.");
      } else {
        showToast(`Mix fout: ${res.error || "Mislukt"}`);
      }
    } catch {
      showToast("Fout bij toepassen van mix.");
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
  const handlePlayPause = useCallback(async () => {
    await backendControlPlayback("play_pause", "");
    refreshStatus();
  }, [refreshStatus]);

  const handleNext = useCallback(async () => {
    await backendControlPlayback("next", "");
    refreshStatus();
  }, [refreshStatus]);

  const handlePrev = useCallback(async () => {
    await backendControlPlayback("previous", "");
    refreshStatus();
  }, [refreshStatus]);

  const handleToggleLike = useCallback(async (trackId?: string) => {
    const tid = trackId || status?.track_meta?.track_id;
    if (!tid) return;
    const res = await backendToggleLike(tid, null);
    if (res.ok) {
      showToast(res.is_liked ? "Toegevoegd aan Favorieten" : "Verwijderd uit Favorieten");
      refreshStatus();
    }
  }, [status, showToast, refreshStatus]);

  const handleToggleRepeat = useCallback(async () => {
    const current = status?.repeat_state || "off";
    const next = current === "off" ? "context" : current === "context" ? "track" : "off";
    await backendSetRepeat(next, "");
    showToast(next === "track" ? "Herhalen: 1 nummer" : next === "context" ? "Herhalen: Aan" : "Herhalen: Uit");
    refreshStatus();
  }, [status, showToast, refreshStatus]);

  const handlePlayTrack = useCallback(async (uri: string, contextUri?: string) => {
    await backendPlayTracks(contextUri || null, uri, null, 0);
    showToast("Afspelen gestart");
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
    if (!t.id) return;
    showToast(`Radio starten voor ${t.name}...`);
    try {
      const res = await backendGetTrackRecommendations(t.id, 25);
      if (res.ok && res.tracks && res.tracks.length > 0) {
        const uris = res.tracks.map((x) => x.uri).filter(Boolean) as string[];
        if (uris.length) {
          await backendPlayTracks(null, uris[0], uris, 0);
          showToast(`Radio gestart (${uris.length} nummers)`);
          refreshStatus();
        }
      } else {
        showToast("Geen aanbevelingen gevonden.");
      }
    } catch {
      showToast("Fout bij ophalen van aanbevelingen.");
    }
    setActionTrack(null);
  }, [showToast, refreshStatus]);

  // Add to Queue
  const handleAddToQueue = useCallback(async (t: TrackItem) => {
    if (!t.uri) return;
    const res = await backendAddToQueue(t.uri, "");
    if (res.ok) {
      showToast(`Toegevoegd aan wachtrij: ${t.name}`);
    } else {
      showToast(`Wachtrij fout: ${res.error || "Mislukt"}`);
    }
    setActionTrack(null);
  }, [showToast]);

  // Add to Playlist
  const handleAddTrackToPlaylist = useCallback(async (playlistId: string, playlistName: string) => {
    if (!actionTrack?.uri) return;
    const res = await backendAddTrackToPlaylist(playlistId, actionTrack.uri);
    if (res.ok) {
      showToast(`Toegevoegd aan ${playlistName}`);
    } else {
      showToast(`Fout bij toevoegen: ${res.error || "Mislukt"}`);
    }
    setShowAddToPlaylistModal(false);
    setActionTrack(null);
  }, [actionTrack, showToast]);

  // Create Folder
  const handleCreateFolder = useCallback(async () => {
    if (!newFolderName.trim()) return;
    const res = await backendManagePlaylistFolder("create", "", newFolderName.trim(), "");
    if (res.ok) {
      showToast(`Map '${newFolderName}' aangemaakt`);
      setNewFolderName("");
      setCreatingFolder(false);
      loadFolders();
    } else {
      showToast(`Fout: ${res.error || "Mislukt"}`);
    }
  }, [newFolderName, showToast, loadFolders]);

  const handleDeleteFolder = useCallback(async (folderId: string, folderName: string) => {
    const res = await backendManagePlaylistFolder("delete", folderId, "", "");
    if (res.ok) {
      showToast(`Map '${folderName}' verwijderd`);
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
    setMode(id);
  }, []);

  // Breadcrumb B navigation handler
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
      // If at root, let Steam close the modal
    }, true);
  }, []);

  const isPlaying = status?.is_playing;
  const audioBackend = status?.audio_backend || status?.settings?.audio_backend || "librespot";
  const audioQuality = status?.settings?.audio_quality || "320";
  const isLossless = audioQuality === "lossless";
  const artwork = track?.artwork_url || track?.image_url;

  // Folder renderer
  const renderFolder = (folder: FolderItem, depth = 0) => {
    const isOpen = expandedFolderIds.has(folder.id);
    const isCustom = folder.id.startsWith("folder-");
    return (
      <div key={folder.id} style={{ marginLeft: depth * 12, marginBottom: 4 }}>
        <InteractiveRow
          onClick={() => toggleFolder(folder.id)}
          style={{ marginBottom: 2 }}
        >
          {isOpen ? <FaFolderOpen color="#1db954" size={14} /> : <FaFolder color="#aaa" size={14} />}
          <span style={{ fontSize: 13, fontWeight: 600, marginLeft: 8 }}>{folder.name}</span>
          <span style={{ fontSize: 11, opacity: 0.5, marginLeft: "auto" }}>
            {folder.playlists.length}
          </span>
          {isCustom && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteFolder(folder.id, folder.name);
              }}
              style={{ padding: "4px 8px", opacity: 0.5, fontSize: 11, cursor: "pointer" }}
            >
              <FaTrash size={10} color="#ff5555" />
            </span>
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
                  <img src={pl.image_url} width={24} height={24} style={{ borderRadius: 4, marginRight: 8 }} />
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

  // Track row component with quick Action Menu trigger
  const renderTrackItem = (t: TrackItem, idx: number, contextUri?: string) => {
    const img = t.artwork_url || t.image_url;
    return (
      <InteractiveRow
        key={t.id || t.uri || idx}
        onClick={() => handlePlayTrack(t.uri || "", contextUri)}
        style={{ gap: 12 }}
      >
        <span style={{ width: 22, fontSize: 12, opacity: 0.5, textAlign: "right" }}>{idx + 1}</span>
        {img ? (
          <img src={img} width={32} height={32} style={{ borderRadius: 4 }} />
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
          Opties (Y)
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
            flow-children="row"
            style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden", position: "relative", zIndex: 1 }}
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
              </div>

              {/* Navigation Menu */}
              <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.4, padding: "4px 8px", textTransform: "uppercase", letterSpacing: 0.8 }}>Afspelen</div>
                <SidebarBtn id="now_playing" label="Nu Spelend" icon={<FaPlay size={12} />} active={mode === "now_playing"} onSelect={handleSelectMode} />
                <SidebarBtn id="lyrics" label="Songteksten" icon={<FaMicrophone size={12} />} active={mode === "lyrics"} onSelect={handleSelectMode} />

                <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.4, padding: "8px 8px 4px", textTransform: "uppercase", letterSpacing: 0.8 }}>Bibliotheek</div>
                <SidebarBtn id="playlists" label="Afspeellijsten" icon={<FaFolder size={12} />} active={mode === "playlists"} onSelect={handleSelectMode} />
                <SidebarBtn id="liked" label="Favorieten" icon={<FaHeart size={12} />} active={mode === "liked"} onSelect={handleSelectMode} />
                <SidebarBtn id="albums" label="Albums" icon={<FaCompactDisc size={12} />} active={mode === "albums"} onSelect={handleSelectMode} />
                <SidebarBtn id="artists" label="Artiesten" icon={<FaUser size={12} />} active={mode === "artists"} onSelect={handleSelectMode} />
                <SidebarBtn id="recent" label="Recent Gespeeld" icon={<FaHistory size={12} />} active={mode === "recent"} onSelect={handleSelectMode} />
                <SidebarBtn id="episodes" label="Podcasts" icon={<FaPodcast size={12} />} active={mode === "episodes"} onSelect={handleSelectMode} />

                <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.4, padding: "8px 8px 4px", textTransform: "uppercase", letterSpacing: 0.8 }}>Controle</div>
                <SidebarBtn id="search" label="Zoeken" icon={<FaSearch size={12} />} active={mode === "search"} onSelect={handleSelectMode} />
                <SidebarBtn id="queue" label="Wachtrij" icon={<FaListUl size={12} />} active={mode === "queue"} onSelect={handleSelectMode} />
                <SidebarBtn id="devices" label="Apparaten" icon={<FaTv size={12} />} active={mode === "devices"} onSelect={handleSelectMode} />
                <SidebarBtn id="engine" label="Instellingen" icon={<FaCog size={12} />} active={mode === "engine"} onSelect={handleSelectMode} />
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
                    <img src={artwork} width={34} height={34} style={{ borderRadius: 4 }} />
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

              {/* Close Hint */}
              <div
                style={{
                  marginTop: 6,
                  padding: "6px 10px",
                  borderRadius: 6,
                  background: "rgba(255,255,255,0.03)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  fontSize: 11,
                  color: "#777",
                }}
              >
                <FaTimes size={10} />
                <span>Druk op (B) om te sluiten</span>
              </div>
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
                  {/* Album Art Fix */}
                  <div style={{ position: "relative", marginBottom: 18 }}>
                    {artwork ? (
                      <img
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
                    {track?.name || "Geen nummer actief"}
                  </h1>
                  <p style={{ fontSize: 15, opacity: 0.7, margin: "0 0 16px 0" }}>
                    {track?.artist || "Kies een afspeellijst of album"}
                  </p>

                  {/* Progress Bar & Seek Scrubbing */}
                  {track?.duration_ms && track.duration_ms > 0 && (
                    <div style={{ width: "100%", marginBottom: 16 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, opacity: 0.6, marginBottom: 4 }}>
                        <span>{formatMs(status?.position_ms || 0)}</span>
                        <span>{formatMs(track.duration_ms)}</span>
                      </div>
                      <div style={{ width: "100%", height: 6, background: "rgba(255,255,255,0.15)", borderRadius: 3, overflow: "hidden" }}>
                        <div
                          style={{
                            width: `${Math.min(100, ((status?.position_ms || 0) / track.duration_ms) * 100)}%`,
                            height: "100%",
                            background: "#1db954",
                          }}
                        />
                      </div>

                      {/* Scrub controls */}
                      <Focusable flow-children="row" style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 8 }}>
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
                    flow-children="row"
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

                  {/* Volume Slider Bar */}
                  <div style={{ marginTop: 20, width: "100%", maxWidth: 360, display: "flex", alignItems: "center", gap: 10 }}>
                    <RoundBtn onClick={() => handleVolumeDelta(-10)} size={32}>
                      <FaVolumeMute size={12} />
                    </RoundBtn>
                    <div style={{ flex: 1, height: 6, background: "rgba(255,255,255,0.15)", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ width: `${status?.volume || 50}%`, height: "100%", background: "#1db954" }} />
                    </div>
                    <RoundBtn onClick={() => handleVolumeDelta(10)} size={32}>
                      <FaVolumeUp size={12} />
                    </RoundBtn>
                  </div>
                </div>
              )}

              {/* VIEW: LIVE LYRICS */}
              {mode === "lyrics" && (
                <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                    <FaMicrophone size={18} color="#1db954" />
                    <div>
                      <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Songteksten</h2>
                      <span style={{ fontSize: 12, opacity: 0.6 }}>{trackName} — {artistName}</span>
                    </div>
                  </div>

                  {loadingLyrics ? (
                    <p style={{ opacity: 0.5 }}>Songteksten laden...</p>
                  ) : syncedLyrics.length > 0 ? (
                    <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12, padding: "20px 0" }}>
                      {syncedLyrics.map((line, idx) => {
                        const isCurrent = idx === currentLineIndex;
                        return (
                          <div
                            key={idx}
                            style={{
                              fontSize: isCurrent ? 22 : 16,
                              fontWeight: isCurrent ? 800 : 500,
                              color: isCurrent ? "#1db954" : "rgba(255,255,255,0.45)",
                              transform: isCurrent ? "scale(1.02)" : "scale(1)",
                              transition: "all 0.2s ease",
                              cursor: "pointer",
                            }}
                            onClick={() => backendSeekPlayback(line.timeMs, "")}
                          >
                            {line.text}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ whiteSpace: "pre-line", opacity: 0.7, fontSize: 15, lineHeight: 1.8 }}>
                      {plainLyrics || "Geen songtekst beschikbaar."}
                    </div>
                  )}
                </div>
              )}

              {/* VIEW: PLAYLISTS & FOLDERS */}
              {mode === "playlists" && !activePlaylist && (
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                    <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Mappen & Afspeellijsten</h2>
                    <InteractiveRow
                      onClick={() => setCreatingFolder(!creatingFolder)}
                      style={{ padding: "6px 12px", background: "#1db954", color: "#000", fontWeight: 700, fontSize: 12 }}
                    >
                      <FaPlus size={10} /> Nieuwe Map
                    </InteractiveRow>
                  </div>

                  {creatingFolder && (
                    <div style={{ marginBottom: 16, padding: 12, borderRadius: 8, background: "rgba(255,255,255,0.06)", display: "flex", gap: 10, alignItems: "center" }}>
                      <TextField
                        label="Mapnaam"
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                      />
                      <InteractiveRow onClick={handleCreateFolder} style={{ background: "#1db954", color: "#000", fontWeight: 700, padding: "8px 14px" }}>
                        Opslaan
                      </InteractiveRow>
                      <InteractiveRow onClick={() => setCreatingFolder(false)} style={{ padding: "8px 12px" }}>
                        Annuleren
                      </InteractiveRow>
                    </div>
                  )}

                  <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {folders.map((f) => renderFolder(f, 0))}
                  </Focusable>
                </div>
              )}

              {/* VIEW: INSIDE A PLAYLIST */}
              {mode === "playlists" && activePlaylist && (
                <div>
                  <Focusable
                    flow-children="row"
                    style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}
                  >
                    <InteractiveRow
                      onClick={() => setActivePlaylist(null)}
                      style={{ padding: "6px 12px", fontSize: 12 }}
                    >
                      ← Terug (B)
                    </InteractiveRow>
                    <div>
                      <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>{activePlaylist.name}</h2>
                      <span style={{ fontSize: 12, opacity: 0.6 }}>{playlistTracks.length} nummers (Volledig geladen)</span>
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
                      <FaPlay size={11} /> Afspelen
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
                        <FaMagic size={11} /> {mixingBusy ? "Bezig..." : activePlaylist.is_mixed ? "Mix Actief" : "Zet Mix Aan"}
                      </InteractiveRow>
                    )}
                  </Focusable>

                  {loadingContent ? (
                    <p style={{ opacity: 0.5 }}>Laden...</p>
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
                      <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Favoriete Nummers</h2>
                      <span style={{ fontSize: 12, opacity: 0.6 }}>{likedTracks.length} nummers</span>
                    </div>
                    {likedTracks.length > 0 && (
                      <InteractiveRow
                        onClick={() => handlePlayTrack(likedTracks[0].uri || "")}
                        style={{ background: "#1db954", color: "#000", fontWeight: 700, padding: "8px 16px", borderRadius: 20, gap: 8 }}
                      >
                        <FaPlay size={11} /> Speel Alles
                      </InteractiveRow>
                    )}
                  </div>
                  {loadingContent ? (
                    <p style={{ opacity: 0.5 }}>Favorieten laden...</p>
                  ) : (
                    <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      {likedTracks.map((t, idx) => renderTrackItem(t, idx))}
                    </Focusable>
                  )}
                </div>
              )}

              {/* VIEW: ALBUMS */}
              {mode === "albums" && !activeAlbum && (
                <div>
                  <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>Opgeslagen Albums</h2>
                  {loadingContent ? (
                    <p style={{ opacity: 0.5 }}>Albums laden...</p>
                  ) : (
                    <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {savedAlbums.map((alb) => (
                        <InteractiveRow
                          key={alb.id}
                          onClick={() => handleOpenAlbum(alb)}
                          style={{ gap: 12 }}
                        >
                          {alb.image_url ? (
                            <img src={alb.image_url} width={38} height={38} style={{ borderRadius: 4 }} />
                          ) : (
                            <FaCompactDisc size={20} color="#888" />
                          )}
                          <div style={{ flex: 1, overflow: "hidden" }}>
                            <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {alb.name}
                            </div>
                            <div style={{ fontSize: 11, opacity: 0.6 }}>
                              {alb.artist} · {alb.track_count || 0} nummers
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
                  <Focusable flow-children="row" style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
                    <InteractiveRow onClick={() => setActiveAlbum(null)} style={{ padding: "6px 12px", fontSize: 12 }}>
                      ← Terug (B)
                    </InteractiveRow>
                    <div>
                      <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>{activeAlbum.name}</h2>
                      <span style={{ fontSize: 12, opacity: 0.6 }}>{activeAlbum.artist}</span>
                    </div>
                    <InteractiveRow
                      onClick={() => handlePlayTrack("", activeAlbum.uri)}
                      style={{ marginLeft: "auto", background: "#1db954", color: "#000", fontWeight: 700, padding: "8px 16px", borderRadius: 20, gap: 8 }}
                    >
                      <FaPlay size={11} /> Speel Album
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
                  <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>Gevolgde Artiesten</h2>
                  {loadingContent ? (
                    <p style={{ opacity: 0.5 }}>Artiesten laden...</p>
                  ) : (
                    <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {followedArtists.map((art) => (
                        <InteractiveRow
                          key={art.id}
                          onClick={() => handleOpenArtist(art)}
                          style={{ gap: 12 }}
                        >
                          {art.image_url ? (
                            <img src={art.image_url} width={38} height={38} style={{ borderRadius: "50%" }} />
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
                  <Focusable flow-children="row" style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
                    <InteractiveRow onClick={() => setActiveArtist(null)} style={{ padding: "6px 12px", fontSize: 12 }}>
                      ← Terug (B)
                    </InteractiveRow>
                    <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>{activeArtist.name}</h2>
                  </Focusable>

                  <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1db954", marginBottom: 10 }}>Populaire Nummers</h3>
                  <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 20 }}>
                    {artistTopTracks.map((t, idx) => renderTrackItem(t, idx))}
                  </Focusable>

                  <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1db954", marginBottom: 10 }}>Albums & Singles</h3>
                  <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {artistAlbums.map((alb) => (
                      <InteractiveRow key={alb.id} onClick={() => handleOpenAlbum(alb)} style={{ gap: 10 }}>
                        {alb.image_url && <img src={alb.image_url} width={30} height={30} style={{ borderRadius: 4 }} />}
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{alb.name}</span>
                      </InteractiveRow>
                    ))}
                  </Focusable>
                </div>
              )}

              {/* VIEW: RECENTLY PLAYED */}
              {mode === "recent" && (
                <div>
                  <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>Recent Afgespeeld</h2>
                  <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {recentlyPlayed.map((t, idx) => renderTrackItem(t, idx))}
                  </Focusable>
                </div>
              )}

              {/* VIEW: PODCASTS */}
              {mode === "episodes" && (
                <div>
                  <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>Podcasts & Afleveringen</h2>
                  <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {savedEpisodes.map((ep) => (
                      <InteractiveRow
                        key={ep.id}
                        onClick={() => handlePlayTrack(ep.uri)}
                        style={{ gap: 12 }}
                      >
                        {ep.image_url ? (
                          <img src={ep.image_url} width={38} height={38} style={{ borderRadius: 6 }} />
                        ) : (
                          <FaPodcast size={20} color="#888" />
                        )}
                        <div style={{ flex: 1, overflow: "hidden" }}>
                          <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {ep.name}
                          </div>
                          <div style={{ fontSize: 11, opacity: 0.6 }}>
                            {ep.show_name} · {formatMs(ep.duration_ms)}
                          </div>
                        </div>
                      </InteractiveRow>
                    ))}
                  </Focusable>
                </div>
              )}

              {/* VIEW: SEARCH */}
              {mode === "search" && (
                <div>
                  <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>Zoeken</h2>
                  <TextField
                    label="Zoeken naar nummers, artiesten of albums..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />

                  {/* Results: Tracks */}
                  {searchResults.tracks && searchResults.tracks.length > 0 && (
                    <div style={{ marginTop: 20 }}>
                      <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1db954", marginBottom: 8 }}>Nummers</h3>
                      <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        {searchResults.tracks.map((t, idx) => renderTrackItem(t, idx))}
                      </Focusable>
                    </div>
                  )}

                  {/* Results: Artists */}
                  {searchResults.artists && searchResults.artists.length > 0 && (
                    <div style={{ marginTop: 20 }}>
                      <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1db954", marginBottom: 8 }}>Artiesten</h3>
                      <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        {searchResults.artists.map((art) => (
                          <InteractiveRow key={art.id} onClick={() => handleOpenArtist(art)} style={{ gap: 10 }}>
                            {art.image_url && <img src={art.image_url} width={30} height={30} style={{ borderRadius: "50%" }} />}
                            <span style={{ fontSize: 13, fontWeight: 600 }}>{art.name}</span>
                          </InteractiveRow>
                        ))}
                      </Focusable>
                    </div>
                  )}

                  {/* Results: Albums */}
                  {searchResults.albums && searchResults.albums.length > 0 && (
                    <div style={{ marginTop: 20 }}>
                      <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1db954", marginBottom: 8 }}>Albums</h3>
                      <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        {searchResults.albums.map((alb) => (
                          <InteractiveRow key={alb.id} onClick={() => handleOpenAlbum(alb)} style={{ gap: 10 }}>
                            {alb.image_url && <img src={alb.image_url} width={30} height={30} style={{ borderRadius: 4 }} />}
                            <div style={{ flex: 1, overflow: "hidden" }}>
                              <div style={{ fontSize: 13, fontWeight: 600 }}>{alb.name}</div>
                              <div style={{ fontSize: 11, opacity: 0.6 }}>{alb.artist}</div>
                            </div>
                          </InteractiveRow>
                        ))}
                      </Focusable>
                    </div>
                  )}
                </div>
              )}

              {/* VIEW: QUEUE */}
              {mode === "queue" && (
                <div>
                  <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>Wachtrij</h2>
                  <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {queueTracks.map((t, idx) => (
                      <InteractiveRow
                        key={t.id || idx}
                        onClick={() => handlePlayTrack(t.uri || "")}
                        style={{ gap: 12 }}
                      >
                        <span style={{ width: 22, fontSize: 12, opacity: 0.5 }}>{idx + 1}</span>
                        {t.image_url && <img src={t.image_url} width={32} height={32} style={{ borderRadius: 4 }} />}
                        <div style={{ flex: 1, overflow: "hidden" }}>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{t.name}</div>
                          <div style={{ fontSize: 11, opacity: 0.6 }}>{t.artist}</div>
                        </div>
                      </InteractiveRow>
                    ))}
                  </Focusable>
                </div>
              )}

              {/* VIEW: DEVICES */}
              {mode === "devices" && (
                <div>
                  <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>Spotify Connect Apparaten</h2>
                  <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {devices.map((d) => (
                      <InteractiveRow
                        key={d.id}
                        onClick={async () => {
                          await backendTransferPlayback(d.id);
                          showToast(`Overgeschakeld naar ${d.name}`);
                          loadDevices();
                        }}
                        active={d.is_active}
                        style={{ justifyContent: "space-between", padding: "12px 16px" }}
                      >
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: d.is_active ? "#1db954" : "#fff" }}>{d.name}</div>
                          <div style={{ fontSize: 11, opacity: 0.5 }}>{d.type} {d.is_active ? "· Actief" : ""}</div>
                        </div>
                        {d.is_active && <span style={{ fontSize: 12, color: "#1db954", fontWeight: 700 }}>Actief</span>}
                      </InteractiveRow>
                    ))}
                  </Focusable>
                </div>
              )}

              {/* VIEW: SETTINGS & KILLER FEATURES CONFIG */}
              {mode === "engine" && (
                <div style={{ maxWidth: 640 }}>
                  <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>Instellingen & Extra Features</h2>

                  {/* Slaaptimer */}
                  <div style={{ marginBottom: 20, padding: 14, borderRadius: 10, background: "rgba(255,255,255,0.04)" }}>
                    <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1db954", marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
                      <FaClock /> Slaaptimer & Afsluiten
                    </h3>
                    <p style={{ fontSize: 12, opacity: 0.6, marginBottom: 10 }}>
                      Laat muziek vanzelf stoppen na een ingestelde tijd, ideaal voor het slapen gaan.
                    </p>
                    <Focusable flow-children="row" style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                      {[15, 30, 45, 60].map((mins) => (
                        <InteractiveRow
                          key={mins}
                          onClick={() => {
                            setSleepTimerRemaining(mins * 60);
                            showToast(`Slaaptimer ingesteld op ${mins} minuten`);
                          }}
                          active={sleepTimerRemaining !== null && Math.ceil(sleepTimerRemaining / 60) === mins}
                          style={{ flex: 1, justifyContent: "center", fontSize: 12, fontWeight: 700 }}
                        >
                          {mins}m
                        </InteractiveRow>
                      ))}
                      <InteractiveRow
                        onClick={() => {
                          setSleepTimerRemaining(null);
                          showToast("Slaaptimer uitgeschakeld");
                        }}
                        style={{ padding: "8px 12px", fontSize: 12 }}
                      >
                        Uit
                      </InteractiveRow>
                    </Focusable>

                    {/* Shutdown deck toggle */}
                    <InteractiveRow
                      onClick={() => setSleepTimerShutdownDeck(!sleepTimerShutdownDeck)}
                      active={sleepTimerShutdownDeck}
                      style={{ justifyContent: "space-between", marginTop: 8 }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <FaPowerOff color={sleepTimerShutdownDeck ? "#1db954" : "#888"} />
                        <span style={{ fontSize: 13, fontWeight: 600 }}>Sluit Steam Deck af wanneer timer afloopt</span>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: sleepTimerShutdownDeck ? "#1db954" : "#888" }}>
                        {sleepTimerShutdownDeck ? "AAN" : "UIT"}
                      </span>
                    </InteractiveRow>
                  </div>

                  {/* Auto-Ducking (Game Audio Balance) */}
                  <div style={{ marginBottom: 20, padding: 14, borderRadius: 10, background: "rgba(255,255,255,0.04)" }}>
                    <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1db954", marginBottom: 6 }}>
                      🎮 Auto-Ducking (Game Audio Balans)
                    </h3>
                    <p style={{ fontSize: 12, opacity: 0.6, marginBottom: 10 }}>
                      Verlaagt automatisch het geluidsvolume van de actieve game wanneer Spotify muziek speelt.
                    </p>
                    <InteractiveRow
                      onClick={() => setAutoDuckingEnabled(!autoDuckingEnabled)}
                      active={autoDuckingEnabled}
                      style={{ justifyContent: "space-between", marginBottom: 10 }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 600 }}>Game Audio Ducking</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: autoDuckingEnabled ? "#1db954" : "#888" }}>
                        {autoDuckingEnabled ? "AAN" : "UIT"}
                      </span>
                    </InteractiveRow>
                    {autoDuckingEnabled && (
                      <Focusable flow-children="row" style={{ display: "flex", gap: 8 }}>
                        {[30, 50, 70].map((pct) => (
                          <InteractiveRow
                            key={pct}
                            onClick={() => setAutoDuckingPercent(pct)}
                            active={autoDuckingPercent === pct}
                            style={{ flex: 1, justifyContent: "center", fontSize: 12, fontWeight: 700 }}
                          >
                            Game -{pct}%
                          </InteractiveRow>
                        ))}
                      </Focusable>
                    )}
                  </div>

                  {/* In-Game Toast Notification Settings */}
                  <div style={{ marginBottom: 20, padding: 14, borderRadius: 10, background: "rgba(255,255,255,0.04)" }}>
                    <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1db954", marginBottom: 6 }}>
                      🔔 In-Game Notificatie Overlay
                    </h3>
                    <p style={{ fontSize: 12, opacity: 0.6, marginBottom: 10 }}>
                      Toon een subtiele pop-up met albumhoes en tracknaam bij wisseling van nummer.
                    </p>
                    <InteractiveRow
                      onClick={() => setToastNotificationEnabled(!toastNotificationEnabled)}
                      active={toastNotificationEnabled}
                      style={{ justifyContent: "space-between", marginBottom: 10 }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 600 }}>Toon melding bij ander nummer</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: toastNotificationEnabled ? "#1db954" : "#888" }}>
                        {toastNotificationEnabled ? "AAN" : "UIT"}
                      </span>
                    </InteractiveRow>
                    {toastNotificationEnabled && (
                      <Focusable flow-children="row" style={{ display: "flex", gap: 8 }}>
                        {[
                          { id: "bottom_right", label: "Rechtsonder" },
                          { id: "top_right", label: "Rechtsboven" },
                          { id: "bottom_left", label: "Linksonder" },
                          { id: "top_left", label: "Linksboven" },
                        ].map((pos) => (
                          <InteractiveRow
                            key={pos.id}
                            onClick={() => setToastPosition(pos.id as any)}
                            active={toastPosition === pos.id}
                            style={{ flex: 1, justifyContent: "center", fontSize: 11, fontWeight: 700 }}
                          >
                            {pos.label}
                          </InteractiveRow>
                        ))}
                      </Focusable>
                    )}
                  </div>

                  {/* Audio Equalizer Presets */}
                  <div style={{ marginBottom: 20, padding: 14, borderRadius: 10, background: "rgba(255,255,255,0.04)" }}>
                    <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1db954", marginBottom: 6 }}>
                      🎚️ Equalizer & Audio Presets
                    </h3>
                    <Focusable flow-children="row" style={{ display: "flex", gap: 8 }}>
                      {[
                        { id: "flat", label: "Standaard" },
                        { id: "bass", label: "Bass Boost" },
                        { id: "vocal", label: "Stemhelder" },
                        { id: "gaming", label: "Gaming Balans" },
                      ].map((eq) => (
                        <InteractiveRow
                          key={eq.id}
                          onClick={() => {
                            setEqPreset(eq.id);
                            showToast(`Audio preset: ${eq.label}`);
                          }}
                          active={eqPreset === eq.id}
                          style={{ flex: 1, justifyContent: "center", fontSize: 12, fontWeight: 700 }}
                        >
                          {eq.label}
                        </InteractiveRow>
                      ))}
                    </Focusable>
                  </div>

                  {/* Backend & Quality */}
                  <div style={{ marginBottom: 20, padding: 14, borderRadius: 10, background: "rgba(255,255,255,0.04)" }}>
                    <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1db954", marginBottom: 8 }}>Afspeel-backend</h3>
                    <Focusable flow-children="row" style={{ display: "flex", gap: 10, marginBottom: 14 }}>
                      <InteractiveRow
                        onClick={async () => {
                          await backendSetSetting("audio_backend", "librespot");
                          showToast("Overgeschakeld naar Librespot");
                          refreshStatus();
                        }}
                        active={audioBackend === "librespot"}
                        style={{ flex: 1, justifyContent: "center", padding: "10px", fontWeight: 700 }}
                      >
                        Librespot (Ingebouwd)
                      </InteractiveRow>

                      <InteractiveRow
                        onClick={async () => {
                          await backendSetSetting("audio_backend", "spotify_client");
                          showToast("Overgeschakeld naar Officiële Spotify Client");
                          refreshStatus();
                        }}
                        active={audioBackend === "spotify_client"}
                        style={{ flex: 1, justifyContent: "center", padding: "10px", fontWeight: 700 }}
                      >
                        Officiële Spotify Client
                      </InteractiveRow>
                    </Focusable>

                    <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1db954", marginBottom: 8 }}>Audiokwaliteit</h3>
                    <Focusable flow-children="row" style={{ display: "flex", gap: 8 }}>
                      {["96", "160", "320", "lossless"].map((q) => {
                        const active = audioQuality === q;
                        const disabled = q === "lossless" && audioBackend !== "spotify_client";
                        return (
                          <InteractiveRow
                            key={q}
                            onClick={async () => {
                              if (disabled) return;
                              await backendSetSetting("audio_quality", q);
                              showToast(`Kwaliteit ingesteld op ${q === "lossless" ? "FLAC Lossless" : q + " kbps"}`);
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
                </div>
              )}
            </Focusable>
          </Focusable>

          {/* Track Context Action Modal (Triggered by Opties (Y)) */}
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
            >
              <Focusable
                flow-children="column"
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
                  gap: 10,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                  {(actionTrack.artwork_url || actionTrack.image_url) && (
                    <img src={actionTrack.artwork_url || actionTrack.image_url} width={44} height={44} style={{ borderRadius: 6 }} />
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
                  <span>Speel Nummer Af</span>
                </InteractiveRow>

                <InteractiveRow onClick={() => handleAddToQueue(actionTrack)} style={{ gap: 10 }}>
                  <FaListUl size={12} />
                  <span>Voeg toe aan Wachtrij</span>
                </InteractiveRow>

                <InteractiveRow onClick={() => setShowAddToPlaylistModal(true)} style={{ gap: 10 }}>
                  <FaFolder size={12} />
                  <span>Voeg toe aan Afspeellijst...</span>
                </InteractiveRow>

                <InteractiveRow onClick={() => handleStartRadio(actionTrack)} style={{ gap: 10 }}>
                  <FaBroadcastTower size={12} color="#1db954" />
                  <span>Start Track Radio (Aanbevelingen)</span>
                </InteractiveRow>

                <InteractiveRow onClick={() => handleToggleLike(actionTrack.id)} style={{ gap: 10 }}>
                  <FaHeart size={12} color="#1db954" />
                  <span>Favoriet (Like) wisselen</span>
                </InteractiveRow>

                <InteractiveRow onClick={() => setActionTrack(null)} style={{ justifyContent: "center", marginTop: 4 }}>
                  <span>Sluiten (B)</span>
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
                <h3 style={{ fontSize: 16, fontWeight: 800, margin: "0 0 4px 0" }}>Kies Afspeellijst</h3>
                <p style={{ fontSize: 12, opacity: 0.6, margin: "0 0 14px 0" }}>Voeg &apos;{actionTrack.name}&apos; toe aan:</p>

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
                  <span>Terug</span>
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
              gap: 18,
              fontSize: 11,
              color: "#aaa",
              fontWeight: 600,
            }}
          >
            <span><b style={{ color: "#fff", background: "rgba(255,255,255,0.15)", padding: "1px 6px", borderRadius: 4 }}>D-Pad</b> Navigeer</span>
            <span><b style={{ color: "#1db954", background: "rgba(29, 185, 84, 0.2)", padding: "1px 6px", borderRadius: 4 }}>A</b> Selecteer / Play</span>
            <span><b style={{ color: "#ff5555", background: "rgba(255, 85, 85, 0.2)", padding: "1px 6px", borderRadius: 4 }}>B</b> Terug / Sluiten</span>
            <span><b style={{ color: "#ffaa00", background: "rgba(255, 170, 0, 0.2)", padding: "1px 6px", borderRadius: 4 }}>Y</b> Opties / Wachtrij</span>
            <span><b style={{ color: "#55aaff", background: "rgba(85, 170, 255, 0.2)", padding: "1px 6px", borderRadius: 4 }}>X</b> Like</span>
            {sleepTimerRemaining !== null && (
              <span style={{ color: "#1db954" }}>
                <FaClock size={10} style={{ marginRight: 4 }} />
                Timer: {Math.ceil(sleepTimerRemaining / 60)}m
              </span>
            )}
          </div>
        </div>
      </div>
    </ModalRootAny>
  );
};
