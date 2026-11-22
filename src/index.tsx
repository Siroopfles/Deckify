import { useEffect, useState, useCallback, useRef, FC, ReactNode } from "react";
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
  Router,
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
import { SilentBanner } from "./components/SilentBanner";
import { emitBanner, BannerTone } from "./bannerBus";
import {
  CHORD_ACTIONS,
  DEFAULT_CHORD_BINDINGS,
  MAX_BUTTON_ID,
  MIN_BUTTON_ID,
  createChordMatcher,
  isChordRecordingActive,
  mapControllerInputButton,
  setChordRecordingActive,
  type ChordMatcher,
} from "./chords";
import { usePlaybackClock } from "./hooks/usePlaybackClock";
import { formatMs, focusHalo } from "./components/common/InteractiveRow";
import { DeckifyImage } from "./components/common/DeckifyImage";
import { fetchWithQueueAndCache, imgMemoryCache } from "./components/common/imagePipeline";
import { parseLrc } from "./utils";
import { playNotificationChime } from "./utils/chime";
import { isSpokenContent, getNextCycleSpeed, formatPlaybackSpeed } from "./utils/playback";
import { getThemeCssVars, syncThemeFromState, useAccentTheme } from "./utils/themeBus";
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
  FaCompactDisc,
  FaChevronDown,
  FaChevronRight,
  FaMoon,
} from "react-icons/fa";
import { QRCodeSVG } from "qrcode.react";
import type {
  AccentThemeMode,
  AudioStreamInfo,
  ChordActionId,
  ChordBindingsMap,
  DuckingState,
  EcoStatusInfo,
  EngineSettings,
  PinnedPlaylistItem,
  ResilienceStatusInfo,
  SpotifyDevice,
  StatusResponse,
  SyncedLine,
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
const backendTriggerDucking = callable<
  [boolean, string?, number?],
  { ok: boolean; is_ducked?: boolean; effective_volume?: number; has_game_override?: boolean; error?: string }
>("trigger_ducking");
const backendGetDuckingState = callable<[], DuckingState>("get_ducking_state");
const backendHandleAppLifetimeEvent = callable<[number, boolean], { ok: boolean; error?: string }>("handle_app_lifetime_event");
const backendBindCurrentMusicToGame = callable<[number, string?], { ok: boolean; error?: string }>("bind_current_music_to_game");
const backendQuickPlayPinned = callable<[string, string], { ok: boolean; error?: string }>("quick_play_pinned");
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
const backendGetTrackLyricsOffset = callable<
  [string],
  { ok: boolean; offset_ms?: number }
>("get_track_lyrics_offset");
const backendRestoreBookmark = callable<[], { ok: boolean; error?: string }>("restore_bookmark");
const backendDismissBookmark = callable<[], { ok: boolean }>("dismiss_bookmark");
const backendSetPlaybackSpeed = callable<[number], { ok: boolean; speed?: number; unsupported_backend?: boolean; error?: string }>("set_playback_speed");
void backendDismissBookmark;

let currentRunningAppId: number | null = null;
const activeGameListeners = new Set<(appId: number | null) => void>();
const setActiveGameState = (appId: number | null) => {
  currentRunningAppId = appId;
  activeGameListeners.forEach((cb) => cb(appId));
};

interface GamepadInputSourceLike {
  RegisterForGamepadButtonDown?: (cb: (btn: number) => void) => unknown;
  RegisterForGamepadButtonUp?: (cb: (btn: number) => void) => unknown;
}

const cloneDefaultBindings = (): ChordBindingsMap => {
  const copy: ChordBindingsMap = {};
  for (const action of CHORD_ACTIONS) {
    copy[action.id] = [...DEFAULT_CHORD_BINDINGS[action.id]];
  }
  return copy;
};

const mergeChordBindings = (raw?: ChordBindingsMap | null): ChordBindingsMap => {
  const next = cloneDefaultBindings();
  if (!raw || typeof raw !== "object") return next;
  for (const action of CHORD_ACTIONS) {
    if (Array.isArray(raw[action.id])) {
      next[action.id] = [...raw[action.id]!];
    }
  }
  return next;
};

let bigOpen = false;
const modalOpenListeners = new Set<(open: boolean) => void>();
let activeChordMatcher: ChordMatcher | null = null;
const setModalOpenState = (open: boolean) => {
  bigOpen = open;
  activeChordMatcher?.setSuppressed(open || isChordRecordingActive());
  modalOpenListeners.forEach((cb) => cb(open));
};
const openExpandedView = () => {
  if (bigOpen) return;
  setModalOpenState(true);
  showModal(
    <DeckifyExpandedModal
      closeModal={() => {
        setModalOpenState(false);
      }}
    />
  );
};

let toastEnabled = true;
let toastSoundEnabled = false;
let silentBannerEnabled = true;
let cachedChordsEnabled = true;
let cachedBindings: ChordBindingsMap = cloneDefaultBindings();
let cachedTrackMeta: TrackMeta | null = null;
let cachedIsLiked = false;
let cachedIsPlaying = false;
let cachedVolume = 50;
let cachedContextUri: string | null = null;
let cachedPinnedPlaylists: PinnedPlaylistItem[] = [];
let cachedOverlayLyricsEnabled = false;
let cachedAccentTheme: AccentThemeMode = "spotify_green";
let cachedArtworkUrl: string | null = null;
let cachedAnimationsSuspended = false;
let lastPinnedIndex = -1;
let likeRequestSeq = 0;
let pinnedCycleSeq = 0;
let lastToastTrackId = "";

const applyThemeBusSync = () => {
  void syncThemeFromState({
    accentTheme: cachedAccentTheme,
    artworkUrl: cachedArtworkUrl,
    animationsSuspended: cachedAnimationsSuspended,
  });
};

const syncNotificationSettings = (settings?: Partial<EngineSettings> | null) => {
  if (!settings || typeof settings !== "object") return;
  if (typeof settings.toast_enabled === "boolean") {
    toastEnabled = settings.toast_enabled;
  }
  if (typeof settings.toast_sound_enabled === "boolean") {
    toastSoundEnabled = settings.toast_sound_enabled;
  }
  if (typeof settings.silent_banner_enabled === "boolean") {
    silentBannerEnabled = settings.silent_banner_enabled;
  }
  if (typeof settings.gamepad_chords_enabled === "boolean") {
    cachedChordsEnabled = settings.gamepad_chords_enabled;
  }
  if (typeof settings.overlay_lyrics_enabled === "boolean") {
    cachedOverlayLyricsEnabled = settings.overlay_lyrics_enabled;
  }
  if (Array.isArray(settings.pinned_playlists)) {
    cachedPinnedPlaylists = [...settings.pinned_playlists];
    if (lastPinnedIndex >= cachedPinnedPlaylists.length) {
      lastPinnedIndex = -1;
    }
  }
  if (settings.accent_theme === "spotify_green" || settings.accent_theme === "dynamic_album" || settings.accent_theme === "steamos_blue") {
    cachedAccentTheme = settings.accent_theme;
  }
  if (settings.gamepad_chord_bindings && typeof settings.gamepad_chord_bindings === "object") {
    cachedBindings = mergeChordBindings(settings.gamepad_chord_bindings);
    activeChordMatcher?.setBindings(cachedBindings);
  }
};

const syncRuntimeStatus = (
  status?: StatusResponse | null,
  options?: { syncLiked?: boolean },
) => {
  if (!status || typeof status !== "object") return;
  if (status.settings) {
    syncNotificationSettings(status.settings);
  }
  const t = status.track || status.track_meta;
  if (t && typeof t === "object") {
    cachedTrackMeta = t;
    cachedArtworkUrl = t.artwork_url || t.image_url || null;
    const initTrackId = String(t.track_id ?? t.id ?? t.name ?? "");
    if (!lastToastTrackId && initTrackId) {
      lastToastTrackId = initTrackId;
    }
    if (options?.syncLiked !== false && typeof t.is_liked === "boolean") {
      cachedIsLiked = t.is_liked;
    }
  } else if (status.track === null) {
    cachedArtworkUrl = null;
  }
  if (status.eco_status && typeof status.eco_status === "object") {
    cachedAnimationsSuspended = Boolean(status.eco_status.animations_suspended);
  }
  if (options?.syncLiked !== false && typeof status.is_liked === "boolean") {
    cachedIsLiked = status.is_liked;
  }
  if (typeof status.is_playing === "boolean") {
    cachedIsPlaying = status.is_playing;
  }
  if (typeof status.volume === "number") {
    cachedVolume = status.volume;
  }
  if (status.context_uri !== undefined) {
    cachedContextUri = status.context_uri ?? null;
  }
  applyThemeBusSync();
};

const syncLibrespotEvent = (ev: unknown): void => {
  if (!ev || typeof ev !== "object") return;
  const data = ev as { event?: unknown; volume?: unknown };
  if (data.event === "playing" || data.event === "started") {
    cachedIsPlaying = true;
  } else if (
    data.event === "paused" ||
    data.event === "stopped" ||
    data.event === "session_disconnected"
  ) {
    cachedIsPlaying = false;
  }
  if (typeof data.volume === "number") {
    cachedVolume = data.volume;
  }
};

const notifyMessage = (text: string, tone: BannerTone = "accent") => {
  if (silentBannerEnabled !== false) {
    emitBanner({ text, tone });
    return;
  }
  try {
    toaster.toast({
      title: "Deckify",
      body: text,
      duration: 2500,
      playSound: false,
    } as any);
  } catch {}
};

const resetModuleRuntimeState = () => {
  toastEnabled = true;
  toastSoundEnabled = false;
  silentBannerEnabled = true;
  cachedChordsEnabled = true;
  cachedBindings = cloneDefaultBindings();
  cachedTrackMeta = null;
  cachedIsLiked = false;
  cachedIsPlaying = false;
  cachedVolume = 50;
  cachedContextUri = null;
  cachedPinnedPlaylists = [];
  cachedOverlayLyricsEnabled = false;
  cachedAccentTheme = "spotify_green";
  cachedArtworkUrl = null;
  cachedAnimationsSuspended = false;
  lastPinnedIndex = -1;
  likeRequestSeq = 0;
  pinnedCycleSeq = 0;
  lastToastTrackId = "";
  setChordRecordingActive(false);
  setModalOpenState(false);
};

const handleVolumeChord = async (delta: number): Promise<void> => {
  try {
    const status = await backendGetStatus().catch(() => null);
    if (status) syncRuntimeStatus(status);
    const base = typeof status?.volume === "number" ? status.volume : cachedVolume;
    const nv = delta > 0 ? Math.min(100, base + delta) : Math.max(0, base + delta);
    cachedVolume = nv;
    await backendSetVolume(nv).catch(() => {});
    notifyMessage(`🔊 Volume ${nv}%`, "accent");
  } catch {}
};

async function safeRpc<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

const syncTrackMetadataCache = (meta: unknown): TrackMeta | null => {
  if (!meta || typeof meta !== "object") return null;
  const parsed = meta as TrackMeta;
  const prevTrackId = String(
    cachedTrackMeta?.track_id ?? cachedTrackMeta?.id ?? cachedTrackMeta?.name ?? "",
  );
  const nextTrackId = String(parsed.track_id ?? parsed.id ?? parsed.name ?? "");
  cachedTrackMeta = parsed;
  if (typeof parsed.is_liked === "boolean") {
    cachedIsLiked = parsed.is_liked;
  } else if (prevTrackId && nextTrackId && prevTrackId !== nextTrackId) {
    cachedIsLiked = false;
  }
  return parsed;
};

const handleTrackMetadataNotification = async (meta: unknown): Promise<void> => {
  const parsed = syncTrackMetadataCache(meta);
  if (!parsed || !parsed.name) return;
  const dedupTrackId = String(parsed.track_id ?? parsed.id ?? parsed.name);
  if (dedupTrackId === lastToastTrackId) return;
  lastToastTrackId = dedupTrackId;
  const likeSeqAtStart = likeRequestSeq;
  const curStatus = await safeRpc(() => backendGetStatus());
  if (curStatus) {
    syncRuntimeStatus(curStatus, { syncLiked: likeSeqAtStart === likeRequestSeq });
  }
  if (toastEnabled === false) return;
  const artwork = parsed.artwork_url || parsed.image_url;
  if (silentBannerEnabled !== false) {
    emitBanner({
      text: parsed.name,
      secondaryText: parsed.artist || undefined,
      imageUrl: resolveCachedArtworkSync(artwork),
      tone: "accent",
    });
    if (toastSoundEnabled) {
      playNotificationChime(cachedVolume);
    }
    return;
  }
  const resolvedArtwork = await safeRpc(() => resolveProxiedArtworkAsync(artwork));
  showTrackToaster(parsed, resolvedArtwork, toastSoundEnabled);
};

const handleLikeChord = async (): Promise<void> => {
  let tid = cachedTrackMeta?.track_id || cachedTrackMeta?.id;
  if (!tid) {
    const status = await safeRpc(() => backendGetStatus());
    if (status) syncRuntimeStatus(status);
    tid = cachedTrackMeta?.track_id || cachedTrackMeta?.id;
  }
  if (!tid) {
    notifyMessage("Couldn't update Liked Songs — try again", "error");
    return;
  }
  const prevLiked = cachedIsLiked;
  const nextLiked = !prevLiked;
  const trackName = cachedTrackMeta?.name || "Track";
  const seq = ++likeRequestSeq;
  if (!lastToastTrackId) {
    lastToastTrackId = String(cachedTrackMeta?.track_id ?? tid);
  }
  cachedIsLiked = nextLiked;
  notifyMessage(
    nextLiked ? `♥ Liked: ${trackName}` : "♡ Removed from Liked",
    nextLiked ? "accent" : "neutral",
  );
  const res = await safeRpc(() => backendToggleLike(tid, nextLiked));
  if (seq !== likeRequestSeq) return;
  if (!res?.ok) {
    cachedIsLiked = prevLiked;
    notifyMessage("Couldn't update Liked Songs — try again", "error");
    return;
  }
  cachedIsLiked = typeof res.is_liked === "boolean" ? res.is_liked : nextLiked;
};

const handlePinnedCycleChord = async (): Promise<void> => {
  const pinned = cachedPinnedPlaylists;
  if (pinned.length === 0) {
    notifyMessage("No pinned playlists", "neutral");
    return;
  }
  let activeIdx = cachedContextUri
    ? pinned.findIndex((p) => p.uri === cachedContextUri)
    : -1;
  if (activeIdx < 0 && lastPinnedIndex >= 0 && lastPinnedIndex < pinned.length) {
    activeIdx = lastPinnedIndex;
  }
  const nextIdx = activeIdx >= 0 ? (activeIdx + 1) % pinned.length : 0;
  const prevUri = cachedContextUri;
  const prevIdx = lastPinnedIndex;
  const seq = ++pinnedCycleSeq;
  const target = pinned[nextIdx];
  lastPinnedIndex = nextIdx;
  cachedContextUri = target.uri;
  const res = await safeRpc(() => backendQuickPlayPinned(target.uri, target.type));
  if (seq !== pinnedCycleSeq) return;
  if (res?.ok) {
    notifyMessage(`▶ Pinned ${nextIdx + 1}/${pinned.length}: ${target.name}`, "accent");
    return;
  }
  cachedContextUri = prevUri;
  lastPinnedIndex = prevIdx;
  notifyMessage("Couldn't start pinned playlist", "error");
};

const handleToggleLyricsChord = async (): Promise<void> => {
  const prevLyrics = cachedOverlayLyricsEnabled;
  const nextLyrics = !prevLyrics;
  const res = await safeRpc(() => backendSetSetting("overlay_lyrics_enabled", nextLyrics));
  if (res?.ok) {
    cachedOverlayLyricsEnabled = nextLyrics;
    notifyMessage(
      nextLyrics ? "Lyrics HUD On" : "Lyrics HUD Off",
      nextLyrics ? "accent" : "neutral",
    );
    return;
  }
  cachedOverlayLyricsEnabled = prevLyrics;
  notifyMessage("Couldn't save lyrics setting", "error");
};

const executeChordAction = async (actionId: ChordActionId): Promise<void> => {
  switch (actionId) {
    case "previous":
      void backendControlPlayback("previous", "").catch(() => {});
      notifyMessage("⏮ Previous", "accent");
      break;
    case "next":
      void backendControlPlayback("next", "").catch(() => {});
      notifyMessage("⏭ Next", "accent");
      break;
    case "play_pause": {
      const wasPlaying = cachedIsPlaying;
      cachedIsPlaying = !wasPlaying;
      void backendControlPlayback("play_pause", "").catch(() => {});
      notifyMessage(wasPlaying ? "⏸ Paused" : "⏯ Playing", "accent");
      break;
    }
    case "volume_up":
      await handleVolumeChord(5);
      break;
    case "volume_down":
      await handleVolumeChord(-5);
      break;
    case "toggle_like":
      await handleLikeChord();
      break;
    case "cycle_pinned":
      await handlePinnedCycleChord();
      break;
    case "toggle_lyrics":
      await handleToggleLyricsChord();
      break;
  }
};

const getInputSource = (): GamepadInputSourceLike | null => {
  if (typeof window === "undefined") return null;
  const win = window as unknown as {
    GamepadNavTree?: { m_context?: { m_controller?: { m_rgGamepadInputSources?: GamepadInputSourceLike[] } } };
    FocusNavController?: { m_rgGamepadInputSources?: GamepadInputSourceLike[] };
  };
  const fc = win?.GamepadNavTree?.m_context?.m_controller || win?.FocusNavController;
  return fc?.m_rgGamepadInputSources?.[0] ?? null;
};

const unregisterHandle = (handle: unknown): void => {
  if (typeof handle === "function") {
    (handle as () => void)();
  } else if (handle && typeof (handle as { unregister?: unknown }).unregister === "function") {
    (handle as { unregister: () => void }).unregister();
  } else if (handle && typeof (handle as { Unregister?: unknown }).Unregister === "function") {
    (handle as { Unregister: () => void }).Unregister();
  }
};

const CHORD_EVENT_DEDUP_MS = 50;

const setupChordListener = (): (() => void) | null => {
  try {
    const win = typeof window !== "undefined" ? (window as any) : null;
    let disposed = false;
    const matcher = createChordMatcher(cachedBindings, {
      onFire: (actionId) => {
        if (disposed || !cachedChordsEnabled || bigOpen || isChordRecordingActive()) return;
        void executeChordAction(actionId).catch(() => {});
      },
    });
    activeChordMatcher = matcher;

    // Bounded to at most (MAX_BUTTON_ID - MIN_BUTTON_ID + 1) * 2 <= 58 keys (T-20-17)
    const lastEventByKey = new Map<string, { ts: number; source: "frontend" | "backend" }>();

    const handleButtonEvent = (
      btn: number,
      isPressed: boolean,
      source: "frontend" | "backend",
    ) => {
      if (
        !Number.isInteger(btn) ||
        btn < MIN_BUTTON_ID ||
        btn > MAX_BUTTON_ID ||
        typeof isPressed !== "boolean"
      ) {
        return;
      }
      const now = Date.now();
      const dedupKey = `${btn}:${isPressed ? 1 : 0}`;
      const prev = lastEventByKey.get(dedupKey);
      if (prev !== undefined && prev.source !== source && now - prev.ts < CHORD_EVENT_DEDUP_MS) {
        return;
      }
      lastEventByKey.set(dedupKey, { ts: now, source });

      if (isPressed) {
        if (disposed || !cachedChordsEnabled || bigOpen || isChordRecordingActive()) {
          matcher.reset();
          return;
        }
        matcher.onButtonDown(btn);
      } else if (!disposed) {
        matcher.onButtonUp(btn);
      }
    };

    let frontendHandles: unknown[] = [];
    const teardownFrontendInput = () => {
      for (const h of frontendHandles) {
        unregisterHandle(h);
      }
      frontendHandles = [];
    };

    const subscribeFrontendInput = () => {
      teardownFrontendInput();
      if (disposed) return;

      const registerControllerInput = win?.SteamClient?.Input?.RegisterForControllerInputMessages;
      if (typeof registerControllerInput === "function") {
        try {
          const inputHandle = registerControllerInput(
            (arg0: unknown, arg1?: unknown, arg2?: unknown) => {
              if (Array.isArray(arg0)) {
                for (const msg of arg0) {
                  if (!msg || typeof msg !== "object") continue;
                  const { nA, bS } = msg as { nA?: unknown; bS?: unknown };
                  if (typeof nA !== "number" || typeof bS !== "boolean") continue;
                  const mapped = mapControllerInputButton(nA);
                  if (mapped === null) continue;
                  handleButtonEvent(mapped, bS, "frontend");
                }
                return;
              }
              if (typeof arg1 !== "number" || typeof arg2 !== "boolean") return;
              const mapped = mapControllerInputButton(arg1);
              if (mapped === null) return;
              handleButtonEvent(mapped, arg2, "frontend");
            },
          );
          if (inputHandle != null) frontendHandles.push(inputHandle);
          return;
        } catch (err) {
          console.debug("Deckify: RegisterForControllerInputMessages unavailable:", err);
        }
      }

      const registerStateChanges = win?.SteamClient?.Input?.RegisterForControllerStateChanges;
      if (typeof registerStateChanges === "function") {
        try {
          const prevButtonsByController = new Map<number, bigint>();
          const stateHandle = registerStateChanges((states: unknown) => {
            const list = Array.isArray(states) ? states : states ? [states] : [];
            for (const rawState of list) {
              if (!rawState || typeof rawState !== "object") continue;
              const state = rawState as {
                unControllerIndex?: unknown;
                nControllerIndex?: unknown;
                ulButtons?: unknown;
              };
              const idx =
                typeof state.unControllerIndex === "number"
                  ? state.unControllerIndex
                  : typeof state.nControllerIndex === "number"
                    ? state.nControllerIndex
                    : 0;
              let curr: bigint;
              try {
                const rawButtons = state.ulButtons ?? 0;
                if (
                  typeof rawButtons !== "number" &&
                  typeof rawButtons !== "bigint" &&
                  typeof rawButtons !== "string"
                ) {
                  continue;
                }
                curr = BigInt(rawButtons);
              } catch {
                continue;
              }
              const prev = prevButtonsByController.get(idx) ?? 0n;
              const changed = curr ^ prev;
              if (changed === 0n) continue;
              prevButtonsByController.set(idx, curr);
              for (let btn = 1; btn <= MAX_BUTTON_ID; btn++) {
                const mask = 1n << BigInt(btn);
                if ((changed & mask) !== 0n) {
                  handleButtonEvent(btn, (curr & mask) !== 0n, "frontend");
                }
              }
            }
          });
          if (stateHandle != null) frontendHandles.push(stateHandle);
          return;
        } catch (err) {
          console.debug("Deckify: RegisterForControllerStateChanges unavailable:", err);
        }
      }

      try {
        const src = getInputSource();
        if (src?.RegisterForGamepadButtonDown) {
          const downHandle = src.RegisterForGamepadButtonDown((btn: number) => {
            handleButtonEvent(btn, true, "frontend");
          });
          const upHandle = src.RegisterForGamepadButtonUp
            ? src.RegisterForGamepadButtonUp((btn: number) => {
                handleButtonEvent(btn, false, "frontend");
              })
            : null;
          if (downHandle != null) frontendHandles.push(downHandle);
          if (upHandle != null) frontendHandles.push(upHandle);
        }
      } catch (err) {
        console.debug("Deckify: FocusNavController input unavailable:", err);
      }
    };

    subscribeFrontendInput();

    const backendInputSub = addEventListener<[unknown]>("controller_input", (ev: unknown) => {
      if (!ev || typeof ev !== "object") return;
      const { button, pressed } = ev as { button?: unknown; pressed?: unknown };
      if (
        typeof button !== "number" ||
        !Number.isInteger(button) ||
        button < 1 ||
        button > MAX_BUTTON_ID ||
        typeof pressed !== "boolean"
      ) {
        return;
      }
      handleButtonEvent(button, pressed, "backend");
    });

    const resumeEventSub = addEventListener<[unknown]>("deck_resumed", () => {
      if (disposed) return;
      matcher.reset();
      subscribeFrontendInput();
    });

    const registerOnResume = win?.SteamClient?.System?.RegisterForOnResumeFromSuspend;
    let steamResumeHandle: unknown = null;
    if (typeof registerOnResume === "function") {
      try {
        steamResumeHandle = registerOnResume(() => {
          if (disposed) return;
          matcher.reset();
          subscribeFrontendInput();
        });
      } catch (err) {
        console.debug("Deckify: RegisterForOnResumeFromSuspend unavailable:", err);
      }
    }

    return () => {
      disposed = true;
      teardownFrontendInput();
      removeEventListener("controller_input", backendInputSub);
      removeEventListener("deck_resumed", resumeEventSub);
      unregisterHandle(steamResumeHandle);
      matcher.dispose();
      if (activeChordMatcher === matcher) {
        activeChordMatcher = null;
      }
    };
  } catch (e) {
    console.warn("Deckify: Gamepad chords setup error:", e);
    return null;
  }
};

const resolveCachedArtworkSync = (artwork?: string | null): string | null => {
  if (typeof artwork !== "string" || artwork.length === 0) return null;
  if (artwork.startsWith("data:") || artwork.startsWith("http://127.0.0.1")) {
    return artwork;
  }
  const cached = imgMemoryCache.get(artwork);
  if (cached) return cached;
  void fetchWithQueueAndCache(artwork);
  return null;
};

const resolveProxiedArtworkAsync = async (artwork?: string | null): Promise<string | null> => {
  if (typeof artwork !== "string" || artwork.length === 0) return null;
  if (artwork.startsWith("data:") || artwork.startsWith("http://127.0.0.1")) {
    return artwork;
  }
  return imgMemoryCache.get(artwork) ?? (await fetchWithQueueAndCache(artwork));
};

const showTrackToaster = (meta: any, resolvedArtwork: string | null, withSound: boolean) => {
  toaster.toast({
    title: meta.name,
    body: meta.artist ? `${meta.artist}` : "Deckify",
    duration: 3500,
    ...(withSound ? { sound: 1 } : {}),
    playSound: withSound,
    onClick: openExpandedView,
    logo: resolvedArtwork ? (
      <img
        src={resolvedArtwork}
        width={48}
        height={48}
        style={{ width: 48, height: 48, borderRadius: 6, objectFit: "cover", display: "block" }}
      />
    ) : (
      <FaSpotify color="var(--deckify-accent, #1DB954)" size={32} />
    ),
  } as any);
};

interface PinnedPillProps {
  pill: PinnedPlaylistItem;
  isActive: boolean;
  fallbackIcon: ReactNode;
  onClick: () => void;
}

const PinnedPill: FC<PinnedPillProps> = ({ pill, isActive, fallbackIcon, onClick }) => {
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
      data-deckify-pinned-pill="true"
      data-focused={focused ? "true" : "false"}
      style={{
        ...focusHalo(focused),
        minHeight: 36,
        maxWidth: 140,
        minWidth: "auto",
        padding: "4px 8px",
        borderRadius: 16,
        gap: 8,
        display: "inline-flex",
        alignItems: "center",
        flexShrink: 0,
        cursor: "pointer",
        border: focused
          ? "1px solid #fff"
          : isActive
          ? "1px solid var(--deckify-accent, #1DB954)"
          : "1px solid rgba(255,255,255,0.12)",
        background: focused
          ? isActive
            ? "rgba(var(--deckify-accent-rgb, 29, 185, 84), 0.28)"
            : "rgba(255, 255, 255, 0.18)"
          : isActive
          ? "rgba(var(--deckify-accent-rgb, 29, 185, 84), 0.16)"
          : "rgba(255, 255, 255, 0.08)",
        color: isActive ? "var(--deckify-accent, #1DB954)" : "#fff",
      }}
    >
      <DeckifyImage
        src={pill.image_url}
        width={20}
        height={20}
        style={{ borderRadius: 4, flexShrink: 0 }}
        fallback={fallbackIcon}
      />
      <span
        style={{
          fontSize: 12,
          fontWeight: 700,
          lineHeight: 1.2,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {pill.name}
      </span>
    </Focusable>
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
  const [hasGameOverride, setHasGameOverride] = useState<boolean>(false);
  const [activeGameAppId, setActiveGameAppId] = useState<number | null>(currentRunningAppId);
  const [contextUri, setContextUri] = useState<string | null>(null);
  const [optimisticContextUri, setOptimisticContextUri] = useState<string | null>(null);
  const [controlsExpanded, setControlsExpanded] = useState<boolean>(false);
  const [settings, setSettings] = useState<EngineSettings>({
    audio_backend: "librespot",
    audio_quality: "320",
    bitrate: 320,
    normalisation: true,
    gapless: true,
    autoplay: true,
  });
  const dockToastEnabledRef = useRef<boolean | undefined>(settings.dock_toast_enabled);
  dockToastEnabledRef.current = settings.dock_toast_enabled;
  const [resilienceStatus, setResilienceStatus] = useState<ResilienceStatusInfo | null>(null);
  const [ecoStatus, setEcoStatus] = useState<EcoStatusInfo | null>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const resilienceToastEnabledRef = useRef<boolean | undefined>(settings.resilience_toast_enabled);
  resilienceToastEnabledRef.current = settings.resilience_toast_enabled;

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
      syncRuntimeStatus(status);
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
      setContextUri(status.context_uri ?? null);
      setAudioStreamInfo(status.audio_stream_info || null);
      if (status.resilience_status !== undefined) {
        setResilienceStatus(status.resilience_status ?? null);
      }
      if (status.eco_status !== undefined) {
        setEcoStatus(status.eco_status ?? null);
      }
      if (typeof status.playback_speed === "number") {
        setPlaybackSpeed(status.playback_speed);
      }
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
        setHasGameOverride(Boolean(state.has_game_override));
        if (typeof state.effective_volume === "number") {
          setEffectiveVolume(state.effective_volume);
        }
      }
    }).catch(() => {});

    const unsubDucking = addEventListener<[any]>("ducking_state_changed", (data: any) => {
      if (!data) return;
      setIsDucked(Boolean(data.is_ducked));
      setHasGameOverride(Boolean(data.has_game_override));
      if (typeof data.effective_volume === "number") {
        setEffectiveVolume(data.effective_volume);
      }
    });

    activeGameListeners.add(setActiveGameAppId);
    setActiveGameAppId(currentRunningAppId);
    const unsubPrompt = addEventListener<[any]>("soundtrack_prompt_switch", (data: any) => {
      try {
        const gameName = data?.app_name ? ` for ${data.app_name}` : "";
        toaster.toast({
          title: "Deckify Soundtrack",
          body: `Soundtrack ready${gameName}. Open Deckify to switch.`,
          duration: 4500,
        });
      } catch {}
    });
    const unsubDock = addEventListener<[any]>("dock_audio_switched", (data: any) => {
      try {
        if (!data || data.toast_enabled === false || dockToastEnabledRef.current === false) {
          return;
        }
        const sinkLabel = data.sink_label || data.sink || "Audio Output";
        let body = "";
        if (data.action === "docked") {
          body = `Docked audio -> ${sinkLabel}`;
        } else if (data.action === "undocked") {
          body = `Undocked audio -> ${sinkLabel}`;
        } else if (data.action === "error") {
          body = "Dock audio switch failed — kept current audio output. Check PipeWire sinks in Settings.";
        }
        if (body) {
          toaster.toast({
            title: "Deckify",
            body,
            duration: 3500,
          });
        }
      } catch {}
    });

    const unsubLibre = addEventListener<[any]>("librespot_event", (ev: any) => {
      if (!ev || typeof ev !== "object") return;
      if (ev.event === "playing" || ev.event === "started") {
        setIsPlaying(true);
      } else if (ev.event === "paused" || ev.event === "stopped" || ev.event === "session_disconnected") {
        setIsPlaying(false);
      }
      if (typeof ev.position_ms === "number") {
        setServerPositionMs(ev.position_ms);
      }
      if (typeof ev.duration_ms === "number") {
        setDurationMs(ev.duration_ms);
      }
      if (typeof ev.volume === "number") {
        setVolume(ev.volume);
      }
    });

    const unsubTrackMeta = addEventListener<[any]>("track_metadata", (meta: any) => {
      if (!meta || typeof meta !== "object") return;
      setTrackMeta(meta);
      if (typeof meta.duration_ms === "number" && meta.duration_ms > 0) {
        setDurationMs(meta.duration_ms);
      }
      if (typeof meta.is_liked === "boolean") {
        setIsLiked(meta.is_liked);
      }
    });

    const unsubResilience = addEventListener<[any]>("resilience_status", (data: any) => {
      if (data && typeof data === "object") {
        setResilienceStatus(data as ResilienceStatusInfo);
      }
    });

    const unsubEco = addEventListener<[unknown]>("eco_status_changed", (data: unknown) => {
      if (data && typeof data === "object") {
        const nextEco = data as EcoStatusInfo;
        setEcoStatus(nextEco);
        cachedAnimationsSuspended = Boolean(nextEco.animations_suspended);
        applyThemeBusSync();
      }
    });

    const unsubRestored = addEventListener<[any]>("session_restored", (data: any) => {
      try {
        if (!data || data.toast_enabled === false || resilienceToastEnabledRef.current === false) {
          return;
        }
        const trackLabel = data.track_name
          ? `${data.track_name}${data.artist ? ` — ${data.artist}` : ""}`
          : "previous session";
        toaster.toast({
          title: "Deckify",
          body: `Resumed ${trackLabel}`,
          duration: 3000,
        });
      } catch {}
    });

    const unsubPlaybackSpeed = addEventListener<[any]>("playback_speed_changed", (data: any) => {
      if (data && typeof data.speed === "number") {
        setPlaybackSpeed(data.speed);
      }
    });

    return () => {
      activeGameListeners.delete(setActiveGameAppId);
      removeEventListener("ducking_state_changed", unsubDucking);
      removeEventListener("soundtrack_prompt_switch", unsubPrompt);
      removeEventListener("dock_audio_switched", unsubDock);
      removeEventListener("librespot_event", unsubLibre);
      removeEventListener("track_metadata", unsubTrackMeta);
      removeEventListener("resilience_status", unsubResilience);
      removeEventListener("eco_status_changed", unsubEco);
      removeEventListener("session_restored", unsubRestored);
      removeEventListener("playback_speed_changed", unsubPlaybackSpeed);
    };
  }, []);

  const handleRestoreBookmark = async () => {
    try {
      const res = await backendRestoreBookmark();
      if (res?.ok) {
        setResilienceStatus((prev) => (prev ? { ...prev, held_bookmark: null, held_reason: null } : prev));
        await refreshStatus();
      } else if (res?.error) {
        toaster.toast({ title: "Deckify", body: res.error, duration: 3000 });
      }
    } catch {
      toaster.toast({ title: "Deckify", body: "Failed to restore bookmark", duration: 3000 });
    }
  };

  const handleWakeAndPlay = async () => {
    try {
      const res = await backendControlPlayback("play", "");
      if (res?.ok === false) {
        toaster.toast({
          title: "Deckify",
          body: "Could not wake playback engine — open Settings to check engine status.",
          duration: 3500,
        });
      } else {
        setEcoStatus((prev) => (prev ? { ...prev, engine_sleeping: false } : prev));
        await refreshStatus();
      }
    } catch {
      toaster.toast({
        title: "Deckify",
        body: "Could not wake playback engine — open Settings to check engine status.",
        duration: 3500,
      });
    }
  };

  const handleQuickBind = async () => {
    if (!activeGameAppId) return;
    try {
      const mainApp = Router?.MainRunningApp;
      const mainAppId = Number(mainApp?.appid);
      const runningAppName =
        mainAppId === activeGameAppId && typeof mainApp?.display_name === "string"
          ? mainApp.display_name.trim()
          : "";
      const res = await backendBindCurrentMusicToGame(activeGameAppId, runningAppName);
      toaster.toast({
        title: "Deckify",
        body: res?.ok ? "Music bound to current game!" : res?.error || "Failed to bind music to game",
        duration: 3000,
      });
    } catch {
      toaster.toast({ title: "Deckify", body: "Failed to bind music to game", duration: 3000 });
    }
  };

  const handleQuickPlayPinned = async (pill: PinnedPlaylistItem) => {
    setOptimisticContextUri(pill.uri);
    try {
      const res = await backendQuickPlayPinned(pill.uri, pill.type);
      if (!res?.ok) {
        setOptimisticContextUri(null);
        toaster.toast({
          title: "Deckify",
          body: res?.error || "Failed to start pinned playlist — check Spotify connection or engine",
          duration: 3000,
        });
      } else {
        setContextUri(pill.uri);
        cachedContextUri = pill.uri;
        setOptimisticContextUri(null);
        refreshStatus();
      }
    } catch {
      setOptimisticContextUri(null);
      toaster.toast({
        title: "Deckify",
        body: "Failed to start pinned playlist — check Spotify connection or engine",
        duration: 3000,
      });
    }
  };

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

  const handleCycleSpeed = async () => {
    const next = getNextCycleSpeed(playbackSpeed);
    try {
      const res = await backendSetPlaybackSpeed(next);
      if (res?.ok) {
        setPlaybackSpeed(res.speed ?? next);
      } else if (res?.unsupported_backend) {
        toaster.toast({
          title: "Deckify",
          body: "Playback speed requires the Official Spotify Client engine.",
          duration: 3000,
        });
      } else {
        toaster.toast({
          title: "Deckify",
          body: res?.error || "Failed to change playback speed — please try again.",
          duration: 3000,
        });
      }
    } catch {
      toaster.toast({
        title: "Deckify",
        body: "Failed to change playback speed — please try again.",
        duration: 3000,
      });
    }
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
    if (res.ok) {
      const next = Boolean(res.is_liked);
      setIsLiked(next);
      cachedIsLiked = next;
    }
  };

  const handleVolumeChange = async (val: number) => {
    setVolume(val);
    cachedVolume = val;
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

  const isPodcast = isSpokenContent(trackMeta);
  const activeBackend = settings.audio_backend || "librespot";
  const pinnedPlaylists = settings.pinned_playlists || [];
  const activeContextUri = optimisticContextUri ?? contextUri;
  const positionMs = clock.positionMs;
  const durationSec = Math.floor(durationMs / 1000);
  const positionSec = Math.floor(positionMs / 1000);

  const renderOpenFullScreenButton = () => (
    <PanelSectionRow>
      <ButtonItem onClick={openExpandedView}>
        Open Deckify (Full Screen)
      </ButtonItem>
    </PanelSectionRow>
  );

  const renderEngineToggle = () => (
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
  );

  const renderBindButton = () =>
    activeGameAppId !== null ? (
      <PanelSectionRow>
        <ButtonItem onClick={handleQuickBind}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              color: "var(--deckify-accent, #1DB954)",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            <FaPlus />
            <span>Bind current music to game</span>
          </span>
        </ButtonItem>
      </PanelSectionRow>
    ) : null;

  const renderDeviceDropdown = () =>
    devices.length > 0 ? (
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
    ) : null;

  const renderOverlayControls = () => (
    <>
      <PanelSectionRow>
        <ToggleField
          label="In-Game Overlay (HUD)"
          description={settings.overlay_enabled ? "Visible during gameplay" : "Disabled"}
          checked={Boolean(settings.overlay_enabled)}
          onChange={async (val) => {
            setSettings((prev) => ({ ...prev, overlay_enabled: val }));
            await backendSetSetting("overlay_enabled", val);
          }}
        />
      </PanelSectionRow>

      {settings.overlay_enabled && (() => {
        const autoHideSec = settings.overlay_autohide_duration_s ?? 6;
        return (
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
                label={`Auto-Hide Overlay (${autoHideSec}s)`}
                description={`Fades out ${autoHideSec}s after track starts or resumes`}
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

            <PanelSectionRow>
              <ToggleField
                label="Overlay Lyrics"
                description="Show live synced lyric line in HUD"
                checked={Boolean(settings.overlay_lyrics_enabled)}
                onChange={async (val) => {
                  cachedOverlayLyricsEnabled = val;
                  setSettings((prev) => ({
                    ...prev,
                    overlay_lyrics_enabled: val,
                  }));
                  await backendSetSetting("overlay_lyrics_enabled", val);
                }}
              />
            </PanelSectionRow>
          </>
        );
      })()}
    </>
  );

  const { accent, animationsSuspended } = useAccentTheme();

  return (
    <div
      data-deckify-qam-root="true"
      style={{ display: "contents", ...getThemeCssVars(accent, animationsSuspended) }}
    >
      <PanelSection title="Deckify">
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

        {/* Conditional Held Bookmark Prompt (D-09: compact when no bookmark is held) */}
        {resilienceStatus?.held_bookmark && settings.resilience_prompt_held_enabled !== false && (
          <PanelSectionRow>
            <ButtonItem
              description={
                resilienceStatus.held_bookmark.track_name
                  ? `${resilienceStatus.held_bookmark.track_name}${resilienceStatus.held_bookmark.artist ? ` — ${resilienceStatus.held_bookmark.artist}` : ""}`
                  : resilienceStatus.held_reason === "remote_active"
                  ? "Yielded to active remote device"
                  : "Saved playback bookmark"
              }
              onClick={handleRestoreBookmark}
            >
              Resume Bookmark
            </ButtonItem>
          </PanelSectionRow>
        )}

        {/* Eco-Sleep Active Banner (ECO-01) */}
        {ecoStatus?.engine_sleeping && (
          <PanelSectionRow>
            <div
              style={{
                padding: "12px 16px",
                borderRadius: 8,
                background: "rgba(255, 255, 255, 0.06)",
                border: "1px solid rgba(255, 193, 7, 0.35)",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 16, fontWeight: 700, color: "#FFD54F" }}>
                <FaMoon size={14} />
                <span>Eco-Sleep Active</span>
              </div>
              <div style={{ fontSize: 14, opacity: 0.8, lineHeight: 1.4 }}>
                Engine paused on battery to save power. Press Play to wake.
              </div>
              <DialogButton
                onClick={handleWakeAndPlay}
                style={{
                  minHeight: 44,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  fontSize: 12,
                  fontWeight: 700,
                  color: "var(--deckify-accent, #1DB954)",
                }}
              >
                <FaPlay size={12} />
                <span>Wake &amp; Play</span>
              </DialogButton>
            </div>
          </PanelSectionRow>
        )}

        {/* Primary Top Zone: Compact Mini-Player */}
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
                    <FaMusic size={24} color="var(--deckify-accent, #1DB954)" />
                  )
                }
              >
                <span style={{ fontSize: 11, color: isPlaying ? "var(--deckify-accent, #1DB954)" : "#888" }}>
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
                      <DialogButton
                        style={{
                          width: "auto",
                          minWidth: "auto",
                          minHeight: 36,
                          padding: "4px 8px",
                          fontSize: 12,
                          fontWeight: 700,
                          ...(playbackSpeed !== 1.0
                            ? {
                                color: "var(--deckify-accent, #1DB954)",
                                border: "1px solid var(--deckify-accent, #1DB954)",
                              }
                            : {}),
                        }}
                        onClick={handleCycleSpeed}
                      >
                        {formatPlaybackSpeed(playbackSpeed)}
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
                  style={{ minWidth: "auto", padding: "8px 11px", color: shuffleState ? "var(--deckify-accent, #1DB954)" : undefined }}
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
                  style={{ minWidth: "auto", padding: "10px 18px", color: "var(--deckify-accent, #1DB954)" }}
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
                  style={{ minWidth: "auto", padding: "8px 11px", color: repeatState !== "off" ? "var(--deckify-accent, #1DB954)" : undefined }}
                  onClick={(e: any) => {
                    e?.currentTarget?.blur?.();
                    handleCycleRepeat();
                  }}
                >
                  <FaRedo />
                  {repeatState === "track" && <span style={{ fontSize: 9, fontWeight: 700, marginLeft: 2 }}>1</span>}
                </DialogButton>
                <DialogButton
                  style={{ minWidth: "auto", padding: "8px 11px", color: isLiked ? "var(--deckify-accent, #1DB954)" : undefined }}
                  onClick={(e: any) => {
                    e?.currentTarget?.blur?.();
                    handleToggleLike();
                  }}
                >
                  {isLiked ? <FaHeart /> : <FaRegHeart />}
                </DialogButton>
              </Focusable>
            </PanelSectionRow>
          </>
        )}

        {/* Pinned Playlist Pills Strip (directly below Transport Controls; hidden when 0 pinned) */}
        {pinnedPlaylists.length > 0 && (
          <PanelSectionRow>
            <Focusable
              flow-children="horizontal"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                overflowX: "auto",
                padding: "4px 4px",
                width: "100%",
              }}
            >
              {pinnedPlaylists.map((pill) => {
                const isActive = activeContextUri === pill.uri;
                const fallbackIcon =
                  pill.type === "liked_songs" ? (
                    <FaHeart size={12} color="var(--deckify-accent, #1DB954)" />
                  ) : pill.type === "album" ? (
                    <FaCompactDisc size={12} color="rgba(255,255,255,0.6)" />
                  ) : (
                    <FaMusic size={12} color="rgba(255,255,255,0.6)" />
                  );
                return (
                  <PinnedPill
                    key={pill.uri}
                    pill={pill}
                    isActive={isActive}
                    fallbackIcon={fallbackIcon}
                    onClick={() => handleQuickPlayPinned(pill)}
                  />
                );
              })}
            </Focusable>
          </PanelSectionRow>
        )}

        {/* Secondary Zone */}
        {trackMeta?.name ? (
          <>
            {/* Volume slider */}
            <PanelSectionRow>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Volume</span>
                {(isDucked || hasGameOverride) && (
                  <span
                    style={{
                      background: "var(--deckify-accent, #1db954)",
                      color: "#000",
                      fontSize: 10,
                      fontWeight: 800,
                      padding: "2px 6px",
                      borderRadius: 4,
                      letterSpacing: "0.5px",
                    }}
                  >
                    {isDucked ? "DUCKED" : "GAME VOL"}
                  </span>
                )}
              </div>
              <SliderField
                label=""
                value={(isDucked || hasGameOverride) && effectiveVolume != null ? effectiveVolume : volume}
                min={0}
                max={100}
                step={1}
                showValue
                valueSuffix="%"
                onChange={handleVolumeChange}
              />
            </PanelSectionRow>

            {renderBindButton()}

            {/* Collapsible Controls & Settings */}
            <PanelSectionRow>
              <ButtonItem onClick={() => setControlsExpanded((prev) => !prev)}>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {controlsExpanded ? <FaChevronDown size={11} /> : <FaChevronRight size={11} />}
                  <span>Controls &amp; Settings</span>
                </span>
              </ButtonItem>
            </PanelSectionRow>

            {controlsExpanded && (
              <>
                {renderDeviceDropdown()}
                {renderOverlayControls()}
                {renderEngineToggle()}
                {renderOpenFullScreenButton()}
              </>
            )}
          </>
        ) : (
          <>
            {renderOpenFullScreenButton()}
            {renderEngineToggle()}
            {renderBindButton()}
            {renderDeviceDropdown()}
            {renderOverlayControls()}
          </>
        )}
      </PanelSection>
    </div>
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

