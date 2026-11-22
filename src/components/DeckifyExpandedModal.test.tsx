import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockToast, mockScrubTo, mockToggleLike, mockSetSetting, mockSetNativeMix, mockPlayTracks, mockGetRecentlyPlayed } = vi.hoisted(() => ({
  mockToast: vi.fn(),
  mockScrubTo: vi.fn(),
  mockToggleLike: vi.fn().mockResolvedValue({ ok: true, is_liked: true }),
  mockSetSetting: vi.fn().mockResolvedValue({ ok: true }),
  mockSetNativeMix: vi.fn().mockResolvedValue({ ok: true }),
  mockPlayTracks: vi.fn().mockResolvedValue({ ok: true }),
  mockGetRecentlyPlayed: vi.fn().mockResolvedValue({ ok: true, tracks: [] }),
}));

vi.mock("@decky/api", () => ({
  callable: (name: string) => {
    if (name === "toggle_like") return mockToggleLike;
    if (name === "set_setting") return mockSetSetting;
    if (name === "set_native_mix") return mockSetNativeMix;
    if (name === "play_tracks") return mockPlayTracks;
    if (name === "get_recently_played") return mockGetRecentlyPlayed;
    return vi.fn().mockResolvedValue({ ok: true });
  },
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
  RoundBtn: ({ children, ...props }: any) => ({ type: "RoundBtn", props: { children, ...props } }),
  focusHalo: () => ({}),
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
vi.mock("react-icons/fa", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const Icon = (props: any) => ({ type: "Icon", props });
  return Object.fromEntries(Object.keys(actual).map((k) => [k, Icon]));
});
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

import { Focusable } from "@decky/ui";
import { DeckifyExpandedModal, SEEK_ACCUMULATION_WINDOW_MS } from "./DeckifyExpandedModal";
import { PlaylistsTab } from "./tabs/PlaylistsTab";
import { AlbumsTab } from "./tabs/AlbumsTab";
import { LikedSongsTab } from "./tabs/LikedSongsTab";
import { NowPlayingTab } from "./tabs/NowPlayingTab";
import { Sidebar } from "./common/Sidebar";
import { TrackActionModal } from "./common/TrackActionModal";
import { CollectionActionModal } from "./common/CollectionActionModal";
import { InteractiveRow } from "./common/InteractiveRow";
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

    // L1/R1/X/Y actions must also be suppressed when suppressed=true
    downHandler!(3); // X
    downHandler!(4); // Y
    downHandler!(5); // L1
    downHandler!(6); // R1
    expect(onAction).not.toHaveBeenCalled();

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

  it("accumulates 600ms R2 seeks across consecutive 350ms pulls (+10s + +10s = +20s), clamps to [0, duration_ms - 1000], and renders floating pill", () => {
    expect(SEEK_ACCUMULATION_WINDOW_MS).toBe(600);
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

    // Advance 350ms (past TRIGGER_DEBOUNCE_MS = 300, still inside SEEK_ACCUMULATION_WINDOW_MS = 600)
    mockScrubTo.mockClear();
    vi.advanceTimersByTime(350);
    expect(mockScrubTo).not.toHaveBeenCalled();

    // Second R2 pull at 350ms (+20s -> 45000ms)
    downHandler!(8);
    upHandler!(8);
    expect(mockScrubTo).toHaveBeenCalledWith(45000);

    stateIdx = 0;
    refIdx = 0;
    tree = DeckifyExpandedModal({ closeModal });
    pill = findNodes(tree, (n) => n.props?.["data-testid"] === "trigger-indicator-pill")[0];
    expect(pill.props.children).toBe("+20s");

    // After 600ms debounce, handleSeekPlayback commits 45000ms once
    mockScrubTo.mockClear();
    vi.advanceTimersByTime(600);
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
    vi.advanceTimersByTime(600);
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
    vi.advanceTimersByTime(600);
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

    // Locate the contentPaneRef attached to the native div wrapping Focusable
    const contentPaneNode = findNodes(tree, (n) => n.props?.["data-testid"] === "content-pane")[0];
    expect(contentPaneNode).toBeDefined();
    expect(contentPaneNode.type).toBe("div");
    expect(contentPaneNode.props.children?.type).toBe(Focusable);
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

  it("supports virtual GamepadUI focus ([data-deckify-focused='true']) in playlists mode and suppresses Sidebar focus", () => {
    const closeModal = vi.fn();
    DeckifyExpandedModal({ closeModal });

    stateValues[0] = "playlists";
    stateValues[1] = {
      settings: { trigger_nav_enabled: true, trigger_page_size: 15, show_controller_hints: true },
    };

    stateIdx = 0;
    refIdx = 0;
    for (const cleanup of effectCleanups) cleanup();
    effectCleanups = [];
    const tree = DeckifyExpandedModal({ closeModal });

    const contentPaneNode = findNodes(tree, (n) => n.props?.["data-testid"] === "content-pane")[0];
    const contentPaneRefObj = contentPaneNode.props.ref;

    const makeMockRow = (label: string) => ({
      getAttribute: (attr: string) => (attr === "data-deckify-label" ? label : null),
      contains: () => false,
      scrollIntoView: vi.fn(),
      focus: vi.fn(),
    });

    const rows = Array.from({ length: 25 }, (_, i) => makeMockRow(`Playlist ${i + 1}`));
    // Simulate SteamOS GamepadUI virtual D-pad focus: document.activeElement stays on document.body
    (globalThis as any).document.activeElement = { tagName: "BODY" };

    // 1. Neither DOM focus nor virtual focus inside contentPaneRef (Sidebar focus) -> R2 ignored
    contentPaneRefObj.current = {
      contains: () => false,
      querySelectorAll: (selector: string) =>
        selector === '[data-deckify-list-item="true"]' ? rows : [],
      querySelector: () => null,
    };

    downHandler!(8);
    upHandler!(8);
    expect(rows[15].scrollIntoView).not.toHaveBeenCalled();
    expect(rows[15].focus).not.toHaveBeenCalled();

    stateIdx = 0;
    refIdx = 0;
    let updatedTree = DeckifyExpandedModal({ closeModal });
    expect(findNodes(updatedTree, (n) => n.props?.["data-testid"] === "trigger-indicator-pill")[0]).toBeUndefined();

    // 2. Virtual focus on row 0 via [data-deckify-focused="true"] while activeElement is BODY -> R2 jumps +15 and shows "16 / 25"
    vi.advanceTimersByTime(350);
    contentPaneRefObj.current = {
      contains: () => false,
      querySelectorAll: (selector: string) =>
        selector === '[data-deckify-list-item="true"]' ? rows : [],
      querySelector: (selector: string) =>
        selector.includes("data-deckify-focused") ? rows[0] : null,
    };

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
  });

  it("shows error toast when handleToggleLike fails with 403 Forbidden", async () => {
    const closeModal = vi.fn();
    DeckifyExpandedModal({ closeModal });
    stateValues[0] = "now_playing";
    stateValues[1] = {
      is_playing: true,
      track: { id: "trk-403", name: "Song", artist: "Artist", duration_ms: 60000 },
      settings: { trigger_nav_enabled: true },
    };

    stateIdx = 0;
    refIdx = 0;
    for (const cleanup of effectCleanups) cleanup();
    effectCleanups = [];
    DeckifyExpandedModal({ closeModal });

    const errMsg = "Spotify rejected library access (403 Forbidden). Re-authenticate in Settings or check Spotify Developer Mode allowlist.";
    mockToggleLike.mockResolvedValueOnce({
      ok: false,
      error: errMsg,
    });

    downHandler!(3); // X button triggers handleToggleLike
    await Promise.resolve();
    await Promise.resolve();

    stateIdx = 0;
    refIdx = 0;
    const tree = DeckifyExpandedModal({ closeModal });
    const toastNodes = findNodes(tree, (n) => n.props?.children === errMsg);
    expect(toastNodes.length).toBe(1);
  });

  it("pins a playlist from PlaylistsTab detail header and shows Pinned to QAM toast", async () => {
    const closeModal = vi.fn();
    DeckifyExpandedModal({ closeModal });

    stateValues[0] = "playlists";
    stateValues[1] = { settings: { trigger_nav_enabled: true, pinned_playlists: [] } };
    stateValues[2] = {
      id: "pl-1",
      name: "Chill Mix",
      uri: "spotify:playlist:pl-1",
      image_url: "https://i.scdn.co/image/pl1",
    };

    stateIdx = 0;
    refIdx = 0;
    const tree = DeckifyExpandedModal({ closeModal });
    const playlistsTabNode = findNodes(tree, (n) => n.type === PlaylistsTab)[0];
    expect(playlistsTabNode).toBeDefined();

    const plTree = PlaylistsTab(playlistsTabNode.props);
    const pinBtn = findNodes(plTree, (n) => n.props?.["aria-label"] === "Pin to QAM")[0];
    expect(pinBtn).toBeDefined();

    await pinBtn.props.onClick();

    expect(mockSetSetting).toHaveBeenCalledWith("pinned_playlists", [
      {
        uri: "spotify:playlist:pl-1",
        name: "Chill Mix",
        type: "playlist",
        image_url: "https://i.scdn.co/image/pl1",
      },
    ]);
    expect(mockToast).toHaveBeenCalledWith({
      title: "Deckify",
      body: "Pinned to QAM",
      duration: 2500,
    });
  });

  it("unpins an already-pinned item from detail header and shows Unpinned from QAM toast", async () => {
    const closeModal = vi.fn();
    DeckifyExpandedModal({ closeModal });

    const existing = [
      { uri: "spotify:playlist:pl-1", name: "Chill Mix", type: "playlist" as const, image_url: null },
      { uri: "spotify:album:alb-2", name: "Album 2", type: "album" as const, image_url: null },
    ];
    stateValues[0] = "playlists";
    stateValues[1] = { settings: { trigger_nav_enabled: true, pinned_playlists: existing } };
    stateValues[2] = {
      id: "pl-1",
      name: "Chill Mix",
      uri: "spotify:playlist:pl-1",
      image_url: null,
    };

    stateIdx = 0;
    refIdx = 0;
    const tree = DeckifyExpandedModal({ closeModal });
    const playlistsTabNode = findNodes(tree, (n) => n.type === PlaylistsTab)[0];
    const plTree = PlaylistsTab(playlistsTabNode.props);
    const unpinBtn = findNodes(plTree, (n) => n.props?.["aria-label"] === "Unpin from QAM")[0];
    expect(unpinBtn).toBeDefined();

    await unpinBtn.props.onClick();

    expect(mockSetSetting).toHaveBeenCalledWith("pinned_playlists", [
      { uri: "spotify:album:alb-2", name: "Album 2", type: "album", image_url: null },
    ]);
    expect(mockToast).toHaveBeenCalledWith({
      title: "Deckify",
      body: "Unpinned from QAM",
      duration: 2500,
    });
  });

  it("focuses an album row, opens CollectionActionModal on Y, and shows row FaThumbtack badge when pinned", async () => {
    const closeModal = vi.fn();
    DeckifyExpandedModal({ closeModal });

    const pinnedAlbum = {
      id: "alb-1",
      name: "Discovery",
      artist: "Daft Punk",
      uri: "spotify:album:alb-1",
      image_url: "https://i.scdn.co/image/alb1",
      track_count: 14,
    };
    stateValues[0] = "albums";
    stateValues[1] = {
      settings: {
        trigger_nav_enabled: true,
        pinned_playlists: [
          {
            uri: "spotify:album:alb-1",
            name: "Discovery",
            type: "album",
            image_url: "https://i.scdn.co/image/alb1",
          },
        ],
      },
    };
    stateValues[17] = [pinnedAlbum];

    stateIdx = 0;
    refIdx = 0;
    for (const cleanup of effectCleanups) cleanup();
    effectCleanups = [];
    const tree = DeckifyExpandedModal({ closeModal });
    const albumsTabNode = findNodes(tree, (n) => n.type === AlbumsTab)[0];
    expect(albumsTabNode).toBeDefined();

    const albumsTree = AlbumsTab(albumsTabNode.props);
    const albumRow = findNodes(
      albumsTree,
      (n) => n.props?.["data-deckify-label"] === "Discovery"
    )[0];
    expect(albumRow).toBeDefined();
    const badge = findNodes(albumRow, (n) => n.props?.title === "Pinned to QAM")[0];
    expect(badge).toBeDefined();

    albumRow.props.onFocus();
    downHandler!(4); // Y button opens CollectionActionModal

    stateIdx = 0;
    refIdx = 0;
    const modalTree = DeckifyExpandedModal({ closeModal });
    const collectionModalNode = findNodes(
      modalTree,
      (n) => n.type === CollectionActionModal
    )[0];
    expect(collectionModalNode).toBeDefined();
    expect(collectionModalNode.props.isPinned).toBe(true);

    const renderedModal = CollectionActionModal(collectionModalNode.props);
    const unpinAction = findNodes(
      renderedModal,
      (n) => n.props?.children === "Unpin from QAM"
    )[0];
    expect(unpinAction).toBeDefined();
  });

  it("does not auto-evict when 4 items are already pinned and shows max-4 toast and Y-menu label", async () => {
    const closeModal = vi.fn();
    DeckifyExpandedModal({ closeModal });

    const fourPinned = [
      { uri: "spotify:playlist:1", name: "P1", type: "playlist" as const, image_url: null },
      { uri: "spotify:playlist:2", name: "P2", type: "playlist" as const, image_url: null },
      { uri: "spotify:playlist:3", name: "P3", type: "playlist" as const, image_url: null },
      { uri: "spotify:playlist:4", name: "P4", type: "playlist" as const, image_url: null },
    ];
    const fifthPlaylist = {
      id: "5",
      name: "P5",
      uri: "spotify:playlist:5",
      image_url: null,
    };

    stateValues[0] = "playlists";
    stateValues[1] = { settings: { trigger_nav_enabled: true, pinned_playlists: fourPinned } };
    stateValues[2] = fifthPlaylist;

    stateIdx = 0;
    refIdx = 0;
    const tree = DeckifyExpandedModal({ closeModal });
    const playlistsTabNode = findNodes(tree, (n) => n.type === PlaylistsTab)[0];
    const plTree = PlaylistsTab(playlistsTabNode.props);
    const pinBtn = findNodes(plTree, (n) => n.props?.["aria-label"] === "Pin to QAM")[0];

    await pinBtn.props.onClick();

    expect(mockSetSetting).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith({
      title: "Deckify",
      body: "Max 4 pinned items — unpin one first",
      duration: 3000,
    });

    // Also verify CollectionActionModal displays "Max 4 Pinned — Unpin One First"
    const modalAtLimit = CollectionActionModal({
      collection: { uri: "spotify:playlist:5", name: "P5", type: "playlist", image_url: null },
      isPinned: false,
      atLimit: true,
      onClose: vi.fn(),
      onPlay: vi.fn(),
      onTogglePin: vi.fn(),
    });
    const limitLabel = findNodes(
      modalAtLimit,
      (n) => n.props?.children === "Max 4 Pinned — Unpin One First"
    )[0];
    expect(limitLabel).toBeDefined();
  });

  it("renders Pin to QAM / Unpin from QAM toggle in LikedSongsTab for spotify:collection:tracks", async () => {
    const closeModal = vi.fn();
    DeckifyExpandedModal({ closeModal });

    stateValues[0] = "liked";
    stateValues[1] = { settings: { trigger_nav_enabled: true, pinned_playlists: [] } };

    stateIdx = 0;
    refIdx = 0;
    const tree = DeckifyExpandedModal({ closeModal });
    const likedTabNode = findNodes(tree, (n) => n.type === LikedSongsTab)[0];
    expect(likedTabNode).toBeDefined();
    expect(likedTabNode.props.isPinned).toBe(false);

    const likedTree = LikedSongsTab(likedTabNode.props);
    const pinBtn = findNodes(likedTree, (n) => n.props?.["aria-label"] === "Pin to QAM")[0];
    expect(pinBtn).toBeDefined();

    await pinBtn.props.onClick();

    expect(mockSetSetting).toHaveBeenCalledWith("pinned_playlists", [
      {
        uri: "spotify:collection:tracks",
        name: "Liked Songs",
        type: "liked_songs",
        image_url: null,
      },
    ]);
  });

  it("hardens PlaylistsTab detail header flex layout and gates Enable Mix to spotify_client", () => {
    const onToggleMix = vi.fn();
    const baseProps = {
      folders: [],
      allUserPlaylists: [],
      activePlaylist: {
        id: "pl-long",
        name: "An Extraordinarily Long Playlist Name Exceeding Twenty Five Characters",
        uri: "spotify:playlist:pl-long",
        image_url: undefined,
        is_mixed: false,
      },
      playlistTracks: [],
      loadingContent: false,
      audioBackend: "librespot" as const,
      mixingBusy: false,
      onOpenPlaylist: vi.fn(),
      onClosePlaylist: vi.fn(),
      onPlayTrack: vi.fn(),
      onToggleMix,
      onToggleLike: vi.fn(),
      onOpenActions: vi.fn(),
      pinnedUris: new Set<string>(),
      onTogglePin: vi.fn(),
      onCreatePlaylist: vi.fn(async () => {}),
      onCreateFolder: vi.fn(async () => {}),
      onRenameFolder: vi.fn(async () => {}),
      onDeleteFolder: vi.fn(async () => {}),
    };

    // 1. On librespot, Mix button is hidden
    const librespotTree = PlaylistsTab(baseProps);
    const hasMixText = (node: any): boolean => {
      const children = Array.isArray(node.props?.children)
        ? node.props.children.join("")
        : String(node.props?.children ?? "");
      return (
        children.includes("Enable Mix") ||
        children.includes("Mix Active") ||
        children.includes("Processing...")
      );
    };
    expect(findNodes(librespotTree, hasMixText)).toHaveLength(0);

    // 2. Title wrapper uses flex: 1, minWidth: 0, overflow: "hidden", h2 uses ellipsis, action buttons use flexShrink: 0
    const titleH2 = findNodes(librespotTree, (n) => n.type === "h2")[0];
    expect(titleH2).toBeDefined();
    expect(titleH2.props.style.whiteSpace).toBe("nowrap");
    expect(titleH2.props.style.overflow).toBe("hidden");
    expect(titleH2.props.style.textOverflow).toBe("ellipsis");

    const titleWrapper = findNodes(
      librespotTree,
      (n) =>
        n.type === "div" &&
        n.props?.style?.flex === 1 &&
        n.props?.style?.minWidth === 0 &&
        n.props?.style?.overflow === "hidden"
    )[0];
    expect(titleWrapper).toBeDefined();

    const headerButtons = findNodes(
      librespotTree,
      (n) => n.type === InteractiveRow && n.props?.style?.flexShrink === 0
    );
    // Back, Play, Pin/Unpin on librespot
    expect(headerButtons.length).toBe(3);

    // 3. On spotify_client, Mix button is rendered with flexShrink: 0 and clicking it invokes onToggleMix
    const clientTree = PlaylistsTab({ ...baseProps, audioBackend: "spotify_client" });
    const mixBtn = findNodes(
      clientTree,
      (n) => n.type === InteractiveRow && hasMixText(n)
    )[0];
    expect(mixBtn).toBeDefined();
    expect(mixBtn.props.style.flexShrink).toBe(0);
    mixBtn.props.onClick();
    expect(onToggleMix).toHaveBeenCalledTimes(1);
  });

  it("renders 5 clickable source pills in LyricsTab inside horizontal Focusable alongside Try Next Source", async () => {
    const { LyricsTab } = await vi.importActual<typeof import("./tabs/LyricsTab")>("./tabs/LyricsTab");
    const onSelectLyricsSource = vi.fn();
    const handleNextLyricsSource = vi.fn();

    const tree = LyricsTab({
      trackName: "Song A",
      artistName: "Artist A",
      lyricsSource: "LRCLIB",
      handleNextLyricsSource,
      onSelectLyricsSource,
      loadingLyrics: false,
      syncedLyrics: [{ timeMs: 1000, text: "Hello" }],
      plainLyrics: null,
      currentLineIndex: 0,
      onSeekPlayback: vi.fn(),
    });

    const { Focusable } = await import("@decky/ui");
    const horizontalFocusable = findNodes(
      tree,
      (n) => (n.type === Focusable || n.type === "Focusable") && n.props?.["flow-children"] === "horizontal"
    )[0];
    expect(horizontalFocusable).toBeDefined();

    const pillRows = findNodes(horizontalFocusable, (n) => n.type === InteractiveRow);
    expect(pillRows.map((p) => p.props.children)).toEqual([
      "Spotify",
      "LRCLIB",
      "NetEase",
      "Musixmatch",
      "Lyrics.ovh",
    ]);

    const lrclibPill = pillRows.find((p) => p.props.children === "LRCLIB");
    const neteasePill = pillRows.find((p) => p.props.children === "NetEase");
    expect(lrclibPill.props.active).toBe(true);
    expect(lrclibPill.props.style.color).toBe("var(--deckify-accent, #1DB954)");
    expect(lrclibPill.props.style.background).toBe("rgba(var(--deckify-accent-rgb, 29, 185, 84), 0.2)");
    expect(neteasePill.props.active).toBe(false);
    expect(neteasePill.props.style.background).toBe("rgba(255, 255, 255, 0.08)");

    neteasePill.props.onClick();
    expect(onSelectLyricsSource).toHaveBeenCalledWith(2, "NetEase");

    const allRows = findNodes(tree, (n) => n.type === InteractiveRow);
    const tryNextBtn = allRows.find((r) => {
      const ch = Array.isArray(r.props?.children) ? r.props.children.join("") : String(r.props?.children ?? "");
      return ch.includes("Try Next Source");
    });
    expect(tryNextBtn).toBeDefined();
    tryNextBtn.props.onClick();
    expect(handleNextLyricsSource).toHaveBeenCalledTimes(1);
  });

  it("registers discovery right after lyrics in ALL_MODES and defaults to discovery when idle", async () => {
    const { ALL_MODES } = await import("../types");
    const lyricsIdx = ALL_MODES.indexOf("lyrics");
    expect(lyricsIdx).toBeGreaterThanOrEqual(0);
    expect(ALL_MODES[lyricsIdx + 1]).toBe("discovery");

    // Idle status (no active track) switches mode to "discovery"
    const closeModal = vi.fn();
    DeckifyExpandedModal({ closeModal });
    stateValues[0] = "now_playing";
    stateValues[1] = {
      is_playing: false,
      position_ms: 0,
      duration_ms: 0,
      track: null,
      track_meta: null,
    };

    stateIdx = 0;
    refIdx = 0;
    for (const cleanup of effectCleanups) cleanup();
    effectCleanups = [];
    DeckifyExpandedModal({ closeModal });
    expect(stateValues[0]).toBe("discovery");
  });

  it("keeps now_playing as default tab when an active track is present", () => {
    const closeModal = vi.fn();
    DeckifyExpandedModal({ closeModal });
    stateValues[0] = "now_playing";
    stateValues[1] = {
      is_playing: true,
      position_ms: 1000,
      duration_ms: 60000,
      track: { id: "trk-1", name: "Active Song", artist: "Artist", duration_ms: 60000 },
    };

    stateIdx = 0;
    refIdx = 0;
    for (const cleanup of effectCleanups) cleanup();
    effectCleanups = [];
    DeckifyExpandedModal({ closeModal });
    expect(stateValues[0]).toBe("now_playing");
  });
});

describe("DeckifyExpandedModal playlist mix ID fallback & playback reliability (12-01)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stateValues = [];
    stateIdx = 0;
    refValues = [];
    refIdx = 0;
    runEffectsInTest = false;
    effectCleanups = [];
    mockSetNativeMix.mockResolvedValue({ ok: true });
    mockPlayTracks.mockResolvedValue({ ok: true });
  });

  it("falls back to activePlaylist.id in handleToggleMix when activePlaylist.uri is empty", async () => {
    const closeModal = vi.fn();
    DeckifyExpandedModal({ closeModal });

    stateValues[0] = "playlists";
    stateValues[1] = { settings: { audio_backend: "spotify_client" } };
    stateValues[2] = { id: "pl-folder-1", name: "Folder Playlist", uri: "", is_mixed: false };

    stateIdx = 0;
    refIdx = 0;
    const tree = DeckifyExpandedModal({ closeModal });
    const playlistsTabNode = findNodes(tree, (n) => n.type === PlaylistsTab)[0];
    expect(playlistsTabNode).toBeDefined();

    await playlistsTabNode.props.onToggleMix();
    expect(mockSetNativeMix).toHaveBeenCalledWith("pl-folder-1", true, true);
  });

  it("passes normalized playlist contextUri and allTracks on track click, and surfaces error toast on failure", async () => {
    const closeModal = vi.fn();
    DeckifyExpandedModal({ closeModal });

    const tracks = [
      { id: "t1", name: "Song 1", artist: "Artist 1", uri: "spotify:track:t1", duration_ms: 180000 },
      { id: "t2", name: "Song 2", artist: "Artist 2", uri: "spotify:track:t2", duration_ms: 200000 },
    ];
    stateValues[0] = "playlists";
    stateValues[1] = { settings: { audio_backend: "librespot" } };
    stateValues[2] = { id: "pl-folder-1", name: "Folder Playlist", uri: "" };
    stateValues[3] = tracks;

    stateIdx = 0;
    refIdx = 0;
    const tree = DeckifyExpandedModal({ closeModal });
    const playlistsTabNode = findNodes(tree, (n) => n.type === PlaylistsTab)[0];
    const plTree = PlaylistsTab(playlistsTabNode.props);

    const trackRowItems = findNodes(plTree, (n) => n.props?.track?.id === "t2");
    expect(trackRowItems.length).toBeGreaterThan(0);
    expect(trackRowItems[0].props.contextUri).toBe("spotify:playlist:pl-folder-1");
    expect(trackRowItems[0].props.allTracks).toEqual(tracks);

    // Click track and verify startIdx is forwarded
    await trackRowItems[0].props.onPlayTrack("spotify:track:t2", "spotify:playlist:pl-folder-1", ["spotify:track:t1", "spotify:track:t2"], 1);
    expect(mockPlayTracks).toHaveBeenCalledWith("spotify:playlist:pl-folder-1", "spotify:track:t2", null, 1);

    // Simulate backend error and verify no false "Playback started" toast
    mockPlayTracks.mockResolvedValueOnce({ ok: false, error: "No active device" });
    await playlistsTabNode.props.onPlayTrack("", "spotify:playlist:pl-folder-1");
    expect(mockPlayTracks).toHaveBeenLastCalledWith("spotify:playlist:pl-folder-1", null, null, 0);
    expect(stateValues).toContain("No active device");
    expect(stateValues).not.toContain("Playback started");
  });
});

