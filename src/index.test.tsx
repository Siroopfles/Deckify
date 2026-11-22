import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockHandleAppLifetimeEvent = vi.fn().mockResolvedValue({ ok: true });
const mockTriggerDucking = vi.fn().mockResolvedValue({ ok: true });
const mockRegisterForAppLifetime = vi.fn().mockReturnValue({ unregister: vi.fn() });
const mockGetStatus = vi.fn().mockResolvedValue(null);
const mockGetAuthStatus = vi.fn().mockResolvedValue({ authenticated: true, needs_reauth: false });
const mockGetDevices = vi.fn().mockResolvedValue({ ok: true, devices: [] });
const mockGetDuckingState = vi.fn().mockResolvedValue({ is_ducked: false, effective_volume: 50, base_volume: 50, duck_reasons: [] });
const mockBindCurrentMusicToGame = vi.fn().mockResolvedValue({ ok: true });
const mockQuickPlayPinned = vi.fn().mockResolvedValue({ ok: true });
const mockGetLyrics = vi.fn().mockResolvedValue({ ok: true, synced_lyrics: "[00:01.00]Hello world" });
const mockSetSetting = vi.fn().mockResolvedValue({ ok: true });
const mockGetImage = vi.fn().mockResolvedValue({ ok: true, data_url: "data:image/jpeg;base64,MOCKCOVER" });
const mockRestoreBookmark = vi.fn().mockResolvedValue({ ok: true });
const mockDismissBookmark = vi.fn().mockResolvedValue({ ok: true });
const mockControlPlayback = vi.fn().mockResolvedValue({ ok: true });
const mockSetVolume = vi.fn().mockResolvedValue({ ok: true });
const mockToggleLike = vi.fn().mockResolvedValue({ ok: true, is_liked: true });
const mockToasterToast = vi.fn();

let capturedPluginFactory: (() => any) | null = null;

vi.mock("@decky/api", () => ({
  callable: (name: string) => {
    if (name === "handle_app_lifetime_event") return (...args: any[]) => mockHandleAppLifetimeEvent(...args);
    if (name === "trigger_ducking") return (...args: any[]) => mockTriggerDucking(...args);
    if (name === "get_status") return (...args: any[]) => mockGetStatus(...args);
    if (name === "get_auth_status") return (...args: any[]) => mockGetAuthStatus(...args);
    if (name === "get_devices") return (...args: any[]) => mockGetDevices(...args);
    if (name === "get_ducking_state") return (...args: any[]) => mockGetDuckingState(...args);
    if (name === "bind_current_music_to_game") return (...args: any[]) => mockBindCurrentMusicToGame(...args);
    if (name === "quick_play_pinned") return (...args: any[]) => mockQuickPlayPinned(...args);
    if (name === "get_lyrics") return (...args: any[]) => mockGetLyrics(...args);
    if (name === "set_setting") return (...args: any[]) => mockSetSetting(...args);
    if (name === "get_image") return (...args: any[]) => mockGetImage(...args);
    if (name === "restore_bookmark") return (...args: any[]) => mockRestoreBookmark(...args);
    if (name === "dismiss_bookmark") return (...args: any[]) => mockDismissBookmark(...args);
    if (name === "control_playback") return (...args: any[]) => mockControlPlayback(...args);
    if (name === "set_volume") return (...args: any[]) => mockSetVolume(...args);
    if (name === "toggle_like_track") return (...args: any[]) => mockToggleLike(...args);
    return vi.fn().mockResolvedValue({ ok: true });
  },
  addEventListener: vi.fn(() => vi.fn()),
  removeEventListener: vi.fn(),
  definePlugin: (fn: () => any) => {
    capturedPluginFactory = fn;
    return fn;
  },
  routerHook: {
    addGlobalComponent: vi.fn(),
    removeGlobalComponent: vi.fn(),
    addRoute: vi.fn(),
    removeRoute: vi.fn(),
  },
  toaster: { toast: (...args: any[]) => mockToasterToast(...args) },
}));

vi.mock("@decky/ui", () => ({
  PanelSection: ({ children }: any) => ({ type: "PanelSection", props: { children } }),
  PanelSectionRow: ({ children }: any) => ({ type: "PanelSectionRow", props: { children } }),
  ToggleField: (props: any) => ({ type: "ToggleField", props }),
  Field: (props: any) => ({ type: "Field", props }),
  DropdownItem: (props: any) => ({ type: "DropdownItem", props }),
  ButtonItem: ({ children, ...props }: any) => ({ type: "ButtonItem", props: { children, ...props } }),
  SliderField: (props: any) => ({ type: "SliderField", props }),
  Focusable: ({ children, ...props }: any) => ({ type: "Focusable", props: { children, ...props } }),
  DialogButton: ({ children, ...props }: any) => ({ type: "DialogButton", props: { children, ...props } }),
  Navigation: { Navigate: vi.fn() },
  Router: { MainRunningApp: { appid: 1091500, display_name: "Cyberpunk 2077" } },
  showModal: vi.fn(),
  staticClasses: { Title: "Title" },
}));

vi.mock("./steamMenu", () => ({ registerSteamMenu: vi.fn(() => vi.fn()) }));
vi.mock("./components/DeckifyExpandedModal", () => ({ DeckifyExpandedModal: () => ({ type: "Modal", props: {} }) }));
vi.mock("./components/DeckifyOverlay", () => ({ DeckifyOverlay: (props: any) => ({ type: "Overlay", props }) }));
vi.mock("./hooks/usePlaybackClock", () => ({ usePlaybackClock: () => ({ positionMs: 0, notifySeek: vi.fn() }) }));
vi.mock("./components/common/InteractiveRow", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./components/common/InteractiveRow")>();
  return {
    ...actual,
    formatMs: (ms: number) => String(ms),
  };
});
vi.mock("./components/common/DeckifyImage", () => ({
  DeckifyImage: (props: any) => ({ type: "DeckifyImage", props }),
}));
vi.mock("react-icons/fa", () => {
  const Icon = () => ({ type: "Icon", props: {} });
  return {
    FaMusic: Icon,
    FaSpotify: Icon,
    FaPlay: Icon,
    FaPause: Icon,
    FaStepBackward: Icon,
    FaStepForward: Icon,
    FaRandom: Icon,
    FaRedo: Icon,
    FaHeart: Icon,
    FaRegHeart: Icon,
    FaPlus: Icon,
    FaCompactDisc: Icon,
    FaChevronDown: Icon,
    FaChevronRight: Icon,
  };
});
vi.mock("qrcode.react", () => ({ QRCodeSVG: () => ({ type: "QRCodeSVG", props: {} }) }));

vi.mock("react/jsx-dev-runtime", () => ({
  Fragment: "Fragment",
  jsxDEV: (type: any, props: any, key: any) => ({
    type,
    props: { ...props, ...(key !== undefined ? { key } : {}) },
  }),
}));

vi.mock("react/jsx-runtime", () => ({
  Fragment: "Fragment",
  jsx: (type: any, props: any, key: any) => ({
    type,
    props: { ...props, ...(key !== undefined ? { key } : {}) },
  }),
  jsxs: (type: any, props: any, key: any) => ({
    type,
    props: { ...props, ...(key !== undefined ? { key } : {}) },
  }),
}));

let hookValues: any[] = [];
let hookIdx = 0;
let effectCleanups: Array<() => void> = [];
function resetHooks() {
  hookValues = [];
  hookIdx = 0;
  effectCleanups = [];
}

vi.mock("react", () => ({
  useState: (init: any) => {
    const i = hookIdx++;
    if (!(i in hookValues)) {
      hookValues[i] = typeof init === "function" ? init() : init;
    }
    const setter = (val: any) => {
      hookValues[i] = typeof val === "function" ? val(hookValues[i]) : val;
    };
    return [hookValues[i], setter];
  },
  useRef: (init: any) => {
    const i = hookIdx++;
    if (!(i in hookValues)) {
      hookValues[i] = { current: init };
    }
    return hookValues[i];
  },
  useEffect: (fn: any) => {
    if (hookIdx === 0) return;
    const cleanup = fn();
    if (typeof cleanup === "function") {
      effectCleanups.push(cleanup);
    }
  },
  useCallback: (fn: any) => fn,
}));

import { subscribeBanner, resetBannerBusForTests } from "./bannerBus";
import { setChordRecordingActive, isChordRecordingActive } from "./chords";
import { imgMemoryCache } from "./components/common/imagePipeline";
import { DeckifyOverlay } from "./components/DeckifyOverlay";
import { SilentBanner } from "./components/SilentBanner";

function findWrapperChild(wrapperTree: any, typeTarget: "Overlay" | "SilentBanner"): any {
  const children = wrapperTree?.props?.children;
  const list = Array.isArray(children) ? children : children ? [children] : [];
  for (const child of list) {
    if (!child || typeof child !== "object") continue;
    if (
      typeTarget === "Overlay" &&
      (child.type === DeckifyOverlay || child.type?.name === "DeckifyOverlay" || child.type === "Overlay")
    ) {
      return child;
    }
    if (
      typeTarget === "SilentBanner" &&
      (child.type === SilentBanner || child.type?.name === "SilentBanner" || child.type === "SilentBanner")
    ) {
      return child;
    }
  }
  return undefined;
}

function flattenNodes(node: any): any[] {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(flattenNodes);
  const resolved = typeof node.type === "function" ? node.type(node.props || {}) : node;
  if (!resolved || typeof resolved !== "object") return [];
  const children = resolved.props?.children;
  return [resolved, ...flattenNodes(children)];
}

function textContent(node: any): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textContent).join("");
  if (typeof node === "object" && node.props) return textContent(node.props.children);
  return "";
}