const setGamescopeComposition = (mode: number): void => {
  try {
    const win = typeof window !== "undefined" ? (window as any) : null;
    win?.SteamClient?.Window?.SetComposition?.(mode, [], 0);
  } catch {}
};

const useGamescopeNotificationComposition = (anyHudVisible: boolean): void => {
  const steamOverlayActiveRef = useRef<boolean>(false);
  const anyHudVisibleRef = useRef<boolean>(anyHudVisible);
  anyHudVisibleRef.current = anyHudVisible;

  useEffect(() => {
    let handle: unknown = null;
    try {
      const win = typeof window !== "undefined" ? (window as any) : null;
      const reg = win?.SteamClient?.Overlay?.RegisterForOverlayActivated;
      if (typeof reg === "function") {
        handle = reg((_pid: number, _appId: number, active: boolean) => {
          steamOverlayActiveRef.current = Boolean(active);
          if (!active && anyHudVisibleRef.current) {
            setGamescopeComposition(1);
          }
        });
      }
    } catch {}
    return () => {
      unregisterHandle(handle);
    };
  }, []);

  useEffect(() => {
    if (anyHudVisible) {
      if (!steamOverlayActiveRef.current) {
        setGamescopeComposition(1);
      }
      const interval = setInterval(() => {
        if (!steamOverlayActiveRef.current) {
          setGamescopeComposition(1);
        }
      }, 500);
      return () => {
        clearInterval(interval);
        if (!steamOverlayActiveRef.current) {
          setGamescopeComposition(0);
        }
      };
    }
    if (!steamOverlayActiveRef.current) {
      setGamescopeComposition(0);
    }
    return undefined;
  }, [anyHudVisible]);
};

