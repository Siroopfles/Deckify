import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

interface MockNode {
  type?: unknown;
  props?: Record<string, unknown> & { children?: unknown };
}

vi.mock("react/jsx-dev-runtime", () => ({
  jsxDEV: (type: unknown, props: Record<string, unknown>, key?: string) => ({
    type,
    props: { ...props, ...(key !== undefined ? { key } : {}) },
  }),
}));

vi.mock("react/jsx-runtime", () => ({
  jsx: (type: unknown, props: Record<string, unknown>, key?: string) => ({
    type,
    props: { ...props, ...(key !== undefined ? { key } : {}) },
  }),
  jsxs: (type: unknown, props: Record<string, unknown>, key?: string) => ({
    type,
    props: { ...props, ...(key !== undefined ? { key } : {}) },
  }),
}));

const hookState: { slots: unknown[]; cursor: number; active: boolean } = {
  slots: [],
  cursor: 0,
  active: false,
};

function resetHookState(active = false): void {
  hookState.slots = [];
  hookState.cursor = 0;
  hookState.active = active;
}

vi.mock("react", () => ({
  useState: (init: unknown) => {
    if (!hookState.active) return [init, vi.fn()];
    const idx = hookState.cursor++;
    if (!(idx in hookState.slots)) {
      hookState.slots[idx] = typeof init === "function" ? (init as () => unknown)() : init;
    }
    const setState = (next: unknown) => {
      hookState.slots[idx] =
        typeof next === "function" ? (next as (prev: unknown) => unknown)(hookState.slots[idx]) : next;
    };
    return [hookState.slots[idx], setState];
  },
  useEffect: (fn: () => void) => fn(),
  useCallback: (fn: unknown) => fn,
  useRef: (init: unknown) => ({ current: init }),
  useMemo: (fn: () => unknown) => fn(),
}));

vi.mock("@decky/ui", () => ({
  GamepadButton: {
    DIR_UP: 9,
    DIR_DOWN: 10,
    DIR_LEFT: 11,
    DIR_RIGHT: 12,
  },
  Focusable: ({ children, ...props }: Record<string, unknown>) => ({
    type: "Focusable",
    props: { children, ...props },
  }),
  DialogButton: ({ children, ...props }: Record<string, unknown>) => ({
    type: "DialogButton",
    props: { children, ...props },
  }),
  Dropdown: (props: Record<string, unknown>) => ({
    type: "Dropdown",
    props,
  }),
}));

vi.mock("react-icons/fa", () => {
  const icon = (name: string) => (props: Record<string, unknown>) => ({
    type: name,
    props,
  });
  return {
    FaSpotify: icon("FaSpotify"),
    FaRandom: icon("FaRandom"),
    FaStepBackward: icon("FaStepBackward"),
    FaPlay: icon("FaPlay"),
    FaPause: icon("FaPause"),
    FaStepForward: icon("FaStepForward"),
    FaRedo: icon("FaRedo"),
    FaUndo: icon("FaUndo"),
    FaHeart: icon("FaHeart"),
    FaRegHeart: icon("FaRegHeart"),
    FaVolumeMute: icon("FaVolumeMute"),
    FaVolumeUp: icon("FaVolumeUp"),
    FaPlus: icon("FaPlus"),
    FaQrcode: icon("FaQrcode"),
  };
});

vi.mock("../common/DeckifyImage", () => ({
  DeckifyImage: (props: Record<string, unknown>) => ({
    type: "DeckifyImage",
    props,
  }),
}));

vi.mock("../common/InteractiveRow", () => ({
  InteractiveRow: ({ children, ...props }: Record<string, unknown>) => ({
    type: "InteractiveRow",
    props: { children, ...props },
  }),
  RoundBtn: ({ children, ...props }: Record<string, unknown>) => ({
    type: "RoundBtn",
    props: { children, ...props },
  }),
  focusHalo: () => ({}),
  formatMs: (ms: number) => `${Math.floor(ms / 1000)}s`,
}));

import { NowPlayingTab, NowPlayingTabProps, ProgressScrubBar } from "./NowPlayingTab";
import { getScrubStepMs } from "../../hooks/usePlaybackClock";
import { StatusResponse } from "../../types";

