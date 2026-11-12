import { useEffect, useState, useCallback, FC } from "react";
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
import { DeckifyOverlay } from "./components/DeckifyOverlay";
import { usePlaybackClock } from "./hooks/usePlaybackClock";
import { formatMs } from "./components/common/InteractiveRow";
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
} from "react-icons/fa";
import { QRCodeSVG } from "qrcode.react";
import type {
  AudioStreamInfo,
  EngineSettings,
  SpotifyDevice,
  StatusResponse,
  TrackMeta,
} from "./types";

const backendStart = callable<[], { ok: boolean; error?: string; pid?: number }>("start_librespot");
const backendStop = callable<[], { ok: boolean }>("stop_librespot");
const backendGetStatus = callable<[], StatusResponse>("get_status");
const backendStartOAuth = callable<[], { ok: boolean; landing_url?: string; redirect_uri?: string; error?: string }>("start_oauth");
const backendGetAuthStatus = callable<[], { authenticated: boolean; needs_reauth: boolean }>("get_auth_status");
const backendControlPlayback = callable<[string, string], { ok: boolean; error?: string }>("control_playback");
const backendSetVolume = callable<[number], { ok: boolean; error?: string }>("set_volume");
const backendSeekPlayback = callable<[number, string], { ok: boolean; position_ms?: number; error?: string }>("seek_playback");
const backendSetShuffle = callable<[boolean, string], { ok: boolean; shuffle_state?: boolean; error?: string }>("set_shuffle");
const backendSetRepeat = callable<[string, string], { ok: boolean; repeat_state?: string; error?: string }>("set_repeat");
const backendToggleLike = callable<[string, boolean | null], { ok: boolean; is_liked?: boolean; error?: string }>("toggle_like_track");
const backendGetDevices = callable<[], { ok: boolean; devices?: SpotifyDevice[]; error?: string }>("get_devices");
const backendTransferPlayback = callable<[string], { ok: boolean; error?: string }>("transfer_playback");
const backendSetSetting = callable<[string, unknown], { ok: boolean; settings?: any; error?: string }>("set_setting");
const backendTriggerDucking = callable<[boolean, string?, number?], { ok: boolean; is_ducked?: boolean; effective_volume?: number; error?: string }>("trigger_ducking");
const backendGetDuckingState = callable<[], { is_ducked: boolean; effective_volume: number; base_volume: number; duck_reasons: string[] }>("get_ducking_state");

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

