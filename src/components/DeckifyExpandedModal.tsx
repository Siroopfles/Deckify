import { FC, useState, useEffect, useCallback, useRef } from "react";
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
} from "react-icons/fa";

const ModalRootAny = ModalRoot as any;

const FULL_BLEED = {
  width: "96vw",
  marginLeft: "calc((100% - 96vw) / 2)",
  boxSizing: "border-box" as const,
};

type ViewMode = "now_playing" | "playlists" | "liked" | "search" | "queue" | "devices" | "engine";

interface TrackItem {
  id?: string;
  uri?: string;
  name?: string;
  artist?: string;
  album?: string;
  image_url?: string;
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

// Callables
const backendGetStatus = callable<[], any>("get_status");
const backendControlPlayback = callable<[string, string], { ok: boolean; error?: string }>("control_playback");
const backendSetShuffle = callable<[boolean, string], { ok: boolean; shuffle_state?: boolean; error?: string }>("set_shuffle");
const backendSetRepeat = callable<[string, string], { ok: boolean; repeat_state?: string; error?: string }>("set_repeat");
const backendToggleLike = callable<[string, boolean | null], { ok: boolean; is_liked?: boolean; error?: string }>("toggle_like_track");
const backendGetQueue = callable<[], { ok: boolean; currently_playing?: TrackItem | null; queue?: TrackItem[]; error?: string }>("get_queue");
const backendGetLikedTracks = callable<[number], { ok: boolean; tracks?: TrackItem[]; total?: number; error?: string }>("get_liked_tracks");
const backendGetPlaylistFolders = callable<[], { ok: boolean; folders?: FolderItem[]; error?: string }>("get_playlist_folders");
const backendGetPlaylistTracks = callable<[string, number], { ok: boolean; tracks?: TrackItem[]; total?: number; is_mixed?: boolean; can_mix?: boolean; error?: string }>("get_playlist_tracks");
const backendSetNativeMix = callable<[string, boolean, boolean], { ok: boolean; is_mixed?: boolean; error?: string }>("set_native_playlist_mix");
const backendPlayTracks = callable<[string | null, string | null, string[] | null, number], { ok: boolean; error?: string }>("play_tracks");
const backendSearchSpotify = callable<[string, string, number], { ok: boolean; tracks?: TrackItem[]; playlists?: PlaylistItem[]; error?: string }>("search_spotify");
const backendGetDevices = callable<[], { ok: boolean; devices?: SpotifyDevice[]; error?: string }>("get_devices");
const backendTransferPlayback = callable<[string], { ok: boolean; error?: string }>("transfer_playback");
const backendSetSetting = callable<[string, unknown], { ok: boolean; settings?: any; error?: string }>("set_setting");

function formatMs(ms: number): string {
  if (!ms || ms <= 0) return "0:00";
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export const DeckifyExpandedModal: FC<{ closeModal?: () => void }> = ({ closeModal }) => {
  const [mode, setMode] = useState<ViewMode>("now_playing");
  const [status, setStatus] = useState<any>(null);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [activePlaylist, setActivePlaylist] = useState<PlaylistItem | null>(null);
  const [playlistTracks, setPlaylistTracks] = useState<TrackItem[]>([]);
  const [loadingTracks, setLoadingTracks] = useState(false);
  const [likedTracks, setLikedTracks] = useState<TrackItem[]>([]);
  const [queueTracks, setQueueTracks] = useState<TrackItem[]>([]);
  const [devices, setDevices] = useState<SpotifyDevice[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ tracks?: TrackItem[]; playlists?: PlaylistItem[] }>({});
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set(["my_playlists"]));
  const [mixingBusy, setMixingBusy] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<any>(null);

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

  // Load folders
  useEffect(() => {
    backendGetPlaylistFolders().then((res) => {
      if (res.ok && res.folders) setFolders(res.folders);
    });
  }, []);

  // Load liked tracks
  const loadLikedTracks = useCallback(async () => {
    try {
      const res = await backendGetLikedTracks(0);
      if (res.ok && res.tracks) setLikedTracks(res.tracks);
    } catch {}
  }, []);

  // Load queue
  const loadQueue = useCallback(async () => {
    try {
      const res = await backendGetQueue();
      if (res.ok && res.queue) setQueueTracks(res.queue);
    } catch {}
  }, []);

  // Load devices
  const loadDevices = useCallback(async () => {
    try {
      const res = await backendGetDevices();
      if (res.ok && res.devices) setDevices(res.devices);
    } catch {}
  }, []);

  useEffect(() => {
    if (mode === "liked") loadLikedTracks();
    if (mode === "queue") loadQueue();
    if (mode === "devices") loadDevices();
  }, [mode, loadLikedTracks, loadQueue, loadDevices]);

  // Open playlist
  const handleOpenPlaylist = useCallback(async (pl: PlaylistItem) => {
    setActivePlaylist(pl);
    setLoadingTracks(true);
    try {
      const res = await backendGetPlaylistTracks(pl.id, 0);
      if (res.ok && res.tracks) {
        setPlaylistTracks(res.tracks);
        if (res.is_mixed !== undefined) {
          setActivePlaylist((prev) => (prev ? { ...prev, is_mixed: res.is_mixed } : null));
        }
      }
    } catch {}
    setLoadingTracks(false);
  }, []);

  // Search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults({});
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await backendSearchSpotify(searchQuery, "track,playlist", 20);
        if (res.ok) setSearchResults(res);
      } catch {}
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Toggle Native Mix
  const handleToggleMix = useCallback(async () => {
    if (!activePlaylist) return;
    setMixingBusy(true);
    const next = !activePlaylist.is_mixed;
    try {
      const res = await backendSetNativeMix(activePlaylist.id, next, true);
      if (res.ok) {
        setActivePlaylist((prev) => (prev ? { ...prev, is_mixed: res.is_mixed ?? next } : null));
        showToast(next ? "Native Spotify Mix geactiveerd!" : "Native Spotify Mix uitgeschakeld");
      } else {
        showToast(res.error || "Mixen mislukt");
      }
    } catch (e) {
      showToast(String(e));
    }
    setMixingBusy(false);
  }, [activePlaylist, showToast]);