function findNodes(
  tree: unknown,
  predicate: (node: MockNode) => boolean,
  results: MockNode[] = []
): MockNode[] {
  if (!tree || typeof tree !== "object") return results;
  if (Array.isArray(tree)) {
    for (const item of tree) findNodes(item, predicate, results);
    return results;
  }
  const node = tree as MockNode;
  if (predicate(node)) results.push(node);
  const children = node.props?.children;
  if (children !== undefined) {
    findNodes(children, predicate, results);
  }
  return results;
}

function collectText(tree: unknown): string {
  if (tree == null || typeof tree === "boolean") return "";
  if (typeof tree === "string" || typeof tree === "number") return String(tree);
  if (Array.isArray(tree)) return tree.map(collectText).join(" ");
  if (typeof tree === "object") {
    const node = tree as MockNode;
    return collectText(node.props?.children);
  }
  return "";
}

function makeStatus(overrides: Partial<StatusResponse> = {}): StatusResponse {
  return {
    authenticated: true,
    running: true,
    librespot_running: false,
    spotify_client_running: true,
    play_state: "playing",
    track: null,
    position_ms: 30000,
    is_playing: true,
    volume: 60,
    shuffle_state: false,
    repeat_state: "off",
    is_liked: false,
    audio_backend: "spotify_client",
    playback_speed: 1.0,
    track_meta: {
      id: "t1",
      name: "Sample Item",
      artist: "Sample Creator",
      album: "Sample Collection",
      uri: "spotify:track:t1",
      duration_ms: 240000,
      media_type: "track",
    },
    ...overrides,
  };
}

function makeProps(overrides: Partial<NowPlayingTabProps> = {}): NowPlayingTabProps {
  return {
    status: makeStatus(),
    currentPositionMs: 30000,
    handlePlayPause: vi.fn(),
    handleNext: vi.fn(),
    handlePrev: vi.fn(),
    handleToggleRepeat: vi.fn(),
    handleToggleLike: vi.fn(),
    handleSeekDelta: vi.fn(),
    handleVolumeDelta: vi.fn(),
    onSetShuffle: vi.fn(),
    onSeekPlayback: vi.fn(),
    onOpenActions: vi.fn(),
    playbackSpeed: 1.0,
    onSetPlaybackSpeed: vi.fn(),
    ...overrides,
  };
}

function renderTab(props: NowPlayingTabProps): MockNode {
  return NowPlayingTab(props) as unknown as MockNode;
}

describe("NowPlayingTab POD-01 transport controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders Previous/Next transport buttons and omits Dropdown for music tracks", () => {
    const props = makeProps({
      status: makeStatus({
        track_meta: {
          id: "m1",
          name: "Music Track",
          artist: "Band",
          album: "LP",
          uri: "spotify:track:m1",
          duration_ms: 180000,
          media_type: "track",
        },
      }),
    });

    const tree = renderTab(props);
    expect(findNodes(tree, (n) => n.props?.["aria-label"] === "Previous")).toHaveLength(1);
    expect(findNodes(tree, (n) => n.props?.["aria-label"] === "Next")).toHaveLength(1);
    expect(findNodes(tree, (n) => n.props?.["aria-label"] === "Rewind 15s")).toHaveLength(0);
    expect(findNodes(tree, (n) => n.props?.["aria-label"] === "Forward 15s")).toHaveLength(0);
    expect(findNodes(tree, (n) => n.props?.rgOptions !== undefined)).toHaveLength(0);
    expect(findNodes(tree, (n) => n.props?.["flow-children"] === "row")).toHaveLength(0);
  });

  it("replaces Previous/Next with -15s and +15s buttons calling handleSeekDelta for podcast episodes", () => {
    const handleSeekDelta = vi.fn();
    const props = makeProps({
      handleSeekDelta,
      status: makeStatus({
        track_meta: {
          id: "ep1",
          name: "Podcast Episode",
          artist: "Host",
          album: "Show",
          uri: "spotify:episode:ep1",
          duration_ms: 1800000,
          media_type: "episode",
        },
      }),
    });

    const tree = renderTab(props);
    expect(findNodes(tree, (n) => n.props?.["aria-label"] === "Previous")).toHaveLength(0);
    expect(findNodes(tree, (n) => n.props?.["aria-label"] === "Next")).toHaveLength(0);
    const rewindBtns = findNodes(tree, (n) => n.props?.["aria-label"] === "Rewind 15s");
    const forwardBtns = findNodes(tree, (n) => n.props?.["aria-label"] === "Forward 15s");

    expect(rewindBtns).toHaveLength(1);
    expect(forwardBtns).toHaveLength(1);
    (rewindBtns[0].props?.onClick as () => void)();
    (forwardBtns[0].props?.onClick as () => void)();
    expect(handleSeekDelta).toHaveBeenNthCalledWith(1, -15);
    expect(handleSeekDelta).toHaveBeenNthCalledWith(2, 15);
  });
});