const Content: FC = () => {
  const [running, setRunning] = useState<boolean>(false);
  const [toggling, setToggling] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [audioStreamInfo, setAudioStreamInfo] = useState<AudioStreamInfo | null>(null);
  const [trackMeta, setTrackMeta] = useState<TrackMeta | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [serverPositionMs, setServerPositionMs] = useState<number>(0);
  const [durationMs, setDurationMs] = useState<number>(0);
  const [volume, setVolume] = useState<number>(50);
  const [devices, setDevices] = useState<SpotifyDevice[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null);
  const [shuffleState, setShuffleState] = useState<boolean>(false);
  const [repeatState, setRepeatState] = useState<"off" | "context" | "track">("off");
  const [isLiked, setIsLiked] = useState<boolean>(false);
  const [authenticated, setAuthenticated] = useState<boolean>(false);
  const [needsReauth, setNeedsReauth] = useState<boolean>(false);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [isDucked, setIsDucked] = useState<boolean>(false);
  const [effectiveVolume, setEffectiveVolume] = useState<number | null>(null);
  const [settings, setSettings] = useState<EngineSettings>({
    audio_backend: "librespot",
    audio_quality: "320",
    bitrate: 320,
    normalisation: true,
    gapless: true,
    autoplay: true,
  });

  const clock = usePlaybackClock({
    serverPositionMs,
    isPlaying,
    durationMs,
    trackId: trackMeta?.track_id || trackMeta?.id,
    onSeekCommit: async (targetMs) => {
      try {
        await backendSeekPlayback(targetMs, "");
      } catch {}
    },
  });

  const refreshStatus = useCallback(async () => {
    try {
      const status = await backendGetStatus();
      if (!status) return;
      setRunning(Boolean(status.running || status.librespot_running || status.spotify_client_running));
      if (status.settings) {
        setSettings((prev) => ({ ...prev, ...status.settings }));
      }
      const t = status.track || status.track_meta;
      if (t) setTrackMeta(t);
      setIsPlaying(Boolean(status.is_playing));
      setServerPositionMs(status.position_ms || 0);
      setDurationMs(status.duration_ms || t?.duration_ms || 0);
      if (typeof status.volume === "number") setVolume(status.volume);
      setShuffleState(Boolean(status.shuffle_state));
      setRepeatState(status.repeat_state || "off");
      setIsLiked(Boolean(status.is_liked));
      setAudioStreamInfo(status.audio_stream_info || null);
      if (status.active_device?.id) setActiveDeviceId(status.active_device.id);

      const auth = await backendGetAuthStatus().catch(() => null);
      if (auth) {
        setAuthenticated(auth.authenticated);
        setNeedsReauth(auth.needs_reauth);
      }
    } catch {}
  }, []);

  const refreshDevices = useCallback(async () => {
    try {
      const res = await backendGetDevices();
      if (res.ok && res.devices) {
        setDevices(res.devices);
        const act = res.devices.find((d) => d.is_active);
        if (act) setActiveDeviceId(act.id);
      }
    } catch {}
  }, []);

  useEffect(() => {
    refreshStatus();
    refreshDevices();
    const interval = setInterval(() => {
      refreshStatus();
    }, 3000);
    return () => clearInterval(interval);
  }, [refreshStatus, refreshDevices]);

  useEffect(() => {
    backendGetDuckingState().then((state) => {
      if (state) {
        setIsDucked(Boolean(state.is_ducked));
        if (typeof state.effective_volume === "number") {
          setEffectiveVolume(state.effective_volume);
        }
      }
    }).catch(() => {});

    const unsubDucking = addEventListener<[any]>("ducking_state_changed", (data: any) => {
      if (!data) return;
      setIsDucked(Boolean(data.is_ducked));
      if (typeof data.effective_volume === "number") {
        setEffectiveVolume(data.effective_volume);
      }
    });

    return () => {
      removeEventListener("ducking_state_changed", unsubDucking);
    };
  }, []);

  const handleToggleEngine = async (enable: boolean) => {
    setToggling(true);
    setError(null);
    try {
      if (enable) {
        const res = await backendStart();
        if (!res.ok) throw new Error(res.error || "Failed to start audio engine");
      } else {
        await backendStop();
      }
      await refreshStatus();
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setToggling(false);
    }
  };

  const handlePlayPause = async () => {
    await backendControlPlayback(isPlaying ? "pause" : "play", "");
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

  const handleSeek = (sec: number) => {
    clock.scrubTo(sec * 1000);
  };

  const handleSeekDelta = (deltaSec: number) => {
    clock.scrubDelta(deltaSec * 1000);
  };

  const handleToggleShuffle = async () => {
    const next = !shuffleState;
    setShuffleState(next);
    await backendSetShuffle(next, "");
  };

  const handleCycleRepeat = async () => {
    const order: ("off" | "context" | "track")[] = ["off", "context", "track"];
    const next = order[(order.indexOf(repeatState) + 1) % order.length];
    setRepeatState(next);
    await backendSetRepeat(next, "");
  };

  const handleToggleLike = async () => {
    const tid = trackMeta?.track_id || trackMeta?.id;
    if (!tid) return;
    const res = await backendToggleLike(tid, null);
    if (res.ok) setIsLiked(Boolean(res.is_liked));
  };

  const handleVolumeChange = async (val: number) => {
    setVolume(val);
    await backendSetVolume(val);
  };

  const handleTransfer = async (option: { data: string; label: string }) => {
    setActiveDeviceId(option.data);
    await backendTransferPlayback(option.data);
    refreshDevices();
  };

  const handleStartLogin = async () => {
    try {
      const res = await backendStartOAuth();
      if (res.ok && res.landing_url) {
        setQrUrl(res.landing_url);
      }
    } catch {}
  };

  const isPodcast = trackMeta?.album === "" || trackMeta?.uri?.includes(":episode:");
  const activeBackend = settings.audio_backend || "librespot";
  const positionMs = clock.positionMs;
  const durationSec = Math.floor(durationMs / 1000);
  const positionSec = Math.floor(positionMs / 1000);

  return (
    <>
      <PanelSection title="Deckify">
        {/* Prominent Open Deckify button */}
        <PanelSectionRow>
          <ButtonItem
            onClick={openExpandedView}
          >
            Open Deckify (Full Screen)
          </ButtonItem>
        </PanelSectionRow>

        {/* Engine Toggle & live audio format badge */}
        <PanelSectionRow>
          <ToggleField
            label={activeBackend === "spotify_client" ? "Spotify Client" : "librespot Engine"}
            description={
              running
                ? `Running${audioStreamInfo?.format_label ? ` · ${audioStreamInfo.format_label}` : ""}`
                : "Stopped"
            }
            checked={running}
            disabled={toggling}
            onChange={handleToggleEngine}
          />
        </PanelSectionRow>

        {error && (
          <PanelSectionRow>
            <Field label="Error">
              <span style={{ color: "#ff4444", fontSize: 12 }}>{error}</span>
            </Field>
          </PanelSectionRow>
        )}

        {/* QR Code login prompt if not authenticated */}
        {(!authenticated || needsReauth) && (
          <PanelSectionRow>
            <div style={{ padding: "8px 0", textAlign: "center" }}>
              <p style={{ fontSize: 12, opacity: 0.8, marginBottom: 8 }}>
                {needsReauth ? "Session expired. Scan QR to reconnect:" : "Log in with Spotify on mobile:"}
              </p>
              {qrUrl ? (
                <div style={{ display: "inline-block", padding: 8, background: "#fff", borderRadius: 8 }}>
                  <QRCodeSVG value={qrUrl} size={140} />
                </div>
              ) : (
                <ButtonItem onClick={handleStartLogin}>Show Login QR Code</ButtonItem>
              )}
            </div>
          </PanelSectionRow>
        )}

        {/* Compact Mini-Player */}
        {trackMeta?.name && (
          <>
            <PanelSectionRow>
              <Field
                label={trackMeta.name}
                description={`${trackMeta.artist || "Unknown"}${trackMeta.album ? ` — ${trackMeta.album}` : ""}`}
                icon={
                  trackMeta.artwork_url || trackMeta.image_url ? (
                    <img
                      src={trackMeta.artwork_url || trackMeta.image_url!}
                      width={38}
                      height={38}
                      style={{ borderRadius: 4, objectFit: "cover" }}
                    />
                  ) : (
                    <FaMusic size={24} color="#1db954" />
                  )
                }
              >
                <span style={{ fontSize: 11, color: isPlaying ? "#1db954" : "#888" }}>
                  {isPlaying ? "Playing" : "Paused"}
                </span>
              </Field>
            </PanelSectionRow>

            {durationSec > 0 && (
              <PanelSectionRow>
                <div style={{ width: "100%" }}>
                  <SliderField
                    label={`${formatMs(clock.positionMs)} / ${formatMs(durationMs)}`}
                    value={positionSec}
                    min={0}
                    max={durationSec}
                    step={1}
                    onChange={handleSeek}
                  />
                  {isPodcast && (
                    <Focusable flow-children="horizontal" style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 4 }}>
                      <DialogButton style={{ minWidth: "auto", padding: "4px 10px", fontSize: 11 }} onClick={() => handleSeekDelta(-15)}>
                        -15s
                      </DialogButton>
                      <DialogButton style={{ minWidth: "auto", padding: "4px 10px", fontSize: 11 }} onClick={() => handleSeekDelta(15)}>
                        +15s
                      </DialogButton>
                    </Focusable>
                  )}
                </div>
              </PanelSectionRow>
            )}

            {/* Transport controls */}
            <PanelSectionRow>
              <Focusable
                style={{ display: "flex", justifyContent: "center", gap: 8, alignItems: "center", width: "100%" }}
                flow-children="right"
              >
                <DialogButton
                  style={{ minWidth: "auto", padding: "8px 11px", color: shuffleState ? "#1DB954" : undefined }}
                  onClick={(e: any) => {
                    e?.currentTarget?.blur?.();
                    handleToggleShuffle();
                  }}
                >
                  <FaRandom />
                </DialogButton>
                <DialogButton
                  style={{ minWidth: "auto", padding: "10px 14px" }}
                  onClick={(e: any) => {
                    e?.currentTarget?.blur?.();
                    handlePrev();
                  }}
                >
                  <FaStepBackward />
                </DialogButton>
                <DialogButton
                  style={{ minWidth: "auto", padding: "10px 18px", color: "#1db954" }}
                  onClick={(e: any) => {
                    e?.currentTarget?.blur?.();
                    handlePlayPause();
                  }}
                >
                  {isPlaying ? <FaPause /> : <FaPlay />}
                </DialogButton>
                <DialogButton
                  style={{ minWidth: "auto", padding: "10px 14px" }}
                  onClick={(e: any) => {
                    e?.currentTarget?.blur?.();
                    handleNext();
                  }}
                >
                  <FaStepForward />
                </DialogButton>
                <DialogButton
                  style={{ minWidth: "auto", padding: "8px 11px", color: repeatState !== "off" ? "#1DB954" : undefined }}
                  onClick={(e: any) => {
                    e?.currentTarget?.blur?.();
                    handleCycleRepeat();
                  }}
                >
                  <FaRedo />
                  {repeatState === "track" && <span style={{ fontSize: 9, fontWeight: 700, marginLeft: 2 }}>1</span>}
                </DialogButton>
                <DialogButton
                  style={{ minWidth: "auto", padding: "8px 11px", color: isLiked ? "#1DB954" : undefined }}
                  onClick={(e: any) => {
                    e?.currentTarget?.blur?.();
                    handleToggleLike();
                  }}
                >
                  {isLiked ? <FaHeart /> : <FaRegHeart />}
                </DialogButton>
              </Focusable>
            </PanelSectionRow>

            {/* Volume slider */}
            <PanelSectionRow>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Volume</span>
                {isDucked && (
                  <span
                    style={{
                      background: "#1db954",
                      color: "#000",
                      fontSize: 10,
                      fontWeight: 800,
                      padding: "2px 6px",
                      borderRadius: 4,
                      letterSpacing: "0.5px",
                    }}
                  >
                    DUCKED
                  </span>
                )}
              </div>
              <SliderField
                label=""
                value={isDucked && effectiveVolume != null ? effectiveVolume : volume}
                min={0}
                max={100}
                step={1}
                showValue
                valueSuffix="%"
                onChange={handleVolumeChange}
              />
            </PanelSectionRow>

            {/* Device switcher */}
            {devices.length > 0 && (
              <PanelSectionRow>
                <DropdownItem
                  label="Playback Device"
                  rgOptions={devices.map((d) => ({
                    data: d.id,
                    label: `${d.name}${d.is_active ? " (Active)" : ""}`,
                  }))}
                  selectedOption={activeDeviceId || devices.find((d) => d.is_active)?.id || devices[0]?.id}
                  onChange={handleTransfer}
                />
              </PanelSectionRow>
            )}

            {/* In-Game Mini Overlay (HUD) Quick Controls */}
            <PanelSectionRow>
              <ToggleField
                label="In-Game Overlay (HUD)"
                description={
                  settings.overlay_enabled
                    ? "Visible during gameplay"
                    : "Disabled"
                }
                checked={Boolean(settings.overlay_enabled)}
                onChange={async (val) => {
                  setSettings((prev) => ({ ...prev, overlay_enabled: val }));
                  await backendSetSetting("overlay_enabled", val);
                }}
              />
            </PanelSectionRow>

            {settings.overlay_enabled && (
              <>
                <PanelSectionRow>
                  <DropdownItem
                    label="Overlay Position"
                    rgOptions={[
                      { data: "top-left", label: "Top Left" },
                      { data: "top-right", label: "Top Right" },
                      { data: "bottom-left", label: "Bottom Left" },
                      { data: "bottom-right", label: "Bottom Right" },
                    ]}
                    selectedOption={settings.overlay_position || "top-right"}
                    onChange={async (opt) => {
                      setSettings((prev) => ({
                        ...prev,
                        overlay_position: opt.data,
                      }));
                      await backendSetSetting("overlay_position", opt.data);
                    }}
                  />
                </PanelSectionRow>

                <PanelSectionRow>
                  <ToggleField
                    label="Auto-Hide Overlay (6s)"
                    description="Fades out 6s after track starts or resumes"
                    checked={Boolean(settings.overlay_autohide)}
                    onChange={async (val) => {
                      setSettings((prev) => ({
                        ...prev,
                        overlay_autohide: val,
                      }));
                      await backendSetSetting("overlay_autohide", val);
                    }}
                  />
                </PanelSectionRow>

                <PanelSectionRow>
                  <ToggleField
                    label="Show Progress Bar"
                    description="2px progress line at bottom of overlay"
                    checked={Boolean(settings.overlay_show_progress)}
                    onChange={async (val) => {
                      setSettings((prev) => ({
                        ...prev,
                        overlay_show_progress: val,
                      }));
                      await backendSetSetting("overlay_show_progress", val);
                    }}
                  />
                </PanelSectionRow>
              </>
            )}
          </>
        )}
      </PanelSection>
    </>
  );
};