describe("src/index.tsx GameSessions AppLifetime & QAM Pinned Playlists", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetHooks();
    mockGetStatus.mockResolvedValue(null);
    mockGetDevices.mockResolvedValue({ ok: true, devices: [] });
    mockQuickPlayPinned.mockResolvedValue({ ok: true });
    (globalThis as any).window = {
      SteamClient: {
        GameSessions: {
          RegisterForAppLifetimeNotifications: mockRegisterForAppLifetime,
        },
        Input: {},
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
  });

  it("seeds running appId from Router.MainRunningApp and registers on SteamClient.GameSessions", async () => {
    await import("./index");
    expect(capturedPluginFactory).toBeTypeOf("function");

    const plugin = capturedPluginFactory!();
    expect(mockHandleAppLifetimeEvent).toHaveBeenCalledWith(1091500, true);
    expect(mockRegisterForAppLifetime).toHaveBeenCalledTimes(1);

    const lifecycleCb = mockRegisterForAppLifetime.mock.calls[0][0];
    await lifecycleCb({ unAppID: 440, bRunning: true });
    expect(mockHandleAppLifetimeEvent).toHaveBeenCalledWith(440, true);

    plugin.onDismount?.();
  });

  it("delays backendTriggerDucking(false, 'game') for 3000ms on game exit and cancels if relaunched", async () => {
    vi.useFakeTimers();
    try {
      await import("./index");
      const plugin = capturedPluginFactory!();
      const lifecycleCb = mockRegisterForAppLifetime.mock.calls[0][0];

      await lifecycleCb({ unAppID: 440, bRunning: true });
      mockHandleAppLifetimeEvent.mockClear();
      mockTriggerDucking.mockClear();

      await lifecycleCb({ unAppID: 440, bRunning: false });
      expect(mockHandleAppLifetimeEvent).toHaveBeenCalledWith(440, false);
      expect(mockTriggerDucking).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(2999);
      expect(mockTriggerDucking).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      expect(mockTriggerDucking).toHaveBeenCalledWith(false, "game");

      mockTriggerDucking.mockClear();
      await lifecycleCb({ unAppID: 440, bRunning: true });
      await lifecycleCb({ unAppID: 440, bRunning: false });
      await vi.advanceTimersByTimeAsync(1500);
      await lifecycleCb({ unAppID: 440, bRunning: true });
      await vi.advanceTimersByTimeAsync(3000);
      expect(mockTriggerDucking).not.toHaveBeenCalled();

      plugin.onDismount?.();
    } finally {
      vi.useRealTimers();
    }
  });

  it("hides pinned pills strip when 0 items are pinned", async () => {
    await import("./index");
    const plugin = capturedPluginFactory!();
    const renderContent = () => {
      hookIdx = 0;
      return plugin.content.type({});
    };

    const tree = renderContent();
    const nodes = flattenNodes(tree);
    const horizontalStrips = nodes.filter(
      (n) => n.type === "Focusable" && n.props?.["flow-children"] === "horizontal"
    );
    expect(horizontalStrips.length).toBe(0);
    plugin.onDismount?.();
  });

  it("renders 1-4 pinned pills inside horizontal Focusable with DeckifyImage and ellipsis truncation", async () => {
    await import("./index");
    const plugin = capturedPluginFactory!();
    const renderContent = () => {
      hookIdx = 0;
      return plugin.content.type({});
    };

    // Initial render initializes state hooks
    renderContent();
    // Inject trackMeta (hook 5), contextUri (hook 18), settings (hook 20) via status simulation:
    const pinned = [
      { uri: "spotify:playlist:1", name: "Very Long Playlist Name That Truncates", type: "playlist", image_url: "https://i.scdn.co/1.jpg" },
      { uri: "spotify:album:2", name: "Album Two", type: "album", image_url: null },
      { uri: "spotify:collection:tracks", name: "Liked Songs", type: "liked_songs", image_url: null },
      { uri: "spotify:playlist:4", name: "Fourth Mix", type: "playlist", image_url: "https://i.scdn.co/4.jpg" },
    ];
    const settingsIdx = hookValues.findIndex((v) => v && typeof v === "object" && "audio_backend" in v);
    expect(settingsIdx).toBeGreaterThan(-1);
    hookValues[settingsIdx] = { ...hookValues[settingsIdx], pinned_playlists: pinned };

    const tree = renderContent();
    const nodes = flattenNodes(tree);
    const strip = nodes.find(
      (n) => n.type === "Focusable" && n.props?.["flow-children"] === "horizontal" && n.props?.style?.overflowX === "auto"
    );
    expect(strip).toBeDefined();
    expect(strip.props.style.padding).toBe("4px 4px");

    const pills = flattenNodes(strip).filter((n) => n.props?.["data-deckify-pinned-pill"] === "true");
    expect(pills.length).toBe(4);
    expect(pills.map((p) => textContent(p))).toEqual([
      "Very Long Playlist Name That Truncates",
      "Album Two",
      "Liked Songs",
      "Fourth Mix",
    ]);

    const images = flattenNodes(strip).filter((n) => n.type === "DeckifyImage");
    expect(images.length).toBe(4);
    expect(images[0].props.src).toBe("https://i.scdn.co/1.jpg");
    expect(images[0].props.width).toBe(20);
    expect(images[0].props.height).toBe(20);

    // No raw <img> tags for i.scdn.co
    const rawImgs = flattenNodes(strip).filter((n) => n.type === "img");
    expect(rawImgs.length).toBe(0);

    const labelSpan = flattenNodes(pills[0]).find((n) => n.type === "span");
    expect(labelSpan.props.style.textOverflow).toBe("ellipsis");
    expect(labelSpan.props.style.whiteSpace).toBe("nowrap");
    expect(pills[0].props.style.maxWidth).toBe(140);

    plugin.onDismount?.();
  });

  it("applies optimistic active highlight and rolls back with toast on quick_play_pinned failure", async () => {
    await import("./index");
    const plugin = capturedPluginFactory!();
    const renderContent = () => {
      hookIdx = 0;
      return plugin.content.type({});
    };

    renderContent();
    const settingsIdx = hookValues.findIndex((v) => v && typeof v === "object" && "audio_backend" in v);
    hookValues[settingsIdx] = {
      ...hookValues[settingsIdx],
      pinned_playlists: [
        { uri: "spotify:playlist:1", name: "Chill", type: "playlist", image_url: null },
      ],
    };

    let resolveRpc!: (v: any) => void;
    mockQuickPlayPinned.mockImplementationOnce(
      () => new Promise((r) => { resolveRpc = r; })
    );

    let nodes = flattenNodes(renderContent());
    let pill = nodes.find((n) => n.props?.["data-deckify-pinned-pill"] === "true" && textContent(n) === "Chill");
    expect(pill.props.style.color).toBe("#fff");

    // Click pill -> optimistic highlight should apply immediately before RPC resolves
    const clickPromise = pill.props.onClick();
    nodes = flattenNodes(renderContent());
    pill = nodes.find((n) => n.props?.["data-deckify-pinned-pill"] === "true" && textContent(n) === "Chill");
    expect(pill.props.style.color).toBe("#1db954");
    expect(pill.props.style.border).toBe("1px solid #1db954");
    expect(mockQuickPlayPinned).toHaveBeenCalledWith("spotify:playlist:1", "playlist");

    // Reject/fail RPC -> optimistic highlight rolls back and toast is shown
    resolveRpc({ ok: false, error: "Engine failed" });
    await clickPromise;
    nodes = flattenNodes(renderContent());
    pill = nodes.find((n) => n.props?.["data-deckify-pinned-pill"] === "true" && textContent(n) === "Chill");
    expect(pill.props.style.color).toBe("#fff");
    expect(mockToasterToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Deckify", body: "Engine failed" })
    );

    plugin.onDismount?.();
  });

  it("renders Bind current music to game without borderColor override and keeps secondary controls accessible", async () => {
    await import("./index");
    const plugin = capturedPluginFactory!();
    const renderContent = () => {
      hookIdx = 0;
      return plugin.content.type({});
    };

    renderContent();
    // 0: running(false), 1: toggling(false), 2: error(null), 3: audioStreamInfo(null), 4: trackMeta(null)
    hookValues[4] = { name: "Test Track", artist: "Artist", album: "Album", duration_ms: 180000 };

    let nodes = flattenNodes(renderContent());
    const bindBtn = nodes.find((n) => n.type === "ButtonItem" && textContent(n).includes("Bind current music to game"));
    expect(bindBtn).toBeDefined();
    expect(bindBtn.props.style?.borderColor).toBeUndefined();

    await bindBtn.props.onClick();
    expect(mockBindCurrentMusicToGame).toHaveBeenCalledWith(1091500, "Cyberpunk 2077");

    const uiMod = await import("@decky/ui");
    const prevApp = uiMod.Router.MainRunningApp;
    (uiMod.Router as any).MainRunningApp = { appid: "999999", display_name: "Wrong Game" };
    try {
      await bindBtn.props.onClick();
      expect(mockBindCurrentMusicToGame).toHaveBeenLastCalledWith(1091500, "");
    } finally {
      (uiMod.Router as any).MainRunningApp = prevApp;
    }

    // Secondary controls toggle is collapsed by default when playing
    const toggleBtn = nodes.find((n) => n.type === "ButtonItem" && textContent(n).includes("Controls & Settings"));
    expect(toggleBtn).toBeDefined();
    expect(nodes.find((n) => n.type === "ButtonItem" && textContent(n).includes("Open Deckify (Full Screen)"))).toBeUndefined();

    // Expanding Controls & Settings reveals Open Deckify, Engine toggle, and Overlay toggle
    toggleBtn.props.onClick();
    nodes = flattenNodes(renderContent());
    expect(nodes.find((n) => n.type === "ButtonItem" && textContent(n).includes("Open Deckify (Full Screen)"))).toBeDefined();
    expect(nodes.find((n) => n.type === "ToggleField" && n.props.label === "In-Game Overlay (HUD)")).toBeDefined();
    expect(nodes.find((n) => n.type === "ToggleField" && n.props.label === "librespot Engine")).toBeDefined();

    plugin.onDismount?.();
  });

  it("handleQuickBind forwards trimmed display_name only on exact appid match and empty string for missing, empty, or zero appid", async () => {
    await import("./index");
    const plugin = capturedPluginFactory!();
    const renderContent = () => {
      hookIdx = 0;
      return plugin.content.type({});
    };

    renderContent();
    const nodes = flattenNodes(renderContent());
    const bindBtn = nodes.find((n) => n.type === "ButtonItem" && textContent(n).includes("Bind current music to game"));
    expect(bindBtn).toBeDefined();

    const uiMod = await import("@decky/ui");
    const router = uiMod.Router as { MainRunningApp: unknown };
    const prevApp = router.MainRunningApp;
    try {
      for (const mainApp of [
        undefined,
        { display_name: "Stale Game" },
        { appid: "", display_name: "Empty AppId Game" },
        { appid: "0", display_name: "Zero String Game" },
        { appid: 0, display_name: "Zero Number Game" },
        { appid: "999999", display_name: "Wrong Game" },
      ]) {
        router.MainRunningApp = mainApp;
        await bindBtn.props.onClick();
        expect(mockBindCurrentMusicToGame).toHaveBeenLastCalledWith(1091500, "");
      }

      router.MainRunningApp = { appid: "1091500", display_name: "  Cyberpunk 2077  " };
      await bindBtn.props.onClick();
      expect(mockBindCurrentMusicToGame).toHaveBeenLastCalledWith(1091500, "Cyberpunk 2077");
    } finally {
      router.MainRunningApp = prevApp;
      plugin.onDismount?.();
    }
  });

  it("renders PinnedPill with focusHalo on focus/gamepadFocus, clears on blur, and activates on onActivate (G-09-2)", async () => {
    await import("./index");
    const plugin = capturedPluginFactory!();
    const renderContent = () => {
      hookIdx = 0;
      return plugin.content.type({});
    };

    renderContent();
    const settingsIdx = hookValues.findIndex((v) => v && typeof v === "object" && "audio_backend" in v);
    hookValues[settingsIdx] = {
      ...hookValues[settingsIdx],
      pinned_playlists: [
        { uri: "spotify:playlist:focus", name: "Focus Mix", type: "playlist", image_url: null },
      ],
    };

    let nodes = flattenNodes(renderContent());
    let pill = nodes.find((n) => n.props?.["data-deckify-pinned-pill"] === "true");
    expect(pill).toBeDefined();
    expect(pill.props.noFocusRing).toBe(true);
    expect(pill.props["data-focused"]).toBe("false");
    expect(pill.props.style.boxShadow).toBe("none");

    // Simulate gamepad focus
    pill.props.onGamepadFocus();
    nodes = flattenNodes(renderContent());
    pill = nodes.find((n) => n.props?.["data-deckify-pinned-pill"] === "true");
    expect(pill.props["data-focused"]).toBe("true");
    expect(pill.props.style.boxShadow).toContain("0 0 0 2px #fff");
    expect(pill.props.style.border).toBe("1px solid #fff");

    // Simulate gamepad blur
    pill.props.onGamepadBlur();
    nodes = flattenNodes(renderContent());
    pill = nodes.find((n) => n.props?.["data-deckify-pinned-pill"] === "true");
    expect(pill.props["data-focused"]).toBe("false");
    expect(pill.props.style.boxShadow).toBe("none");

    // Simulate DOM focus and activation
    pill.props.onFocus();
    nodes = flattenNodes(renderContent());
    pill = nodes.find((n) => n.props?.["data-deckify-pinned-pill"] === "true");
    expect(pill.props["data-focused"]).toBe("true");
    await pill.props.onActivate();
    expect(mockQuickPlayPinned).toHaveBeenCalledWith("spotify:playlist:focus", "playlist");

    plugin.onDismount?.();
  });
});

