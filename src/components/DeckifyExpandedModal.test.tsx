import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockToast, mockScrubTo } = vi.hoisted(() => ({
  mockToast: vi.fn(),
  mockScrubTo: vi.fn(),
}));

vi.mock("@decky/api", () => ({
  callable: () => vi.fn().mockResolvedValue({ ok: true }),
  toaster: { toast: mockToast },
}));

vi.mock("@decky/ui", () => ({
  ModalRoot: ({ children, ...props }: any) => ({ type: "ModalRoot", props: { children, ...props } }),
  Focusable: ({ children, ...props }: any) => ({ type: "Focusable", props: { children, ...props } }),
  DialogButton: ({ children, ...props }: any) => ({ type: "DialogButton", props: { children, ...props } }),
  ButtonItem: ({ children, ...props }: any) => ({ type: "ButtonItem", props: { children, ...props } }),
  ToggleField: (props: any) => ({ type: "ToggleField", props }),
  DropdownItem: (props: any) => ({ type: "DropdownItem", props }),
  SliderField: (props: any) => ({ type: "SliderField", props }),
  TextField: (props: any) => ({ type: "TextField", props }),
  NavEntryPositionPreferences: { FIRST: 0 },
}));

vi.mock("./common/DeckifyImage", () => ({
  DeckifyImage: (props: any) => ({ type: "DeckifyImage", props }),
}));
vi.mock("./common/InteractiveRow", () => ({
  InteractiveRow: ({ children, ...props }: any) => ({ type: "InteractiveRow", props: { children, ...props } }),
  formatMs: (ms: number) => String(ms),
}));
vi.mock("./common/NowPlayingFooter", () => ({
  NowPlayingFooter: (props: any) => ({ type: "NowPlayingFooter", props }),
}));
vi.mock("./tabs/HomeTab", () => ({ HomeTab: () => ({ type: "HomeTab", props: {} }) }));
vi.mock("./tabs/SearchTab", () => ({ SearchTab: () => ({ type: "SearchTab", props: {} }) }));
vi.mock("./tabs/LibraryTab", () => ({ LibraryTab: () => ({ type: "LibraryTab", props: {} }) }));
vi.mock("./tabs/QueueTab", () => ({ QueueTab: () => ({ type: "QueueTab", props: {} }) }));
vi.mock("./tabs/LyricsTab", () => ({ LyricsTab: () => ({ type: "LyricsTab", props: {} }) }));
vi.mock("./tabs/SoundtracksTab", () => ({ SoundtracksTab: () => ({ type: "SoundtracksTab", props: {} }) }));
vi.mock("./tabs/SettingsTab", () => ({ SettingsTab: () => ({ type: "SettingsTab", props: {} }) }));
vi.mock("../hooks/usePlaybackClock", () => ({
  usePlaybackClock: () => ({ positionMs: 25000, notifySeek: vi.fn(), scrubTo: mockScrubTo, scrubDelta: vi.fn() }),
}));
vi.mock("react-icons/fa", () => new Proxy({}, { get: () => () => ({ type: "Icon", props: {} }) }));
vi.mock("react-icons/md", () => new Proxy({}, { get: () => () => ({ type: "Icon", props: {} }) }));
vi.mock("qrcode.react", () => ({ QRCodeSVG: () => ({ type: "QRCodeSVG", props: {} }) }));

vi.mock("react/jsx-dev-runtime", () => ({
  jsxDEV: (type: any, props: any, key: any) => ({
    type,
    props: { ...props, ...(key !== undefined ? { key } : {}) },
  }),
}));

vi.mock("react/jsx-runtime", () => ({
  jsx: (type: any, props: any, key: any) => ({
    type,
    props: { ...props, ...(key !== undefined ? { key } : {}) },
  }),
  jsxs: (type: any, props: any, key: any) => ({
    type,
    props: { ...props, ...(key !== undefined ? { key } : {}) },
  }),
}));

let stateValues: any[] = [];
let stateIdx = 0;
let refValues: any[] = [];
let refIdx = 0;
let runEffectsInTest = false;
let effectCleanups: Array<() => void> = [];