const DeckifyRouteOpener: FC = () => {
  useEffect(() => {
    try {
      Navigation.NavigateBack();
    } catch {}
    const id = setTimeout(openExpandedView, 100);
    return () => clearTimeout(id);
  }, []);
  return null;
};

const DeckifyOverlayWrapper: FC = () => {
  const [track, setTrack] = useState<TrackMeta | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [settings, setSettings] = useState<EngineSettings | null>(null);
  const [positionMs, setPositionMs] = useState<number>(0);
  const [durationMs, setDurationMs] = useState<number>(0);

  useEffect(() => {
    let mounted = true;

    const syncStatus = (s: StatusResponse | null) => {
      if (!mounted || !s) return;
      const t = s.track || s.track_meta || null;
      if (t) setTrack(t);
      if (typeof s.is_playing === "boolean") setIsPlaying(s.is_playing);
      if (s.settings) setSettings(s.settings);
      if (typeof s.position_ms === "number") setPositionMs(s.position_ms);
      if (typeof s.duration_ms === "number") {
        setDurationMs(s.duration_ms || t?.duration_ms || 0);
      } else if (t?.duration_ms) {
        setDurationMs(t.duration_ms);
      }
    };

    backendGetStatus()
      .then(syncStatus)
      .catch(() => {});

    const unsubMeta = addEventListener<[any]>("track_metadata", (meta: any) => {
      if (meta) {
        setTrack(meta);
        if (meta.duration_ms) setDurationMs(meta.duration_ms);
      }
    });
    const unsubLibre = addEventListener<[any]>("librespot_event", (ev: any) => {
      if (ev?.event === "playing") setIsPlaying(true);
      else if (ev?.event === "paused" || ev?.event === "stopped") setIsPlaying(false);
      if (typeof ev?.position_ms === "number") setPositionMs(ev.position_ms);
      if (typeof ev?.duration_ms === "number") setDurationMs(ev.duration_ms);
    });
    const unsubSettings = addEventListener<[any]>("settings_changed", (st: any) => {
      if (st) setSettings(st);
    });

    const poll = setInterval(async () => {
      try {
        const s = await backendGetStatus();
        syncStatus(s);
      } catch {}
    }, 4000);

    return () => {
      mounted = false;
      clearInterval(poll);
      removeEventListener("track_metadata", unsubMeta);
      removeEventListener("librespot_event", unsubLibre);
      removeEventListener("settings_changed", unsubSettings);
    };
  }, []);

  if (!settings?.overlay_enabled) return null;
  return (
    <DeckifyOverlay
      track={track}
      isPlaying={isPlaying}
      position={settings.overlay_position || "top-right"}
      visible={Boolean(settings.overlay_enabled)}
      autoHide={Boolean(settings.overlay_autohide)}
      showProgress={Boolean(settings.overlay_show_progress)}
      positionMs={positionMs}
      durationMs={durationMs}
    />
  );
};