describe("NowPlayingTab POD-01 speed Dropdown", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders speed Dropdown with 7 options (0.5x..2.0x) on spotify_client and invokes onSetPlaybackSpeed(1.5)", () => {
    const onSetPlaybackSpeed = vi.fn();
    const props = makeProps({
      playbackSpeed: 1.0,
      onSetPlaybackSpeed,
      status: makeStatus({
        audio_backend: "spotify_client",
        track_meta: {
          id: "ep2",
          name: "Episode 2",
          artist: "Host",
          album: "Show",
          uri: "spotify:episode:ep2",
          duration_ms: 900000,
          media_type: "episode",
        },
      }),
    });

    const tree = renderTab(props);
    const dropdowns = findNodes(tree, (n) => n.props?.rgOptions !== undefined);
    expect(dropdowns).toHaveLength(1);

    const dropdown = dropdowns[0];
    const options = dropdown.props?.rgOptions as Array<{ data: number; label: string }>;
    expect(options).toHaveLength(7);
    expect(options[0]).toEqual({ data: 0.5, label: "0.5x" });
    expect(options[6]).toEqual({ data: 2.0, label: "2.0x" });
    expect(dropdown.props?.disabled).toBe(false);

    const onChange = dropdown.props?.onChange as (opt: { data: unknown }) => void;
    onChange({ data: 1.5 });
    expect(onSetPlaybackSpeed).toHaveBeenCalledWith(1.5);

    onChange({ data: "not-a-number" });
    expect(onSetPlaybackSpeed).toHaveBeenCalledTimes(1);
  });

  it("disables Dropdown and renders helper caption on librespot backend", () => {
    const props = makeProps({
      status: makeStatus({
        audio_backend: "librespot",
        track_meta: {
          id: "ab1",
          name: "Audiobook Chapter",
          artist: "Author",
          album: "Book",
          uri: "spotify:chapter:ab1",
          duration_ms: 1200000,
          media_type: "audiobook",
        },
      }),
    });

    const tree = renderTab(props);
    const dropdowns = findNodes(tree, (n) => n.props?.rgOptions !== undefined);
    expect(dropdowns).toHaveLength(1);
    expect(dropdowns[0].props?.disabled).toBe(true);
    expect(collectText(tree)).toContain("Playback speed requires Official Spotify Client");
  });
});

function setupMockWindowListeners() {
  const listeners = new Map<string, Set<(ev: unknown) => void>>();
  const addEventListener = vi.fn((type: string, fn: (ev: unknown) => void) => {
    const set = listeners.get(type) ?? new Set();
    set.add(fn);
    listeners.set(type, set);
  });
  const removeEventListener = vi.fn((type: string, fn: (ev: unknown) => void) => {
    listeners.get(type)?.delete(fn);
  });
  vi.stubGlobal("window", { addEventListener, removeEventListener });
  return { listeners, addEventListener, removeEventListener };
}

function attachSliderRefTarget(slider: MockNode) {
  const setPointerCapture = vi.fn();
  const releasePointerCapture = vi.fn();
  const target = {
    getBoundingClientRect: () => ({ left: 100, width: 200 }),
    setPointerCapture,
    releasePointerCapture,
  };
  const ref = slider.props?.ref;
  if (typeof ref === "function") {
    ref(target);
  } else if (ref && typeof ref === "object" && "current" in ref) {
    (ref as { current: unknown }).current = target;
  }
  return { target, setPointerCapture, releasePointerCapture };
}