describe("src/index.tsx DeckifyOverlayWrapper Phase 10 Gating & Modal Suppression", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    resetHooks();
    resetBannerBusForTests();
    imgMemoryCache.clear();
    mockGetStatus.mockResolvedValue(null);
    mockGetLyrics.mockResolvedValue({ ok: true, synced_lyrics: "[00:01.00]Line one" });
    (globalThis as any).window = {
      SteamClient: {
        GameSessions: {
          RegisterForAppLifetimeNotifications: mockRegisterForAppLifetime,
        },
        Input: {},
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
  });

  afterEach(() => {
    resetBannerBusForTests();
    imgMemoryCache.clear();
    vi.useRealTimers();
  });

  it("gates get_lyrics on overlay_enabled && overlay_lyrics_enabled and deduplicates per track", async () => {
    await import("./index");
    const { routerHook } = await import("@decky/api");
    const plugin = capturedPluginFactory!();
    const wrapperFactory = (routerHook.addGlobalComponent as any).mock.calls[0][1];
    const renderWrapper = () => {
      hookIdx = 0;
      const el = wrapperFactory();
      return el.type(el.props || {});
    };

    // Case 1: overlay_enabled=true, overlay_lyrics_enabled=false -> no get_lyrics
    mockGetStatus.mockResolvedValue({
      track: { track_id: "trk1", name: "Song A", artist: "Artist A", duration_ms: 180000 },
      is_playing: true,
      position_ms: 0,
      duration_ms: 180000,
      settings: { overlay_enabled: true, overlay_lyrics_enabled: false },
    });
    renderWrapper();
    await Promise.resolve();
    await Promise.resolve();
    const overlayOff = findWrapperChild(renderWrapper(), "Overlay");
    expect(overlayOff.props.lyricsEnabled).toBe(false);
    expect(mockGetLyrics).not.toHaveBeenCalled();

    // Case 2: enable overlay_lyrics_enabled=true -> calls get_lyrics once, deduplicates across re-renders/polls
    mockGetStatus.mockResolvedValue({
      track: { track_id: "trk1", name: "Song A", artist: "Artist A", duration_ms: 180000 },
      is_playing: true,
      position_ms: 4000,
      duration_ms: 180000,
      settings: {
        overlay_enabled: true,
        overlay_lyrics_enabled: true,
        overlay_autohide_duration_s: 9,
        overlay_lyrics_offset_ms: 200,
      },
    });
    renderWrapper();
    await Promise.resolve();
    await Promise.resolve();
    const overlayOn1 = findWrapperChild(renderWrapper(), "Overlay");
    await Promise.resolve();
    await Promise.resolve();
    const overlayOn2 = findWrapperChild(renderWrapper(), "Overlay");

    expect(mockGetLyrics).toHaveBeenCalledTimes(1);
    expect(mockGetLyrics).toHaveBeenCalledWith("Song A", "Artist A", 180000, 0);
    expect(overlayOn2.props.lyricsEnabled).toBe(true);
    expect(overlayOn2.props.autoHideDurationMs).toBe(9000);
    expect(overlayOn2.props.lyricsOffsetMs).toBe(200);
    expect(overlayOn2.props.syncedLyrics).toEqual([{ timeMs: 1000, text: "Line one" }]);
    expect(overlayOn2.props.lyricsLoaded).toBe(true);
    expect(overlayOn1.props.visible).toBe(true);

    plugin.onDismount?.();
  });

  it("suppresses HUD visibility via modalOpenListeners while modal is open and restores on close (D-10)", async () => {
    await import("./index");
    const { routerHook } = await import("@decky/api");
    const { showModal } = await import("@decky/ui");
    const plugin = capturedPluginFactory!();
    const wrapperFactory = (routerHook.addGlobalComponent as any).mock.calls[0][1];
    const renderWrapper = () => {
      hookIdx = 0;
      const el = wrapperFactory();
      return el.type(el.props || {});
    };

    mockGetStatus.mockResolvedValue({
      track: { track_id: "trk2", name: "Song B", artist: "Artist B", duration_ms: 120000 },
      is_playing: true,
      settings: { overlay_enabled: true, overlay_lyrics_enabled: false },
    });

    renderWrapper();
    await Promise.resolve();
    await Promise.resolve();
    expect(findWrapperChild(renderWrapper(), "Overlay").props.visible).toBe(true);

    // Open expanded modal via DeckifyRouteOpener
    const routeCalls = (routerHook.addRoute as any).mock.calls;
    const RouteOpener = routeCalls[routeCalls.length - 1][1];
    RouteOpener({});
    vi.advanceTimersByTime(100);

    expect(showModal).toHaveBeenCalledTimes(1);
    expect(findWrapperChild(renderWrapper(), "Overlay").props.visible).toBe(false);

    // Close modal via closeModal prop passed to DeckifyExpandedModal
    const modalEl = (showModal as any).mock.calls[0][0];
    modalEl.props.closeModal();
    expect(findWrapperChild(renderWrapper(), "Overlay").props.visible).toBe(true);

    plugin.onDismount?.();
  });

  it("renders Overlay Lyrics ToggleField in QAM when overlay_enabled is true and persists overlay_lyrics_enabled", async () => {
    await import("./index");
    const plugin = capturedPluginFactory!();
    const renderContent = () => {
      hookIdx = 0;
      return plugin.content.type({});
    };

    renderContent();
    const settingsIdx = hookValues.findIndex(
      (v) => v && typeof v === "object" && "audio_backend" in v
    );
    expect(settingsIdx).toBeGreaterThanOrEqual(0);
    hookValues[settingsIdx] = {
      ...hookValues[settingsIdx],
      overlay_enabled: true,
      overlay_lyrics_enabled: false,
      overlay_autohide_duration_s: 10,
    };

    const nodes = flattenNodes(renderContent());
    const autoHideToggle = nodes.find(
      (n) => n.type === "ToggleField" && n.props?.label === "Auto-Hide Overlay (10s)"
    );
    const overlayLyricsToggle = nodes.find(
      (n) => n.type === "ToggleField" && n.props?.label === "Overlay Lyrics"
    );
    expect(autoHideToggle).toBeDefined();
    expect(overlayLyricsToggle).toBeDefined();
    expect(overlayLyricsToggle.props.checked).toBe(false);

    // QAM must stay compact (no duration or latency sliders)
    const sliders = nodes.filter((n) => n.type === "SliderField");
    expect(
      sliders.some(
        (s) =>
          s.props?.label === "Auto-Hide Duration (Seconds)" ||
          s.props?.label === "Lyrics Latency Offset (ms)"
      )
    ).toBe(false);

    await overlayLyricsToggle.props.onChange(true);
    expect(mockSetSetting).toHaveBeenCalledWith("overlay_lyrics_enabled", true);

    plugin.onDismount?.();
  });

  it("preserves overlay_lyrics_enabled from settings_changed across subsequent partial get_status() polls", async () => {
    await import("./index");
    const { addEventListener, routerHook } = await import("@decky/api");
    const plugin = capturedPluginFactory!();
    const wrapperFactory = (routerHook.addGlobalComponent as any).mock.calls[0][1];
    const renderWrapper = () => {
      hookIdx = 0;
      const el = wrapperFactory();
      return el.type(el.props || {});
    };

    mockGetStatus.mockResolvedValue({
      track: { track_id: "trk1", name: "Song A", artist: "Artist A", duration_ms: 180000 },
      is_playing: true,
      settings: { overlay_enabled: true, overlay_lyrics_enabled: false },
    });

    renderWrapper();
    await Promise.resolve();
    await Promise.resolve();

    const settingsChangedHandlers = (addEventListener as any).mock.calls
      .filter((c: any[]) => c[0] === "settings_changed")
      .map((c: any[]) => c[1]);
    expect(settingsChangedHandlers.length).toBeGreaterThan(0);

    // Simulate a subsequent 4s poll whose settings payload omits overlay_lyrics_enabled
    mockGetStatus.mockResolvedValue({
      track: { track_id: "trk1", name: "Song A", artist: "Artist A", duration_ms: 180000 },
      is_playing: true,
      settings: { overlay_enabled: true },
    });

    // Simulate settings_changed event enabling overlay_lyrics_enabled
    settingsChangedHandlers.forEach((handler: any) =>
      handler({ overlay_enabled: true, overlay_lyrics_enabled: true })
    );
    expect(findWrapperChild(renderWrapper(), "Overlay").props.lyricsEnabled).toBe(true);

    vi.advanceTimersByTime(4000);
    await Promise.resolve();
    await Promise.resolve();

    expect(findWrapperChild(renderWrapper(), "Overlay").props.lyricsEnabled).toBe(true);

    plugin.onDismount?.();
  });

  it("proxies track_metadata toast cover via get_image at 48x48 and respects toast_sound_enabled", async () => {
    mockToasterToast.mockClear();
    mockGetImage.mockClear();
    await import("./index");
    const { addEventListener } = await import("@decky/api");
    const plugin = capturedPluginFactory!();

    const trackMetaCall = (addEventListener as any).mock.calls.find(
      (c: any[]) => c[0] === "track_metadata"
    );
    expect(trackMetaCall).toBeDefined();
    const trackMetaHandler = trackMetaCall[1];

    mockGetStatus.mockResolvedValue({
      settings: {
        toast_enabled: true,
        toast_sound_enabled: true,
        silent_banner_enabled: false,
      },
    });
    await trackMetaHandler({
      track_id: "trk-toast-1",
      name: "Toast Song",
      artist: "Toast Artist",
      artwork_url: "https://i.scdn.co/image/abc123",
    });

    expect(mockGetImage).toHaveBeenCalledWith("https://i.scdn.co/image/abc123");
    expect(mockToasterToast).toHaveBeenCalledTimes(1);
    const toastArg = mockToasterToast.mock.calls[0][0];
    expect(toastArg.sound).toBe(1);
    expect(toastArg.playSound).toBe(true);
    expect(toastArg.logo.type).toBe("img");
    expect(toastArg.logo.props.src).toBe("data:image/jpeg;base64,MOCKCOVER");
    expect(toastArg.logo.props.width).toBe(48);
    expect(toastArg.logo.props.height).toBe(48);
    expect(toastArg.logo.props.style).toMatchObject({ width: 48, height: 48, objectFit: "cover" });

    plugin.onDismount?.();
  });

  it("always mounts SilentBanner even when overlay_enabled is false while omitting Overlay (TOAST-01, D-01, D-05)", async () => {
    await import("./index");
    const { routerHook } = await import("@decky/api");
    const plugin = capturedPluginFactory!();
    const wrapperFactory = (routerHook.addGlobalComponent as any).mock.calls[0][1];
    const renderWrapper = () => {
      hookIdx = 0;
      const el = wrapperFactory();
      return el.type(el.props || {});
    };

    mockGetStatus.mockResolvedValue({
      track: { track_id: "trk-off-1", name: "Hidden HUD Track", artist: "Artist" },
      is_playing: true,
      settings: {
        overlay_enabled: false,
        toast_enabled: true,
        toast_sound_enabled: false,
        silent_banner_enabled: true,
        overlay_position: "top-right",
      },
    });

    renderWrapper();
    await Promise.resolve();
    await Promise.resolve();
    const wrapperTree = renderWrapper();

    expect(findWrapperChild(wrapperTree, "Overlay")).toBeUndefined();
    const bannerEl = findWrapperChild(wrapperTree, "SilentBanner");
    expect(bannerEl).toBeDefined();
    expect(bannerEl.props).toMatchObject({
      enabled: true,
      position: "top-right",
      hudVisible: false,
    });

    // silent_banner_position takes precedence over overlay_position even when overlay_enabled is false
    mockGetStatus.mockResolvedValue({
      track: { track_id: "trk-off-2", name: "Hidden HUD Track 2", artist: "Artist" },
      is_playing: true,
      settings: {
        overlay_enabled: false,
        toast_enabled: true,
        toast_sound_enabled: false,
        silent_banner_enabled: true,
        overlay_position: "top-right",
        silent_banner_position: "bottom-left",
      },
    });
    renderWrapper();
    await Promise.resolve();
    await Promise.resolve();
    const bannerElCustomPos = findWrapperChild(renderWrapper(), "SilentBanner");
    expect(bannerElCustomPos).toBeDefined();
    expect(bannerElCustomPos.props.position).toBe("bottom-left");

    plugin.onDismount?.();
  });

  it("emits silent banner on track_metadata without awaiting get_image or calling toaster.toast when toast_sound_enabled is false (TOAST-01, D-04)", async () => {
    mockToasterToast.mockClear();
    mockGetImage.mockClear();
    await import("./index");
    const { addEventListener } = await import("@decky/api");
    const plugin = capturedPluginFactory!();

    const received: any[] = [];
    const unsub = subscribeBanner((b) => received.push(b));

    const trackMetaCall = (addEventListener as any).mock.calls.find(
      (c: any[]) => c[0] === "track_metadata"
    );
    expect(trackMetaCall).toBeDefined();
    const trackMetaHandler = trackMetaCall[1];

    mockGetStatus.mockResolvedValue({
      settings: {
        toast_enabled: true,
        toast_sound_enabled: false,
        silent_banner_enabled: true,
      },
    });

    // Uncached cover: get_image stays unresolved; banner still emits immediately with imageUrl: null
    mockGetImage.mockImplementationOnce(() => new Promise(() => {}));
    await trackMetaHandler({
      track_id: "trk-silent-uncached",
      name: "Silent Uncached Song",
      artist: "Silent Artist",
      artwork_url: "https://i.scdn.co/image/silent-uncached",
    });

    expect(mockToasterToast).not.toHaveBeenCalled();
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      text: "Silent Uncached Song",
      secondaryText: "Silent Artist",
      tone: "accent",
      imageUrl: null,
    });

    // Cached cover in imgMemoryCache: banner emits synchronously with cached data URL
    imgMemoryCache.set("https://i.scdn.co/image/silent-cached", "data:image/jpeg;base64,CACHED");
    await trackMetaHandler({
      track_id: "trk-silent-cached",
      name: "Silent Cached Song",
      artist: "Cached Artist",
      artwork_url: "https://i.scdn.co/image/silent-cached",
    });

    expect(mockToasterToast).not.toHaveBeenCalled();
    expect(received).toHaveLength(2);
    expect(received[1]).toMatchObject({
      text: "Silent Cached Song",
      secondaryText: "Cached Artist",
      tone: "accent",
      imageUrl: "data:image/jpeg;base64,CACHED",
    });

    unsub();
    plugin.onDismount?.();
  });

  it("keeps SilentBanner mounted for D-11 chord confirmations when toast_enabled is false while suppressing track_metadata notifications (D-01, D-11)", async () => {
    mockToasterToast.mockClear();
    let onButtonDown: ((btn: number) => void) | null = null;
    (globalThis as any).window.FocusNavController = {
      m_rgGamepadInputSources: [
        {
          RegisterForGamepadButtonDown: (cb: (btn: number) => void) => {
            onButtonDown = cb;
            return vi.fn();
          },
          RegisterForGamepadButtonUp: vi.fn(() => vi.fn()),
        },
      ],
    };

    await import("./index");
    const { addEventListener, routerHook } = await import("@decky/api");
    const plugin = capturedPluginFactory!();

    const wrapperFactory = (routerHook.addGlobalComponent as any).mock.calls[0][1];
    const renderWrapper = () => {
      hookIdx = 0;
      const el = wrapperFactory();
      return el.type(el.props || {});
    };

    mockGetStatus.mockResolvedValue({
      settings: {
        overlay_enabled: false,
        toast_enabled: false,
        toast_sound_enabled: false,
        silent_banner_enabled: true,
        gamepad_chord_bindings: { next: [23, 12] },
      },
    });

    renderWrapper();
    await Promise.resolve();
    await Promise.resolve();
    const bannerEl = findWrapperChild(renderWrapper(), "SilentBanner");
    expect(bannerEl).toBeDefined();
    expect(bannerEl.props.enabled).toBe(true);

    const received: any[] = [];
    const unsub = subscribeBanner((b) => received.push(b));
    const trackMetaCall = (addEventListener as any).mock.calls.find(
      (c: any[]) => c[0] === "track_metadata"
    );
    await trackMetaCall[1]({
      track_id: "trk-muted-1",
      name: "Suppressed Track",
      artist: "Artist",
    });

    expect(received).toHaveLength(0);
    expect(mockToasterToast).not.toHaveBeenCalled();

    expect(onButtonDown).toBeTypeOf("function");
    onButtonDown!(23);
    onButtonDown!(12);
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      text: "⏭ Next",
      tone: "accent",
    });
    expect(mockToasterToast).not.toHaveBeenCalled();

    unsub();
    plugin.onDismount?.();
  });
});

