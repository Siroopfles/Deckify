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
function resetHooks() {
  hookValues = [];
  hookIdx = 0;
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
    fn();
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
});
