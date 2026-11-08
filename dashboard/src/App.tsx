import { useEffect, useState, useRef, useCallback } from "react";
import {
  FaPlay,
  FaPause,
  FaStepBackward,
  FaStepForward,
  FaVolumeUp,
  FaBars,
  FaSearch,
  FaRandom,
  FaRedo,
  FaHeart,
  FaRegHeart,
  FaListUl,
  FaSlidersH,
  FaDesktop,
  FaTimes,
  FaPlus,
  FaGamepad,
  FaWindowMaximize,
} from "react-icons/fa";
import {
  fetchStatus,
  controlPlayback,
  setVolume,
  seekPlayback,
  setShuffle,
  setRepeat,
  toggleLikeTrack,
  fetchQueue,
  fetchDevices,
  transferPlayback,
  updateEngineSettings,
  fetchPlaylists,
  addTrackToPlaylist,
  fetchClientWindowStatus,
  getClientWindowScreenshotUrl,
  sendClientWindowInput,
  playUris,
  type StatusResponse,
  type PlaylistTrack,
  type Playlist,
  type SpotifyDevice,
  type EngineSettings,
  type AudioBackend,
  type AudioQuality,
} from "./api";
import Sidebar from "./Sidebar";
import SearchOverlay from "./SearchOverlay";
import { formatMs } from "./utils";