describe("Phase 17: Event-Driven librespot (--onevent) & QAM Resilience UX", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetHooks();
    mockGetStatus.mockResolvedValue(null);
    mockGetDevices.mockResolvedValue({ ok: true, devices: [] });
    mockRestoreBookmark.mockResolvedValue({ ok: true });
    (globalThis as any).window = {
      SteamClient: {
        GameSessions: {
          RegisterForAppLifetimeNotifications: mockRegisterForAppLifetime,
        },
        Input: {},
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
  });

  it("usePlaybackStatus updates status immediately on librespot_event and track_metadata and cleans up listeners on unmount (RESIL-01)", async () => {
    const { usePlaybackStatus } = await import("./hooks/usePlaybackStatus");
    const { addEventListener, removeEventListener } = await import("@decky/api");

    const RenderHook = () => {
      hookIdx = 0;
      return usePlaybackStatus();
    };

    const initial = RenderHook();
    expect(initial.status).toBeNull();

    const libreCall = (addEventListener as any).mock.calls.find((c: any[]) => c[0] === "librespot_event");
    const metaCall = (addEventListener as any).mock.calls.find((c: any[]) => c[0] === "track_metadata");
    expect(libreCall).toBeDefined();
    expect(metaCall).toBeDefined();

    // Push track_metadata -> immediate track & duration update without waiting for 1.5s poll
    metaCall[1]({
      track_id: "base62track12345678901",
      name: "Instant Song",
      artist: "Instant Artist",
      duration_ms: 210000,
      is_liked: true,
    });

    let current = RenderHook();
    expect(current.status?.track?.name).toBe("Instant Song");
    expect(current.status?.duration_ms).toBe(210000);
    expect(current.status?.is_liked).toBe(true);

    // Push librespot_event playing -> immediate is_playing, position_ms, duration_ms, volume
    libreCall[1]({
      event: "playing",
      track_id: "base62track12345678901",
      position_ms: 42000,
      duration_ms: 215000,
      volume: 75,
    });

    current = RenderHook();
    expect(current.status?.is_playing).toBe(true);
    expect(current.status?.play_state).toBe("playing");
    expect(current.status?.position_ms).toBe(42000);
    expect(current.status?.duration_ms).toBe(215000);
    expect(current.status?.volume).toBe(75);

    // Push librespot_event paused -> immediate pause
    libreCall[1]({ event: "paused", position_ms: 45000 });
    current = RenderHook();
    expect(current.status?.is_playing).toBe(false);
    expect(current.status?.play_state).toBe("paused");
    expect(current.status?.position_ms).toBe(45000);

    // Unmount cleanup removes both listeners
    effectCleanups.forEach((cleanup) => cleanup());
    expect(removeEventListener).toHaveBeenCalledWith("librespot_event", expect.anything());
    expect(removeEventListener).toHaveBeenCalledWith("track_metadata", expect.anything());
  });

  it("QuickAccessMenu conditionally renders Resume Bookmark button only when held_bookmark is non-null and resilience_prompt_held_enabled is true (D-09)", async () => {
    await import("./index");
    const { addEventListener } = await import("@decky/api");
    const plugin = capturedPluginFactory!();
    const renderContent = () => {
      hookIdx = 0;
      return plugin.content.type({});
    };

    // Initial render: held_bookmark is null -> no Resume Bookmark button
    let nodes = flattenNodes(renderContent());
    expect(
      nodes.find((n) => n.type === "ButtonItem" && textContent(n).includes("Resume Bookmark"))
    ).toBeUndefined();

    // Emit resilience_status with a held_bookmark
    const resilienceCalls = (addEventListener as any).mock.calls.filter(
      (c: any[]) => c[0] === "resilience_status"
    );
    expect(resilienceCalls.length).toBeGreaterThan(0);
    const resilienceHandler = resilienceCalls[resilienceCalls.length - 1][1];

    resilienceHandler({
      onevent_healthy: true,
      poll_interval_s: 20,
      polling_mode: "onevent",
      last_event_at: 100,
      held_bookmark: {
        track_uri: "spotify:track:held123",
        context_uri: "spotify:playlist:ctx123",
        position_ms: 60000,
        was_playing: true,
        track_name: "Held Song",
        artist: "Held Artist",
        saved_at: 1700000000,
      },
      held_reason: "remote_active",
      recovering: false,
    });

    nodes = flattenNodes(renderContent());
    let resumeBtn = nodes.find(
      (n) => n.type === "ButtonItem" && textContent(n).includes("Resume Bookmark")
    );
    expect(resumeBtn).toBeDefined();
    expect(resumeBtn.props.description).toContain("Held Song");

    // Disable resilience_prompt_held_enabled -> button hides
    const settingsIdx = hookValues.findIndex(
      (v) => v && typeof v === "object" && "audio_backend" in v
    );
    hookValues[settingsIdx] = {
      ...hookValues[settingsIdx],
      resilience_prompt_held_enabled: false,
    };
    nodes = flattenNodes(renderContent());
    expect(
      nodes.find((n) => n.type === "ButtonItem" && textContent(n).includes("Resume Bookmark"))
    ).toBeUndefined();

    // Re-enable prompt and click Resume Bookmark -> invokes restore_bookmark RPC and clears banner
    hookValues[settingsIdx] = {
      ...hookValues[settingsIdx],
      resilience_prompt_held_enabled: true,
    };
    nodes = flattenNodes(renderContent());
    resumeBtn = nodes.find(
      (n) => n.type === "ButtonItem" && textContent(n).includes("Resume Bookmark")
    );
    await resumeBtn.props.onClick();
    expect(mockRestoreBookmark).toHaveBeenCalledTimes(1);

    nodes = flattenNodes(renderContent());
    expect(
      nodes.find((n) => n.type === "ButtonItem" && textContent(n).includes("Resume Bookmark"))
    ).toBeUndefined();

    plugin.onDismount?.();
  });

  it("QuickAccessMenu updates state immediately on librespot_event and shows toast on session_restored only when resilience_toast_enabled is true (D-09)", async () => {
    mockToasterToast.mockClear();
    await import("./index");
    const { addEventListener } = await import("@decky/api");
    const plugin = capturedPluginFactory!();
    const renderContent = () => {
      hookIdx = 0;
      return plugin.content.type({});
    };

    renderContent();

    // Grab QAM listeners registered during renderContent
    const trackMetaCalls = (addEventListener as any).mock.calls.filter(
      (c: any[]) => c[0] === "track_metadata"
    );
    const libreCalls = (addEventListener as any).mock.calls.filter(
      (c: any[]) => c[0] === "librespot_event"
    );
    const restoredCalls = (addEventListener as any).mock.calls.filter(
      (c: any[]) => c[0] === "session_restored"
    );
    const qamTrackMetaHandler = trackMetaCalls[trackMetaCalls.length - 1][1];
    const qamLibreHandler = libreCalls[libreCalls.length - 1][1];
    const qamRestoredHandler = restoredCalls[restoredCalls.length - 1][1];

    // Push track_metadata and librespot_event playing
    qamTrackMetaHandler({
      track_id: "trk-qam-1",
      name: "QAM Track",
      artist: "QAM Artist",
      duration_ms: 180000,
    });
    qamLibreHandler({ event: "playing", position_ms: 15000, duration_ms: 180000, volume: 80 });

    let nodes = flattenNodes(renderContent());
    const trackField = nodes.find((n) => n.type === "Field" && n.props?.label === "QAM Track");
    expect(trackField).toBeDefined();
    expect(textContent(trackField)).toContain("Playing");

    // Push librespot_event paused -> immediately shows Paused
    qamLibreHandler({ event: "paused", position_ms: 20000 });
    nodes = flattenNodes(renderContent());
    const pausedField = nodes.find((n) => n.type === "Field" && n.props?.label === "QAM Track");
    expect(textContent(pausedField)).toContain("Paused");

    // session_restored toast when enabled
    qamRestoredHandler({
      source: "dbus",
      track_name: "Wake Song",
      artist: "Wake Artist",
      position_ms: 30000,
      toast_enabled: true,
    });
    expect(mockToasterToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Deckify",
        body: "Resumed Wake Song — Wake Artist",
      })
    );

    // Suppress toast when resilience_toast_enabled is false in settings
    mockToasterToast.mockClear();
    const settingsIdx = hookValues.findIndex(
      (v) => v && typeof v === "object" && "audio_backend" in v
    );
    hookValues[settingsIdx] = {
      ...hookValues[settingsIdx],
      resilience_toast_enabled: false,
    };
    renderContent();
    qamRestoredHandler({
      source: "wifi",
      track_name: "Wake Song",
      artist: "Wake Artist",
      position_ms: 30000,
      toast_enabled: true,
    });
    expect(mockToasterToast).not.toHaveBeenCalled();

    // Suppress toast when payload toast_enabled is false
    hookValues[settingsIdx] = {
      ...hookValues[settingsIdx],
      resilience_toast_enabled: true,
    };
    renderContent();
    qamRestoredHandler({
      source: "wifi",
      track_name: "Wake Song",
      artist: "Wake Artist",
      position_ms: 30000,
      toast_enabled: false,
    });
    expect(mockToasterToast).not.toHaveBeenCalled();

    plugin.onDismount?.();
  });

  it("QuickAccessMenu renders GAME VOL / DUCKED pills and effective_volume from get_ducking_state and ducking_state_changed (D-08)", async () => {
    await import("./index");
    const { addEventListener } = await import("@decky/api");
    mockGetDuckingState.mockResolvedValueOnce({
      is_ducked: false,
      has_game_override: true,
      effective_volume: 52,
      base_volume: 80,
      duck_reasons: [],
    });

    const plugin = capturedPluginFactory!();
    const renderContent = () => {
      hookIdx = 0;
      return plugin.content.type({});
    };

    renderContent();
    await Promise.resolve();
    await Promise.resolve();

    // Seed active trackMeta (slot 4) so secondary zone volume slider is rendered
    hookValues[4] = { name: "Game OST", artist: "Composer", album: "OST", duration_ms: 180000 };

    let nodes = flattenNodes(renderContent());
    let volSlider = nodes.find((n) => n.type === "SliderField" && n.props?.valueSuffix === "%");
    expect(volSlider).toBeDefined();
    expect(volSlider.props.value).toBe(52);
    expect(nodes.some((n) => n.type === "span" && textContent(n) === "GAME VOL")).toBe(true);
    expect(nodes.some((n) => n.type === "span" && textContent(n) === "DUCKED")).toBe(false);

    const duckCalls = (addEventListener as any).mock.calls.filter(
      (c: any[]) => c[0] === "ducking_state_changed"
    );
    expect(duckCalls.length).toBeGreaterThan(0);
    const duckHandler = duckCalls[duckCalls.length - 1][1];

    duckHandler({
      is_ducked: true,
      has_game_override: true,
      effective_volume: 32,
      base_volume: 80,
      duck_reasons: ["game"],
    });
    nodes = flattenNodes(renderContent());
    volSlider = nodes.find((n) => n.type === "SliderField" && n.props?.valueSuffix === "%");
    expect(volSlider.props.value).toBe(32);
    expect(nodes.some((n) => n.type === "span" && textContent(n) === "DUCKED")).toBe(true);
    expect(nodes.some((n) => n.type === "span" && textContent(n) === "GAME VOL")).toBe(false);

    duckHandler({
      is_ducked: false,
      has_game_override: true,
      effective_volume: 65,
      base_volume: 80,
      duck_reasons: [],
    });
    nodes = flattenNodes(renderContent());
    volSlider = nodes.find((n) => n.type === "SliderField" && n.props?.valueSuffix === "%");
    expect(volSlider.props.value).toBe(65);
    expect(nodes.some((n) => n.type === "span" && textContent(n) === "GAME VOL")).toBe(true);
    expect(nodes.some((n) => n.type === "span" && textContent(n) === "DUCKED")).toBe(false);

    duckHandler({
      is_ducked: false,
      has_game_override: false,
      effective_volume: 80,
      base_volume: 80,
      duck_reasons: [],
    });
    nodes = flattenNodes(renderContent());
    volSlider = nodes.find((n) => n.type === "SliderField" && n.props?.valueSuffix === "%");
    expect(volSlider.props.value).toBe(50);
    expect(nodes.some((n) => n.type === "span" && textContent(n) === "GAME VOL")).toBe(false);
    expect(nodes.some((n) => n.type === "span" && textContent(n) === "DUCKED")).toBe(false);

    plugin.onDismount?.();
  });
});

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 6; i += 1) {
    await Promise.resolve();
  }
}