export default definePlugin(() => {
  console.log("Deckify v0.3.0 native plugin initializing");

  // 1. Register native full-screen route
  routerHook.addRoute("/deckify", DeckifyRouteOpener);

  // 2. Mount in-game overlay as global component
  try {
    routerHook.addGlobalComponent("DeckifyOverlay", () => <DeckifyOverlayWrapper />);
  } catch (err) {
    console.warn("Could not register DeckifyOverlay global component:", err);
  }

  // 3. Patch Steam Main Menu (STEAM button) to add Spotify entry
  let menuOrder = 3;
  try {
    const rawPos = localStorage.getItem("DECKIFY_MENU_POSITION");
    if (rawPos) {
      const parsed = parseInt(rawPos, 10);
      if (parsed >= 1 && parsed <= 9) menuOrder = parsed;
    }
  } catch {}

  const unregisterMenu = registerSteamMenu({
    id: "deckify",
    label: "Spotify",
    route: "/deckify",
    icon: <FaSpotify size={18} color="#1db954" />,
    order: menuOrder,
  });

  // 4. In-Game Gamepad Chords Listener (STEAM + D-Pad Left/Right for Track Skip, STEAM + Up/Down for Volume)
  let cleanupChords: (() => void) | null = null;
  try {
    const win = window as any;
    const fc = win.FocusNavController;
    const src = fc?.m_rgGamepadInputSources?.[0];
    if (src?.RegisterForGamepadButtonDown) {
      let guideHeld = false;
      const onDown = (btn: number) => {
        if (btn === 13 || btn === 14) guideHeld = true;
        if (guideHeld) {
          if (btn === 11) {
            backendControlPlayback("previous", "").catch(() => {});
            toaster.toast({ title: "Deckify", body: "⏮ Previous track", duration: 1500 });
          } else if (btn === 12) {
            backendControlPlayback("next", "").catch(() => {});
            toaster.toast({ title: "Deckify", body: "⏭ Next track", duration: 1500 });
          } else if (btn === 0) {
            backendControlPlayback("play_pause", "").catch(() => {});
            toaster.toast({ title: "Deckify", body: "⏯ Play / Pause", duration: 1500 });
          } else if (btn === 9) {
            backendGetStatus().then((s) => {
              if (s) {
                const nv = Math.min(100, (s.volume ?? 50) + 5);
                backendSetVolume(nv);
                toaster.toast({ title: "Deckify", body: `🔊 Volume: ${nv}%`, duration: 1200 });
              }
            }).catch(() => {});
          } else if (btn === 10) {
            backendGetStatus().then((s) => {
              if (s) {
                const nv = Math.max(0, (s.volume ?? 50) - 5);
                backendSetVolume(nv);
                toaster.toast({ title: "Deckify", body: `🔉 Volume: ${nv}%`, duration: 1200 });
              }
            }).catch(() => {});
          }
        }
      };
      const onUp = (btn: number) => {
        if (btn === 13 || btn === 14) guideHeld = false;
      };
      src.RegisterForGamepadButtonDown(onDown);
      if (src.RegisterForGamepadButtonUp) {
        src.RegisterForGamepadButtonUp(onUp);
      }
      cleanupChords = () => {
        guideHeld = false;
      };
    }
  } catch (e) {
    console.warn("Deckify: Gamepad chords setup error:", e);
  }

  // 5. In-game track change toast notification (silent sound: 0, click opens modal)
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
        sound: 0 as any,
        onClick: openExpandedView,
        logo: artwork ? (
          <img src={artwork} width={28} height={28} style={{ borderRadius: 4, objectFit: "cover" }} />
        ) : (
          <FaSpotify color="#1db954" />
        ),
      } as any);
    } catch {}
  });

  // 6. In-game Auto-Ducking & App Lifetime Listener (with per-game profiles)
  let activeGameAppId: number | null = null;
  let gameExitDebounceTimer: any = null;
  let appLifetimeSub: any = null;
  try {
    const steamApps = (window as any).SteamClient?.Apps;
    if (steamApps?.RegisterForAppLifetimeNotifications) {
      appLifetimeSub = steamApps.RegisterForAppLifetimeNotifications(async (ev: any) => {
        if (!ev) return;
        const appId = ev.unAppID || ev.nAppID;
        const running = Boolean(ev.bRunning);
        if (running && appId) {
          if (gameExitDebounceTimer) {
            clearTimeout(gameExitDebounceTimer);
            gameExitDebounceTimer = null;
          }
          activeGameAppId = appId;
          await backendTriggerDucking(true, "game", appId).catch(() => {});
        } else if (!running && activeGameAppId && appId === activeGameAppId) {
          if (gameExitDebounceTimer) clearTimeout(gameExitDebounceTimer);
          gameExitDebounceTimer = setTimeout(async () => {
            activeGameAppId = null;
            gameExitDebounceTimer = null;
            await backendTriggerDucking(false, "game").catch(() => {});
          }, 3000);
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
        if (gameExitDebounceTimer) {
          clearTimeout(gameExitDebounceTimer);
          gameExitDebounceTimer = null;
        }
        if (appLifetimeSub?.unregister) {
          appLifetimeSub.unregister();
        }
        unregisterMenu();
        routerHook.removeRoute("/deckify");
        try {
          routerHook.removeGlobalComponent("DeckifyOverlay");
        } catch {}
        removeEventListener("track_metadata", trackSub);
        const chordsCleaner: any = cleanupChords;
        if (typeof chordsCleaner === "function") chordsCleaner();
      } catch (e) {
        console.warn("Deckify dismount cleanup error:", e);
      }
    },
  };
});