describe("ProgressScrubBar G-24-2 scrubbing and cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders no -15s or +15s buttons under ProgressScrubBar", () => {
    const tree = ProgressScrubBar({
      durationMs: 240000,
      currentPositionMs: 30000,
      handleSeekDelta: vi.fn(),
      onSeekPlayback: vi.fn(),
    }) as unknown as MockNode;

    const text = collectText(tree);
    expect(text).not.toContain("-15s");
    expect(text).not.toContain("+15s");
    expect(findNodes(tree, (n) => n.type === "InteractiveRow")).toHaveLength(0);
  });

  it("handles onGamepadDirection DIR_LEFT and DIR_RIGHT scrubbing on Focusable without onPointerDown on Focusable", () => {
    const handleSeekDelta = vi.fn();
    const durationMs = 240000;
    const expectedStepSec = getScrubStepMs(durationMs) / 1000;

    const tree = ProgressScrubBar({
      durationMs,
      currentPositionMs: 30000,
      handleSeekDelta,
      onSeekPlayback: vi.fn(),
    }) as unknown as MockNode;

    const focusables = findNodes(tree, (n) => n.props?.noFocusRing === true);
    expect(focusables).toHaveLength(1);
    const bar = focusables[0];
    expect(bar.props?.onPointerDown).toBeUndefined();
    const onGamepadDirection = bar.props?.onGamepadDirection as (e: unknown) => void;
    expect(typeof onGamepadDirection).toBe("function");

    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    expect(onGamepadDirection({ detail: { button: 11 }, preventDefault, stopPropagation })).toBe(true);
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(handleSeekDelta).toHaveBeenNthCalledWith(1, -expectedStepSec);

    expect(onGamepadDirection({ detail: { button: 12 }, preventDefault, stopPropagation })).toBe(true);
    expect(handleSeekDelta).toHaveBeenNthCalledWith(2, expectedStepSec);

    expect(onGamepadDirection({ detail: { button: 9 }, preventDefault, stopPropagation })).toBe(false);
    expect(onGamepadDirection({ detail: { button: 10 }, preventDefault, stopPropagation })).toBe(false);
    expect(handleSeekDelta).toHaveBeenCalledTimes(2);
  });
});

describe("ProgressScrubBar G-24-4 controller focus and selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetHookState(true);
  });

  afterEach(() => {
    resetHookState(false);
  });

  it("registers onActivate, onCancelButton, and aria-label on Focusable and toggles Done Scrubbing mode", () => {
    const props = {
      durationMs: 240000,
      currentPositionMs: 30000,
      handleSeekDelta: vi.fn(),
      onSeekPlayback: vi.fn(),
    };
    const renderBar = () => {
      hookState.cursor = 0;
      const tree = ProgressScrubBar(props) as unknown as MockNode;
      return findNodes(tree, (n) => n.props?.noFocusRing === true)[0];
    };

    let bar = renderBar();
    expect(bar.props?.["aria-label"]).toBe("Seek Playback");
    expect(typeof bar.props?.onActivate).toBe("function");
    expect(typeof bar.props?.onCancelButton).toBe("function");
    expect(bar.props?.onOKActionDescription).toBe("Scrub ←/→");
    expect(bar.props?.["data-deckify-focused"]).toBeUndefined();

    const idleCancelPrevent = vi.fn();
    const idleCancelStop = vi.fn();
    (bar.props?.onCancelButton as (e: unknown) => void)({
      preventDefault: idleCancelPrevent,
      stopPropagation: idleCancelStop,
    });
    expect(idleCancelPrevent).not.toHaveBeenCalled();

    (bar.props?.onGamepadFocus as () => void)();
    (bar.props?.onActivate as () => void)();
    bar = renderBar();
    expect(bar.props?.["data-deckify-focused"]).toBe("true");
    expect(bar.props?.onOKActionDescription).toBe("Done Scrubbing");

    const cancelPrevent = vi.fn();
    const cancelStop = vi.fn();
    (bar.props?.onCancelButton as (e: unknown) => void)({
      preventDefault: cancelPrevent,
      stopPropagation: cancelStop,
    });
    expect(cancelPrevent).toHaveBeenCalledTimes(1);
    expect(cancelStop).toHaveBeenCalledTimes(1);

    bar = renderBar();
    expect(bar.props?.onOKActionDescription).toBe("Scrub ←/→");
  });
});