interface ChordHarness {
  plugin: any;
  received: any[];
  unsubBanner: () => void;
  pressChord: (...btns: number[]) => void;
  pressDown: (btn: number) => void;
  releaseUp: (btn: number) => void;
  unregDown: ReturnType<typeof vi.fn>;
  unregUp: ReturnType<typeof vi.fn>;
  renderWrapper: () => any;
  renderContent: () => any;
  getHandler: (eventName: string) => ((payload: any) => any);
}

async function mountChordHarness(initialStatus: any = null): Promise<ChordHarness> {
  let downCb: ((btn: number) => void) | null = null;
  let upCb: ((btn: number) => void) | null = null;
  const unregDown = vi.fn();
  const unregUp = vi.fn();

  (globalThis as any).window.FocusNavController = {
    m_rgGamepadInputSources: [
      {
        RegisterForGamepadButtonDown: (cb: (btn: number) => void) => {
          downCb = cb;
          return unregDown;
        },
        RegisterForGamepadButtonUp: (cb: (btn: number) => void) => {
          upCb = cb;
          return unregUp;
        },
      },
    ],
  };

  if (initialStatus !== undefined) {
    mockGetStatus.mockResolvedValue(initialStatus);
  }

  await import("./index");
  const { addEventListener, routerHook } = await import("@decky/api");
  const plugin = capturedPluginFactory!();
  await flushMicrotasks();

  const received: any[] = [];
  const unsubBanner = subscribeBanner((b) => received.push(b));
  const wrapperFactory = (routerHook.addGlobalComponent as any).mock.calls[0][1];

  const pressDown = (btn: number) => {
    expect(downCb).toBeTypeOf("function");
    downCb!(btn);
  };
  const releaseUp = (btn: number) => {
    expect(upCb).toBeTypeOf("function");
    upCb!(btn);
  };
  const pressChord = (...btns: number[]) => {
    for (const b of btns) pressDown(b);
    for (let i = btns.length - 1; i >= 0; i -= 1) releaseUp(btns[i]);
  };
  const getHandler = (eventName: string) => {
    const calls = (addEventListener as any).mock.calls.filter((c: any[]) => c[0] === eventName);
    expect(calls.length).toBeGreaterThan(0);
    return calls[calls.length - 1][1];
  };

  return {
    plugin,
    received,
    unsubBanner,
    pressChord,
    pressDown,
    releaseUp,
    unregDown,
    unregUp,
    renderWrapper: () => {
      hookIdx = 0;
      const el = wrapperFactory();
      return el.type(el.props || {});
    },
    renderContent: () => {
      hookIdx = 0;
      return plugin.content.type({});
    },
    getHandler,
  };
}