vi.mock("react", () => ({
  useState: (init: any) => {
    const idx = stateIdx++;
    if (!(idx in stateValues)) {
      stateValues[idx] = typeof init === "function" ? init() : init;
    }
    const setter = (val: any) => {
      stateValues[idx] = typeof val === "function" ? val(stateValues[idx]) : val;
    };
    return [stateValues[idx], setter];
  },
  useEffect: (fn: () => void | (() => void)) => {
    if (runEffectsInTest) {
      const cleanup = fn();
      if (typeof cleanup === "function") effectCleanups.push(cleanup);
    }
  },
  useCallback: (fn: any) => fn,
  useMemo: (fn: any) => fn(),
  useRef: (init: any) => {
    const idx = refIdx++;
    if (!(idx in refValues)) {
      refValues[idx] = { current: init };
    }
    return refValues[idx];
  },
}));

import { DeckifyExpandedModal } from "./DeckifyExpandedModal";
import { useTriggerNavigation } from "../hooks/useTriggerNavigation";

function findNodes(tree: any, predicate: (node: any) => boolean, results: any[] = []): any[] {
  if (!tree) return results;
  if (Array.isArray(tree)) {
    for (const child of tree) findNodes(child, predicate, results);
    return results;
  }
  if (predicate(tree)) results.push(tree);
  if (tree.props && tree.props.children) {
    findNodes(tree.props.children, predicate, results);
  }
  return results;
}

describe("DeckifyExpandedModal vgp_oncancel bubble handling (Gap 3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stateValues = [];
    stateIdx = 0;
    refValues = [];
    refIdx = 0;
  });

  it("registers vgp_oncancel in bubble phase (false) and does not call closeModal directly", () => {
    const closeModal = vi.fn();
    const tree = DeckifyExpandedModal({ closeModal });

    const navDiv = findNodes(tree, (n) => n.type === "div" && typeof n.props?.ref === "function")[0];
    expect(navDiv).toBeDefined();

    const listeners: Record<string, { fn: (e: any) => void; capture: any }> = {};
    const mockEl: any = {
      addEventListener: vi.fn((ev: string, fn: (e: any) => void, capture: any) => {
        listeners[ev] = { fn, capture };
      }),
    };

    navDiv.props.ref(mockEl);

    expect(mockEl.addEventListener).toHaveBeenCalledWith("vgp_oncancel", expect.any(Function), false);
    expect(listeners["vgp_oncancel"].capture).toBe(false);

    // When no breadcrumb is active (e.g., SliderField handled or bubbled), attachNav must NOT call closeModal
    const ev = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      stopImmediatePropagation: vi.fn(),
    };
    listeners["vgp_oncancel"].fn(ev);
    expect(ev.preventDefault).not.toHaveBeenCalled();
    expect(ev.stopPropagation).not.toHaveBeenCalled();
    expect(closeModal).not.toHaveBeenCalled();

    // Verify ModalRoot still has onCancel={closeModal} for unhandled bubble events
    expect((tree as any).props.onCancel).toBe(closeModal);
  });

  it("closes active breadcrumb without calling closeModal when vgp_oncancel fires", () => {
    const closeModal = vi.fn();
    const tree = DeckifyExpandedModal({ closeModal });

    const navDiv = findNodes(tree, (n) => n.type === "div" && typeof n.props?.ref === "function")[0];
    const listeners: Record<string, (e: any) => void> = {};
    navDiv.props.ref({
      addEventListener: (ev: string, fn: (e: any) => void) => {
        listeners[ev] = fn;
      },
    });

    // Activate breadcrumb refs (actionTrackRef / activeAlbumRef / activeArtistRef / activePlaylistRef)
    for (const r of refValues) {
      if (r && r.current === null) {
        r.current = { id: "pl-1", name: "Test Playlist" };
      }
    }

    const ev = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      stopImmediatePropagation: vi.fn(),
    };
    listeners["vgp_oncancel"](ev);

    expect(ev.preventDefault).toHaveBeenCalledTimes(1);
    expect(ev.stopPropagation).toHaveBeenCalledTimes(1);
    expect(closeModal).not.toHaveBeenCalled();
  });
});

