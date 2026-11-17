import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockHandleAppLifetimeEvent = vi.fn().mockResolvedValue({ ok: true });
const mockTriggerDucking = vi.fn().mockResolvedValue({ ok: true });
const mockRegisterForAppLifetime = vi.fn().mockReturnValue({ unregister: vi.fn() });
const mockGetStatus = vi.fn().mockResolvedValue(null);
const mockGetAuthStatus = vi.fn().mockResolvedValue({ authenticated: true, needs_reauth: false });
const mockGetDevices = vi.fn().mockResolvedValue({ ok: true, devices: [] });
const mockGetDuckingState = vi.fn().mockResolvedValue({ is_ducked: false, effective_volume: 50, base_volume: 50, duck_reasons: [] });
const mockQuickPlayPinned = vi.fn().mockResolvedValue({ ok: true });
const mockGetLyrics = vi.fn().mockResolvedValue({ ok: true, synced_lyrics: "[00:01.00]Hello world" });
const mockSetSetting = vi.fn().mockResolvedValue({ ok: true });
const mockGetImage = vi.fn().mockResolvedValue({ ok: true, data_url: "data:image/jpeg;base64,MOCKCOVER" });
const mockRestoreBookmark = vi.fn().mockResolvedValue({ ok: true });
const mockDismissBookmark = vi.fn().mockResolvedValue({ ok: true });
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
    if (name === "quick_play_pinned") return (...args: any[]) => mockQuickPlayPinned(...args);
    if (name === "get_lyrics") return (...args: any[]) => mockGetLyrics(...args);
    if (name === "set_setting") return (...args: any[]) => mockSetSetting(...args);
    if (name === "get_image") return (...args: any[]) => mockGetImage(...args);
    if (name === "restore_bookmark") return (...args: any[]) => mockRestoreBookmark(...args);
    if (name === "dismiss_bookmark") return (...args: any[]) => mockDismissBookmark(...args);
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
  Router: { MainRunningApp: { appid: 1091500 } },
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
    const overlayOff = renderWrapper();
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
    const overlayOn1 = renderWrapper();
    await Promise.resolve();
    await Promise.resolve();
    const overlayOn2 = renderWrapper();

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
    expect(renderWrapper().props.visible).toBe(true);

    // Open expanded modal via DeckifyRouteOpener
    const routeCalls = (routerHook.addRoute as any).mock.calls;
    const RouteOpener = routeCalls[routeCalls.length - 1][1];
    RouteOpener({});
    vi.advanceTimersByTime(100);

    expect(showModal).toHaveBeenCalledTimes(1);
    expect(renderWrapper().props.visible).toBe(false);

    // Close modal via closeModal prop passed to DeckifyExpandedModal
    const modalEl = (showModal as any).mock.calls[0][0];
    modalEl.props.closeModal();
    expect(renderWrapper().props.visible).toBe(true);

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

    const settingsChangedCall = (addEventListener as any).mock.calls.find(
      (c: any[]) => c[0] === "settings_changed"
    );
    expect(settingsChangedCall).toBeDefined();
    const settingsChangedHandler = settingsChangedCall[1];

    // Simulate a subsequent 4s poll whose settings payload omits overlay_lyrics_enabled
    mockGetStatus.mockResolvedValue({
      track: { track_id: "trk1", name: "Song A", artist: "Artist A", duration_ms: 180000 },
      is_playing: true,
      settings: { overlay_enabled: true },
    });

    // Simulate settings_changed event enabling overlay_lyrics_enabled
    settingsChangedHandler({ overlay_enabled: true, overlay_lyrics_enabled: true });
    expect(renderWrapper().props.lyricsEnabled).toBe(true);

    vi.advanceTimersByTime(4000);
    await Promise.resolve();
    await Promise.resolve();

    expect(renderWrapper().props.lyricsEnabled).toBe(true);

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
      settings: { toast_enabled: true, toast_sound_enabled: true },
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
});
