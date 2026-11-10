import { useEffect, useState, useCallback, useRef, FC } from "react";
import {
  PanelSection,
  PanelSectionRow,
  ToggleField,
  Field,
  DropdownItem,
  ButtonItem,
  SliderField,
  Focusable,
  DialogButton,
  TextField,
  Navigation,
  showModal,
  staticClasses,
} from "@decky/ui";
import {
  callable,
  addEventListener,
  removeEventListener,
  definePlugin,
  routerHook,
  toaster,
} from "@decky/api";
import { registerSteamMenu } from "./steamMenu";
import { DeckifyExpandedModal } from "./components/DeckifyExpandedModal";
import {
  FaMusic,
  FaSpotify,
  FaPlay,
  FaPause,
  FaStepBackward,
  FaStepForward,
  FaRandom,
  FaRedo,
  FaHeart,
  FaRegHeart,
  FaPlus,
  FaListUl,
} from "react-icons/fa";
import { QRCodeSVG } from "qrcode.react";

type AudioBackend = "librespot" | "spotify_client";
type AudioQuality = "96" | "160" | "320" | "lossless";

interface AudioStreamInfo {
  sample_spec?: string;
  sample_rate_hz?: number;
  bit_depth?: number;
  is_lossless_rate?: boolean;
  format_label?: string;
}

const backendStart = callable<[], { ok: boolean; error?: string; pid?: number }>("start_librespot");
const backendStop = callable<[], { ok: boolean }>("stop_librespot");
const backendGetStatus = callable<[], {
  running: boolean;
  librespot_running?: boolean;
  spotify_client_running?: boolean;
  audio_backend?: AudioBackend;
  binary_found: boolean;
  spotify_client_installed?: boolean;
  settings: Settings;
  last_event: LibrespotEvent | null;
  track_meta: TrackMetadata | null;
  active_device: { id: string; name: string; type: string } | null;
  is_playing: boolean;
  position_ms: number;
  duration_ms: number;
  volume: number | null;
  shuffle_state: boolean;
  repeat_state: "off" | "context" | "track";
  is_liked: boolean;
  audio_stream_info?: AudioStreamInfo | null;
}>("get_status");
const backendSetSetting = callable<[string, unknown], { ok: boolean; settings?: Settings; error?: string }>("set_setting");
const backendStartOAuth = callable<[], { ok: boolean; landing_url?: string; redirect_uri?: string; error?: string }>("start_oauth");
const backendGetAuthStatus = callable<[], { authenticated: boolean; needs_reauth: boolean }>("get_auth_status");
const backendLogout = callable<[], { ok: boolean }>("logout_spotify");
const backendControlPlayback = callable<[string, string], { ok: boolean; error?: string }>("control_playback");
const backendSetVolume = callable<[number], { ok: boolean; error?: string }>("set_volume");
const backendSeekPlayback = callable<[number, string], { ok: boolean; position_ms?: number; error?: string }>("seek_playback");
const backendSetShuffle = callable<[boolean, string], { ok: boolean; shuffle_state?: boolean; error?: string }>("set_shuffle");
const backendSetRepeat = callable<[string, string], { ok: boolean; repeat_state?: string; error?: string }>("set_repeat");
const backendToggleLike = callable<[string, boolean | null], { ok: boolean; is_liked?: boolean; error?: string }>("toggle_like_track");
const backendAddTrackToPlaylist = callable<[string, string], { ok: boolean; error?: string }>("add_track_to_playlist");
const backendGetQueue = callable<[], { ok: boolean; currently_playing?: TrackItem | null; queue?: TrackItem[]; error?: string }>("get_queue");
const backendAddToQueue = callable<[string, string], { ok: boolean; error?: string }>("add_to_queue");
const backendGetPlaylists = callable<[number], { ok: boolean; playlists?: PlaylistItem[]; total?: number; error?: string }>("get_playlists");
const backendGetLikedTracks = callable<[number], { ok: boolean; tracks?: TrackItem[]; total?: number; error?: string }>("get_liked_tracks");
const backendSearchSpotify = callable<[string, string, number], {
  ok: boolean;
  tracks?: TrackItem[];
  playlists?: PlaylistItem[];
  error?: string;
}>("search_spotify");
const backendPlayTracks = callable<[string | null, string | null, string[] | null, number], { ok: boolean; error?: string }>("play_tracks");
const backendGetDevices = callable<[], { ok: boolean; devices?: SpotifyDevice[]; error?: string }>("get_devices");
const backendTransferPlayback = callable<[string], { ok: boolean; error?: string }>("transfer_playback");
const backendPushGamepadEvent = callable<[string[]], { ok: boolean }>("push_gamepad_event");

interface Settings {
  device_name: string;
  audio_backend?: AudioBackend;
  audio_quality?: AudioQuality;
  bitrate: number;
  spotify_client_id: string;
  normalisation?: boolean;
  normalisation_pregain?: number;
  gapless?: boolean;
  autoplay?: boolean;
  game_audio_profiles?: Record<string, { volume: number; ducking: boolean }>;
  auto_ducking?: boolean;
  auto_ducking_volume?: number;
  gamepad_chords_enabled?: boolean;
  toast_enabled?: boolean;
  overlay_enabled?: boolean;
  overlay_position?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
}

interface LibrespotEvent {
  event: string;
  track_id?: string;
  old_track_id?: string;
  duration_ms?: number;
  position_ms?: number;
  volume?: number;
}

interface StatusPayload {
  running: boolean;
  audio_backend?: AudioBackend;
  error?: string | null;
  auto_restarting?: boolean;
}

interface SpotifyDevice {
  id: string;
  name: string;
  type: string;
  is_active: boolean;
  volume_percent: number | null;
}

interface TrackMetadata {
  track_id: string;
  name: string;
  artist: string;
  album: string;
  artwork_url: string | null;
  duration_ms: number;
  uri?: string;
  is_liked?: boolean;
}

interface TrackItem {
  id: string | null;
  name: string;
  artist: string;
  album: string;
  uri: string;
  duration_ms: number;
  image_url: string | null;
  is_liked?: boolean;
}

interface PlaylistItem {
  id: string;
  name: string;
  image_url: string | null;
  track_count: number;
  owner_id: string;
}

type QuickTab = "none" | "playlists" | "liked" | "queue" | "search" | "add_to_playlist";