const DeckifyOverlayWrapper: FC = () => {
  const [track, setTrack] = useState<TrackMeta | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [settings, setSettings] = useState<EngineSettings | null>(null);
  const [positionMs, setPositionMs] = useState<number>(0);
  const [durationMs, setDurationMs] = useState<number>(0);
  const [modalOpen, setModalOpen] = useState<boolean>(bigOpen);
  const [syncedLyrics, setSyncedLyrics] = useState<SyncedLine[]>([]);
  const [lyricsLoaded, setLyricsLoaded] = useState<boolean>(false);
  const [trackLyricsOffsetMs, setTrackLyricsOffsetMs] = useState<number>(0);
  const [bannerVisible, setBannerVisible] = useState<boolean>(false);
  const [overlayVisible, setOverlayVisible] = useState<boolean>(false);
  const lastFetchedTrackKeyRef = useRef<string>("");
  const currentTrackKeyRef = useRef<string>("");
  const currentTrackIdRef = useRef<string>("");

  useEffect(() => {
    const listener = (open: boolean) => setModalOpen(open);
    modalOpenListeners.add(listener);
    setModalOpen(bigOpen);
    return () => {
      modalOpenListeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const syncStatus = (s: StatusResponse | null) => {
      if (!mounted || !s) return;
      syncRuntimeStatus(s);
      const t = s.track || s.track_meta || null;
      if (t) setTrack(t);
      if (typeof s.is_playing === "boolean") setIsPlaying(s.is_playing);
      if (s.settings) {
        syncNotificationSettings(s.settings);
        setSettings((prev) => ({ ...(prev ?? ({} as EngineSettings)), ...s.settings }));
      }
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
      if (st) {
        syncNotificationSettings(st);
        setSettings((prev) => ({ ...(prev ?? ({} as EngineSettings)), ...st }));
      }
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

  const overlayLyricsEnabled = Boolean(
    settings?.overlay_enabled && settings?.overlay_lyrics_enabled
  );
  const trackId = track?.track_id || track?.id || "";
  const trackTitle = track?.name || "";
  const trackArtist = track?.artist || "";
  const trackKey =
    trackTitle && trackArtist
      ? `${trackId || trackTitle}::${trackArtist}`
      : "";
  currentTrackKeyRef.current = trackKey;
  currentTrackIdRef.current = trackId;

  useEffect(() => {
    const unsubOffset = addEventListener<[{ track_id?: string; offset_ms?: number }]>(
      "lyrics_offset_changed",
      (ev) => {
        if (ev && ev.track_id === currentTrackIdRef.current && typeof ev.offset_ms === "number") {
          setTrackLyricsOffsetMs(ev.offset_ms);
        }
      }
    );
    return () => {
      removeEventListener("lyrics_offset_changed", unsubOffset);
    };
  }, []);

  useEffect(() => {
    if (!overlayLyricsEnabled || !trackId) {
      setTrackLyricsOffsetMs(0);
      return;
    }
    const activeId = trackId;
    backendGetTrackLyricsOffset(activeId)
      .then((res) => {
        if (currentTrackIdRef.current !== activeId) return;
        if (res?.ok && typeof res.offset_ms === "number") {
          setTrackLyricsOffsetMs(res.offset_ms);
        } else {
          setTrackLyricsOffsetMs(0);
        }
      })
      .catch(() => {
        if (currentTrackIdRef.current === activeId) {
          setTrackLyricsOffsetMs(0);
        }
      });
  }, [overlayLyricsEnabled, trackId]);

  useEffect(() => {
    if (!overlayLyricsEnabled || !trackTitle || !trackArtist || !trackKey) {
      if (!overlayLyricsEnabled) {
        lastFetchedTrackKeyRef.current = "";
        setSyncedLyrics([]);
        setLyricsLoaded(false);
      }
      return;
    }

    if (lastFetchedTrackKeyRef.current === trackKey) {
      return;
    }
    lastFetchedTrackKeyRef.current = trackKey;
    setSyncedLyrics([]);
    setLyricsLoaded(false);

    const fetchKey = trackKey;
    const dur = durationMs || track?.duration_ms || 0;
    backendGetLyrics(trackTitle, trackArtist, dur, 0, trackId)
      .then((res) => {
        if (currentTrackKeyRef.current !== fetchKey) return;
        const parsed =
          res?.ok && Array.isArray(res?.romanized_lines) && res.romanized_lines.length > 0
            ? res.romanized_lines
            : res?.ok && res?.synced_lyrics
            ? parseLrc(res.synced_lyrics)
            : [];
        setSyncedLyrics(parsed);
        setLyricsLoaded(true);
      })
      .catch(() => {
        if (currentTrackKeyRef.current !== fetchKey) return;
        setSyncedLyrics([]);
        setLyricsLoaded(true);
      });
  }, [overlayLyricsEnabled, trackKey, trackId, trackTitle, trackArtist, durationMs, track?.duration_ms]);

  const overlayEnabled = Boolean(settings?.overlay_enabled);
  const hudVisible = overlayEnabled && !modalOpen && Boolean(track?.name);
  const bannerPosition =
    settings?.silent_banner_position || settings?.toast_position || settings?.overlay_position || "top-right";
  const anyHudVisible = (bannerVisible || (overlayEnabled && overlayVisible)) && !modalOpen;

  useGamescopeNotificationComposition(anyHudVisible);

  return (
    <>
      {overlayEnabled ? (
        <DeckifyOverlay
          track={track}
          isPlaying={isPlaying}
          position={settings?.overlay_position || "top-right"}
          visible={overlayEnabled && !modalOpen}
          autoHide={Boolean(settings?.overlay_autohide)}
          autoHideDurationMs={(settings?.overlay_autohide_duration_s ?? 6) * 1000}
          showProgress={Boolean(settings?.overlay_show_progress)}
          positionMs={positionMs}
          durationMs={durationMs}
          lyricsEnabled={Boolean(settings?.overlay_lyrics_enabled)}
          lyricsOffsetMs={settings?.overlay_lyrics_offset_ms ?? 0}
          trackLyricsOffsetMs={trackLyricsOffsetMs}
          romanizeOverlayEnabled={Boolean(settings?.romanize_overlay_enabled)}
          romanizeDisplayStyle={settings?.romanize_display_style || "dual"}
          syncedLyrics={syncedLyrics}
          lyricsLoaded={lyricsLoaded}
          onVisibilityChange={setOverlayVisible}
        />
      ) : null}
      <SilentBanner
        enabled={settings?.silent_banner_enabled !== false}
        position={bannerPosition}
        hudVisible={hudVisible}
        hudPosition={settings?.overlay_position || "top-right"}
        onVisibilityChange={setBannerVisible}
      />
    </>
  );
};

export default definePlugin(() => {
  console.log("Deckify v0.3.0 native plugin initializing");
  resetModuleRuntimeState();
  backendGetStatus().then((s) => syncRuntimeStatus(s)).catch(() => {});

  const settingsChangedSub = addEventListener<[any]>("settings_changed", (st: any) => {
    syncNotificationSettings(st);
    applyThemeBusSync();
  });
  const librespotSub = addEventListener<[any]>("librespot_event", (ev: any) => {
    syncLibrespotEvent(ev);
  });
  const ecoStatusSub = addEventListener<[unknown]>("eco_status_changed", (ev: unknown) => {
    if (ev && typeof ev === "object") {
      cachedAnimationsSuspended = Boolean((ev as EcoStatusInfo).animations_suspended);
      applyThemeBusSync();
    }
  });

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
    icon: <FaSpotify size={18} color="var(--deckify-accent, #1DB954)" />,
    order: menuOrder,
  });

  // 4. In-Game Gamepad Chords Listener (configurable 1-4 button chords + 4s guideHeld expiry)
  const cleanupChords = setupChordListener();

  // 5. In-game track change notification (silent banner by default; Steam toast when sound enabled or silent banner disabled)
  const trackSub = addEventListener<[unknown]>("track_metadata", (meta: unknown) => {
    if (meta && typeof meta === "object") {
      const m = meta as TrackMeta;
      cachedArtworkUrl = m.artwork_url || m.image_url || null;
      applyThemeBusSync();
    }
    return handleTrackMetadataNotification(meta);
  });

  // 6. In-game Auto-Ducking & App Lifetime Listener (with per-game profiles)
  let activeGameAppId: number | null = null;
  let gameExitDebounceTimer: any = null;
  let appLifetimeSub: any = null;
  try {
    const rawMainAppId = (Router as any)?.MainRunningApp?.appid;
    const mainAppId = typeof rawMainAppId === "number" ? rawMainAppId : Number(rawMainAppId);
    if (Number.isFinite(mainAppId) && mainAppId > 0) {
      activeGameAppId = mainAppId;
      setActiveGameState(mainAppId);
      backendHandleAppLifetimeEvent(mainAppId, true).catch(() => {});
    }
    const gameSessions = (window as any).SteamClient?.GameSessions;
    if (gameSessions?.RegisterForAppLifetimeNotifications) {
      appLifetimeSub = gameSessions.RegisterForAppLifetimeNotifications(async (ev: any) => {
        if (!ev) return;
        const appId = ev.unAppID || ev.nAppID;
        const running = Boolean(ev.bRunning);
        if (running && appId) {
          if (gameExitDebounceTimer) {
            clearTimeout(gameExitDebounceTimer);
            gameExitDebounceTimer = null;
          }
          activeGameAppId = appId;
          setActiveGameState(appId);
          await backendHandleAppLifetimeEvent(appId, true).catch(() => {});
        } else if (!running && activeGameAppId && appId === activeGameAppId) {
          if (gameExitDebounceTimer) clearTimeout(gameExitDebounceTimer);
          await backendHandleAppLifetimeEvent(appId, false).catch(() => {});
          gameExitDebounceTimer = setTimeout(async () => {
            activeGameAppId = null;
            gameExitDebounceTimer = null;
            setActiveGameState(null);
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
        removeEventListener("settings_changed", settingsChangedSub);
        removeEventListener("librespot_event", librespotSub);
        removeEventListener("eco_status_changed", ecoStatusSub);
        if (typeof cleanupChords === "function") cleanupChords();
        resetModuleRuntimeState();
      } catch (e) {
        console.warn("Deckify dismount cleanup error:", e);
      }
    },
  };
});