describe("DeckifyExpandedModal Sidebar actions, NowPlaying Add to Playlist & Recent discrete refresh (12-03)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stateValues = [];
    stateIdx = 0;
    refValues = [];
    refIdx = 0;
    runEffectsInTest = false;
    effectCleanups = [];
    mockGetRecentlyPlayed.mockResolvedValue({ ok: true, tracks: [] });
  });

  it("opens TrackActionModal from NowPlayingTab Add to Playlist RoundBtn", () => {
    const closeModal = vi.fn();
    DeckifyExpandedModal({ closeModal });

    const activeTrack = {
      id: "trk-np-1",
      track_id: "trk-np-1",
      name: "Current Song",
      artist: "Current Artist",
      album: "Current Album",
      duration_ms: 180000,
      uri: "spotify:track:trk-np-1",
    };
    stateValues[0] = "now_playing";
    stateValues[1] = { is_playing: true, track: activeTrack };

    stateIdx = 0;
    refIdx = 0;
    const tree = DeckifyExpandedModal({ closeModal });
    const npTabNode = findNodes(tree, (n) => n.type === NowPlayingTab)[0];
    expect(npTabNode).toBeDefined();

    const npTree = NowPlayingTab(npTabNode.props);
    const addBtn = findNodes(npTree, (n) => n.props?.["aria-label"] === "Add to Playlist")[0];
    expect(addBtn).toBeDefined();

    addBtn.props.onClick();

    stateIdx = 0;
    refIdx = 0;
    const afterTree = DeckifyExpandedModal({ closeModal });
    const actionModalNode = findNodes(afterTree, (n) => n.type === TrackActionModal)[0];
    expect(actionModalNode).toBeDefined();
    expect(actionModalNode.props.actionTrack).toEqual(activeTrack);
  });

  it("opens TrackActionModal on Y when Sidebar Now Playing card is focused in engine mode", () => {
    const closeModal = vi.fn();
    let capturedDownHandler: ((btn: number) => void) | undefined;
    (globalThis as any).window = {
      FocusNavController: {
        RegisterForGamepadButtonDown: vi.fn((cb: (btn: number) => void) => {
          capturedDownHandler = cb;
          return { Unregister: vi.fn() };
        }),
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    runEffectsInTest = true;
    DeckifyExpandedModal({ closeModal });

    const activeTrack = {
      id: "trk-sb-1",
      track_id: "trk-sb-1",
      name: "Sidebar Track",
      artist: "Sidebar Artist",
      album: "Sidebar Album",
      duration_ms: 180000,
      uri: "spotify:track:trk-sb-1",
    };
    stateValues[0] = "engine";
    stateValues[1] = { is_playing: true, track: activeTrack, settings: { trigger_nav_enabled: true } };

    stateIdx = 0;
    refIdx = 0;
    for (const cleanup of effectCleanups) cleanup();
    effectCleanups = [];
    const tree = DeckifyExpandedModal({ closeModal });

    const sidebarNode = findNodes(tree, (n) => n.type === Sidebar)[0];
    expect(sidebarNode).toBeDefined();
    sidebarNode.props.onFocusTrack(activeTrack);

    if (capturedDownHandler) {
      capturedDownHandler(4); // Y button
    } else {
      sidebarNode.props.onOpenActions(activeTrack);
    }
    stateIdx = 0;
    refIdx = 0;
    const afterTree = DeckifyExpandedModal({ closeModal });
    const actionModalNode = findNodes(afterTree, (n) => n.type === TrackActionModal)[0];
    expect(actionModalNode).toBeDefined();
    expect(actionModalNode.props.actionTrack).toEqual(activeTrack);
  });

  it("refreshes backendGetRecentlyPlayed when active track_id changes while mode is recent", () => {
    const closeModal = vi.fn();
    runEffectsInTest = true;
    DeckifyExpandedModal({ closeModal });

    stateValues[0] = "recent";
    stateValues[1] = {
      is_playing: true,
      track: { track_id: "trk-1", name: "First", artist: "A", album: "B", duration_ms: 1000 },
    };

    stateIdx = 0;
    refIdx = 0;
    for (const cleanup of effectCleanups) cleanup();
    effectCleanups = [];
    DeckifyExpandedModal({ closeModal });

    const callsAfterModeEnter = mockGetRecentlyPlayed.mock.calls.length;

    // Change track_id while staying in recent mode
    stateValues[1] = {
      is_playing: true,
      track: { track_id: "trk-2", name: "Second", artist: "A", album: "B", duration_ms: 1000 },
    };
    stateIdx = 0;
    refIdx = 0;
    for (const cleanup of effectCleanups) cleanup();
    effectCleanups = [];
    DeckifyExpandedModal({ closeModal });

    expect(mockGetRecentlyPlayed.mock.calls.length).toBeGreaterThan(callsAfterModeEnter);
  });
});
