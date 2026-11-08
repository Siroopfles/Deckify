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
  updateMixSettings,
  playUris,
  type StatusResponse,
  type PlaylistTrack,
  type SpotifyDevice,
  type MixSettings,
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
  const [mixPanelOpen, setMixPanelOpen] = useState(false);
  const [devicesOpen, setDevicesOpen] = useState(false);
  const [queueItems, setQueueItems] = useState<PlaylistTrack[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [devices, setDevices] = useState<SpotifyDevice[]>([]);
  const [mixSettings, setMixSettings] = useState<MixSettings>({
    mix_mode: "off",
    crossfade_seconds: 5,
    normalisation: true,
    gapless: true,
    autoplay: true,
  });
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const anchorRef = useRef<{ positionMs: number; startTime: number; durationMs: number } | null>(null);
  const volumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const volumeDragging = useRef(false);
  const seekingRef = useRef(false);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }, []);

  // Poll /api/status
  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const s = await fetchStatus();
        if (!active) return;
        setStatus(s);
        if (s.mix_settings) {
          setMixSettings(s.mix_settings);
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

  const handleOpenQueue = useCallback(async () => {
    const nextOpen = !queueOpen;
    setQueueOpen(nextOpen);
    setMixPanelOpen(false);
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
    setMixPanelOpen(false);
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

  const handleMixChange = useCallback(async (patch: Partial<MixSettings>) => {
    const updated = { ...mixSettings, ...patch };
    setMixSettings(updated);
    try {
      const res = await updateMixSettings(patch);
      if (res.ok) {
        setMixSettings({
          mix_mode: res.mix_mode,
          crossfade_seconds: res.crossfade_seconds,
          normalisation: res.normalisation,
          gapless: res.gapless,
          autoplay: res.autoplay,
        });
      }
    } catch (e) {
      console.error("Failed to update mix settings:", e);
    }
  }, [mixSettings]);

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

  const track = status?.track;
  const isPlaying = status?.is_playing ?? false;
  const isLiked = status?.is_liked ?? track?.is_liked ?? false;
  const shuffleState = status?.shuffle_state ?? false;
  const repeatState = status?.repeat_state ?? "off";
  const durationMs = track?.duration_ms ?? 0;
  const currentMs = durationMs > 0 ? Math.round(progress * durationMs) : 0;

  return (
    <div className="h-screen overflow-hidden bg-neutral-950 text-white flex flex-col items-center justify-center p-4 relative select-none">
      {/* Top Left: Library menu */}
      <button
        onClick={() => setSidebarOpen(true)}
        className="absolute top-4 left-4 text-neutral-400 hover:text-white transition-colors p-2"
        title="Library"
      >
        <FaBars size={20} />
      </button>

      {/* Top Right: Mix, Queue, Devices, Search */}
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <button
          onClick={() => {
            setMixPanelOpen((v) => !v);
            setQueueOpen(false);
            setDevicesOpen(false);
          }}
          className={`transition-colors p-2 rounded-lg ${
            mixSettings.mix_mode !== "off" ? "text-green-400 bg-green-950/40" : "text-neutral-400 hover:text-white"
          }`}
          title="Mixing & Transitions"
        >
          <FaSlidersH size={18} />
        </button>
        <button
          onClick={handleOpenQueue}
          className={`transition-colors p-2 rounded-lg ${
            queueOpen ? "text-green-400 bg-neutral-800" : "text-neutral-400 hover:text-white"
          }`}
          title="Up Next Queue"
        >
          <FaListUl size={18} />
        </button>
        <button
          onClick={handleOpenDevices}
          className={`transition-colors p-2 rounded-lg ${
            devicesOpen ? "text-green-400 bg-neutral-800" : "text-neutral-400 hover:text-white"
          }`}
          title="Spotify Connect Devices"
        >
          <FaDesktop size={18} />
        </button>
        <button
          onClick={() => setSearchOpen(true)}
          className="text-neutral-400 hover:text-white transition-colors p-2"
          title="Search Spotify"
        >
          <FaSearch size={18} />
        </button>
      </div>

      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} onToast={showToast} />
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} onToast={showToast} />

      {/* Mixing Popover */}
      {mixPanelOpen && (
        <div className="absolute top-14 right-4 z-40 w-80 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl p-4 space-y-4">
          <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
            <span className="text-sm font-semibold">Spotify Mixing & Transitions</span>
            <button onClick={() => setMixPanelOpen(false)} className="text-neutral-500 hover:text-white">
              <FaTimes size={14} />
            </button>
          </div>
          <div>
            <label className="text-xs text-neutral-400 block mb-1.5">Transition Style</label>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  { id: "off", label: "Off" },
                  { id: "fade", label: "Smooth Fade" },
                  { id: "rise", label: "Quick Rise" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => handleMixChange({ mix_mode: opt.id })}
                  className={`py-1.5 px-2 rounded-lg text-xs font-medium transition-colors ${
                    mixSettings.mix_mode === opt.id
                      ? "bg-green-500 text-black font-semibold"
                      : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {mixSettings.mix_mode !== "off" && (
            <div>
              <div className="flex justify-between text-xs text-neutral-400 mb-1">
                <span>Crossfade Overlap</span>
                <span className="text-green-400 font-medium">{mixSettings.crossfade_seconds}s</span>
              </div>
              <input
                type="range"
                min={1}
                max={12}
                value={mixSettings.crossfade_seconds}
                onChange={(e) => handleMixChange({ crossfade_seconds: Number(e.target.value) })}
                className="w-full h-1.5 bg-neutral-800 rounded-full appearance-none cursor-pointer accent-green-500"
              />
            </div>
          )}

          <div className="space-y-2 pt-1 border-t border-neutral-800 text-xs">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-neutral-300">Volume Normalization</span>
              <input
                type="checkbox"
                checked={mixSettings.normalisation}
                onChange={(e) => handleMixChange({ normalisation: e.target.checked })}
                className="accent-green-500"
              />
            </label>
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-neutral-300">Gapless Playback</span>
              <input
                type="checkbox"
                checked={mixSettings.gapless}
                onChange={(e) => handleMixChange({ gapless: e.target.checked })}
                className="accent-green-500"
              />
            </label>
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-neutral-300">Autoplay Endless Mix</span>
              <input
                type="checkbox"
                checked={mixSettings.autoplay}
                onChange={(e) => handleMixChange({ autoplay: e.target.checked })}
                className="accent-green-500"
              />
            </label>
          </div>
        </div>
      )}

      {/* Queue Drawer */}
      {queueOpen && (
        <div className="absolute top-14 right-4 z-40 w-80 max-h-96 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
            <span className="text-sm font-semibold">Up Next in Queue</span>
            <button onClick={() => setQueueOpen(false)} className="text-neutral-500 hover:text-white">
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
                <button
                  key={item.uri + idx}
                  onClick={() => {
                    playUris([item.uri]);
                    setQueueOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-800 transition-colors text-left"
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
                  <span className="text-[11px] text-neutral-600">{formatMs(item.duration_ms)}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Devices Popover */}
      {devicesOpen && (
        <div className="absolute top-14 right-4 z-40 w-72 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
            <span className="text-sm font-semibold">Connect Devices</span>
            <button onClick={() => setDevicesOpen(false)} className="text-neutral-500 hover:text-white">
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
        {mixSettings.mix_mode !== "off" && (
          <span className="absolute -bottom-2 right-2 bg-green-500 text-black text-[10px] font-bold px-2 py-0.5 rounded-full shadow">
            MIX {mixSettings.crossfade_seconds}s
          </span>
        )}
      </div>

      {/* Track info + Like button */}
      <div className="flex items-center justify-center gap-3 mt-5 shrink-0 w-full max-w-md px-4">
        <div className="text-center min-w-0 flex-1">
          <h1 className="text-xl font-bold truncate">
            {track?.name ?? "Not Playing"}
          </h1>
          <p className="text-neutral-400 truncate text-sm">
            {track ? `${track.artist}${track.album ? ` — ${track.album}` : ""}` : "Waiting for playback..."}
          </p>
        </div>
        {track?.track_id && (
          <button
            onClick={handleToggleLike}
            className={`p-2 transition-transform hover:scale-110 shrink-0 ${
              isLiked ? "text-green-500" : "text-neutral-500 hover:text-white"
            }`}
            title={isLiked ? "Remove from Liked Songs" : "Save to Liked Songs"}
          >
            {isLiked ? <FaHeart size={18} /> : <FaRegHeart size={18} />}
          </button>
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
          onClick={handleToggleShuffle}
          className={`transition-colors p-2.5 ${
            shuffleState ? "text-green-500" : "text-neutral-500 hover:text-white"
          }`}
          title="Shuffle"
        >
          <FaRandom size={18} />
        </button>
        <button
          onClick={() => handleControl("previous")}
          className="text-neutral-400 hover:text-white transition-colors p-3"
          title="Previous"
        >
          <FaStepBackward size={22} />
        </button>
        <button
          onClick={() => handleControl(isPlaying ? "pause" : "play")}
          className="bg-white text-black rounded-full p-4 hover:scale-105 transition-transform"
          title={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? <FaPause size={24} /> : <FaPlay size={24} className="ml-0.5" />}
        </button>
        <button
          onClick={() => handleControl("next")}
          className="text-neutral-400 hover:text-white transition-colors p-3"
          title="Next"
        >
          <FaStepForward size={22} />
        </button>
        <button
          onClick={handleCycleRepeat}
          className={`transition-colors p-2.5 relative ${
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
        {status?.librespot_running ? "Spotify Connect active" : "Spotify Connect inactive"}
        {status?.active_device?.name ? ` · ${status.active_device.name}` : ""}
        {status?.authenticated ? "" : " · Not authenticated"}
      </div>
    </div>
  );
}