const AUDIO_BACKEND_OPTIONS = [
  { data: "librespot", label: "librespot (Lightweight Connect Daemon)" },
  { data: "spotify_client", label: "Official Spotify Client (Lossless + Native Mix)" },
];

const LIBRESPOT_QUALITY_OPTIONS = [
  { data: "96", label: "Normal (96 kbps Ogg Vorbis)" },
  { data: "160", label: "High (160 kbps Ogg Vorbis)" },
  { data: "320", label: "Very High (320 kbps Ogg Vorbis)" },
];

const SPOTIFY_CLIENT_QUALITY_OPTIONS = [
  { data: "96", label: "Normal (96 kbps)" },
  { data: "160", label: "High (160 kbps)" },
  { data: "320", label: "Very High (320 kbps)" },
  { data: "lossless", label: "Lossless (Up to 24-bit / 44.1 kHz FLAC)" },
];

function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec < 10 ? "0" : ""}${sec}`;
}

function playerEventToLabel(event: string | undefined, isPlaying: boolean): string {
  switch (event) {
    case "playing":
    case "started":
      return "Playing";
    case "paused":
      return "Paused";
    case "stopped":
    case "unavailable":
      return "Stopped";
    case "changed":
    case "preloading":
      return "Loading";
    case "volume_set":
      return isPlaying ? "Playing" : "Paused";
    default:
      return isPlaying ? "Playing" : (event ?? "Ready");
  }
}

const Content: FC = () => {
  const [running, setRunning] = useState(false);
  const [binaryFound, setBinaryFound] = useState(true);
  const [spotifyClientInstalled, setSpotifyClientInstalled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastEvent, setLastEvent] = useState<LibrespotEvent | null>(null);
  const [settings, setSettings] = useState<Settings>({
    device_name: "",
    audio_backend: "librespot",
    audio_quality: "320",
    bitrate: 320,
    spotify_client_id: "",
    normalisation: true,
    gapless: true,
    autoplay: true,
  });
  const [audioStreamInfo, setAudioStreamInfo] = useState<AudioStreamInfo | null>(null);
  const [toggling, setToggling] = useState(false);
  const [deviceName, setDeviceName] = useState("");
  const [savingDeviceName, setSavingDeviceName] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [needsReauth, setNeedsReauth] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [trackMeta, setTrackMeta] = useState<TrackMetadata | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(50);
  const [shuffleState, setShuffleState] = useState(false);
  const [repeatState, setRepeatState] = useState<"off" | "context" | "track">("off");
  const [isLiked, setIsLiked] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [restartNeeded, setRestartNeeded] = useState(false);
  const [devices, setDevices] = useState<SpotifyDevice[]>([]);

  // Quick Browser & Add-to-Playlist state
  const [quickTab, setQuickTab] = useState<QuickTab>("none");
  const [quickLoading, setQuickLoading] = useState(false);
  const [playlists, setPlaylists] = useState<PlaylistItem[]>([]);
  const [likedTracks, setLikedTracks] = useState<TrackItem[]>([]);
  const [queueTracks, setQueueTracks] = useState<TrackItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<TrackItem[]>([]);
  const [pendingTrackForPlaylist, setPendingTrackForPlaylist] = useState<{ uri: string; name: string } | null>(null);

  const activeDeviceIdRef = useRef<string>("");
  const updateDevices = useCallback((devs: SpotifyDevice[]) => {
    setDevices(devs);
    activeDeviceIdRef.current = devs.find((d) => d.is_active)?.id ?? devs[0]?.id ?? "";
  }, []);
  const volumeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const volumeChangeSourceRef = useRef<"user" | "remote">("remote");
  const seekDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekingRef = useRef(false);

  useEffect(() => {
    backendGetStatus().then((status) => {
      setRunning(status.running);
      setBinaryFound(status.binary_found);
      if (status.spotify_client_installed !== undefined) {
        setSpotifyClientInstalled(status.spotify_client_installed);
      }
      setSettings((prev) => ({ ...prev, ...status.settings }));
      setDeviceName(status.settings.device_name);
      setLastEvent(status.last_event);
      if (status.audio_stream_info !== undefined) {
        setAudioStreamInfo(status.audio_stream_info ?? null);
      }
      if (status.volume != null) setVolume(status.volume);
      if (status.track_meta) {
        setTrackMeta(status.track_meta);
        setDurationMs(status.track_meta.duration_ms || status.duration_ms || 0);
        if (status.track_meta.is_liked !== undefined) {
          setIsLiked(status.track_meta.is_liked);
        }
      }
      setPositionMs(status.position_ms || 0);
      setIsPlaying(status.is_playing);
      setShuffleState(Boolean(status.shuffle_state));
      setRepeatState(status.repeat_state || "off");
      setIsLiked(Boolean(status.is_liked));
    });
    backendGetAuthStatus().then((s) => {
      setAuthenticated(s.authenticated);
      setNeedsReauth(s.needs_reauth);
      if (s.authenticated) {
        backendGetDevices().then((r) => {
          if (r.ok && r.devices && r.devices.length > 0) updateDevices(r.devices);
        });
      }
    });
  }, [updateDevices]);

  // Periodic device list refresh
  useEffect(() => {
    if (!authenticated) return;
    const interval = setInterval(async () => {
      const r = await backendGetDevices();
      if (r.ok && r.devices && r.devices.length > 0) updateDevices(r.devices);
    }, 30000);
    return () => clearInterval(interval);
  }, [authenticated, updateDevices]);

  // Listen to backend events
  useEffect(() => {
    const onStatus = (payload: StatusPayload) => {
      setRunning(payload.running);
      if (payload.audio_backend) {
        setSettings((prev) => ({ ...prev, audio_backend: payload.audio_backend }));
      }
      setError(payload.error ?? null);
      if (payload.error) {
        toaster.toast({
          title: "Deckify",
          body: payload.error,
          duration: 5000,
          icon: <FaMusic />,
        });
      }
    };
    const onEvent = (event: LibrespotEvent) => {
      setLastEvent(event);
      const etype = event.event;
      if (etype === "playing" || etype === "started") {
        setIsPlaying(true);
        if (!seekingRef.current && event.position_ms !== undefined) {
          setPositionMs(event.position_ms);
        }
        if (event.duration_ms !== undefined) {
          setDurationMs(event.duration_ms);
        }
      } else if (etype === "paused") {
        setIsPlaying(false);
        if (!seekingRef.current && event.position_ms !== undefined) {
          setPositionMs(event.position_ms);
        }
      } else if (etype === "stopped" || etype === "unavailable") {
        setIsPlaying(false);
        setTrackMeta(null);
        setPositionMs(0);
        setDurationMs(0);
      } else if (etype === "volume_set" && event.volume !== undefined) {
        if (volumeChangeSourceRef.current !== "user") {
          setVolume(event.volume);
        }
      }
    };
    const onOAuthComplete = (payload: { authenticated: boolean }) => {
      setAuthenticated(payload.authenticated);
      setNeedsReauth(false);
      setOauthLoading(false);
      setQrCodeUrl(null);
      toaster.toast({
        title: "Deckify",
        body: "Spotify account connected!",
        duration: 3000,
        icon: <FaSpotify />,
      });
    };
    const onTrackMeta = (meta: TrackMetadata) => {
      setTrackMeta(meta);
      setDurationMs(meta.duration_ms || 0);
      if (meta.is_liked !== undefined) {
        setIsLiked(meta.is_liked);
      }
    };
    const onPlaybackModes = (modes: { shuffle_state: boolean; repeat_state: "off" | "context" | "track" }) => {
      setShuffleState(modes.shuffle_state);
      setRepeatState(modes.repeat_state);
    };
    const onAuthExpired = () => {
      setAuthenticated(false);
      setNeedsReauth(false);
      setDevices([]);
      activeDeviceIdRef.current = "";
      toaster.toast({
        title: "Deckify",
        body: "Spotify authorization expired. Please connect your account again.",
        duration: 5000,
        icon: <FaSpotify />,
      });
    };
    const onDeviceChanged = () => {
      backendGetDevices().then((r) => {
        if (r.ok && r.devices && r.devices.length > 0) updateDevices(r.devices);
      });
    };

    const regStatus = addEventListener<[StatusPayload]>("librespot_status", onStatus);
    const regEvent = addEventListener<[LibrespotEvent]>("librespot_event", onEvent);
    const regOAuth = addEventListener<[{ authenticated: boolean }]>("oauth_complete", onOAuthComplete);
    const regAuthExpired = addEventListener("auth_expired", onAuthExpired);
    const regMeta = addEventListener<[TrackMetadata]>("track_metadata", onTrackMeta);
    const regModes = addEventListener<[{ shuffle_state: boolean; repeat_state: "off" | "context" | "track" }]>(
      "playback_modes",
      onPlaybackModes,
    );
    const regDevice = addEventListener("device_changed", onDeviceChanged);

    return () => {
      removeEventListener("librespot_status", regStatus);
      removeEventListener("librespot_event", regEvent);
      removeEventListener("oauth_complete", regOAuth);
      removeEventListener("auth_expired", regAuthExpired);
      removeEventListener("track_metadata", regMeta);
      removeEventListener("playback_modes", regModes);
      removeEventListener("device_changed", regDevice);
    };
  }, [updateDevices]);

  // Smooth progress bar tick while playing
  useEffect(() => {
    if (!isPlaying || durationMs <= 0) return;
    const timer = setInterval(() => {
      if (!seekingRef.current) {
        setPositionMs((prev) => Math.min(durationMs, prev + 1000));
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [isPlaying, durationMs]);

  const handleToggle = useCallback(async (checked: boolean) => {
    setToggling(true);
    try {
      if (checked) {
        const result = await backendStart();
        if (!result.ok) {
          setError(result.error ?? "Failed to start");
        }
      } else {
        await backendStop();
        setLastEvent(null);
        setTrackMeta(null);
        setIsPlaying(false);
      }
    } finally {
      setToggling(false);
    }
  }, []);

  const handleSettingChange = useCallback(async (key: string, value: unknown) => {
    try {
      const result = await backendSetSetting(key, value);
      if (!result.ok || !result.settings) throw new Error(result.error ?? "Could not save setting");
      setSettings((prev) => ({ ...prev, ...result.settings }));
      if (key === "device_name") setDeviceName(result.settings.device_name);
      if (key === "audio_backend") {
        setRestartNeeded(false);
        const st = await backendGetStatus();
        setRunning(st.running);
        setAudioStreamInfo(st.audio_stream_info ?? null);
        toaster.toast({
          title: "Deckify Audio Engine",
          body:
            value === "spotify_client"
              ? "Switched to Official Spotify Client"
              : "Switched to librespot",
          duration: 3000,
          icon: <FaSpotify />,
        });
        setTimeout(() => {
          backendGetDevices().then((r) => {
            if (r.ok && r.devices && r.devices.length > 0) updateDevices(r.devices);
          });
        }, 2500);
      } else if (
        (key === "device_name" || key === "audio_quality" || key === "bitrate" || key === "normalisation" || key === "gapless" || key === "autoplay")
        && running
      ) {
        setRestartNeeded(true);
      }
    } catch (err) {
      toaster.toast({ title: "Deckify", body: String(err), duration: 5000 });
    }
  }, [running, updateDevices]);

  const handleOAuthStart = useCallback(async () => {
    setOauthLoading(true);
    try {
      const result = await backendStartOAuth();
      if (result.ok && result.landing_url) {
        setQrCodeUrl(result.landing_url);
      } else {
        setOauthLoading(false);
        toaster.toast({
          title: "Deckify",
          body: result.error ?? "Failed to start OAuth",
          duration: 5000,
          icon: <FaMusic />,
        });
      }
    } catch {
      setOauthLoading(false);
    }
  }, []);

  const handleOAuthCancel = useCallback(() => {
    setOauthLoading(false);
    setQrCodeUrl(null);
  }, []);

  const handleLogout = useCallback(async () => {
    await backendLogout();
    setAuthenticated(false);
    setNeedsReauth(false);
    setTrackMeta(null);
    setQrCodeUrl(null);
  }, []);

  const handlePlaybackControl = useCallback(async (action: string) => {
    const result = await backendControlPlayback(action, activeDeviceIdRef.current);
    if (!result.ok) {
      toaster.toast({
        title: "Deckify",
        body: result.error ?? "Playback control failed",
        duration: 3000,
        icon: <FaMusic />,
      });
    }
  }, []);

  const handleSeekChange = useCallback((seconds: number) => {
    const targetMs = seconds * 1000;
    seekingRef.current = true;
    setPositionMs(targetMs);
    if (seekDebounceRef.current) clearTimeout(seekDebounceRef.current);
    seekDebounceRef.current = setTimeout(async () => {
      await backendSeekPlayback(targetMs, activeDeviceIdRef.current);
      setTimeout(() => {
        seekingRef.current = false;
      }, 600);
    }, 350);
  }, []);

  const handleToggleShuffle = useCallback(async () => {
    const nextState = !shuffleState;
    setShuffleState(nextState);
    const res = await backendSetShuffle(nextState, activeDeviceIdRef.current);
    if (!res.ok) {
      setShuffleState(!nextState);
      toaster.toast({ title: "Deckify", body: res.error ?? "Failed to set shuffle", duration: 3000 });
    }
  }, [shuffleState]);

  const handleCycleRepeat = useCallback(async () => {
    const order: Array<"off" | "context" | "track"> = ["off", "context", "track"];
    const nextState = order[(order.indexOf(repeatState) + 1) % order.length];
    const prevState = repeatState;
    setRepeatState(nextState);
    const res = await backendSetRepeat(nextState, activeDeviceIdRef.current);
    if (!res.ok) {
      setRepeatState(prevState);
      toaster.toast({ title: "Deckify", body: res.error ?? "Failed to set repeat", duration: 3000 });
    }
  }, [repeatState]);

  const handleToggleLike = useCallback(async () => {
    if (!trackMeta?.track_id) return;
    const nextLiked = !isLiked;
    setIsLiked(nextLiked);
    const res = await backendToggleLike(trackMeta.track_id, nextLiked);
    if (!res.ok) {
      setIsLiked(!nextLiked);
      toaster.toast({ title: "Deckify", body: res.error ?? "Failed to update Library", duration: 3000 });
    } else {
      toaster.toast({
        title: "Deckify",
        body: nextLiked ? "Added to Liked Songs" : "Removed from Liked Songs",
        duration: 2000,
        icon: <FaSpotify />,
      });
    }
  }, [trackMeta, isLiked]);

  const handleOpenAddToPlaylistForTrack = useCallback(async (uri: string, name: string) => {
    setPendingTrackForPlaylist({ uri, name });
    setQuickTab("add_to_playlist");
    if (playlists.length === 0) {
      setQuickLoading(true);
      try {
        const res = await backendGetPlaylists(0);
        if (res.ok && res.playlists) setPlaylists(res.playlists.slice(0, 25));
      } finally {
        setQuickLoading(false);
      }
    }
  }, [playlists.length]);

  const handleConfirmAddToPlaylist = useCallback(async (pl: PlaylistItem) => {
    if (!pendingTrackForPlaylist) return;
    const res = await backendAddTrackToPlaylist(pl.id, pendingTrackForPlaylist.uri);
    if (res.ok) {
      toaster.toast({
        title: "Added to Playlist",
        body: `Added "${pendingTrackForPlaylist.name}" to ${pl.name}`,
        duration: 2500,
        icon: <FaSpotify />,
      });
      setPendingTrackForPlaylist(null);
      setQuickTab("none");
    } else {
      toaster.toast({
        title: "Deckify",
        body: res.error ?? "Could not add track to playlist",
        duration: 3500,
      });
    }
  }, [pendingTrackForPlaylist]);

  const handleVolumeChange = useCallback((value: number) => {
    setVolume(value);
    volumeChangeSourceRef.current = "user";
    if (volumeDebounceRef.current) clearTimeout(volumeDebounceRef.current);
    volumeDebounceRef.current = setTimeout(async () => {
      await backendSetVolume(value);
      setTimeout(() => {
        volumeChangeSourceRef.current = "remote";
      }, 500);
    }, 300);
  }, []);

  const handleRefreshDevices = useCallback(async () => {
    const result = await backendGetDevices();
    if (result.ok && result.devices && result.devices.length > 0) {
      updateDevices(result.devices);
    }
  }, [updateDevices]);

  const handleTransferPlayback = useCallback(async (opt: { data: string; label: string }) => {
    const result = await backendTransferPlayback(opt.data);
    if (!result.ok) {
      toaster.toast({ title: "Deckify", body: result.error ?? "Transfer failed", duration: 3000, icon: <FaMusic /> });
    } else {
      activeDeviceIdRef.current = opt.data;
      setTimeout(() => handleRefreshDevices(), 1000);
    }
  }, [handleRefreshDevices]);

  const handleRestart = useCallback(async () => {
    await backendStop();
    setLastEvent(null);
    setTrackMeta(null);
    setIsPlaying(false);
    const result = await backendStart();
    if (!result.ok) {
      setError(result.error ?? "Failed to restart");
    }
    setRestartNeeded(false);
  }, []);

  // Quick Browser loaders
  const handleSelectQuickTab = useCallback(async (tab: QuickTab) => {
    if (quickTab === tab) {
      setQuickTab("none");
      return;
    }
    setQuickTab(tab);
    setQuickLoading(true);
    try {
      if (tab === "playlists") {
        const res = await backendGetPlaylists(0);
        if (res.ok && res.playlists) setPlaylists(res.playlists.slice(0, 15));
      } else if (tab === "liked") {
        const res = await backendGetLikedTracks(0);
        if (res.ok && res.tracks) setLikedTracks(res.tracks.slice(0, 15));
      } else if (tab === "queue") {
        const res = await backendGetQueue();
        if (res.ok && res.queue) setQueueTracks(res.queue.slice(0, 15));
      }
    } finally {
      setQuickLoading(false);
    }
  }, [quickTab]);

  const handleRunSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setQuickLoading(true);
    try {
      const res = await backendSearchSpotify(searchQuery.trim(), "track", 0);
      if (res.ok && res.tracks) setSearchResults(res.tracks.slice(0, 10));
    } finally {
      setQuickLoading(false);
    }
  }, [searchQuery]);

  const handleAddToQueue = useCallback(async (uri: string, name: string) => {
    const res = await backendAddToQueue(uri, activeDeviceIdRef.current);
    if (res.ok) {
      toaster.toast({ title: "Queued", body: name, duration: 2000, icon: <FaSpotify /> });
    } else {
      toaster.toast({ title: "Deckify", body: res.error ?? "Could not add to queue", duration: 3000 });
    }
  }, []);

  const handleToggleItemLike = useCallback(async (track: TrackItem) => {
    if (!track.id) return;
    const nextLiked = !track.is_liked;
    const res = await backendToggleLike(track.id, nextLiked);
    if (res.ok) {
      const updateList = (list: TrackItem[]) =>
        list.map((t) => (t.id === track.id ? { ...t, is_liked: res.is_liked } : t));
      setSearchResults(updateList);
      setQueueTracks(updateList);
      setLikedTracks(updateList);
      if (trackMeta?.track_id === track.id) {
        setIsLiked(Boolean(res.is_liked));
      }
    } else {
      toaster.toast({ title: "Deckify", body: res.error ?? "Failed to update Library", duration: 3000 });
    }
  }, [trackMeta]);

  const activeBackend: AudioBackend = settings.audio_backend ?? "librespot";
  const isSpotifyClientBackend = activeBackend === "spotify_client";
  const qualityOptions = isSpotifyClientBackend ? SPOTIFY_CLIENT_QUALITY_OPTIONS : LIBRESPOT_QUALITY_OPTIONS;
  const selectedQuality: AudioQuality =
    !isSpotifyClientBackend && settings.audio_quality === "lossless"
      ? "320"
      : (settings.audio_quality ?? String(settings.bitrate ?? 320) as AudioQuality);

  const playState = lastEvent ? playerEventToLabel(lastEvent.event, isPlaying) : (isPlaying ? "Playing" : "Idle");
  const trackId = lastEvent?.track_id ?? "—";
  const showRichMedia = (authenticated || running) && trackMeta;
  const durationSec = Math.max(1, Math.floor(durationMs / 1000));
  const positionSec = Math.min(durationSec, Math.floor(positionMs / 1000));

  return (
    <>
      <PanelSection title="Deckify">
        {!isSpotifyClientBackend && !binaryFound && (
          <PanelSectionRow>
            <Field
              label="librespot Not Found"
              description="Download the librespot binary from github.com/librespot-org/librespot/releases and place it at plugin/bin/librespot on your Steam Deck."
            >
              <span style={{ color: "#ff4444" }}>Setup Required</span>
            </Field>
          </PanelSectionRow>
        )}

        {isSpotifyClientBackend && !spotifyClientInstalled && (
          <PanelSectionRow>
            <Field
              label="Spotify Client Not Found"
              description="Install Official Spotify Client via: flatpak install --user -y flathub com.spotify.Client"
            >
              <span style={{ color: "#ff4444" }}>Setup Required</span>
            </Field>
          </PanelSectionRow>
        )}

        <PanelSectionRow>
          <ToggleField
            label={isSpotifyClientBackend ? "Official Spotify Client" : "Spotify Connect (librespot)"}
            description={
              running
                ? `Running${audioStreamInfo?.format_label ? ` · ${audioStreamInfo.format_label}` : ""}`
                : "Stopped"
            }
            checked={running}
            disabled={toggling || (!isSpotifyClientBackend && !binaryFound)}
            onChange={handleToggle}
          />
        </PanelSectionRow>

        {error && (
          <PanelSectionRow>
            <Field label="Error">
              <span style={{ color: "#ff4444" }}>{error}</span>
            </Field>
          </PanelSectionRow>
        )}

        {showRichMedia ? (
          <>
            <PanelSectionRow>
              <Field
                label={trackMeta.name}
                description={`${trackMeta.artist}${trackMeta.album ? ` — ${trackMeta.album}` : ""}`}
                icon={
                  trackMeta.artwork_url ? (
                    <img
                      src={trackMeta.artwork_url}
                      width={40}
                      height={40}
                      style={{ borderRadius: 4 }}
                    />
                  ) : (
                    <FaMusic />
                  )
                }
              >
                {playState}
              </Field>
            </PanelSectionRow>
            {durationMs > 0 && (
              <PanelSectionRow>
                <SliderField
                  label={`Position (${formatDuration(positionMs)} / ${formatDuration(durationMs)})`}
                  value={positionSec}
                  min={0}
                  max={durationSec}
                  step={1}
                  onChange={handleSeekChange}
                />
              </PanelSectionRow>
            )}
          </>
        ) : running ? (
          <>
            <PanelSectionRow>
              <Field label="Status">{playState}</Field>
            </PanelSectionRow>
            {lastEvent?.track_id && (
              <PanelSectionRow>
                <Field label="Track ID">
                  <span style={{ fontSize: "0.8em", wordBreak: "break-all" }}>{trackId}</span>
                </Field>
              </PanelSectionRow>
            )}
          </>
        ) : null}

        {authenticated && (
          <>
            <PanelSectionRow>
              <Focusable style={{ display: "flex", justifyContent: "center", gap: "8px", alignItems: "center" }} flow-children="right">
                <DialogButton
                  style={{
                    minWidth: "auto",
                    padding: "8px 11px",
                    color: shuffleState ? "#1DB954" : undefined,
                  }}
                  onClick={(e: MouseEvent) => {
                    (e.currentTarget as HTMLElement).blur();
                    handleToggleShuffle();
                  }}
                >
                  <FaRandom />
                </DialogButton>
                <DialogButton
                  style={{ minWidth: "auto", padding: "10px 14px" }}
                  onClick={(e: MouseEvent) => {
                    (e.currentTarget as HTMLElement).blur();
                    handlePlaybackControl("previous");
                  }}
                >
                  <FaStepBackward />
                </DialogButton>
                <DialogButton
                  style={{ minWidth: "auto", padding: "10px 18px" }}
                  onClick={(e: MouseEvent) => {
                    (e.currentTarget as HTMLElement).blur();
                    handlePlaybackControl(isPlaying ? "pause" : "play");
                  }}
                >
                  {isPlaying ? <FaPause /> : <FaPlay />}
                </DialogButton>
                <DialogButton
                  style={{ minWidth: "auto", padding: "10px 14px" }}
                  onClick={(e: MouseEvent) => {
                    (e.currentTarget as HTMLElement).blur();
                    handlePlaybackControl("next");
                  }}
                >
                  <FaStepForward />
                </DialogButton>
                <DialogButton
                  style={{
                    minWidth: "auto",
                    padding: "8px 11px",
                    color: repeatState !== "off" ? "#1DB954" : undefined,
                    position: "relative",
                  }}
                  onClick={(e: MouseEvent) => {
                    (e.currentTarget as HTMLElement).blur();
                    handleCycleRepeat();
                  }}
                >
                  <FaRedo />
                  {repeatState === "track" && (
                    <span style={{ fontSize: "9px", fontWeight: 700, marginLeft: 2 }}>1</span>
                  )}
                </DialogButton>
                <DialogButton
                  style={{
                    minWidth: "auto",
                    padding: "8px 11px",
                    color: isLiked ? "#1DB954" : undefined,
                  }}
                  disabled={!trackMeta?.track_id}
                  onClick={(e: MouseEvent) => {
                    (e.currentTarget as HTMLElement).blur();
                    handleToggleLike();
                  }}
                >
                  {isLiked ? <FaHeart /> : <FaRegHeart />}
                </DialogButton>
                {trackMeta?.track_id && (
                  <DialogButton
                    style={{
                      minWidth: "auto",
                      padding: "8px 11px",
                    }}
                    onClick={(e: MouseEvent) => {
                      (e.currentTarget as HTMLElement).blur();
                      handleOpenAddToPlaylistForTrack(
                        trackMeta.uri || `spotify:track:${trackMeta.track_id}`,
                        trackMeta.name,
                      );
                    }}
                  >
                    <FaListUl />
                  </DialogButton>
                )}
              </Focusable>
            </PanelSectionRow>

            <PanelSectionRow>
              <SliderField
                label="Volume"
                value={volume}
                min={0}
                max={100}
                step={1}
                showValue
                valueSuffix="%"
                onChange={handleVolumeChange}
              />
            </PanelSectionRow>

            {devices.length > 0 && (
              <PanelSectionRow>
                <DropdownItem
                  label="Device"
                  rgOptions={devices.map((d) => ({
                    data: d.id,
                    label: d.name,
                  }))}
                  selectedOption={devices.find((d) => d.is_active)?.id ?? devices[0]?.id}
                  onChange={handleTransferPlayback}
                />
              </PanelSectionRow>
            )}
            <PanelSectionRow>
              <ButtonItem label="Refresh Devices" onClick={handleRefreshDevices}>
                Refresh
              </ButtonItem>
            </PanelSectionRow>
          </>
        )}
      </PanelSection>

      {authenticated && (
        <PanelSection title="Quick Library & Queue">
          <PanelSectionRow>
            <Focusable style={{ display: "flex", gap: "6px", justifyContent: "space-between" }} flow-children="right">
              {(["playlists", "liked", "queue", "search"] as QuickTab[]).map((tab) => (
                <DialogButton
                  key={tab}
                  style={{
                    minWidth: "auto",
                    flex: 1,
                    padding: "6px 8px",
                    fontSize: "12px",
                    background: quickTab === tab ? "#1DB954" : undefined,
                    color: quickTab === tab ? "#000" : undefined,
                    fontWeight: quickTab === tab ? 700 : 500,
                  }}
                  onClick={() => handleSelectQuickTab(tab)}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </DialogButton>
              ))}
            </Focusable>
          </PanelSectionRow>

          {quickLoading && (
            <PanelSectionRow>
              <Field label="Loading..." />
            </PanelSectionRow>
          )}

          {!quickLoading && quickTab === "add_to_playlist" && pendingTrackForPlaylist && (
            <>
              <PanelSectionRow>
                <Field
                  label={`Add "${pendingTrackForPlaylist.name}" to:`}
                  description="Select a playlist below"
                />
              </PanelSectionRow>
              {playlists.map((pl) => (
                <PanelSectionRow key={pl.id}>
                  <ButtonItem
                    label={pl.name}
                    description={`${pl.track_count} tracks`}
                    onClick={() => handleConfirmAddToPlaylist(pl)}
                  >
                    Add
                  </ButtonItem>
                </PanelSectionRow>
              ))}
              <PanelSectionRow>
                <ButtonItem label="Cancel" onClick={() => { setPendingTrackForPlaylist(null); setQuickTab("none"); }}>
                  Cancel
                </ButtonItem>
              </PanelSectionRow>
            </>
          )}

          {!quickLoading && quickTab === "playlists" && (
            <>
              {playlists.map((pl) => (
                <PanelSectionRow key={pl.id}>
                  <ButtonItem
                    label={pl.name}
                    description={`${pl.track_count} tracks`}
                    onClick={() => backendPlayTracks(`spotify:playlist:${pl.id}`, null, null, 0)}
                  >
                    Play
                  </ButtonItem>
                </PanelSectionRow>
              ))}
            </>
          )}

          {!quickLoading && quickTab === "liked" && (
            <>
              {likedTracks.length > 0 && (
                <PanelSectionRow>
                  <ButtonItem
                    label="Play All Liked Songs"
                    onClick={() => backendPlayTracks(null, null, likedTracks.map((t) => t.uri), 0)}
                  >
                    Play Liked
                  </ButtonItem>
                </PanelSectionRow>
              )}
              {likedTracks.slice(0, 8).map((t, idx) => (
                <PanelSectionRow key={t.uri + idx}>
                  <Focusable style={{ display: "flex", alignItems: "center", gap: "6px", width: "100%" }} flow-children="right">
                    <DialogButton
                      style={{ flex: 1, textAlign: "left", padding: "6px 10px", fontSize: "12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      onClick={() => backendPlayTracks(null, null, likedTracks.map((x) => x.uri), idx)}
                    >
                      {t.name} — {t.artist}
                    </DialogButton>
                    <DialogButton
                      style={{ minWidth: "auto", padding: "6px 9px", fontSize: "11px" }}
                      onClick={() => handleOpenAddToPlaylistForTrack(t.uri, t.name)}
                    >
                      <FaListUl />
                    </DialogButton>
                    <DialogButton
                      style={{ minWidth: "auto", padding: "6px 10px", fontSize: "11px" }}
                      onClick={() => handleAddToQueue(t.uri, t.name)}
                    >
                      <FaPlus />
                    </DialogButton>
                  </Focusable>
                </PanelSectionRow>
              ))}
            </>
          )}

          {!quickLoading && quickTab === "queue" && (
            <>
              {queueTracks.length === 0 ? (
                <PanelSectionRow>
                  <Field label="Queue is empty" />
                </PanelSectionRow>
              ) : (
                queueTracks.slice(0, 8).map((t, idx) => (
                  <PanelSectionRow key={t.uri + idx}>
                    <ButtonItem
                      label={t.name}
                      description={t.artist}
                      onClick={() => backendPlayTracks(null, null, [t.uri], 0)}
                    >
                      Play
                    </ButtonItem>
                  </PanelSectionRow>
                ))
              )}
            </>
          )}

          {quickTab === "search" && (
            <>
              <PanelSectionRow>
                <TextField
                  label="Search Spotify"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </PanelSectionRow>
              <PanelSectionRow>
                <ButtonItem label="Search Tracks" onClick={handleRunSearch}>
                  Search
                </ButtonItem>
              </PanelSectionRow>
              {!quickLoading &&
                searchResults.map((t, idx) => (
                  <PanelSectionRow key={t.uri + idx}>
                    <Focusable style={{ display: "flex", alignItems: "center", gap: "6px", width: "100%" }} flow-children="right">
                      <DialogButton
                        style={{ flex: 1, textAlign: "left", padding: "6px 10px", fontSize: "12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        onClick={() => backendPlayTracks(null, null, [t.uri], 0)}
                      >
                        {t.name} — {t.artist}
                      </DialogButton>
                      <DialogButton
                        style={{ minWidth: "auto", padding: "6px 9px", fontSize: "11px", color: t.is_liked ? "#1DB954" : undefined }}
                        onClick={() => handleToggleItemLike(t)}
                      >
                        {t.is_liked ? <FaHeart /> : <FaRegHeart />}
                      </DialogButton>
                      <DialogButton
                        style={{ minWidth: "auto", padding: "6px 9px", fontSize: "11px" }}
                        onClick={() => handleOpenAddToPlaylistForTrack(t.uri, t.name)}
                      >
                        <FaListUl />
                      </DialogButton>
                      <DialogButton
                        style={{ minWidth: "auto", padding: "6px 10px", fontSize: "11px" }}
                        onClick={() => handleAddToQueue(t.uri, t.name)}
                      >
                        <FaPlus />
                      </DialogButton>
                    </Focusable>
                  </PanelSectionRow>
                ))}
            </>
          )}
        </PanelSection>
      )}

      <PanelSection title="Audio Engine & Quality">
        <PanelSectionRow>
          <DropdownItem
            label="Audio Engine"
            description="Official Spotify Client unlocks Lossless FLAC & native Spotify Playlist Mixing. Switching cleanly stops the other engine."
            rgOptions={AUDIO_BACKEND_OPTIONS}
            selectedOption={activeBackend}
            onChange={(opt) => handleSettingChange("audio_backend", opt.data)}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <DropdownItem
            label="Audio Quality"
            description={
              isSpotifyClientBackend
                ? "Lossless streams up to 24-bit / 44.1 kHz FLAC via PipeWire"
                : "Lossless is only available when using the Official Spotify Client engine"
            }
            rgOptions={qualityOptions}
            selectedOption={selectedQuality}
            onChange={(opt) => handleSettingChange("audio_quality", opt.data)}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <ToggleField
            label="Volume Normalization"
            description="Play all tracks at matched loudness"
            checked={settings.normalisation ?? true}
            onChange={(checked) => handleSettingChange("normalisation", checked)}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <ToggleField
            label="Gapless Playback"
            description="Seamless zero-gap transitions between tracks"
            checked={settings.gapless ?? true}
            onChange={(checked) => handleSettingChange("gapless", checked)}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <ToggleField
            label="Autoplay Similar Music"
            description="Continue playing similar music when a playlist ends"
            checked={settings.autoplay ?? true}
            onChange={(checked) => handleSettingChange("autoplay", checked)}
          />
        </PanelSectionRow>
      </PanelSection>

      <PanelSection title="Spotify Account">
        {authenticated && needsReauth && (
          <PanelSectionRow>
            <ButtonItem
              label="Reconnect Required"
              description="New features (Add to Playlist & Like) need updated permissions."
              onClick={handleOAuthStart}
            >
              {oauthLoading ? "Waiting..." : "Reconnect"}
            </ButtonItem>
          </PanelSectionRow>
        )}
        {qrCodeUrl ? (
          <>
            <PanelSectionRow>
              <Field
                label="Scan with Phone"
                description="Scan this QR code to login with Spotify"
              >
                <></>
              </Field>
            </PanelSectionRow>
            <PanelSectionRow>
              <div style={{ display: "flex", justifyContent: "center", padding: "8px 0" }}>
                <QRCodeSVG value={qrCodeUrl} size={160} bgColor="#1a1a2e" fgColor="#ffffff" />
              </div>
            </PanelSectionRow>
            <PanelSectionRow>
              <ButtonItem label="Cancel" onClick={handleOAuthCancel}>
                Cancel
              </ButtonItem>
            </PanelSectionRow>
          </>
        ) : (
          <PanelSectionRow>
            {authenticated ? (
              <ButtonItem label="Connected" description="Spotify account linked" onClick={handleLogout}>
                Disconnect
              </ButtonItem>
            ) : (
              <ButtonItem
                label="Spotify Login"
                description="Scan QR code on your phone to connect"
                disabled={oauthLoading}
                onClick={handleOAuthStart}
              >
                {oauthLoading ? "Waiting..." : "Connect"}
              </ButtonItem>
            )}
          </PanelSectionRow>
        )}
        <PanelSectionRow>
          <ButtonItem
            label="Dashboard"
            description="Open full-screen Spotify console view"
            onClick={() => {
              openExpandedView();
            }}
          >
            Open Dashboard
          </ButtonItem>
        </PanelSectionRow>
      </PanelSection>

      <PanelSection title="Gaming & Auto-Ducking">
        <PanelSectionRow>
          <ToggleField
            label="In-Game Auto-Ducking"
            description="Automatically lowers music volume while a game is running."
            checked={settings.auto_ducking ?? true}
            onChange={(checked) => handleSettingChange("auto_ducking", checked)}
          />
        </PanelSectionRow>
        {(settings.auto_ducking ?? true) && (
          <PanelSectionRow>
            <SliderField
              label="Ducked Game Volume"
              value={settings.auto_ducking_volume ?? 30}
              min={5}
              max={100}
              step={5}
              onChange={(value) => handleSettingChange("auto_ducking_volume", value)}
            />
          </PanelSectionRow>
        )}
        <PanelSectionRow>
          <ToggleField
            label="In-Game Track Change Toasts"
            description="Show toast notification with song & artist on track change."
            checked={settings.toast_enabled ?? true}
            onChange={(checked) => handleSettingChange("toast_enabled", checked)}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <ToggleField
            label="Gamepad Global Chords"
            description="Use STEAM + D-Pad Left/Right to skip tracks during games."
            checked={settings.gamepad_chords_enabled ?? true}
            onChange={(checked) => handleSettingChange("gamepad_chords_enabled", checked)}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <ToggleField
            label="In-Game HUD Overlay"
            description="Display an on-screen mini player overlay while playing games."
            checked={settings.overlay_enabled ?? false}
            onChange={(checked) => handleSettingChange("overlay_enabled", checked)}
          />
        </PanelSectionRow>
      </PanelSection>

      <PanelSection title="Settings">
        <PanelSectionRow>
          <TextField
            label="Device name"
            description="Spotify Connect name. Leave empty to use the system hostname."
            value={deviceName}
            disabled={savingDeviceName}
            onChange={(event) => setDeviceName(event.target.value)}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <ButtonItem
            label="Save device name"
            disabled={savingDeviceName || deviceName === settings.device_name}
            onClick={async () => {
              setSavingDeviceName(true);
              try {
                await handleSettingChange("device_name", deviceName);
              } finally {
                setSavingDeviceName(false);
              }
            }}
          >
            Save
          </ButtonItem>
        </PanelSectionRow>
        {restartNeeded && (
          <PanelSectionRow>
            <ButtonItem
              label="Restart Required"
              description="Settings changed. Restart audio engine to apply."
              onClick={handleRestart}
            >
              Restart Now
            </ButtonItem>
          </PanelSectionRow>
        )}
      </PanelSection>
    </>
  );
};

let bigOpen = false;
const openExpandedView = () => {
  if (bigOpen) return;
  bigOpen = true;
  showModal(
    <DeckifyExpandedModal
      closeModal={() => {
        bigOpen = false;
      }}
    />
  );
};

const DeckifyRouteOpener: FC = () => {
  useEffect(() => {
    try {
      Navigation.NavigateBack();
    } catch {}
    const id = setTimeout(openExpandedView, 120);
    return () => clearTimeout(id);
  }, []);
  return null;
};

export default definePlugin(() => {
  console.log("Deckify initializing");

  // 1. Register native full-screen route
  routerHook.addRoute("/deckify", DeckifyRouteOpener);

  // 2. Patch Steam Main Menu (STEAM button) to add Spotify entry
  const unregisterMenu = registerSteamMenu({
    id: "deckify",
    label: "Spotify",
    route: "/deckify",
    icon: <FaSpotify size={18} color="#1db954" />,
    order: 3,
  });

  // 3. Fallback controller bridge for external browser view
  try {
    const win = window as any;
    const fc = win.FocusNavController;
    const src = fc?.m_rgGamepadInputSources?.[0];
    if (src?.RegisterForGamepadButtonDown && !win.__deckify_steam_gamepad_bridge_installed) {
      win.__deckify_steam_gamepad_bridge_installed = true;
      const buttonMap: Record<number, string> = {
        1: "a",
        2: "b",
        3: "x",
        4: "y",
        5: "lb",
        6: "rb",
        7: "lt",
        8: "rt",
        9: "up",
        10: "down",
        11: "left",
        12: "right",
        13: "select",
        14: "start",
      };
      src.RegisterForGamepadButtonDown((btn: number, _srcType: number, _ctrlIdx: number, isRepeat: boolean) => {
        const isDir = btn >= 9 && btn <= 12;
        if (isRepeat && !isDir) return;
        const mapped = buttonMap[btn];
        if (!mapped) return;
        fetch("http://127.0.0.1:39282/api/gamepad/push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ events: [mapped] }),
        }).catch(() => {
          backendPushGamepadEvent([mapped]).catch(() => {});
        });
      });
    }
  } catch (err) {
    console.warn("Deckify gamepad bridge init failed:", err);
  }

  // 4. In-game track change toast notification
  let lastToastTrackId = "";
  const trackSub = addEventListener<[any]>("track_metadata", async (meta: any) => {
    if (!meta || !meta.name || meta.track_id === lastToastTrackId) return;
    lastToastTrackId = meta.track_id;
    try {
      const curStatus = await backendGetStatus().catch(() => null);
      if (curStatus?.settings?.toast_enabled === false) return;
      const artwork = meta.artwork_url || meta.image_url;
      toaster.toast({
        title: meta.name,
        body: meta.artist ? `${meta.artist}` : "Deckify",
        duration: 3500,
        logo: artwork ? (
          <img src={artwork} width={28} height={28} style={{ borderRadius: 4, objectFit: "cover" }} />
        ) : (
          <FaSpotify color="#1db954" />
        ),
      });
    } catch {}
  });

  // 5. In-game Auto-Ducking & App Lifetime Listener
  let originalVolumeBeforeGame: number | null = null;
  let activeGameAppId: number | null = null;
  let appLifetimeSub: any = null;
  try {
    const steamApps = (window as any).SteamClient?.Apps;
    if (steamApps?.RegisterForAppLifetimeNotifications) {
      appLifetimeSub = steamApps.RegisterForAppLifetimeNotifications(async (ev: any) => {
        if (!ev) return;
        const appId = ev.unAppID || ev.nAppID;
        const running = Boolean(ev.bRunning);
        if (running && appId) {
          activeGameAppId = appId;
          const status = await backendGetStatus().catch(() => null);
          if (!status) return;
          const ducking = status.settings?.auto_ducking ?? true;
          const duckVol = status.settings?.auto_ducking_volume ?? 30;
          if (ducking && status.volume != null && status.volume > duckVol) {
            originalVolumeBeforeGame = status.volume;
            await backendSetVolume(duckVol);
          }
        } else if (!running && activeGameAppId) {
          activeGameAppId = null;
          if (originalVolumeBeforeGame != null) {
            await backendSetVolume(originalVolumeBeforeGame);
            originalVolumeBeforeGame = null;
          }
        }
      });
    }
  } catch (err) {
    console.debug("Deckify: AppLifetimeNotifications not available", err);
  }

  return {
    name: "Deckify",
    titleView: <div className={staticClasses.Title}>Deckify</div>,
    content: <Content />,
    icon: <FaMusic />,
    onDismount() {
      console.log("Deckify dismounting");
      try {
        if (appLifetimeSub?.unregister) {
          appLifetimeSub.unregister();
        }
        unregisterMenu();
        routerHook.removeRoute("/deckify");
        removeEventListener("track_metadata", trackSub);
      } catch (e) {
        console.warn("Deckify dismount cleanup error:", e);
      }
    },
  };
});