export default function App() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [localVolume, setLocalVolume] = useState<number>(50);
  const [progress, setProgress] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [enginePanelOpen, setEnginePanelOpen] = useState(false);
  const [devicesOpen, setDevicesOpen] = useState(false);
  const [clientWindowOpen, setClientWindowOpen] = useState(false);
  const [queueItems, setQueueItems] = useState<PlaylistTrack[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [devices, setDevices] = useState<SpotifyDevice[]>([]);
  const [engineSettings, setEngineSettings] = useState<EngineSettings>({
    audio_backend: "librespot",
    audio_quality: "320",
    bitrate: 320,
    normalisation: true,
    gapless: true,
    autoplay: true,
    spotify_client_installed: true,
  });
  const [switchingEngine, setSwitchingEngine] = useState(false);

  // Add to Playlist modal state
  const [addPlaylistTarget, setAddPlaylistTarget] = useState<{
    uri: string;
    name: string;
    artist?: string;
  } | null>(null);
  const [userPlaylists, setUserPlaylists] = useState<Playlist[]>([]);
  const [loadingUserPlaylists, setLoadingUserPlaylists] = useState(false);
  const [playlistFilter, setPlaylistFilter] = useState("");

  // Official Spotify Client Remote Window state
  const [clientScreenBust, setClientScreenBust] = useState<number>(Date.now());
  const [clientWindowRunning, setClientWindowRunning] = useState(false);
  const [clientWindowTitle, setClientWindowTitle] = useState("");
  const [clientTextInput, setClientTextInput] = useState("");

  // Gamepad state
  const [gamepadConnected, setGamepadConnected] = useState(false);
  const focusedElRef = useRef<HTMLElement | null>(null);

  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const anchorRef = useRef<{ positionMs: number; startTime: number; durationMs: number } | null>(null);
  const volumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const volumeDragging = useRef(false);
  const seekingRef = useRef(false);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  }, []);

  // Poll /api/status
  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const s = await fetchStatus();
        if (!active) return;
        setStatus(s);
        if (s.engine_settings) {
          setEngineSettings(s.engine_settings);
        }

        const dur = s.track?.duration_ms ?? 0;
        if (!seekingRef.current) {
          if (dur > 0) {
            anchorRef.current = { positionMs: s.position_ms, startTime: Date.now(), durationMs: dur };
          } else {
            anchorRef.current = null;
            setProgress(0);
          }
        }

        if (s.volume !== null && !volumeDragging.current) {
          setLocalVolume(s.volume);
        }
        setError(null);
      } catch (e) {
        console.error("Status poll failed:", e);
        if (active) setError("Cannot reach backend");
      }
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  // Progress tick
  useEffect(() => {
    if (!status?.is_playing) return;
    const id = setInterval(() => {
      if (seekingRef.current) return;
      const a = anchorRef.current;
      if (!a || a.durationMs <= 0) return;
      const current = a.positionMs + (Date.now() - a.startTime);
      setProgress(Math.min(current / a.durationMs, 1));
    }, 250);
    return () => clearInterval(id);
  }, [status?.is_playing]);

  // Sync progress when paused
  useEffect(() => {
    if (status && !status.is_playing && !seekingRef.current) {
      const a = anchorRef.current;
      if (a && a.durationMs > 0) {
        setProgress(Math.min(a.positionMs / a.durationMs, 1));
      }
    }
  }, [status]);

  // Poll Official Spotify Client Remote Window when open
  useEffect(() => {
    if (!clientWindowOpen) return;
    let active = true;
    const refreshWindow = async () => {
      try {
        const st = await fetchClientWindowStatus();
        if (!active) return;
        setClientWindowRunning(st.running);
        setClientWindowTitle(st.title || "Official Spotify Client");
        if (st.running) {
          setClientScreenBust(Date.now());
        }
      } catch {
        if (active) setClientWindowRunning(false);
      }
    };
    refreshWindow();
    const timer = setInterval(refreshWindow, 1200);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [clientWindowOpen]);

  const handleControl = useCallback(async (action: string) => {
    try {
      await controlPlayback(action);
    } catch (e) {
      console.error("Playback control failed:", e);
    }
    setTimeout(async () => {
      try {
        const s = await fetchStatus();
        setStatus(s);
      } catch (e) {
        console.error("Re-poll failed:", e);
      }
    }, 500);
  }, []);

  const handleSeekInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const ratio = Number(e.target.value) / 1000;
    const dur = status?.track?.duration_ms ?? 0;
    if (dur <= 0) return;
    seekingRef.current = true;
    setProgress(ratio);
    const targetMs = Math.round(ratio * dur);
    anchorRef.current = { positionMs: targetMs, startTime: Date.now(), durationMs: dur };
  }, [status?.track?.duration_ms]);

  const handleSeekCommit = useCallback(async () => {
    const dur = status?.track?.duration_ms ?? 0;
    if (dur <= 0) {
      seekingRef.current = false;
      return;
    }
    const targetMs = Math.round(progress * dur);
    try {
      await seekPlayback(targetMs);
      anchorRef.current = { positionMs: targetMs, startTime: Date.now(), durationMs: dur };
    } catch (e) {
      console.error("Seek failed:", e);
    } finally {
      setTimeout(() => {
        seekingRef.current = false;
      }, 400);
    }
  }, [progress, status?.track?.duration_ms]);

  const handleToggleShuffle = useCallback(async () => {
    const next = !status?.shuffle_state;
    setStatus((prev) => (prev ? { ...prev, shuffle_state: next } : prev));
    try {
      const res = await setShuffle(next);
      if (!res.ok) throw new Error(res.error);
      showToast(next ? "Shuffle On" : "Shuffle Off");
    } catch {
      setStatus((prev) => (prev ? { ...prev, shuffle_state: !next } : prev));
    }
  }, [status?.shuffle_state, showToast]);

  const handleCycleRepeat = useCallback(async () => {
    const order: Array<"off" | "context" | "track"> = ["off", "context", "track"];
    const curr = status?.repeat_state ?? "off";
    const next = order[(order.indexOf(curr) + 1) % order.length];
    setStatus((prev) => (prev ? { ...prev, repeat_state: next } : prev));
    try {
      const res = await setRepeat(next);
      if (!res.ok) throw new Error(res.error);
      showToast(`Repeat: ${next === "off" ? "Off" : next === "context" ? "All" : "One"}`);
    } catch {
      setStatus((prev) => (prev ? { ...prev, repeat_state: curr } : prev));
    }
  }, [status?.repeat_state, showToast]);

  const handleToggleLike = useCallback(async () => {
    const trackId = status?.track?.track_id;
    if (!trackId) return;
    const nextLiked = !(status?.is_liked ?? status?.track?.is_liked ?? false);
    setStatus((prev) =>
      prev
        ? {
            ...prev,
            is_liked: nextLiked,
            track: prev.track ? { ...prev.track, is_liked: nextLiked } : null,
          }
        : prev,
    );
    try {
      const res = await toggleLikeTrack(trackId, nextLiked);
      if (!res.ok) throw new Error(res.error);
      showToast(nextLiked ? "Added to Liked Songs" : "Removed from Liked Songs");
    } catch {
      setStatus((prev) => (prev ? { ...prev, is_liked: !nextLiked } : prev));
    }
  }, [status?.track?.track_id, status?.is_liked, status?.track?.is_liked, showToast]);

  const handleOpenAddToPlaylist = useCallback(
    async (target: { uri: string; name: string; artist?: string }) => {
      setAddPlaylistTarget(target);
      setPlaylistFilter("");
      setLoadingUserPlaylists(true);
      try {
        const res = await fetchPlaylists(0);
        if (res.ok) {
          setUserPlaylists(res.playlists || []);
        }
      } catch (e) {
        console.error("Failed to fetch playlists:", e);
      } finally {
        setLoadingUserPlaylists(false);
      }
    },
    [],
  );

  const handleConfirmAddTrackToPlaylist = useCallback(
    async (pl: Playlist) => {
      if (!addPlaylistTarget) return;
      try {
        const res = await addTrackToPlaylist(pl.id, addPlaylistTarget.uri);
        if (res.ok) {
          showToast(`Added "${addPlaylistTarget.name}" to ${pl.name}`);
          setAddPlaylistTarget(null);
        } else {
          showToast(res.error || "Failed to add to playlist");
        }
      } catch (e) {
        showToast(String(e));
      }
    },
    [addPlaylistTarget, showToast],
  );

  const handleOpenQueue = useCallback(async () => {
    const nextOpen = !queueOpen;
    setQueueOpen(nextOpen);
    setEnginePanelOpen(false);
    setDevicesOpen(false);
    if (nextOpen) {
      setLoadingQueue(true);
      try {
        const res = await fetchQueue();
        if (res.ok) setQueueItems(res.queue || []);
      } catch (e) {
        console.error("Failed to fetch queue:", e);
      } finally {
        setLoadingQueue(false);
      }
    }
  }, [queueOpen]);

  const handleOpenDevices = useCallback(async () => {
    const nextOpen = !devicesOpen;
    setDevicesOpen(nextOpen);
    setQueueOpen(false);
    setEnginePanelOpen(false);
    if (nextOpen) {
      try {
        const res = await fetchDevices();
        if (res.ok) setDevices(res.devices || []);
      } catch (e) {
        console.error("Failed to load devices:", e);
      }
    }
  }, [devicesOpen]);

  const handleSelectDevice = useCallback(async (deviceId: string, name: string) => {
    try {
      const res = await transferPlayback(deviceId);
      if (res.ok) {
        showToast(`Transferred to ${name}`);
        setDevicesOpen(false);
      }
    } catch (e) {
      console.error("Device transfer failed:", e);
    }
  }, [showToast]);

  const handleEngineSettingChange = useCallback(
    async (patch: Partial<EngineSettings>) => {
      setSwitchingEngine(true);
      try {
        const res = await updateEngineSettings(patch);
        if (res.ok) {
          setEngineSettings((prev) => ({
            ...prev,
            audio_backend: (res.audio_backend as AudioBackend) ?? prev.audio_backend,
            audio_quality: (res.audio_quality as AudioQuality) ?? prev.audio_quality,
            bitrate: res.bitrate ?? prev.bitrate,
            normalisation: res.normalisation ?? prev.normalisation,
            gapless: res.gapless ?? prev.gapless,
            autoplay: res.autoplay ?? prev.autoplay,
          }));
          if (patch.audio_backend) {
            showToast(
              patch.audio_backend === "spotify_client"
                ? "Switched to Official Spotify Client"
                : "Switched to librespot",
            );
          } else if (patch.audio_quality) {
            showToast(
              patch.audio_quality === "lossless"
                ? "Audio Quality: Lossless FLAC"
                : `Audio Quality: ${patch.audio_quality} kbps`,
            );
          }
        } else {
          showToast(res.error || "Failed to update setting");
        }
      } catch (e) {
        showToast(String(e));
      } finally {
        setSwitchingEngine(false);
      }
    },
    [showToast],
  );

  const handleVolumeStep = useCallback(
    async (delta: number) => {
      const next = Math.max(0, Math.min(100, localVolume + delta));
      setLocalVolume(next);
      await setVolume(next);
      showToast(`Volume: ${next}%`);
    },
    [localVolume, showToast],
  );

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setLocalVolume(val);
    volumeDragging.current = true;
    if (volumeTimeoutRef.current) clearTimeout(volumeTimeoutRef.current);
    volumeTimeoutRef.current = setTimeout(async () => {
      await setVolume(val);
      volumeDragging.current = false;
    }, 300);
  }, []);

  const handleClientCanvasClick = useCallback(
    async (e: React.MouseEvent<HTMLImageElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const scaleX = 1280 / rect.width;
      const scaleY = 800 / rect.height;
      const x = Math.round((e.clientX - rect.left) * scaleX);
      const y = Math.round((e.clientY - rect.top) * scaleY);
      await sendClientWindowInput({ action: "click", x, y });
      setTimeout(() => setClientScreenBust(Date.now()), 350);
    },
    [],
  );

  const handleClientSendText = useCallback(async () => {
    if (!clientTextInput) return;
    await sendClientWindowInput({ action: "text", text: clientTextInput });
    setClientTextInput("");
    setTimeout(() => setClientScreenBust(Date.now()), 350);
  }, [clientTextInput]);

  // ── HTML5 Gamepad / Controller Navigation ────────────────────
  useEffect(() => {
    const onConnect = () => setGamepadConnected(true);
    const onDisconnect = () => {
      const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : [];
      setGamepadConnected(pads.length > 0);
    };
    window.addEventListener("gamepadconnected", onConnect);
    window.addEventListener("gamepaddisconnected", onDisconnect);

    let rafId = 0;
    let lastMoveTime = 0;
    const prevButtons: Record<number, boolean> = {};

    const getVisibleFocusableElements = (): HTMLElement[] => {
      // Scope to topmost active modal/drawer so focus doesn't jump behind modals
      let scopeRoot: ParentNode = document;
      const modalEl = document.querySelector("[data-modal-scope='true']");
      if (modalEl) {
        scopeRoot = modalEl;
      }
      const candidates = Array.from(scopeRoot.querySelectorAll<HTMLElement>("[data-focusable='true']"));
      return candidates.filter((el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
    };

    const setGamepadFocus = (el: HTMLElement | null) => {
      if (focusedElRef.current && focusedElRef.current !== el) {
        focusedElRef.current.removeAttribute("data-gamepad-focused");
      }
      focusedElRef.current = el;
      if (el) {
        el.setAttribute("data-gamepad-focused", "true");
        el.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    };

    const moveFocus = (dir: "up" | "down" | "left" | "right") => {
      const elements = getVisibleFocusableElements();
      if (elements.length === 0) return;

      const current = focusedElRef.current;
      if (!current || !elements.includes(current)) {
        setGamepadFocus(elements[0]);
        return;
      }

      const curRect = current.getBoundingClientRect();
      const curCx = curRect.left + curRect.width / 2;
      const curCy = curRect.top + curRect.height / 2;

      let bestEl: HTMLElement | null = null;
      let bestScore = Infinity;

      for (const el of elements) {
        if (el === current) continue;
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const dx = cx - curCx;
        const dy = cy - curCy;

        if (dir === "up" && dy >= -4) continue;
        if (dir === "down" && dy <= 4) continue;
        if (dir === "left" && dx >= -4) continue;
        if (dir === "right" && dx <= 4) continue;

        const primary = dir === "up" || dir === "down" ? Math.abs(dy) : Math.abs(dx);
        const secondary = dir === "up" || dir === "down" ? Math.abs(dx) : Math.abs(dy);
        const score = primary + secondary * 2.2;
        if (score < bestScore) {
          bestScore = score;
          bestEl = el;
        }
      }

      if (!bestEl) {
        const idx = elements.indexOf(current);
        if (dir === "down" || dir === "right") {
          bestEl = elements[(idx + 1) % elements.length];
        } else {
          bestEl = elements[(idx - 1 + elements.length) % elements.length];
        }
      }
      setGamepadFocus(bestEl);
    };

    const triggerBack = () => {
      if (addPlaylistTarget) {
        setAddPlaylistTarget(null);
      } else if (clientWindowOpen) {
        setClientWindowOpen(false);
      } else if (enginePanelOpen) {
        setEnginePanelOpen(false);
      } else if (devicesOpen) {
        setDevicesOpen(false);
      } else if (queueOpen) {
        setQueueOpen(false);
      } else if (searchOpen) {
        setSearchOpen(false);
      } else if (sidebarOpen) {
        setSidebarOpen(false);
      }
    };

    const triggerLikeOnFocusedOrCurrent = async () => {
      const focused = focusedElRef.current;
      const focusedTrackId = focused?.getAttribute("data-track-id");
      const focusedTrackName = focused?.getAttribute("data-track-name");
      if (focusedTrackId) {
        const res = await toggleLikeTrack(focusedTrackId);
        if (res.ok) {
          showToast(res.is_liked ? `Liked "${focusedTrackName || "Track"}"` : `Unliked "${focusedTrackName || "Track"}"`);
        }
        return;
      }
      handleToggleLike();
    };

    const triggerAddToPlaylistOnFocusedOrCurrent = () => {
      const focused = focusedElRef.current;
      const focusedUri = focused?.getAttribute("data-track-uri");
      const focusedName = focused?.getAttribute("data-track-name");
      if (focusedUri && focusedName) {
        handleOpenAddToPlaylist({ uri: focusedUri, name: focusedName });
        return;
      }
      if (status?.track?.track_id) {
        handleOpenAddToPlaylist({
          uri: status.track.uri || `spotify:track:${status.track.track_id}`,
          name: status.track.name,
          artist: status.track.artist,
        });
      }
    };

    const pollGamepad = () => {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      const gp = pads[0] || pads[1] || pads[2] || pads[3];
      if (gp) {
        if (!gamepadConnected) setGamepadConnected(true);
        const now = performance.now();

        const isPressed = (idx: number) => Boolean(gp.buttons[idx]?.pressed);
        const justPressed = (idx: number) => isPressed(idx) && !prevButtons[idx];

        // D-Pad (12=Up, 13=Down, 14=Left, 15=Right) + Left Stick (axes 0, 1)
        const stickX = gp.axes[0] ?? 0;
        const stickY = gp.axes[1] ?? 0;
        if (now - lastMoveTime > 190) {
          if (isPressed(12) || stickY < -0.55) {
            moveFocus("up");
            lastMoveTime = now;
          } else if (isPressed(13) || stickY > 0.55) {
            moveFocus("down");
            lastMoveTime = now;
          } else if (isPressed(14) || stickX < -0.55) {
            moveFocus("left");
            lastMoveTime = now;
          } else if (isPressed(15) || stickX > 0.55) {
            moveFocus("right");
            lastMoveTime = now;
          }
        }

        // A (0): Activate focused element
        if (justPressed(0)) {
          if (focusedElRef.current) {
            focusedElRef.current.click();
          } else {
            moveFocus("down");
          }
        }
        // B (1): Back / Close modal
        if (justPressed(1)) {
          triggerBack();
        }
        // X (2): Like focused or current track
        if (justPressed(2)) {
          triggerLikeOnFocusedOrCurrent();
        }
        // Y (3): Add to Playlist for focused or current track
        if (justPressed(3)) {
          triggerAddToPlaylistOnFocusedOrCurrent();
        }
        // LB (4): Previous track
        if (justPressed(4)) {
          handleControl("previous");
        }
        // RB (5): Next track
        if (justPressed(5)) {
          handleControl("next");
        }
        // LT (6): Volume -5%
        if (justPressed(6)) {
          handleVolumeStep(-5);
        }
        // RT (7): Volume +5%
        if (justPressed(7)) {
          handleVolumeStep(5);
        }
        // Select / View (8): Toggle Sidebar or Search
        if (justPressed(8)) {
          setSidebarOpen((v) => !v);
        }
        // Start / Menu (9): Play / Pause
        if (justPressed(9)) {
          handleControl(status?.is_playing ? "pause" : "play");
        }

        for (let i = 0; i < gp.buttons.length; i++) {
          prevButtons[i] = Boolean(gp.buttons[i]?.pressed);
        }
      }
      rafId = requestAnimationFrame(pollGamepad);
    };

    rafId = requestAnimationFrame(pollGamepad);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("gamepadconnected", onConnect);
      window.removeEventListener("gamepaddisconnected", onDisconnect);
    };
  }, [
    addPlaylistTarget,
    clientWindowOpen,
    enginePanelOpen,
    devicesOpen,
    queueOpen,
    searchOpen,
    sidebarOpen,
    gamepadConnected,
    status?.is_playing,
    status?.track,
    handleControl,
    handleToggleLike,
    handleOpenAddToPlaylist,
    handleVolumeStep,
    showToast,
  ]);

  const track = status?.track;
  const isPlaying = status?.is_playing ?? false;
  const isLiked = status?.is_liked ?? track?.is_liked ?? false;
  const shuffleState = status?.shuffle_state ?? false;
  const repeatState = status?.repeat_state ?? "off";
  const durationMs = track?.duration_ms ?? 0;
  const currentMs = durationMs > 0 ? Math.round(progress * durationMs) : 0;
  const isSpotifyClientBackend = engineSettings.audio_backend === "spotify_client";
  const streamFormatLabel = status?.audio_stream_info?.format_label;

  const filteredPlaylists = userPlaylists.filter((p) =>
    p.name.toLowerCase().includes(playlistFilter.trim().toLowerCase()),
  );

  return (
    <div className="h-screen overflow-hidden bg-neutral-950 text-white flex flex-col items-center justify-center p-4 relative select-none">
      {/* Top Left: Library menu */}
      <button
        data-focusable="true"
        onClick={() => setSidebarOpen(true)}
        className="absolute top-4 left-4 text-neutral-400 hover:text-white transition-colors p-2 rounded-lg"
        title="Library"
      >
        <FaBars size={20} />
      </button>

      {/* Top Right: Audio Engine & Quality, Remote Spotify Window, Queue, Devices, Search */}
      <div className="absolute top-4 right-4 flex items-center gap-2">
        {isSpotifyClientBackend && (
          <button
            data-focusable="true"
            onClick={() => setClientWindowOpen(true)}
            className="text-green-400 hover:text-green-300 bg-green-950/40 border border-green-500/30 transition-colors px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-medium"
            title="Open Official Spotify Client Window (Login / Native Mix)"
          >
            <FaWindowMaximize size={13} />
            <span className="hidden sm:inline">Spotify App</span>
          </button>
        )}
        <button
          data-focusable="true"
          onClick={() => {
            setEnginePanelOpen((v) => !v);
            setQueueOpen(false);
            setDevicesOpen(false);
          }}
          className={`transition-colors p-2 rounded-lg ${
            engineSettings.audio_quality === "lossless" || enginePanelOpen
              ? "text-green-400 bg-green-950/40"
              : "text-neutral-400 hover:text-white"
          }`}
          title="Audio Engine & Lossless Quality"
        >
          <FaSlidersH size={18} />
        </button>
        <button
          data-focusable="true"
          onClick={handleOpenQueue}
          className={`transition-colors p-2 rounded-lg ${
            queueOpen ? "text-green-400 bg-neutral-800" : "text-neutral-400 hover:text-white"
          }`}
          title="Up Next Queue"
        >
          <FaListUl size={18} />
        </button>
        <button
          data-focusable="true"
          onClick={handleOpenDevices}
          className={`transition-colors p-2 rounded-lg ${
            devicesOpen ? "text-green-400 bg-neutral-800" : "text-neutral-400 hover:text-white"
          }`}
          title="Spotify Connect Devices"
        >
          <FaDesktop size={18} />
        </button>
        <button
          data-focusable="true"
          onClick={() => setSearchOpen(true)}
          className="text-neutral-400 hover:text-white transition-colors p-2 rounded-lg"
          title="Search Spotify"
        >
          <FaSearch size={18} />
        </button>
      </div>

      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onToast={showToast}
        onOpenAddToPlaylist={handleOpenAddToPlaylist}
      />
      <SearchOverlay
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onToast={showToast}
        onOpenAddToPlaylist={handleOpenAddToPlaylist}
      />

      {/* Audio Engine & Quality Popover */}
      {enginePanelOpen && (
        <div
          data-modal-scope="true"
          className="absolute top-14 right-4 z-40 w-84 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl p-4 space-y-4"
        >
          <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
            <span className="text-sm font-semibold">Audio Engine & Quality</span>
            <button
              data-focusable="true"
              onClick={() => setEnginePanelOpen(false)}
              className="text-neutral-500 hover:text-white"
            >
              <FaTimes size={14} />
            </button>
          </div>

          {/* Audio Backend Selector */}
          <div>
            <label className="text-xs text-neutral-400 block mb-1.5">
              Spotify Connect Backend (cleanly stops the other engine)
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                data-focusable="true"
                disabled={switchingEngine}
                onClick={() => handleEngineSettingChange({ audio_backend: "librespot" })}
                className={`py-2 px-2.5 rounded-lg text-xs font-medium text-left transition-colors border ${
                  !isSpotifyClientBackend
                    ? "bg-green-500 text-black font-semibold border-green-400"
                    : "bg-neutral-800 text-neutral-300 border-neutral-700 hover:bg-neutral-700"
                }`}
              >
                <div>librespot</div>
                <div className={`text-[10px] ${!isSpotifyClientBackend ? "text-black/80" : "text-neutral-500"}`}>
                  Lightweight · Up to 320k
                </div>
              </button>
              <button
                data-focusable="true"
                disabled={switchingEngine}
                onClick={() => handleEngineSettingChange({ audio_backend: "spotify_client" })}
                className={`py-2 px-2.5 rounded-lg text-xs font-medium text-left transition-colors border ${
                  isSpotifyClientBackend
                    ? "bg-green-500 text-black font-semibold border-green-400"
                    : "bg-neutral-800 text-neutral-300 border-neutral-700 hover:bg-neutral-700"
                }`}
              >
                <div>Official Client</div>
                <div className={`text-[10px] ${isSpotifyClientBackend ? "text-black/80" : "text-neutral-500"}`}>
                  Lossless FLAC + Native Mix
                </div>
              </button>
            </div>
          </div>

          {/* Audio Quality Selector */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-neutral-400">Streaming Quality</label>
              {streamFormatLabel && (
                <span className="text-[10px] font-semibold text-green-400 bg-green-950/60 border border-green-500/30 px-1.5 py-0.5 rounded">
                  PipeWire: {streamFormatLabel}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {(
                [
                  { id: "96", label: "Normal (96k)", losslessOnly: false },
                  { id: "160", label: "High (160k)", losslessOnly: false },
                  { id: "320", label: "Very High (320k)", losslessOnly: false },
                  { id: "lossless", label: "Lossless FLAC", losslessOnly: true },
                ] as const
              ).map((opt) => {
                const disabled = opt.losslessOnly && !isSpotifyClientBackend;
                const active = engineSettings.audio_quality === opt.id;
                return (
                  <button
                    key={opt.id}
                    data-focusable={!disabled ? "true" : undefined}
                    disabled={disabled || switchingEngine}
                    onClick={() => handleEngineSettingChange({ audio_quality: opt.id })}
                    className={`py-1.5 px-2 rounded-lg text-xs font-medium transition-colors ${
                      disabled
                        ? "bg-neutral-900 text-neutral-600 border border-neutral-800 cursor-not-allowed"
                        : active
                          ? "bg-green-500 text-black font-semibold"
                          : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
                    }`}
                    title={
                      disabled
                        ? "Switch to Official Spotify Client above to enable Lossless FLAC"
                        : opt.label
                    }
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            {!isSpotifyClientBackend && (
              <div className="text-[11px] text-neutral-500 mt-1">
                Lossless (24-bit / 44.1 kHz FLAC) and native Spotify Playlist Mixing require the{" "}
                <span className="text-neutral-300">Official Client</span> engine.
              </div>
            )}
          </div>

          {isSpotifyClientBackend && (
            <button
              data-focusable="true"
              onClick={() => {
                setEnginePanelOpen(false);
                setClientWindowOpen(true);
              }}
              className="w-full py-2 px-3 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs font-medium text-green-400 border border-green-500/30 flex items-center justify-center gap-2"
            >
              <FaWindowMaximize size={12} /> Open Headless Spotify Client Window
            </button>
          )}

          <div className="space-y-2 pt-1 border-t border-neutral-800 text-xs">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-neutral-300">Volume Normalization</span>
              <input
                data-focusable="true"
                type="checkbox"
                checked={engineSettings.normalisation}
                onChange={(e) => handleEngineSettingChange({ normalisation: e.target.checked })}
                className="accent-green-500"
              />
            </label>
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-neutral-300">Gapless Playback</span>
              <input
                data-focusable="true"
                type="checkbox"
                checked={engineSettings.gapless}
                onChange={(e) => handleEngineSettingChange({ gapless: e.target.checked })}
                className="accent-green-500"
              />
            </label>
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-neutral-300">Autoplay Similar Music</span>
              <input
                data-focusable="true"
                type="checkbox"
                checked={engineSettings.autoplay}
                onChange={(e) => handleEngineSettingChange({ autoplay: e.target.checked })}
                className="accent-green-500"
              />
            </label>
          </div>
        </div>
      )}

      {/* Official Spotify Client Remote Window Modal */}
      {clientWindowOpen && (
        <div
          data-modal-scope="true"
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
        >
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl max-w-4xl w-full flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
              <div>
                <div className="text-sm font-semibold flex items-center gap-2">
                  <span>{clientWindowTitle || "Official Spotify Client"}</span>
                  <span className="text-[10px] bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">
                    Click image to interact · Scan QR with phone to log in
                  </span>
                </div>
              </div>
              <button
                data-focusable="true"
                onClick={() => setClientWindowOpen(false)}
                className="text-neutral-400 hover:text-white p-1"
              >
                <FaTimes size={18} />
              </button>
            </div>

            <div className="bg-black flex items-center justify-center min-h-[360px] max-h-[65vh] overflow-hidden">
              {clientWindowRunning ? (
                <img
                  src={getClientWindowScreenshotUrl(clientScreenBust)}
                  alt="Official Spotify Client Window"
                  onClick={handleClientCanvasClick}
                  className="max-w-full max-h-[65vh] object-contain cursor-pointer select-none"
                />
              ) : (
                <div className="p-8 text-center text-sm text-neutral-400">
                  Official Spotify Client window is starting up... Make sure the Official Client engine is enabled.
                </div>
              )}
            </div>

            <div className="px-4 py-2.5 bg-neutral-900 border-t border-neutral-800 flex items-center gap-2">
              <input
                type="text"
                value={clientTextInput}
                onChange={(e) => setClientTextInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleClientSendText();
                }}
                placeholder="Type text to send to Spotify Client (optional — QR login is easiest)..."
                className="flex-1 bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-1.5 text-xs text-white outline-none"
              />
              <button
                data-focusable="true"
                onClick={handleClientSendText}
                className="bg-green-500 text-black text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-green-400"
              >
                Send Text
              </button>
              <button
                data-focusable="true"
                onClick={() => sendClientWindowInput({ action: "key", key: "Enter" })}
                className="bg-neutral-800 text-neutral-200 text-xs px-3 py-1.5 rounded-lg hover:bg-neutral-700"
              >
                Enter
              </button>
              <button
                data-focusable="true"
                onClick={() => sendClientWindowInput({ action: "key", key: "Tab" })}
                className="bg-neutral-800 text-neutral-200 text-xs px-3 py-1.5 rounded-lg hover:bg-neutral-700"
              >
                Tab
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Track to Playlist Modal */}
      {addPlaylistTarget && (
        <div
          data-modal-scope="true"
          className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
        >
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
              <div className="min-w-0 pr-2">
                <div className="text-sm font-semibold">Add to Playlist</div>
                <div className="text-xs text-neutral-400 truncate">
                  {addPlaylistTarget.name}
                  {addPlaylistTarget.artist ? ` — ${addPlaylistTarget.artist}` : ""}
                </div>
              </div>
              <button
                data-focusable="true"
                onClick={() => setAddPlaylistTarget(null)}
                className="text-neutral-500 hover:text-white p-1"
              >
                <FaTimes size={16} />
              </button>
            </div>

            <div className="p-3 border-b border-neutral-800">
              <input
                data-focusable="true"
                type="text"
                value={playlistFilter}
                onChange={(e) => setPlaylistFilter(e.target.value)}
                placeholder="Filter playlists..."
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-1.5 text-xs text-white outline-none"
              />
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-neutral-800/50">
              {loadingUserPlaylists ? (
                <div className="p-4 text-xs text-neutral-500">Loading your playlists...</div>
              ) : filteredPlaylists.length === 0 ? (
                <div className="p-4 text-xs text-neutral-500">No matching playlists found</div>
              ) : (
                filteredPlaylists.map((pl) => (
                  <button
                    key={pl.id}
                    data-focusable="true"
                    onClick={() => handleConfirmAddTrackToPlaylist(pl)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-800 transition-colors text-left"
                  >
                    {pl.image_url ? (
                      <img src={pl.image_url} alt="" className="w-9 h-9 rounded object-cover shrink-0" />
                    ) : (
                      <div className="w-9 h-9 rounded bg-neutral-800 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium truncate">{pl.name}</div>
                      <div className="text-[11px] text-neutral-500">{pl.track_count} tracks</div>
                    </div>
                    <span className="text-xs text-green-400 font-semibold">+ Add</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Queue Drawer */}
      {queueOpen && (
        <div
          data-modal-scope="true"
          className="absolute top-14 right-4 z-40 w-80 max-h-96 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl flex flex-col overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
            <span className="text-sm font-semibold">Up Next in Queue</span>
            <button
              data-focusable="true"
              onClick={() => setQueueOpen(false)}
              className="text-neutral-500 hover:text-white"
            >
              <FaTimes size={14} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-neutral-800/50">
            {loadingQueue ? (
              <div className="p-4 text-xs text-neutral-500">Loading queue...</div>
            ) : queueItems.length === 0 ? (
              <div className="p-4 text-xs text-neutral-500">Queue is empty</div>
            ) : (
              queueItems.map((item, idx) => (
                <div
                  key={item.uri + idx}
                  data-focusable="true"
                  data-track-id={item.id ?? ""}
                  data-track-uri={item.uri}
                  data-track-name={item.name}
                  onClick={() => {
                    playUris([item.uri]);
                    setQueueOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-800 transition-colors text-left cursor-pointer"
                >
                  {item.image_url ? (
                    <img src={item.image_url} alt="" className="w-8 h-8 rounded object-cover shrink-0" />
                  ) : (
                    <div className="w-8 h-8 rounded bg-neutral-800 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium truncate">{item.name}</div>
                    <div className="text-[11px] text-neutral-500 truncate">{item.artist}</div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenAddToPlaylist({ uri: item.uri, name: item.name, artist: item.artist });
                    }}
                    className="p-1.5 text-neutral-500 hover:text-green-400"
                    title="Add to Playlist"
                  >
                    <FaPlus size={11} />
                  </button>
                  <span className="text-[11px] text-neutral-600">{formatMs(item.duration_ms)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Devices Popover */}
      {devicesOpen && (
        <div
          data-modal-scope="true"
          className="absolute top-14 right-4 z-40 w-72 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
            <span className="text-sm font-semibold">Connect Devices</span>
            <button
              data-focusable="true"
              onClick={() => setDevicesOpen(false)}
              className="text-neutral-500 hover:text-white"
            >
              <FaTimes size={14} />
            </button>
          </div>
          <div className="divide-y divide-neutral-800/50">
            {devices.length === 0 ? (
              <div className="p-4 text-xs text-neutral-500">No active Spotify devices found</div>
            ) : (
              devices.map((d) => (
                <button
                  key={d.id}
                  data-focusable="true"
                  onClick={() => handleSelectDevice(d.id, d.name)}
                  className={`w-full flex items-center justify-between px-4 py-2.5 hover:bg-neutral-800 text-left text-xs ${
                    d.is_active ? "text-green-400 font-semibold" : "text-neutral-200"
                  }`}
                >
                  <span className="truncate">{d.name}</span>
                  <span className="text-[10px] uppercase text-neutral-500">{d.is_active ? "Active" : d.type}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Album art */}
      <div className="shrink-0 relative">
        {track?.artwork_url ? (
          <img
            src={track.artwork_url}
            alt="Album art"
            className="w-48 h-48 rounded-2xl shadow-2xl object-cover"
          />
        ) : (
          <div className="w-48 h-48 rounded-2xl bg-neutral-800 flex items-center justify-center">
            <FaPlay className="text-neutral-600 text-4xl" />
          </div>
        )}
        {engineSettings.audio_quality === "lossless" && isSpotifyClientBackend && (
          <span className="absolute -bottom-2 right-2 bg-green-500 text-black text-[10px] font-bold px-2.5 py-0.5 rounded-full shadow">
            LOSSLESS {streamFormatLabel ? `· ${streamFormatLabel}` : "FLAC"}
          </span>
        )}
      </div>

      {/* Track info + Like + Add to Playlist buttons */}
      <div className="flex items-center justify-center gap-2 mt-5 shrink-0 w-full max-w-md px-4">
        <div className="text-center min-w-0 flex-1">
          <h1 className="text-xl font-bold truncate">
            {track?.name ?? "Not Playing"}
          </h1>
          <p className="text-neutral-400 truncate text-sm">
            {track ? `${track.artist}${track.album ? ` — ${track.album}` : ""}` : "Waiting for playback..."}
          </p>
        </div>
        {track?.track_id && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              data-focusable="true"
              onClick={handleToggleLike}
              className={`p-2 transition-transform hover:scale-110 rounded-lg ${
                isLiked ? "text-green-500" : "text-neutral-500 hover:text-white"
              }`}
              title={isLiked ? "Remove from Liked Songs (Controller X)" : "Save to Liked Songs (Controller X)"}
            >
              {isLiked ? <FaHeart size={18} /> : <FaRegHeart size={18} />}
            </button>
            <button
              data-focusable="true"
              onClick={() =>
                handleOpenAddToPlaylist({
                  uri: track.uri || `spotify:track:${track.track_id}`,
                  name: track.name,
                  artist: track.artist,
                })
              }
              className="p-2 text-neutral-500 hover:text-green-400 transition-transform hover:scale-110 rounded-lg"
              title="Add Track to Playlist (Controller Y)"
            >
              <FaPlus size={17} />
            </button>
          </div>
        )}
      </div>

      {/* Interactive Seek Bar */}
      <div className="w-full max-w-md px-4 mt-4 shrink-0">
        <input
          type="range"
          min={0}
          max={1000}
          value={Math.round(progress * 1000)}
          disabled={durationMs <= 0}
          onChange={handleSeekInput}
          onMouseUp={handleSeekCommit}
          onTouchEnd={handleSeekCommit}
          className="w-full h-1.5 bg-neutral-800 rounded-full appearance-none cursor-pointer accent-green-500"
        />
        <div className="flex justify-between text-xs text-neutral-500 mt-1">
          <span>{formatMs(Math.min(currentMs, durationMs))}</span>
          <span>{durationMs > 0 ? formatMs(durationMs) : "--:--"}</span>
        </div>
      </div>

      {/* Playback controls (Shuffle, Prev, Play/Pause, Next, Repeat) */}
      <div className="flex items-center justify-center gap-6 mt-4 shrink-0">
        <button
          data-focusable="true"
          onClick={handleToggleShuffle}
          className={`transition-colors p-2.5 rounded-lg ${
            shuffleState ? "text-green-500" : "text-neutral-500 hover:text-white"
          }`}
          title="Shuffle"
        >
          <FaRandom size={18} />
        </button>
        <button
          data-focusable="true"
          onClick={() => handleControl("previous")}
          className="text-neutral-400 hover:text-white transition-colors p-3 rounded-lg"
          title="Previous (LB)"
        >
          <FaStepBackward size={22} />
        </button>
        <button
          data-focusable="true"
          onClick={() => handleControl(isPlaying ? "pause" : "play")}
          className="bg-white text-black rounded-full p-4 hover:scale-105 transition-transform"
          title={isPlaying ? "Pause (Start)" : "Play (Start)"}
        >
          {isPlaying ? <FaPause size={24} /> : <FaPlay size={24} className="ml-0.5" />}
        </button>
        <button
          data-focusable="true"
          onClick={() => handleControl("next")}
          className="text-neutral-400 hover:text-white transition-colors p-3 rounded-lg"
          title="Next (RB)"
        >
          <FaStepForward size={22} />
        </button>
        <button
          data-focusable="true"
          onClick={handleCycleRepeat}
          className={`transition-colors p-2.5 relative rounded-lg ${
            repeatState !== "off" ? "text-green-500" : "text-neutral-500 hover:text-white"
          }`}
          title={`Repeat: ${repeatState}`}
        >
          <FaRedo size={18} />
          {repeatState === "track" && (
            <span className="absolute top-1 right-1 text-[9px] font-bold text-green-400">1</span>
          )}
        </button>
      </div>

      {/* Volume slider */}
      <div className="flex items-center gap-3 mt-4 w-full max-w-md px-4 shrink-0">
        <FaVolumeUp className="text-neutral-500 shrink-0" />
        <input
          type="range"
          min={0}
          max={100}
          value={localVolume}
          onChange={handleVolumeChange}
          className="w-full h-1.5 bg-neutral-800 rounded-full appearance-none cursor-pointer accent-green-500"
        />
        <span className="text-neutral-500 text-sm w-8 text-right">{localVolume}</span>
      </div>

      {/* Toast notification */}
      {toast && (
        <div className="mt-3 px-3 py-1 bg-neutral-800 text-green-400 text-xs rounded-full border border-neutral-700 shrink-0">
          {toast}
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="mt-3 px-4 py-2 bg-red-900/60 text-red-200 text-xs rounded-lg shrink-0">
          {error}
        </div>
      )}

      {/* Status bar */}
      <div className="mt-3 text-center text-xs text-neutral-600 shrink-0">
        {status?.librespot_running
          ? isSpotifyClientBackend
            ? "Official Spotify Client active"
            : "librespot Connect active"
          : "Spotify Connect inactive"}
        {status?.active_device?.name ? ` · ${status.active_device.name}` : ""}
        {streamFormatLabel ? ` · ${streamFormatLabel}` : ""}
        {status?.authenticated ? "" : " · Not authenticated"}
      </div>

      {/* Controller Legend Bar */}
      <div className="mt-2 flex flex-wrap items-center justify-center gap-3 text-[11px] text-neutral-500 shrink-0">
        <span className="flex items-center gap-1 text-neutral-400">
          <FaGamepad size={12} className={gamepadConnected ? "text-green-400" : "text-neutral-600"} />
          {gamepadConnected ? "Controller Ready" : "Gamepad Supported"}
        </span>
        <span>
          <strong className="text-neutral-300">A</strong> Select
        </span>
        <span>
          <strong className="text-neutral-300">B</strong> Back
        </span>
        <span>
          <strong className="text-neutral-300">X</strong> Like
        </span>
        <span>
          <strong className="text-neutral-300">Y</strong> +Playlist
        </span>
        <span>
          <strong className="text-neutral-300">LB/RB</strong> Prev/Next
        </span>
        <span>
          <strong className="text-neutral-300">LT/RT</strong> Vol
        </span>
        <span>
          <strong className="text-neutral-300">Start</strong> Play/Pause
        </span>
      </div>
    </div>
  );
}