describe("ProgressScrubBar G-24-3 native div pointer-drag, window listeners, and click deduplication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("handles native div role=slider pointer drag via window listeners and suppresses duplicate trailing onClick", () => {
    const { listeners, addEventListener, removeEventListener } = setupMockWindowListeners();
    const onSeekPlayback = vi.fn();
    const tree = ProgressScrubBar({
      durationMs: 200000,
      currentPositionMs: 20000,
      handleSeekDelta: vi.fn(),
      onSeekPlayback,
    }) as unknown as MockNode;

    const sliders = findNodes(tree, (n) => n.type === "div" && n.props?.role === "slider");
    expect(sliders).toHaveLength(1);
    const slider = sliders[0];
    const style = slider.props?.style as Record<string, unknown>;
    expect(style?.touchAction).toBe("none");
    expect(style?.padding).toBe("10px 0");
    expect(style?.userSelect).toBe("none");

    const { target, setPointerCapture, releasePointerCapture } = attachSliderRefTarget(slider);
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    (slider.props?.onPointerDown as (e: unknown) => void)({
      clientX: 150, pointerId: 7, pointerType: "touch", button: 0, currentTarget: target, preventDefault, stopPropagation,
    });
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(setPointerCapture).toHaveBeenCalledWith(7);
    expect(addEventListener).toHaveBeenCalledWith("pointermove", expect.any(Function));
    expect(addEventListener).toHaveBeenCalledWith("pointerup", expect.any(Function));
    expect(addEventListener).toHaveBeenCalledWith("pointercancel", expect.any(Function));

    const movePreventDefault = vi.fn();
    listeners.get("pointermove")?.forEach((fn) => fn({ clientX: 250, pointerId: 7, preventDefault: movePreventDefault }));
    expect(movePreventDefault).toHaveBeenCalledTimes(1);
    expect(onSeekPlayback).not.toHaveBeenCalled();

    listeners.get("pointerup")?.forEach((fn) => fn({ clientX: 250, pointerId: 7 }));
    expect(releasePointerCapture).toHaveBeenCalledWith(7);
    expect(removeEventListener).toHaveBeenCalledWith("pointermove", expect.any(Function));
    expect(removeEventListener).toHaveBeenCalledWith("pointerup", expect.any(Function));
    expect(removeEventListener).toHaveBeenCalledWith("pointercancel", expect.any(Function));
    expect(onSeekPlayback).toHaveBeenCalledTimes(1);
    expect(onSeekPlayback).toHaveBeenCalledWith(150000);

    const onClick = slider.props?.onClick as (e: unknown) => void;
    onClick({ clientX: 250, currentTarget: target });
    expect(onSeekPlayback).toHaveBeenCalledTimes(1);
    onClick({ clientX: 150, currentTarget: target });
    expect(onSeekPlayback).toHaveBeenCalledTimes(2);
    expect(onSeekPlayback).toHaveBeenNthCalledWith(2, 50000);
  });

  it("cleans up window listeners and aborts seek when pointercancel fires mid-drag", () => {
    const { listeners, removeEventListener } = setupMockWindowListeners();
    const onSeekPlayback = vi.fn();
    const tree = ProgressScrubBar({
      durationMs: 200000, currentPositionMs: 20000, handleSeekDelta: vi.fn(), onSeekPlayback,
    }) as unknown as MockNode;

    const slider = findNodes(tree, (n) => n.type === "div" && n.props?.role === "slider")[0];
    const { target } = attachSliderRefTarget(slider);
    (slider.props?.onPointerDown as (e: unknown) => void)({
      clientX: 150, pointerId: 3, pointerType: "touch", button: 0, currentTarget: target,
    });

    listeners.get("pointercancel")?.forEach((fn) => fn({ pointerId: 3 }));
    expect(removeEventListener).toHaveBeenCalledWith("pointermove", expect.any(Function));
    expect(removeEventListener).toHaveBeenCalledWith("pointerup", expect.any(Function));
    expect(removeEventListener).toHaveBeenCalledWith("pointercancel", expect.any(Function));
    expect(onSeekPlayback).not.toHaveBeenCalled();
  });
});