describe("useTriggerNavigation & DeckifyExpandedModal controller dispatch", () => {
  let downHandler: ((btn: number) => void) | null = null;
  let upHandler: ((btn: number) => void) | null = null;
  let unregDown: ReturnType<typeof vi.fn>;
  let unregUp: ReturnType<typeof vi.fn>;
  let winListeners: Record<string, Array<(e: any) => void>>;
  let rafQueue: Array<{ id: number; cb: FrameRequestCallback }>;
  let nextRafId: number;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    vi.clearAllMocks();
    stateValues = [];
    stateIdx = 0;
    refValues = [];
    refIdx = 0;
    effectCleanups = [];
    runEffectsInTest = true;

    downHandler = null;
    upHandler = null;
    unregDown = vi.fn();
    unregUp = vi.fn();
    winListeners = {};
    rafQueue = [];
    nextRafId = 1;

    vi.stubGlobal("window", {
      FocusNavController: {
        m_rgGamepadInputSources: [
          {
            RegisterForGamepadButtonDown: vi.fn((fn: (btn: number) => void) => {
              downHandler = fn;
              return { Unregister: unregDown };
            }),
            RegisterForGamepadButtonUp: vi.fn((fn: (btn: number) => void) => {
              upHandler = fn;
              return { Unregister: unregUp };
            }),
          },
        ],
      },
      addEventListener: vi.fn((ev: string, fn: (e: any) => void) => {
        if (!winListeners[ev]) winListeners[ev] = [];
        winListeners[ev].push(fn);
      }),
      removeEventListener: vi.fn((ev: string, fn: (e: any) => void) => {
        if (winListeners[ev]) {
          winListeners[ev] = winListeners[ev].filter((f) => f !== fn);
        }
      }),
    });

    vi.stubGlobal("document", {
      activeElement: { tagName: "DIV" },
    });

    vi.stubGlobal("navigator", {
      getGamepads: vi.fn(() => []),
    });

    vi.stubGlobal("requestAnimationFrame", vi.fn((cb: FrameRequestCallback) => {
      const id = nextRafId++;
      rafQueue.push({ id, cb });
      return id;
    }));
    vi.stubGlobal("cancelAnimationFrame", vi.fn((id: number) => {
      rafQueue = rafQueue.filter((item) => item.id !== id);
    }));
  });

  afterEach(() => {
    for (const cleanup of effectCleanups) cleanup();
    effectCleanups = [];
    runEffectsInTest = false;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("subscribes to FocusNavController for Y (4), X (3), L2 (7), R2 (8) and dedupes vgp_onbuttondown within 80ms", () => {
    const onTrigger = vi.fn();
    const onAction = vi.fn();

    useTriggerNavigation({
      enabled: true,
      suppressed: false,
      onTrigger,
      onAction,
    });

    expect(downHandler).toBeTypeOf("function");
    expect(upHandler).toBeTypeOf("function");

    // Y (4) via FocusNavController, then duplicate vgp_onbuttondown within 80ms
    downHandler!(4);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenLastCalledWith("Y", undefined);

    vi.advanceTimersByTime(30);
    for (const fn of winListeners["vgp_onbuttondown"] || []) {
      fn({ detail: { button: 4 } });
    }
    expect(onAction).toHaveBeenCalledTimes(1); // deduped

    // After 80ms window, X (3) via FocusNavController fires
    vi.advanceTimersByTime(60);
    downHandler!(3);
    expect(onAction).toHaveBeenCalledTimes(2);
    expect(onAction).toHaveBeenLastCalledWith("X", undefined);

    // L2 (7) and R2 (8) via FocusNavController
    downHandler!(7);
    expect(onTrigger).toHaveBeenCalledWith("L2");
    upHandler!(7);

    vi.advanceTimersByTime(350);
    downHandler!(8);
    expect(onTrigger).toHaveBeenCalledWith("R2");
    upHandler!(8);
  });

  it("suppresses L2/R2 triggers when suppressed=true (ActionMenu/PlaylistPickerModal) or INPUT is focused", () => {
    const onTrigger = vi.fn();
    const onAction = vi.fn();

    useTriggerNavigation({
      enabled: true,
      suppressed: true,
      onTrigger,
      onAction,
    });

    // Suppressed via sub-modal
    downHandler!(7);
    downHandler!(8);
    expect(onTrigger).not.toHaveBeenCalled();

    // Unsuppressed, but INPUT element has focus
    stateIdx = 0;
    refIdx = 0;
    for (const cleanup of effectCleanups) cleanup();
    effectCleanups = [];

    useTriggerNavigation({
      enabled: true,
      suppressed: false,
      onTrigger,
      onAction,
    });

    (globalThis as any).document.activeElement = { tagName: "INPUT" };
    (globalThis as any).navigator.getGamepads = vi.fn(() => [
      { connected: true, buttons: { 6: { value: 0.9 }, 7: { value: 0.9 } } },
    ]);

    // Run queued rAF callback
    const frame = rafQueue.shift();
    expect(frame).toBeDefined();
    frame!.cb(16);
    downHandler!(7);
    expect(onTrigger).not.toHaveBeenCalled();
  });

  it("cleans up FocusNavController unregisters, window listeners, and rAF on unmount", () => {
    const onTrigger = vi.fn();
    const onAction = vi.fn();

    useTriggerNavigation({
      enabled: true,
      suppressed: false,
      onTrigger,
      onAction,
    });

    expect(rafQueue.length).toBeGreaterThan(0);

    for (const cleanup of effectCleanups) cleanup();
    effectCleanups = [];

    expect(unregDown).toHaveBeenCalledTimes(1);
    expect(unregUp).toHaveBeenCalledTimes(1);
    expect((globalThis as any).cancelAnimationFrame).toHaveBeenCalled();
    expect((globalThis as any).window.removeEventListener).toHaveBeenCalledWith(
      "vgp_onbuttondown",
      expect.any(Function)
    );
    expect((globalThis as any).window.removeEventListener).toHaveBeenCalledWith(
      "keydown",
      expect.any(Function)
    );
  });

  it("DeckifyExpandedModal wires Y/X actions for focusedTrackRef and active track in now_playing/lyrics modes", () => {
    const closeModal = vi.fn();
    DeckifyExpandedModal({ closeModal });

    // Set focusedTrackRef in modal refs to a track item and test Y opens ActionMenu (updates state)
    const trackCandidate = { id: "trk-1", name: "Test Song", uri: "spotify:track:trk-1" };
    for (const r of refValues) {
      if (r && r.current === null) {
        r.current = trackCandidate;
        break;
      }
    }

    // Y (4) should invoke setActionTrack without throwing
    expect(() => downHandler!(4)).not.toThrow();
    // X (3) after 80ms should invoke handleToggleLike without throwing
    vi.advanceTimersByTime(100);
    expect(() => downHandler!(3)).not.toThrow();
  });

  it("accumulates 250ms R2 seeks (+10s + +10s = +20s), clamps to [0, duration_ms - 1000], and renders floating pill", () => {
    const closeModal = vi.fn();
    // First render to populate stateValues[0] (mode) and stateValues[1] (status)
    DeckifyExpandedModal({ closeModal });
    stateValues[0] = "now_playing";
    stateValues[1] = {
      is_playing: true,
      position_ms: 25000,
      duration_ms: 60000,
      track: { id: "trk-1", name: "Song", artist: "Artist", duration_ms: 60000 },
      settings: { trigger_nav_enabled: true, trigger_seek_seconds: 10, show_controller_hints: true },
    };

    // Re-render with active track & status so onTrigger closes over track + durationMs
    stateIdx = 0;
    refIdx = 0;
    for (const cleanup of effectCleanups) cleanup();
    effectCleanups = [];
    DeckifyExpandedModal({ closeModal });

    mockScrubTo.mockClear();

    // First R2 pull (+10s -> 35000ms)
    downHandler!(8);
    upHandler!(8);
    expect(mockScrubTo).toHaveBeenCalledWith(35000);

    // Re-render to inspect pillMsg ("+10s")
    stateIdx = 0;
    refIdx = 0;
    let tree = DeckifyExpandedModal({ closeModal });
    let pill = findNodes(tree, (n) => n.props?.["data-testid"] === "trigger-indicator-pill")[0];
    expect(pill).toBeDefined();
    expect(pill.props.children).toBe("+10s");

    // Second R2 pull within 250ms (+20s -> 45000ms)
    vi.advanceTimersByTime(100);
    downHandler!(8);
    upHandler!(8);
    expect(mockScrubTo).toHaveBeenCalledWith(45000);

    stateIdx = 0;
    refIdx = 0;
    tree = DeckifyExpandedModal({ closeModal });
    pill = findNodes(tree, (n) => n.props?.["data-testid"] === "trigger-indicator-pill")[0];
    expect(pill.props.children).toBe("+20s");

    // After 250ms debounce, handleSeekPlayback commits 45000ms once
    mockScrubTo.mockClear();
    vi.advanceTimersByTime(250);
    expect(mockScrubTo).toHaveBeenCalledTimes(1);
    expect(mockScrubTo).toHaveBeenCalledWith(45000);

    // After 1000ms, floating pill auto-clears
    vi.advanceTimersByTime(1000);
    stateIdx = 0;
    refIdx = 0;
    tree = DeckifyExpandedModal({ closeModal });
    pill = findNodes(tree, (n) => n.props?.["data-testid"] === "trigger-indicator-pill")[0];
    expect(pill).toBeUndefined();

    // Boundary clamping: R2 near end clamps to duration_ms - 1000 (29000ms when duration_ms=30000)
    stateValues[1] = {
      is_playing: true,
      position_ms: 25000,
      duration_ms: 30000,
      track: { id: "trk-1", name: "Song", artist: "Artist", duration_ms: 30000 },
      settings: { trigger_nav_enabled: true, trigger_seek_seconds: 10, show_controller_hints: true },
    };
    stateIdx = 0;
    refIdx = 0;
    DeckifyExpandedModal({ closeModal });
    mockScrubTo.mockClear();
    downHandler!(8);
    upHandler!(8);
    expect(mockScrubTo).toHaveBeenLastCalledWith(29000);
    vi.advanceTimersByTime(250);
    expect(mockScrubTo).toHaveBeenLastCalledWith(29000);

    // Boundary clamping: L2 below 0 clamps to 0ms
    stateValues[1] = {
      is_playing: true,
      position_ms: 25000,
      duration_ms: 60000,
      track: { id: "trk-1", name: "Song", artist: "Artist", duration_ms: 60000 },
      settings: { trigger_nav_enabled: true, trigger_seek_seconds: 30, show_controller_hints: true },
    };
    stateIdx = 0;
    refIdx = 0;
    DeckifyExpandedModal({ closeModal });
    mockScrubTo.mockClear();
    downHandler!(7);
    upHandler!(7);
    expect(mockScrubTo).toHaveBeenLastCalledWith(0);
    vi.advanceTimersByTime(250);
    expect(mockScrubTo).toHaveBeenLastCalledWith(0);
  });

  it("renders context-aware controller hint bar per tab and hides when show_controller_hints is false", () => {
    const closeModal = vi.fn();
    DeckifyExpandedModal({ closeModal });

    // now_playing -> Seek hint
    stateValues[0] = "now_playing";
    stateValues[1] = { settings: { show_controller_hints: true } };
    stateIdx = 0;
    refIdx = 0;
    let tree = DeckifyExpandedModal({ closeModal });
    let hintBar = findNodes(tree, (n) => n.props?.["data-testid"] === "controller-hint-bar")[0];
    expect(hintBar.props.children).toBe("L2/R2 Seek · X Like · Y Options · L1/R1 Tabs");

    // playlists -> Page hint
    stateValues[0] = "playlists";
    stateIdx = 0;
    refIdx = 0;
    tree = DeckifyExpandedModal({ closeModal });
    hintBar = findNodes(tree, (n) => n.props?.["data-testid"] === "controller-hint-bar")[0];
    expect(hintBar.props.children).toBe("L2/R2 Page · X Like · Y Options · L1/R1 Tabs");

    // engine -> L1/R1 Tabs · B Back
    stateValues[0] = "engine";
    stateIdx = 0;
    refIdx = 0;
    tree = DeckifyExpandedModal({ closeModal });
    hintBar = findNodes(tree, (n) => n.props?.["data-testid"] === "controller-hint-bar")[0];
    expect(hintBar.props.children).toBe("L1/R1 Tabs · B Back");

    // Hidden when show_controller_hints === false
    stateValues[1] = { settings: { show_controller_hints: false } };
    stateIdx = 0;
    refIdx = 0;
    tree = DeckifyExpandedModal({ closeModal });
    hintBar = findNodes(tree, (n) => n.props?.["data-testid"] === "controller-hint-bar")[0];
    expect(hintBar).toBeUndefined();
  });

  it("enforces contentPaneRef focus guard, jumps list rows with scrollIntoView + focus, and shows position pill", () => {
    const closeModal = vi.fn();
    DeckifyExpandedModal({ closeModal });

    // Switch to playlists mode with trigger_page_size = 15
    stateValues[0] = "playlists";
    stateValues[1] = {
      settings: { trigger_nav_enabled: true, trigger_page_size: 15, show_controller_hints: true },
    };

    stateIdx = 0;
    refIdx = 0;
    for (const cleanup of effectCleanups) cleanup();
    effectCleanups = [];
    const tree = DeckifyExpandedModal({ closeModal });

    // Locate the contentPaneRef attached to the right-hand Focusable
    const contentPaneNode = findNodes(tree, (n) => n.props?.["data-testid"] === "content-pane")[0];
    expect(contentPaneNode).toBeDefined();
    const contentPaneRefObj = contentPaneNode.props.ref;

    const makeMockRow = (label: string) => ({
      getAttribute: (attr: string) => (attr === "data-deckify-label" ? label : null),
      contains: () => false,
      scrollIntoView: vi.fn(),
      focus: vi.fn(),
    });

    const rows = Array.from({ length: 25 }, (_, i) => makeMockRow(`Playlist ${i + 1}`));
    const activeEl: any = { tagName: "DIV" }; // Sidebar element (not inside contentPane)

    (globalThis as any).document.activeElement = activeEl;

    contentPaneRefObj.current = {
      contains: (el: any) => rows.includes(el),
      querySelectorAll: (selector: string) =>
        selector === '[data-deckify-list-item="true"]' ? rows : [],
      querySelector: () => null,
    };

    // 1. Focus in Sidebar -> R2 must NOT jump or show pill
    downHandler!(8);
    upHandler!(8);
    expect(rows[15].scrollIntoView).not.toHaveBeenCalled();
    expect(rows[15].focus).not.toHaveBeenCalled();

    stateIdx = 0;
    refIdx = 0;
    let updatedTree = DeckifyExpandedModal({ closeModal });
    expect(findNodes(updatedTree, (n) => n.props?.["data-testid"] === "trigger-indicator-pill")[0]).toBeUndefined();

    // 2. Focus on row 0 inside contentPane -> R2 jumps to row 15 and shows "16 / 25"
    vi.advanceTimersByTime(350);
    (globalThis as any).document.activeElement = rows[0];
    downHandler!(8);
    upHandler!(8);
    expect(rows[15].scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(rows[15].focus).toHaveBeenCalledTimes(1);

    stateIdx = 0;
    refIdx = 0;
    updatedTree = DeckifyExpandedModal({ closeModal });
    const pill = findNodes(updatedTree, (n) => n.props?.["data-testid"] === "trigger-indicator-pill")[0];
    expect(pill).toBeDefined();
    expect(pill.props.children).toBe("16 / 25");

    // 3. Sorted A-Z container -> R2 jumps from Alpha (0) to Beta (2) and shows "B"
    vi.advanceTimersByTime(350);
    const azRows = [makeMockRow("Alpha"), makeMockRow("Apex"), makeMockRow("Beta")];
    contentPaneRefObj.current = {
      contains: (el: any) => azRows.includes(el),
      querySelectorAll: (selector: string) =>
        selector === '[data-deckify-list-item="true"]' ? azRows : [],
      querySelector: (selector: string) =>
        selector === '[data-deckify-sorted="az"]' ? {} : null,
    };
    (globalThis as any).document.activeElement = azRows[0];
    downHandler!(8);
    upHandler!(8);
    expect(azRows[2].scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(azRows[2].focus).toHaveBeenCalledTimes(1);

    stateIdx = 0;
    refIdx = 0;
    updatedTree = DeckifyExpandedModal({ closeModal });
    const azPill = findNodes(updatedTree, (n) => n.props?.["data-testid"] === "trigger-indicator-pill")[0];
    expect(azPill).toBeDefined();
    expect(azPill.props.children).toBe("B");
  });
});