  const toggleFolder = (id: string) => {
    setExpandedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Playback actions
  const handlePlayPause = async () => {
    const action = status?.is_playing ? "pause" : "play";
    await backendControlPlayback(action, "");
    refreshStatus();
  };

  const handleNext = async () => {
    await backendControlPlayback("next", "");
    refreshStatus();
  };

  const handlePrev = async () => {
    await backendControlPlayback("previous", "");
    refreshStatus();
  };

  const handleToggleLike = async () => {
    const tid = status?.track_meta?.track_id;
    if (!tid) return;
    const res = await backendToggleLike(tid, null);
    if (res.ok) {
      showToast(res.is_liked ? "Toegevoegd aan Favorieten" : "Verwijderd uit Favorieten");
      refreshStatus();
    }
  };

  const handleToggleRepeat = async () => {
    const current = status?.repeat_state || "off";
    const next = current === "off" ? "context" : current === "context" ? "track" : "off";
    await backendSetRepeat(next, "");
    showToast(next === "track" ? "Herhalen: 1 nummer" : next === "context" ? "Herhalen: Aan" : "Herhalen: Uit");
    refreshStatus();
  };

  const handlePlayTrack = async (uri: string, contextUri?: string) => {
    await backendPlayTracks(contextUri || null, uri, null, 0);
    showToast("Afspelen gestart");
    refreshStatus();
  };

  const isPlaying = status?.is_playing;
  const track = status?.track_meta;
  const audioBackend = status?.audio_backend || status?.settings?.audio_backend || "librespot";
  const audioQuality = status?.settings?.audio_quality || "320";
  const isLossless = audioQuality === "lossless";

  // Sidebar item helper
  const renderSidebarBtn = (id: ViewMode, label: string, icon: any) => {
    const active = mode === id && (!activePlaylist || id !== "playlists");
    return (
      <Focusable
        onClick={() => {
          setActivePlaylist(null);
          setMode(id);
        }}
        onActivate={() => {
          setActivePlaylist(null);
          setMode(id);
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 14px",
          borderRadius: 8,
          marginBottom: 4,
          background: active ? "#1db954" : "transparent",
          color: active ? "#000" : "#fff",
          fontWeight: active ? 700 : 500,
          cursor: "pointer",
          transition: "all 0.15s ease",
        }}
      >
        <span style={{ fontSize: 16 }}>{icon}</span>
        <span style={{ fontSize: 14 }}>{label}</span>
      </Focusable>
    );
  };

  // Render recursive folder tree
  const renderFolder = (folder: FolderItem, depth = 0) => {
    const isOpen = expandedFolderIds.has(folder.id);
    return (
      <div key={folder.id} style={{ marginLeft: depth * 12 }}>
        <Focusable
          onClick={() => toggleFolder(folder.id)}
          onActivate={() => toggleFolder(folder.id)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 10px",
            borderRadius: 6,
            marginBottom: 2,
            background: "rgba(255,255,255,0.04)",
            cursor: "pointer",
          }}
        >
          {isOpen ? <FaFolderOpen color="#1db954" size={14} /> : <FaFolder color="#aaa" size={14} />}
          <span style={{ fontSize: 13, fontWeight: 600 }}>{folder.name}</span>
          <span style={{ fontSize: 11, opacity: 0.5, marginLeft: "auto" }}>
            {folder.playlists.length}
          </span>
        </Focusable>
        {isOpen && (
          <div style={{ paddingLeft: 8 }}>
            {folder.subfolders?.map((sf) => renderFolder(sf, depth + 1))}
            {folder.playlists.map((pl) => (
              <Focusable
                key={pl.id}
                onClick={() => handleOpenPlaylist(pl)}
                onActivate={() => handleOpenPlaylist(pl)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 8px",
                  borderRadius: 6,
                  marginBottom: 2,
                  background: activePlaylist?.id === pl.id ? "rgba(29, 185, 84, 0.2)" : "transparent",
                  cursor: "pointer",
                }}
              >
                {pl.image_url ? (
                  <img src={pl.image_url} width={24} height={24} style={{ borderRadius: 4 }} />
                ) : (
                  <FaMusic size={12} color="#888" />
                )}
                <span style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {pl.name}
                </span>
                {pl.is_mixed && (
                  <span style={{ fontSize: 10, background: "#1db954", color: "#000", padding: "1px 4px", borderRadius: 4, fontWeight: 700, marginLeft: "auto" }}>
                    MIX
                  </span>
                )}
              </Focusable>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <ModalRootAny closeModal={closeModal} onCancel={closeModal} bAllowFullSize>
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
        {/* Main Body */}
        <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
          {/* Left Sidebar */}
          <Focusable
            flow-children="column"
            style={{
              width: 250,
              flexShrink: 0,
              background: "#181818",
              borderRight: "1px solid rgba(255,255,255,0.08)",
              display: "flex",
              flexDirection: "column",
              padding: "16px 12px",
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 8px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)", marginBottom: 12 }}>
              <FaSpotify size={28} color="#1db954" />
              <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: -0.5 }}>Deckify</span>
            </div>

            {/* Nav Menu */}
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {renderSidebarBtn("now_playing", "Nu Spelend", <FaPlay size={14} />)}
              {renderSidebarBtn("playlists", "Afspeellijsten", <FaFolder size={14} />)}
              {renderSidebarBtn("liked", "Favorieten", <FaHeart size={14} />)}
              {renderSidebarBtn("search", "Zoeken", <FaSearch size={14} />)}
              {renderSidebarBtn("queue", "Wachtrij", <FaListUl size={14} />)}
              {renderSidebarBtn("devices", "Apparaten", <FaTv size={14} />)}
              {renderSidebarBtn("engine", "Audio Instellingen", <FaCog size={14} />)}
            </div>

            {/* Now Playing Widget Thumbnail in Sidebar */}
            {track?.name && (
              <div
                style={{
                  marginTop: "auto",
                  padding: 10,
                  borderRadius: 8,
                  background: "rgba(255,255,255,0.05)",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                {track.image_url ? (
                  <img src={track.image_url} width={36} height={36} style={{ borderRadius: 4 }} />
                ) : (
                  <FaMusic size={20} color="#888" />
                )}
                <div style={{ overflow: "hidden", flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {track.name}
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {track.artist}
                  </div>
                </div>
              </div>
            )}

            {/* Close Button */}
            <Focusable
              onClick={closeModal}
              onActivate={closeModal}
              style={{
                marginTop: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: "8px 12px",
                borderRadius: 8,
                background: "rgba(255,255,255,0.08)",
                color: "#ddd",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              <FaTimes size={12} />
              <span>Terug naar Game (B)</span>
            </Focusable>
          </Focusable>

          {/* Right Content Panel */}
          <Focusable
            flow-children="column"
            navEntryPreferPosition={NavEntryPositionPreferences.FIRST}
            style={{
              flex: 1,
              minWidth: 0,
              padding: "24px 32px",
              display: "flex",
              flexDirection: "column",
              overflowY: "auto",
            }}
          >
            {/* VIEW: NOW PLAYING */}
            {mode === "now_playing" && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", maxWidth: 680, margin: "0 auto", textAlign: "center" }}>
                {/* Album Art */}
                <div style={{ position: "relative", marginBottom: 20 }}>
                  {track?.image_url ? (
                    <img
                      src={track.image_url}
                      width={260}
                      height={260}
                      style={{ borderRadius: 16, boxShadow: "0 16px 40px rgba(0,0,0,0.6)" }}
                    />
                  ) : (
                    <div style={{ width: 260, height: 260, borderRadius: 16, background: "#222", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <FaSpotify size={80} color="#1db954" />
                    </div>
                  )}

                  {/* Lossless FLAC badge */}
                  {isLossless && (
                    <div
                      style={{
                        position: "absolute",
                        top: 10,
                        right: 10,
                        background: "rgba(0,0,0,0.75)",
                        border: "1px solid #1db954",
                        color: "#1db954",
                        padding: "3px 8px",
                        borderRadius: 6,
                        fontSize: 10,
                        fontWeight: 800,
                        letterSpacing: 0.5,
                      }}
                    >
                      LOSSLESS FLAC
                    </div>
                  )}
                </div>

                {/* Track Details */}
                <h1 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 6px 0", color: "#fff" }}>
                  {track?.name || "Geen nummer actief"}
                </h1>
                <p style={{ fontSize: 16, opacity: 0.7, margin: "0 0 20px 0" }}>
                  {track?.artist || "Start muziek via Spotify of kies een afspeellijst"}
                </p>

                {/* Progress Bar */}
                {track?.duration_ms && track.duration_ms > 0 && (
                  <div style={{ width: "100%", marginBottom: 24 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, opacity: 0.6, marginBottom: 6 }}>
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
                  </div>
                )}

                {/* Controller Playback Controls */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16 }}>
                  <Focusable
                    onClick={() => backendSetShuffle(!status?.shuffle_state, "")}
                    onActivate={() => backendSetShuffle(!status?.shuffle_state, "")}
                    style={{
                      padding: 12,
                      borderRadius: "50%",
                      background: status?.shuffle_state ? "rgba(29, 185, 84, 0.25)" : "transparent",
                      color: status?.shuffle_state ? "#1db954" : "#aaa",
                      cursor: "pointer",
                    }}
                  >
                    <FaRandom size={18} />
                  </Focusable>

                  <Focusable
                    onClick={handlePrev}
                    onActivate={handlePrev}
                    style={{ padding: 14, borderRadius: "50%", background: "rgba(255,255,255,0.08)", cursor: "pointer" }}
                  >
                    <FaStepBackward size={20} />
                  </Focusable>

                  <Focusable
                    onClick={handlePlayPause}
                    onActivate={handlePlayPause}
                    style={{
                      padding: 18,
                      borderRadius: "50%",
                      background: "#1db954",
                      color: "#000",
                      cursor: "pointer",
                      boxShadow: "0 4px 16px rgba(29, 185, 84, 0.4)",
                    }}
                  >
                    {isPlaying ? <FaPause size={24} /> : <FaPlay size={24} style={{ marginLeft: 2 }} />}
                  </Focusable>

                  <Focusable
                    onClick={handleNext}
                    onActivate={handleNext}
                    style={{ padding: 14, borderRadius: "50%", background: "rgba(255,255,255,0.08)", cursor: "pointer" }}
                  >
                    <FaStepForward size={20} />
                  </Focusable>

                  <Focusable
                    onClick={handleToggleRepeat}
                    onActivate={handleToggleRepeat}
                    style={{
                      padding: 12,
                      borderRadius: "50%",
                      background: status?.repeat_state && status?.repeat_state !== "off" ? "rgba(29, 185, 84, 0.25)" : "transparent",
                      color: status?.repeat_state && status?.repeat_state !== "off" ? "#1db954" : "#aaa",
                      cursor: "pointer",
                      position: "relative",
                    }}
                  >
                    <FaRedo size={16} />
                    {status?.repeat_state === "track" && (
                      <span style={{ position: "absolute", fontSize: 9, top: 4, right: 4, fontWeight: 900 }}>1</span>
                    )}
                  </Focusable>

                  <Focusable
                    onClick={handleToggleLike}
                    onActivate={handleToggleLike}
                    style={{
                      padding: 12,
                      borderRadius: "50%",
                      color: status?.is_liked ? "#1db954" : "#aaa",
                      cursor: "pointer",
                    }}
                  >
                    {status?.is_liked ? <FaHeart size={20} /> : <FaRegHeart size={20} />}
                  </Focusable>
                </div>
              </div>
            )}

            {/* VIEW: PLAYLISTS & FOLDERS */}
            {mode === "playlists" && !activePlaylist && (
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>Mappen & Afspeellijsten</h2>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {folders.map((f) => renderFolder(f, 0))}
                </div>
              </div>
            )}

            {/* VIEW: INSIDE A PLAYLIST */}
            {mode === "playlists" && activePlaylist && (
              <div>
                {/* Playlist Header */}
                <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
                  <Focusable
                    onClick={() => setActivePlaylist(null)}
                    onActivate={() => setActivePlaylist(null)}
                    style={{ padding: "8px 12px", borderRadius: 6, background: "rgba(255,255,255,0.08)", fontSize: 13, cursor: "pointer" }}
                  >
                    ← Terug (B)
                  </Focusable>
                  <div>
                    <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>{activePlaylist.name}</h2>
                    <span style={{ fontSize: 12, opacity: 0.6 }}>{playlistTracks.length} nummers</span>
                  </div>

                  {/* Play All button */}
                  <Focusable
                    onClick={() => handlePlayTrack("", activePlaylist.uri)}
                    onActivate={() => handlePlayTrack("", activePlaylist.uri)}
                    style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", borderRadius: 20, background: "#1db954", color: "#000", fontWeight: 700, cursor: "pointer" }}
                  >
                    <FaPlay size={12} /> Afspelen
                  </Focusable>

                  {/* Native Spotify Mix Toggle (only when client backend active) */}
                  {audioBackend === "spotify_client" && (
                    <Focusable
                      onClick={handleToggleMix}
                      onActivate={handleToggleMix}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "8px 14px",
                        borderRadius: 20,
                        background: activePlaylist.is_mixed ? "#1db954" : "rgba(255,255,255,0.1)",
                        color: activePlaylist.is_mixed ? "#000" : "#fff",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      <FaMagic size={12} /> {mixingBusy ? "Bezig..." : activePlaylist.is_mixed ? "Mix Actief" : "Zet Mix Aan"}
                    </Focusable>
                  )}
                </div>

                {/* Track List */}
                {loadingTracks ? (
                  <p style={{ opacity: 0.5 }}>Laden...</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {playlistTracks.map((t, idx) => (
                      <Focusable
                        key={t.id || t.uri || idx}
                        onClick={() => handlePlayTrack(t.uri || "", activePlaylist.uri)}
                        onActivate={() => handlePlayTrack(t.uri || "", activePlaylist.uri)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          padding: "8px 12px",
                          borderRadius: 6,
                          background: "rgba(255,255,255,0.03)",
                          cursor: "pointer",
                        }}
                      >
                        <span style={{ width: 24, fontSize: 12, opacity: 0.5, textAlign: "right" }}>{idx + 1}</span>
                        {t.image_url ? (
                          <img src={t.image_url} width={32} height={32} style={{ borderRadius: 4 }} />
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
                      </Focusable>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* VIEW: LIKED SONGS */}
            {mode === "liked" && (
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>Favoriete Nummers</h2>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {likedTracks.map((t, idx) => (
                    <Focusable
                      key={t.id || idx}
                      onClick={() => handlePlayTrack(t.uri || "")}
                      onActivate={() => handlePlayTrack(t.uri || "")}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "8px 12px",
                        borderRadius: 6,
                        background: "rgba(255,255,255,0.03)",
                        cursor: "pointer",
                      }}
                    >
                      <span style={{ width: 24, fontSize: 12, opacity: 0.5, textAlign: "right" }}>{idx + 1}</span>
                      {t.image_url && <img src={t.image_url} width={32} height={32} style={{ borderRadius: 4 }} />}
                      <div style={{ flex: 1, overflow: "hidden" }}>
                        <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</div>
                        <div style={{ fontSize: 11, opacity: 0.6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.artist}</div>
                      </div>
                      <span style={{ fontSize: 12, opacity: 0.5 }}>{formatMs(t.duration_ms || 0)}</span>
                    </Focusable>
                  ))}
                </div>
              </div>
            )}

            {/* VIEW: SEARCH */}
            {mode === "search" && (
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>Zoeken</h2>
                <TextField
                  label="Zoeken"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 6 }}>
                  {searchResults.tracks?.map((t) => (
                    <Focusable
                      key={t.id}
                      onClick={() => handlePlayTrack(t.uri || "")}
                      onActivate={() => handlePlayTrack(t.uri || "")}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "8px 12px",
                        borderRadius: 6,
                        background: "rgba(255,255,255,0.03)",
                        cursor: "pointer",
                      }}
                    >
                      {t.image_url && <img src={t.image_url} width={32} height={32} style={{ borderRadius: 4 }} />}
                      <div style={{ flex: 1, overflow: "hidden" }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{t.name}</div>
                        <div style={{ fontSize: 11, opacity: 0.6 }}>{t.artist}</div>
                      </div>
                    </Focusable>
                  ))}
                </div>
              </div>
            )}

            {/* VIEW: QUEUE */}
            {mode === "queue" && (
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>Wachtrij</h2>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {queueTracks.map((t, idx) => (
                    <div
                      key={t.id || idx}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "8px 12px",
                        borderRadius: 6,
                        background: "rgba(255,255,255,0.03)",
                      }}
                    >
                      <span style={{ width: 24, fontSize: 12, opacity: 0.5 }}>{idx + 1}</span>
                      {t.image_url && <img src={t.image_url} width={32} height={32} style={{ borderRadius: 4 }} />}
                      <div style={{ flex: 1, overflow: "hidden" }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{t.name}</div>
                        <div style={{ fontSize: 11, opacity: 0.6 }}>{t.artist}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* VIEW: DEVICES */}
            {mode === "devices" && (
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>Beschikbare Apparaten</h2>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {devices.map((d) => (
                    <Focusable
                      key={d.id}
                      onClick={async () => {
                        await backendTransferPlayback(d.id);
                        showToast(`Overgeschakeld naar ${d.name}`);
                        loadDevices();
                      }}
                      onActivate={async () => {
                        await backendTransferPlayback(d.id);
                        showToast(`Overgeschakeld naar ${d.name}`);
                        loadDevices();
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "12px 16px",
                        borderRadius: 8,
                        background: d.is_active ? "rgba(29, 185, 84, 0.2)" : "rgba(255,255,255,0.04)",
                        cursor: "pointer",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: d.is_active ? "#1db954" : "#fff" }}>{d.name}</div>
                        <div style={{ fontSize: 11, opacity: 0.5 }}>{d.type} {d.is_active ? "· Actief" : ""}</div>
                      </div>
                      {d.is_active && <span style={{ fontSize: 12, color: "#1db954", fontWeight: 700 }}>Actief</span>}
                    </Focusable>
                  ))}
                </div>
              </div>
            )}

            {/* VIEW: ENGINE SETTINGS */}
            {mode === "engine" && (
              <div style={{ maxWidth: 600 }}>
                <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>Audio & Backend Instellingen</h2>

                <div style={{ marginBottom: 20 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, color: "#1db954" }}>Afspeel-backend</h3>
                  <div style={{ display: "flex", gap: 10 }}>
                    <Focusable
                      onClick={async () => {
                        await backendSetSetting("audio_backend", "librespot");
                        showToast("Overgeschakeld naar Librespot");
                        refreshStatus();
                      }}
                      onActivate={async () => {
                        await backendSetSetting("audio_backend", "librespot");
                        showToast("Overgeschakeld naar Librespot");
                        refreshStatus();
                      }}
                      style={{
                        flex: 1,
                        padding: "12px",
                        borderRadius: 8,
                        background: audioBackend === "librespot" ? "#1db954" : "rgba(255,255,255,0.06)",
                        color: audioBackend === "librespot" ? "#000" : "#fff",
                        fontWeight: 700,
                        textAlign: "center",
                        cursor: "pointer",
                      }}
                    >
                      Librespot (Ingebouwd)
                    </Focusable>

                    <Focusable
                      onClick={async () => {
                        await backendSetSetting("audio_backend", "spotify_client");
                        showToast("Overgeschakeld naar Officiële Spotify Client");
                        refreshStatus();
                      }}
                      onActivate={async () => {
                        await backendSetSetting("audio_backend", "spotify_client");
                        showToast("Overgeschakeld naar Officiële Spotify Client");
                        refreshStatus();
                      }}
                      style={{
                        flex: 1,
                        padding: "12px",
                        borderRadius: 8,
                        background: audioBackend === "spotify_client" ? "#1db954" : "rgba(255,255,255,0.06)",
                        color: audioBackend === "spotify_client" ? "#000" : "#fff",
                        fontWeight: 700,
                        textAlign: "center",
                        cursor: "pointer",
                      }}
                    >
                      Officiële Spotify Client
                    </Focusable>
                  </div>
                </div>

                {/* Lossless Quality Toggle (only for spotify_client) */}
                <div style={{ marginBottom: 20 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, color: "#1db954" }}>Audiokwaliteit</h3>
                  <div style={{ display: "flex", gap: 8 }}>
                    {["96", "160", "320", "lossless"].map((q) => {
                      const active = audioQuality === q;
                      const disabled = q === "lossless" && audioBackend !== "spotify_client";
                      return (
                        <Focusable
                          key={q}
                          onClick={async () => {
                            if (disabled) return;
                            await backendSetSetting("audio_quality", q);
                            showToast(q === "lossless" ? "Lossless FLAC geactiveerd!" : `Kwaliteit ingesteld op ${q} kbps`);
                            refreshStatus();
                          }}
                          onActivate={async () => {
                            if (disabled) return;
                            await backendSetSetting("audio_quality", q);
                            showToast(q === "lossless" ? "Lossless FLAC geactiveerd!" : `Kwaliteit ingesteld op ${q} kbps`);
                            refreshStatus();
                          }}
                          style={{
                            flex: 1,
                            padding: "10px",
                            borderRadius: 6,
                            background: active ? "#1db954" : "rgba(255,255,255,0.06)",
                            color: active ? "#000" : disabled ? "#555" : "#fff",
                            fontWeight: 700,
                            textAlign: "center",
                            fontSize: 12,
                            cursor: disabled ? "not-allowed" : "pointer",
                            opacity: disabled ? 0.4 : 1,
                          }}
                        >
                          {q === "lossless" ? "Lossless FLAC" : `${q} kbps`}
                        </Focusable>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </Focusable>
        </div>

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
            background: "#0a0a0a",
            borderTop: "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 20,
            fontSize: 11,
            color: "#aaa",
            fontWeight: 600,
          }}
        >
          <span><b style={{ color: "#fff", background: "rgba(255,255,255,0.15)", padding: "1px 6px", borderRadius: 4 }}>D-Pad</b> Navigeer</span>
          <span><b style={{ color: "#1db954", background: "rgba(29, 185, 84, 0.2)", padding: "1px 6px", borderRadius: 4 }}>A</b> Selecteer</span>
          <span><b style={{ color: "#ff5555", background: "rgba(255, 85, 85, 0.2)", padding: "1px 6px", borderRadius: 4 }}>B</b> Terug / Sluiten</span>
          <span><b style={{ color: "#55aaff", background: "rgba(85, 170, 255, 0.2)", padding: "1px 6px", borderRadius: 4 }}>X</b> Like</span>
          <span><b style={{ color: "#ffaa00", background: "rgba(255, 170, 0, 0.2)", padding: "1px 6px", borderRadius: 4 }}>Y</b> +Playlist</span>
          <span><b style={{ color: "#fff", background: "rgba(255,255,255,0.15)", padding: "1px 6px", borderRadius: 4 }}>LB / RB</b> Vorig / Volgend</span>
          <span><b style={{ color: "#fff", background: "rgba(255,255,255,0.15)", padding: "1px 6px", borderRadius: 4 }}>Start</b> Play / Pauze</span>
        </div>
      </div>
    </ModalRootAny>
  );
};