describe("NowPlayingTab AI DJ indicator & button (G-26-1)", () => {
  const baseProps: NowPlayingTabProps = {
    status: {
      authenticated: true,
      librespot_running: false,
      audio_backend: "spotify_client",
      play_state: "playing",
      track: { name: "Test Track", artist: "Test Artist", album: "Test Album", duration_ms: 180000 },
      position_ms: 10000,
      is_playing: true,
      volume: 75,
    },
    currentPositionMs: 10000,
    handlePlayPause: vi.fn(),
    handleNext: vi.fn(),
    handlePrev: vi.fn(),
    handleToggleRepeat: vi.fn(),
    handleToggleLike: vi.fn(),
    handleSeekDelta: vi.fn(),
    handleVolumeDelta: vi.fn(),
    onSetShuffle: vi.fn(),
  };

  it("renders 'AI DJ Speaking...' indicator when status.ai_dj_speaking is true", () => {
    const tree = NowPlayingTab({
      ...baseProps,
      status: { ...baseProps.status!, ai_dj_active: true, ai_dj_speaking: true },
    }) as unknown as MockNode;

    const indicator = findNodes(tree, (n) => n.props?.["data-testid"] === "ai-dj-indicator");
    expect(indicator).toHaveLength(1);
    expect(indicator[0].props?.children).toBe("AI DJ Speaking...");
  });

  it("renders AI DJ button and invokes onPlayAiDj when clicked", () => {
    const onPlayAiDj = vi.fn();
    const tree = NowPlayingTab({
      ...baseProps,
      status: { ...baseProps.status!, ai_dj_active: false, ai_dj_speaking: false },
      onPlayAiDj,
    }) as unknown as MockNode;

    const btn = findNodes(tree, (n) => n.props?.["data-testid"] === "now-playing-ai-dj-btn");
    expect(btn).toHaveLength(1);
    expect(btn[0].props?.children).toBe("AI DJ");
    (btn[0].props?.onClick as () => void)();
    expect(onPlayAiDj).toHaveBeenCalledTimes(1);
  });
});

describe("NowPlayingTab Spotify Jam controls (JAM-01)", () => {
  it("renders 'Start / Share Spotify Jam' when jamSession is inactive and invokes onOpenJamModal", () => {
    const onOpenJamModal = vi.fn();
    const tree = NowPlayingTab({
      ...makeProps(),
      jamSession: { active: false },
      onOpenJamModal,
    }) as unknown as MockNode;

    const btn = findNodes(tree, (n) => n.props?.["data-testid"] === "now-playing-start-jam-btn");
    expect(btn).toHaveLength(1);
    const btnStyle = btn[0].props?.style as Record<string, unknown> | undefined;
    expect(btnStyle?.width).toBe("auto");
    expect(btnStyle?.flexShrink).toBe(0);
    (btn[0].props?.onClick as () => void)();
    expect(onOpenJamModal).toHaveBeenCalledTimes(1);
  });

  it("renders 'Jam Active' pill with guest count and 'End Jam' button when host", () => {
    const onOpenJamModal = vi.fn();
    const onEndJam = vi.fn();
    const tree = NowPlayingTab({
      ...makeProps(),
      jamSession: { active: true, guest_count: 3, is_host: true },
      onOpenJamModal,
      onEndJam,
    }) as unknown as MockNode;

    const pill = findNodes(tree, (n) => n.props?.["data-testid"] === "now-playing-jam-pill");
    expect(pill).toHaveLength(1);
    expect(JSON.stringify(pill[0])).toContain("Jam Active · 3");
    (pill[0].props?.onClick as () => void)();
    expect(onOpenJamModal).toHaveBeenCalledTimes(1);

    const endBtn = findNodes(tree, (n) => n.props?.["data-testid"] === "now-playing-end-jam-btn");
    expect(endBtn).toHaveLength(1);
    (endBtn[0].props?.onClick as () => void)();
    expect(onEndJam).toHaveBeenCalledTimes(1);
  });
});