describe("Phase 20: Configurable Quick-Chords & Silent Confirmations (CHORD-01)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    resetHooks();
    resetBannerBusForTests();
    setChordRecordingActive(false);
    mockGetStatus.mockResolvedValue(null);
    mockControlPlayback.mockResolvedValue({ ok: true });
    mockSetVolume.mockResolvedValue({ ok: true });
    mockToggleLike.mockResolvedValue({ ok: true, is_liked: true });
    mockQuickPlayPinned.mockResolvedValue({ ok: true });
    mockSetSetting.mockResolvedValue({ ok: true });
    (globalThis as any).window = {
      SteamClient: {
        GameSessions: { RegisterForAppLifetimeNotifications: mockRegisterForAppLifetime },
        Input: {},
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
  });

  afterEach(() => {
    resetBannerBusForTests();
    setChordRecordingActive(false);
    vi.useRealTimers();
  });

  it("dispatches configured chords ([23,11], [23,12], [23,1], [23,9], [23,10]) via silent banner without toaster chime", async () => {
    const h = await mountChordHarness({
      volume: 50,
      is_playing: false,
      settings: {
        silent_banner_enabled: true,
        toast_enabled: true,
        gamepad_chord_bindings: {
          previous: [23, 11],
          next: [23, 12],
          play_pause: [23, 1],
          volume_up: [23, 9],
          volume_down: [23, 10],
        },
      },
    });

    h.pressChord(23, 11);
    expect(mockControlPlayback).toHaveBeenLastCalledWith("previous", "");
    expect(h.received[0]).toMatchObject({ text: "⏮ Previous", tone: "accent" });

    h.pressChord(23, 12);
    expect(mockControlPlayback).toHaveBeenLastCalledWith("next", "");
    expect(h.received[1]).toMatchObject({ text: "⏭ Next", tone: "accent" });

    h.pressChord(23, 1);
    expect(mockControlPlayback).toHaveBeenLastCalledWith("play_pause", "");
    expect(h.received[2]).toMatchObject({ text: "⏯ Playing", tone: "accent" });

    h.pressChord(23, 1);
    expect(h.received[3]).toMatchObject({ text: "⏸ Paused", tone: "accent" });

    h.pressChord(23, 9);
    await flushMicrotasks();
    expect(mockSetVolume).toHaveBeenLastCalledWith(55);
    expect(h.received[4]).toMatchObject({ text: "🔊 Volume 55%", tone: "accent" });

    mockGetStatus.mockResolvedValue({ volume: 55, settings: { silent_banner_enabled: true } });
    h.pressChord(23, 10);
    await flushMicrotasks();
    expect(mockSetVolume).toHaveBeenLastCalledWith(50);
    expect(h.received[5]).toMatchObject({ text: "🔊 Volume 50%", tone: "accent" });

    expect(mockToasterToast).not.toHaveBeenCalled();
    h.unsubBanner();
    h.plugin.onDismount?.();
  });

  it("delivers chord banners when toast_enabled is false (D-01/D-11) and falls back to toaster when silent_banner_enabled is false", async () => {
    const h = await mountChordHarness({
      settings: {
        overlay_enabled: false,
        toast_enabled: false,
        silent_banner_enabled: true,
        gamepad_chord_bindings: {
          previous: [23, 11],
          next: [23, 12],
        },
      },
    });

    const wrapperTree = h.renderWrapper();
    await flushMicrotasks();
    const bannerEl = findWrapperChild(h.renderWrapper(), "SilentBanner");
    expect(wrapperTree).toBeDefined();
    expect(bannerEl?.props.enabled).toBe(true);

    h.pressChord(23, 12);
    expect(h.received).toHaveLength(1);
    expect(h.received[0]).toMatchObject({ text: "⏭ Next", tone: "accent" });
    expect(mockToasterToast).not.toHaveBeenCalled();

    const settingsHandler = h.getHandler("settings_changed");
    settingsHandler({ silent_banner_enabled: false });
    h.pressChord(23, 11);
    expect(h.received).toHaveLength(1);
    expect(mockToasterToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Deckify", body: "⏮ Previous", playSound: false }),
    );

    h.unsubBanner();
    h.plugin.onDismount?.();
  });

  it("handles toggle_like chord [23,3] with optimistic banner, RPC error/rejection rollback, concurrency guard, and track_metadata sync (D-13)", async () => {
    const h = await mountChordHarness({
      track: { track_id: "trk-like-1", name: "Starlight", artist: "Muse" },
      is_liked: false,
      settings: {
        silent_banner_enabled: true,
        toast_enabled: true,
        toast_sound_enabled: false,
        gamepad_chord_bindings: { toggle_like: [23, 3] },
      },
    });
    const trackMetaHandler = h.getHandler("track_metadata");

    // 1. Optimistic like + same-track re-emit from backend must NOT emit duplicate track banner
    mockToggleLike.mockResolvedValueOnce({ ok: true, is_liked: true });
    h.pressChord(23, 3);
    expect(h.received[0]).toMatchObject({ text: "♥ Liked: Starlight", tone: "accent" });
    expect(mockToggleLike).toHaveBeenCalledWith("trk-like-1", true);
    await flushMicrotasks();

    await trackMetaHandler({
      track_id: "trk-like-1",
      name: "Starlight",
      artist: "Muse",
      is_liked: true,
    });
    expect(h.received).toHaveLength(1);

    // 2. Unlike succeeds
    mockToggleLike.mockResolvedValueOnce({ ok: true, is_liked: false });
    h.pressChord(23, 3);
    expect(h.received[1]).toMatchObject({ text: "♡ Removed from Liked", tone: "neutral" });
    await flushMicrotasks();

    // 3. { ok: false } rollback -> reverts cachedIsLiked back to false
    mockToggleLike.mockResolvedValueOnce({ ok: false, error: "Forbidden" });
    h.pressChord(23, 3);
    expect(h.received[2]).toMatchObject({ text: "♥ Liked: Starlight", tone: "accent" });
    await flushMicrotasks();
    expect(h.received[3]).toMatchObject({
      text: "Couldn't update Liked Songs — try again",
      tone: "error",
    });

    // 4. Rejected promise rollback -> reverts cachedIsLiked cleanly without unhandled rejection
    mockToggleLike.mockRejectedValueOnce(new Error("Network down"));
    h.pressChord(23, 3);
    expect(h.received[4]).toMatchObject({ text: "♥ Liked: Starlight", tone: "accent" });
    await flushMicrotasks();
    expect(h.received[5]).toMatchObject({
      text: "Couldn't update Liked Songs — try again",
      tone: "error",
    });

    // 5. QAM/Modal same-track track_metadata syncs cachedIsLiked=true so next chord unlikes
    await trackMetaHandler({
      track_id: "trk-like-1",
      name: "Starlight",
      artist: "Muse",
      is_liked: true,
    });
    expect(h.received).toHaveLength(6);
    mockToggleLike.mockResolvedValueOnce({ ok: true, is_liked: false });
    h.pressChord(23, 3);
    expect(h.received[6]).toMatchObject({ text: "♡ Removed from Liked", tone: "neutral" });
    await flushMicrotasks();

    // 6. Rapid double-toggle concurrency guard: stale first failure ignored
    let resolveFirst!: (val: any) => void;
    mockToggleLike
      .mockImplementationOnce(() => new Promise((r) => { resolveFirst = r; }))
      .mockResolvedValueOnce({ ok: true, is_liked: false });
    h.pressChord(23, 3); // seq 1 -> optimistic like
    h.pressChord(23, 3); // seq 2 -> optimistic unlike
    resolveFirst({ ok: false });
    await flushMicrotasks();
    expect(h.received.slice(7)).toEqual([
      expect.objectContaining({ text: "♥ Liked: Starlight", tone: "accent" }),
      expect.objectContaining({ text: "♡ Removed from Liked", tone: "neutral" }),
    ]);

    h.unsubBanner();
    h.plugin.onDismount?.();
  });

  it("handles cycle_pinned [24] empty state, 1..n wrapping, and failure rollback on { ok: false } and rejected promise (D-12)", async () => {
    const h = await mountChordHarness({
      settings: {
        silent_banner_enabled: true,
        pinned_playlists: [],
        gamepad_chord_bindings: { cycle_pinned: [24] },
      },
    });

    // Empty state
    h.pressChord(24);
    expect(h.received[0]).toMatchObject({ text: "No pinned playlists", tone: "neutral" });

    // Seed 2 pinned items via settings_changed
    const settingsHandler = h.getHandler("settings_changed");
    settingsHandler({
      pinned_playlists: [
        { uri: "spotify:playlist:p1", name: "Synthwave", type: "playlist" },
        { uri: "spotify:album:a2", name: "Discovery", type: "album" },
      ],
    });

    h.pressChord(24);
    await flushMicrotasks();
    expect(mockQuickPlayPinned).toHaveBeenLastCalledWith("spotify:playlist:p1", "playlist");
    expect(h.received[1]).toMatchObject({ text: "▶ Pinned 1/2: Synthwave", tone: "accent" });

    h.pressChord(24);
    await flushMicrotasks();
    expect(mockQuickPlayPinned).toHaveBeenLastCalledWith("spotify:album:a2", "album");
    expect(h.received[2]).toMatchObject({ text: "▶ Pinned 2/2: Discovery", tone: "accent" });

    // Failure { ok: false } on wrap to 1/2 -> reverts state so next trigger retries 1/2
    mockQuickPlayPinned.mockResolvedValueOnce({ ok: false, error: "Offline" });
    h.pressChord(24);
    await flushMicrotasks();
    expect(mockQuickPlayPinned).toHaveBeenLastCalledWith("spotify:playlist:p1", "playlist");
    expect(h.received[3]).toMatchObject({ text: "Couldn't start pinned playlist", tone: "error" });

    // Rejected promise on retry of 1/2 -> reverts again cleanly without unhandled rejection
    mockQuickPlayPinned.mockRejectedValueOnce(new Error("RPC timeout"));
    h.pressChord(24);
    await flushMicrotasks();
    expect(mockQuickPlayPinned).toHaveBeenLastCalledWith("spotify:playlist:p1", "playlist");
    expect(h.received[4]).toMatchObject({ text: "Couldn't start pinned playlist", tone: "error" });

    // Next attempt succeeds at 1/2
    h.pressChord(24);
    await flushMicrotasks();
    expect(mockQuickPlayPinned).toHaveBeenLastCalledWith("spotify:playlist:p1", "playlist");
    expect(h.received[5]).toMatchObject({ text: "▶ Pinned 1/2: Synthwave", tone: "accent" });

    h.unsubBanner();
    h.plugin.onDismount?.();
  });

  it("handles toggle_lyrics [25] persistence and failure rollback on { ok: false } and rejected promise (D-14)", async () => {
    const h = await mountChordHarness({
      settings: {
        silent_banner_enabled: true,
        overlay_lyrics_enabled: false,
        gamepad_chord_bindings: { toggle_lyrics: [25] },
      },
    });

    // { ok: false } preserves cachedOverlayLyricsEnabled=false
    mockSetSetting.mockResolvedValueOnce({ ok: false, error: "Disk error" });
    h.pressChord(25);
    await flushMicrotasks();
    expect(mockSetSetting).toHaveBeenLastCalledWith("overlay_lyrics_enabled", true);
    expect(h.received[0]).toMatchObject({ text: "Couldn't save lyrics setting", tone: "error" });

    // Rejected promise also preserves cachedOverlayLyricsEnabled=false
    mockSetSetting.mockRejectedValueOnce(new Error("Pipe broken"));
    h.pressChord(25);
    await flushMicrotasks();
    expect(mockSetSetting).toHaveBeenLastCalledWith("overlay_lyrics_enabled", true);
    expect(h.received[1]).toMatchObject({ text: "Couldn't save lyrics setting", tone: "error" });

    // Next press flips false -> true cleanly
    h.pressChord(25);
    await flushMicrotasks();
    expect(mockSetSetting).toHaveBeenLastCalledWith("overlay_lyrics_enabled", true);
    expect(h.received[2]).toMatchObject({ text: "Lyrics HUD On", tone: "accent" });

    // Second press flips true -> false
    h.pressChord(25);
    await flushMicrotasks();
    expect(mockSetSetting).toHaveBeenLastCalledWith("overlay_lyrics_enabled", false);
    expect(h.received[3]).toMatchObject({ text: "Lyrics HUD Off", tone: "neutral" });

    h.unsubBanner();
    h.plugin.onDismount?.();
  });

  it("expires guideHeld after 4000ms for both 27 and legacy 13 (D-09)", async () => {
    vi.useFakeTimers();
    const h = await mountChordHarness({
      settings: {
        silent_banner_enabled: true,
        gamepad_chord_bindings: { next: [12, 27], previous: [11, 27] },
      },
    });

    h.pressDown(27);
    vi.advanceTimersByTime(4000);
    h.pressDown(12);
    expect(h.received).toHaveLength(0);
    expect(mockControlPlayback).not.toHaveBeenCalled();
    h.releaseUp(12);

    h.pressDown(13);
    vi.advanceTimersByTime(3999);
    h.pressDown(12);
    expect(h.received).toHaveLength(1);
    expect(h.received[0]).toMatchObject({ text: "⏭ Next" });
    h.releaseUp(12);
    h.releaseUp(13);

    h.pressDown(13);
    vi.advanceTimersByTime(4000);
    h.pressDown(11);
    expect(h.received).toHaveLength(1);
    h.releaseUp(11);

    h.unsubBanner();
    h.plugin.onDismount?.();
  });

  it("suppresses chords when modal open, recording active, or disabled, stays active in QAM, updates on settings_changed, and cleans up on dismount (D-10)", async () => {
    const h = await mountChordHarness({
      settings: {
        silent_banner_enabled: true,
        gamepad_chords_enabled: true,
        gamepad_chord_bindings: { next: [23, 12], previous: [23, 11] },
      },
    });
    const { showModal } = await import("@decky/ui");

    // 1. QAM open does NOT suppress chords
    const qamNodes = flattenNodes(h.renderContent());
    h.pressChord(23, 12);
    expect(h.received).toHaveLength(1);

    // 2. Expanded Modal open suppresses chords until closeModal
    const openBtn = qamNodes.find(
      (n) => n.type === "ButtonItem" && textContent(n).includes("Open Deckify (Full Screen)"),
    );
    expect(openBtn).toBeDefined();
    openBtn.props.onClick();
    expect(showModal).toHaveBeenCalledTimes(1);
    h.pressChord(23, 11);
    expect(h.received).toHaveLength(1);

    const modalEl = (showModal as any).mock.calls[0][0];
    modalEl.props.closeModal();
    h.pressChord(23, 11);
    expect(h.received).toHaveLength(2);

    // 3. setChordRecordingActive(true) suppresses chords
    setChordRecordingActive(true);
    h.pressChord(23, 12);
    expect(h.received).toHaveLength(2);
    setChordRecordingActive(false);

    // 4. gamepad_chords_enabled=false disables chords; settings_changed live-updates bindings
    const settingsHandler = h.getHandler("settings_changed");
    settingsHandler({ gamepad_chords_enabled: false });
    h.pressChord(23, 12);
    expect(h.received).toHaveLength(2);

    settingsHandler({
      gamepad_chords_enabled: true,
      gamepad_chord_bindings: { next: [26] },
    });
    h.pressChord(26);
    expect(h.received).toHaveLength(3);
    expect(h.received[2]).toMatchObject({ text: "⏭ Next" });

    // 5. onDismount unregisters Down/Up listeners, resets runtime state, and ignores post-dismount presses
    setChordRecordingActive(true);
    h.plugin.onDismount?.();
    expect(h.unregDown).toHaveBeenCalledTimes(1);
    expect(h.unregUp).toHaveBeenCalledTimes(1);
    expect(isChordRecordingActive()).toBe(false);

    h.pressDown(26);
    expect(h.received).toHaveLength(3);
    h.unsubBanner();
  });

  it("keeps SilentBanner active and plays volume-scaled Web Audio chime (never toaster.toast) when silent_banner_enabled and toast_sound_enabled are both true (G-20-1)", async () => {
    mockToasterToast.mockClear();
    const originalAudioContext = globalThis.AudioContext;
    const gainCalls: Array<{ value: number; time: number }> = [];
    class FakeAudioContext {
      state = "running";
      currentTime = 5;
      destination = {};
      resume = vi.fn().mockResolvedValue(undefined);
      createOscillator = vi.fn(() => ({
        type: "sine",
        frequency: { setValueAtTime: vi.fn() },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      }));
      createGain = vi.fn(() => ({
        gain: {
          setValueAtTime: vi.fn((value: number, time: number) => {
            gainCalls.push({ value, time });
          }),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
      }));
    }
    (globalThis as { AudioContext?: unknown }).AudioContext = FakeAudioContext;

    try {
      await import("./index");
      const { addEventListener } = await import("@decky/api");
      const plugin = capturedPluginFactory!();
      const received: any[] = [];
      const unsub = subscribeBanner((b) => received.push(b));

      const trackMetaCall = (addEventListener as any).mock.calls.find(
        (c: any[]) => c[0] === "track_metadata"
      );
      const trackMetaHandler = trackMetaCall[1];

      mockGetStatus.mockResolvedValue({
        volume: 60,
        settings: {
          toast_enabled: true,
          toast_sound_enabled: true,
          silent_banner_enabled: true,
        },
      });

      await trackMetaHandler({
        track_id: "trk-chime-1",
        name: "Chime Song",
        artist: "Chime Artist",
      });

      expect(mockToasterToast).not.toHaveBeenCalled();
      expect(received).toHaveLength(1);
      expect(received[0]).toMatchObject({
        text: "Chime Song",
        secondaryText: "Chime Artist",
        tone: "accent",
      });
      expect(gainCalls.length).toBeGreaterThanOrEqual(2);
      expect(gainCalls[0].value).toBeCloseTo((60 / 100) * 0.18, 5);

      unsub();
      plugin.onDismount?.();
    } finally {
      if (originalAudioContext === undefined) {
        delete (globalThis as { AudioContext?: unknown }).AudioContext;
      } else {
        globalThis.AudioContext = originalAudioContext;
      }
    }
  });

  it("captures in-game chords via SteamClient.Input.RegisterForControllerInputMessages (mapped with mapControllerInputButton) and unregisters on dismount (G-20-2)", async () => {
    let inputCb: ((controllerIndex: number, gamepadButton: number, isPressed: boolean) => void) | null = null;
    const unregInput = vi.fn(() => {
      inputCb = null;
    });
    (globalThis as any).window = {
      SteamClient: {
        GameSessions: { RegisterForAppLifetimeNotifications: mockRegisterForAppLifetime },
        Input: {
          RegisterForControllerInputMessages: vi.fn((cb: any) => {
            inputCb = cb;
            return { Unregister: unregInput };
          }),
        },
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };

    mockGetStatus.mockResolvedValue({
      track: { track_id: "trk-ingame-1", name: "In-Game Track", artist: "Artist" },
      is_liked: false,
      settings: {
        silent_banner_enabled: true,
        gamepad_chords_enabled: true,
        gamepad_chord_bindings: { toggle_like: [3, 23] },
      },
    });

    await import("./index");
    const plugin = capturedPluginFactory!();
    await flushMicrotasks();

    const received: any[] = [];
    const unsub = subscribeBanner((b) => received.push(b));

    expect(inputCb).toBeTypeOf("function");
    // Unmapped analog index (47) is ignored cleanly
    inputCb!(0, 47, true);
    inputCb!(0, 47, false);
    expect(mockToggleLike).not.toHaveBeenCalled();

    // ControllerInputGamepadButton 44 (L4 -> 23) + 2 (X -> 3) triggers toggle_like even with no FocusNavController
    inputCb!(0, 44, true);
    inputCb!(0, 2, true);
    await flushMicrotasks();
    expect(mockToggleLike).toHaveBeenCalledWith("trk-ingame-1", true);
    expect(received[0]).toMatchObject({ text: "♥ Liked: In-Game Track" });

    inputCb!(0, 2, false);
    inputCb!(0, 44, false);

    plugin.onDismount?.();
    expect(unregInput).toHaveBeenCalledTimes(1);
    unsub();
  });

  it("manages Gamescope EUIComposition.Notification (1) in DeckifyOverlayWrapper when SilentBanner or DeckifyOverlay is visible and resets to 0 when hidden (G-20-2)", async () => {
    vi.useFakeTimers();
    let overlayCb: ((pid: number, appId: number, active: boolean) => void) | null = null;
    const mockSetComposition = vi.fn();
    const unregOverlay = vi.fn();
    (globalThis as any).window = {
      SteamClient: {
        GameSessions: { RegisterForAppLifetimeNotifications: mockRegisterForAppLifetime },
        Input: {},
        Window: { SetComposition: mockSetComposition },
        Overlay: {
          RegisterForOverlayActivated: vi.fn((cb: any) => {
            overlayCb = cb;
            return { Unregister: unregOverlay };
          }),
        },
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };

    mockGetStatus.mockResolvedValue({
      track: { track_id: "trk-comp-1", name: "Overlay Song", artist: "Artist" },
      is_playing: true,
      settings: {
        overlay_enabled: false,
        silent_banner_enabled: true,
      },
    });

    await import("./index");
    const { routerHook } = await import("@decky/api");
    const plugin = capturedPluginFactory!();
    const wrapperFactory = (routerHook.addGlobalComponent as any).mock.calls[0]?.[1];
    const renderWrapper = () => {
      hookIdx = 0;
      const el = wrapperFactory();
      return el.type(el.props || {});
    };

    renderWrapper();
    await flushMicrotasks();

    // Initially nothing visible -> SetComposition(0, [], 0)
    expect(mockSetComposition).toHaveBeenLastCalledWith(0, [], 0);

    // SilentBanner becomes visible -> SetComposition(1, [], 0)
    const bannerEl = findWrapperChild(renderWrapper(), "SilentBanner");
    expect(bannerEl?.props.onVisibilityChange).toBeTypeOf("function");
    bannerEl.props.onVisibilityChange(true);
    renderWrapper();
    expect(mockSetComposition).toHaveBeenLastCalledWith(1, [], 0);

    // Interval re-asserts Notification (1) while visible
    mockSetComposition.mockClear();
    vi.advanceTimersByTime(500);
    expect(mockSetComposition).toHaveBeenCalledWith(1, [], 0);

    // When Steam Overlay/QAM activates, do NOT downgrade to 0 even if banner hides
    (overlayCb as ((pid: number, appId: number, active: boolean) => void) | null)?.(0, 0, true);
    mockSetComposition.mockClear();
    bannerEl.props.onVisibilityChange(false);
    renderWrapper();
    expect(mockSetComposition).not.toHaveBeenCalledWith(0, [], 0);

    // When Steam Overlay closes while nothing is visible, resets to 0; if banner is visible, re-asserts 1
    (overlayCb as ((pid: number, appId: number, active: boolean) => void) | null)?.(0, 0, false);
    const overlayEl = findWrapperChild(
      renderWrapper(),
      "Overlay",
    );
    expect(overlayEl).toBeUndefined();
    bannerEl.props.onVisibilityChange(true);
    renderWrapper();
    expect(mockSetComposition).toHaveBeenLastCalledWith(1, [], 0);

    bannerEl.props.onVisibilityChange(false);
    renderWrapper();
    expect(mockSetComposition).toHaveBeenLastCalledWith(0, [], 0);

    for (const cleanup of effectCleanups) cleanup();
    resetHooks();
    plugin.onDismount?.();
    expect(unregOverlay).toHaveBeenCalled();
  });

  it("unregisterHandle invokes .unregister() (lowercase), .Unregister() (uppercase), and function handles cleanly (G-20-3)", async () => {
    const unregLower = vi.fn();
    (globalThis as any).window = {
      SteamClient: {
        GameSessions: { RegisterForAppLifetimeNotifications: mockRegisterForAppLifetime },
        Input: {
          RegisterForControllerInputMessages: vi.fn(() => ({ unregister: unregLower })),
        },
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };

    await import("./index");
    let plugin = capturedPluginFactory!();
    plugin.onDismount?.();
    expect(unregLower).toHaveBeenCalledTimes(1);

    const unregUpper = vi.fn();
    (globalThis as any).window.SteamClient.Input.RegisterForControllerInputMessages = vi.fn(() => ({
      Unregister: unregUpper,
    }));
    plugin = capturedPluginFactory!();
    plugin.onDismount?.();
    expect(unregUpper).toHaveBeenCalledTimes(1);

    const unregFn = vi.fn();
    (globalThis as any).window.SteamClient.Input.RegisterForControllerInputMessages = vi.fn(() => unregFn);
    plugin = capturedPluginFactory!();
    plugin.onDismount?.();
    expect(unregFn).toHaveBeenCalledTimes(1);
  });

  it("handles RegisterForControllerInputMessages with BOTH Array<{ nA, bS }> and 3-arg signatures (G-20-3)", async () => {
    let inputCb: ((...args: any[]) => void) | null = null;
    const unregInput = vi.fn();
    (globalThis as any).window = {
      SteamClient: {
        GameSessions: { RegisterForAppLifetimeNotifications: mockRegisterForAppLifetime },
        Input: {
          RegisterForControllerInputMessages: vi.fn((cb: any) => {
            inputCb = cb;
            return { unregister: unregInput };
          }),
        },
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };

    mockGetStatus.mockResolvedValue({
      track: { track_id: "trk-dual-1", name: "Dual Sig Track", artist: "Artist" },
      is_liked: false,
      settings: {
        silent_banner_enabled: true,
        gamepad_chords_enabled: true,
        gamepad_chord_bindings: {
          toggle_like: [3, 24], // X (3) + L5 (24)
          next: [3, 23], // X (3) + L4 (23)
        },
      },
    });

    await import("./index");
    const plugin = capturedPluginFactory!();
    await flushMicrotasks();

    expect(inputCb).toBeTypeOf("function");

    // Array<{ nA, bS }> signature: 32 -> L5 (24), 2 -> X (3)
    inputCb!([
      { nA: 32, bS: true },
      { nA: 2, bS: true },
    ]);
    await flushMicrotasks();
    expect(mockToggleLike).toHaveBeenCalledWith("trk-dual-1", true);

    inputCb!([
      { nA: 32, bS: false },
      { nA: 2, bS: false },
    ]);

    // 3-arg signature: 44 -> L4 (23), 2 -> X (3)
    inputCb!(0, 44, true);
    inputCb!(0, 2, true);
    await flushMicrotasks();
    expect(mockControlPlayback).toHaveBeenCalledWith("next", "");

    plugin.onDismount?.();
    expect(unregInput).toHaveBeenCalledTimes(1);
  });

  it("falls back to SteamClient.Input.RegisterForControllerStateChanges (diffing ulButtons bitmasks) when RegisterForControllerInputMessages is absent (G-20-3)", async () => {
    let stateCb: ((states: any) => void) | null = null;
    const unregState = vi.fn();
    (globalThis as any).window = {
      SteamClient: {
        GameSessions: { RegisterForAppLifetimeNotifications: mockRegisterForAppLifetime },
        Input: {
          RegisterForControllerStateChanges: vi.fn((cb: any) => {
            stateCb = cb;
            return { unregister: unregState };
          }),
        },
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };

    mockGetStatus.mockResolvedValue({
      track: { track_id: "trk-state-1", name: "State Track", artist: "Artist" },
      is_liked: false,
      settings: {
        silent_banner_enabled: true,
        gamepad_chords_enabled: true,
        gamepad_chord_bindings: {
          toggle_like: [3, 23], // X (3) + L4 (23)
        },
      },
    });

    await import("./index");
    const plugin = capturedPluginFactory!();
    await flushMicrotasks();

    expect(stateCb).toBeTypeOf("function");

    // First packet: L4 (bit 23) + X (bit 3) pressed
    const mask = (1 << 23) | (1 << 3);
    stateCb!([{ unControllerIndex: 0, ulButtons: mask }]);
    await flushMicrotasks();
    expect(mockToggleLike).toHaveBeenCalledWith("trk-state-1", true);

    // Release X, keep L4
    mockToggleLike.mockClear();
    stateCb!([{ unControllerIndex: 0, ulButtons: 1 << 23 }]);
    await flushMicrotasks();
    expect(mockToggleLike).not.toHaveBeenCalled();

    // Press X again -> fires again (toggles back to false)
    stateCb!([{ unControllerIndex: 0, ulButtons: mask }]);
    await flushMicrotasks();
    expect(mockToggleLike).toHaveBeenLastCalledWith("trk-state-1", false);

    plugin.onDismount?.();
    expect(unregState).toHaveBeenCalledTimes(1);
  });

  it("subscribes to backend controller_input, deduplicates within 50ms, and re-subscribes SteamClient.Input on deck_resumed / RegisterForOnResumeFromSuspend (G-20-3)", async () => {
    vi.useFakeTimers();
    let inputCb: ((...args: any[]) => void) | null = null;
    let resumeCb: (() => void) | null = null;
    const unregInput1 = vi.fn();
    const unregInput2 = vi.fn();
    const unregInput3 = vi.fn();
    const unregResume = vi.fn();
    const registerInput = vi
      .fn()
      .mockImplementationOnce((cb: any) => {
        inputCb = cb;
        return { unregister: unregInput1 };
      })
      .mockImplementationOnce((cb: any) => {
        inputCb = cb;
        return { unregister: unregInput2 };
      })
      .mockImplementationOnce((cb: any) => {
        inputCb = cb;
        return { unregister: unregInput3 };
      });

    (globalThis as any).window = {
      SteamClient: {
        GameSessions: { RegisterForAppLifetimeNotifications: mockRegisterForAppLifetime },
        Input: {
          RegisterForControllerInputMessages: registerInput,
        },
        System: {
          RegisterForOnResumeFromSuspend: vi.fn((cb: any) => {
            resumeCb = cb;
            return { unregister: unregResume };
          }),
        },
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };

    mockGetStatus.mockResolvedValue({
      track: { track_id: "trk-backend-1", name: "Backend Input Track", artist: "Artist" },
      is_liked: false,
      settings: {
        silent_banner_enabled: true,
        gamepad_chords_enabled: true,
        gamepad_chord_bindings: {
          next: [23, 24], // L4 (23) + L5 (24)
          play_pause: [3, 23], // X (3) + L4 (23)
        },
      },
    });

    await import("./index");
    const { addEventListener, removeEventListener } = await import("@decky/api");
    const plugin = capturedPluginFactory!();
    await flushMicrotasks();

    const controllerInputCall = (addEventListener as any).mock.calls.find(
      (c: any[]) => c[0] === "controller_input",
    );
    const deckResumedCall = (addEventListener as any).mock.calls.find(
      (c: any[]) => c[0] === "deck_resumed",
    );
    expect(controllerInputCall).toBeTruthy();
    expect(deckResumedCall).toBeTruthy();
    const emitControllerInput = controllerInputCall[1];
    const emitDeckResumed = deckResumedCall[1];

    // Malformed payloads are ignored
    emitControllerInput(null);
    emitControllerInput({ button: 99, pressed: true });
    emitControllerInput({ button: 23, pressed: "yes" });
    expect(mockControlPlayback).not.toHaveBeenCalled();

    // Backend controller_input triggers chord (L4 + L5 -> next)
    emitControllerInput({ button: 23, pressed: true, source: "hidraw" });
    emitControllerInput({ button: 24, pressed: true, source: "hidraw" });
    await flushMicrotasks();
    expect(mockControlPlayback).toHaveBeenCalledTimes(1);
    expect(mockControlPlayback).toHaveBeenCalledWith("next", "");

    // Release L4 + L5
    emitControllerInput({ button: 24, pressed: false, source: "hidraw" });
    emitControllerInput({ button: 23, pressed: false, source: "hidraw" });

    // Deduplication within 50ms: frontend delivers L4+X, backend delivers identical L4+X 10ms later -> fires once
    vi.advanceTimersByTime(100);
    mockControlPlayback.mockClear();
    inputCb!(0, 44, true); // L4 (23)
    inputCb!(0, 2, true); // X (3)
    await flushMicrotasks();
    expect(mockControlPlayback).toHaveBeenCalledTimes(1);
    expect(mockControlPlayback).toHaveBeenCalledWith("play_pause", "");

    vi.advanceTimersByTime(10);
    // Releasing then re-pressing within 50ms is deduplicated; or identical down from backend while already held
    emitControllerInput({ button: 2, pressed: false, source: "hidraw" });
    emitControllerInput({ button: 23, pressed: false, source: "hidraw" });
    // Now test identical down from both within 50ms after releasing cleanly (>50ms)
    vi.advanceTimersByTime(100);
    mockControlPlayback.mockClear();
    emitControllerInput({ button: 23, pressed: true, source: "hidraw" });
    inputCb!(0, 44, true); // duplicate L4 down within 50ms
    emitControllerInput({ button: 3, pressed: true, source: "hidraw" });
    await flushMicrotasks();
    expect(mockControlPlayback).toHaveBeenCalledTimes(1);

    // deck_resumed tears down old frontend handle and re-subscribes
    expect(registerInput).toHaveBeenCalledTimes(1);
    emitDeckResumed({});
    expect(unregInput1).toHaveBeenCalledTimes(1);
    expect(registerInput).toHaveBeenCalledTimes(2);

    // RegisterForOnResumeFromSuspend also tears down and re-subscribes
    resumeCb!();
    expect(unregInput2).toHaveBeenCalledTimes(1);
    expect(registerInput).toHaveBeenCalledTimes(3);

    // Full cleanup on dismount
    plugin.onDismount?.();
    expect(unregInput3).toHaveBeenCalledTimes(1);
    expect(unregResume).toHaveBeenCalledTimes(1);
    expect(removeEventListener).toHaveBeenCalledWith("controller_input", expect.anything());
    expect(removeEventListener).toHaveBeenCalledWith("deck_resumed", expect.anything());
  });

  it("falls through cleanly and still subscribes to controller_input when SteamClient.Input proxy throws Unknown method", async () => {
    const win = window as any;
    win.SteamClient = {
      ...(win.SteamClient || {}),
      Input: {
        RegisterForControllerInputMessages: vi.fn(() => {
          throw new Error("Unknown method");
        }),
        RegisterForControllerStateChanges: vi.fn(() => {
          throw new Error("Unknown method");
        }),
      },
      System: {
        RegisterForOnResumeFromSuspend: vi.fn(() => {
          throw new Error("Unknown method");
        }),
      },
    };
    mockGetStatus.mockResolvedValueOnce({
      settings: {
        gamepad_chords_enabled: true,
        silent_banner_enabled: true,
        gamepad_chord_bindings: {
          previous: [23, 24],
          next: [25, 26],
          play_pause: [24, 26],
          volume_up: [],
          volume_down: [],
          toggle_like: [],
          cycle_pinned: [],
          toggle_lyrics: [],
        },
      },
    });

    const { addEventListener } = await import("@decky/api");
    const plugin = capturedPluginFactory!();
    await flushMicrotasks();

    const controllerInputCall = (addEventListener as any).mock.calls.find(
      (c: any[]) => c[0] === "controller_input",
    );
    expect(controllerInputCall).toBeTruthy();

    const emitControllerInput = controllerInputCall[1];
    emitControllerInput({ button: 25, pressed: true, source: "hidraw" });
    emitControllerInput({ button: 26, pressed: true, source: "hidraw" });
    await flushMicrotasks();
    expect(mockControlPlayback).toHaveBeenCalledWith("next", "");

    plugin.onDismount?.();
  });
});
