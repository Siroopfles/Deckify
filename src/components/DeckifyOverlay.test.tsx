import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock React JSX runtime
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

vi.mock("./common/DeckifyImage", () => ({
  DeckifyImage: (props: any) => ({
    type: "DeckifyImage",
    props,
  }),
}));

let stateSlots: any[] = [];
let stateIndex = 0;
let refSlots: any[] = [];
let refIndex = 0;
let effectSlots: Array<{
  effect: () => void | (() => void);
  deps?: any[];
  cleanup?: () => void;
}> = [];
let effectIndex = 0;
let triggerRerender: (() => void) | null = null;

vi.mock("react", () => ({
  useState: (initial: any) => {
    const idx = stateIndex++;
    if (stateSlots[idx] === undefined) {
      stateSlots[idx] = typeof initial === "function" ? initial() : initial;
    }
    const setState = (next: any) => {
      const val = typeof next === "function" ? next(stateSlots[idx]) : next;
      if (stateSlots[idx] !== val) {
        stateSlots[idx] = val;
        if (triggerRerender) {
          triggerRerender();
        }
      }
    };
    return [stateSlots[idx], setState];
  },
  useRef: (initial: any) => {
    const idx = refIndex++;
    if (refSlots[idx] === undefined) {
      refSlots[idx] = { current: initial };
    }
    return refSlots[idx];
  },
  useEffect: (effect: () => void | (() => void), deps?: any[]) => {
    const idx = effectIndex++;
    const prev = effectSlots[idx];
    let hasChanged = true;
    if (prev && prev.deps && deps) {
      hasChanged = deps.some((dep, i) => !Object.is(dep, prev.deps![i]));
    }
    if (hasChanged) {
      if (prev?.cleanup) {
        try {
          prev.cleanup();
        } catch {}
      }
      effectSlots[idx] = { effect, deps };
    }
  },
  useCallback: (fn: any) => fn,
  useMemo: (fn: any) => fn(),
}));

import { DeckifyOverlay, DeckifyOverlayProps } from "./DeckifyOverlay";
import { DeckifyImage } from "./common/DeckifyImage";

function resetHooks() {
  for (const entry of effectSlots) {
    if (entry?.cleanup) {
      try {
        entry.cleanup();
      } catch {}
    }
  }
  stateSlots = [];
  stateIndex = 0;
  refSlots = [];
  refIndex = 0;
  effectSlots = [];
  effectIndex = 0;
  triggerRerender = null;
}

function flushEffects() {
  for (let i = 0; i < effectSlots.length; i++) {
    const entry = effectSlots[i];
    if (entry && !entry.cleanup) {
      const res = entry.effect();
      if (typeof res === "function") {
        entry.cleanup = res;
      }
    }
  }
}

function render(initialProps: DeckifyOverlayProps) {
  resetHooks();
  let currentProps = { ...initialProps };
  let currentTree: any = null;

  triggerRerender = () => {
    stateIndex = 0;
    refIndex = 0;
    effectIndex = 0;
    currentTree = DeckifyOverlay(currentProps);
    flushEffects();
  };

  stateIndex = 0;
  refIndex = 0;
  effectIndex = 0;
  currentTree = DeckifyOverlay(currentProps);
  flushEffects();

  return {
    getTree: () => currentTree,
    rerender: (nextProps: Partial<DeckifyOverlayProps>) => {
      currentProps = { ...currentProps, ...nextProps };
      stateIndex = 0;
      refIndex = 0;
      effectIndex = 0;
      currentTree = DeckifyOverlay(currentProps);
      flushEffects();
      return currentTree;
    },
  };
}

function findNodes(
  tree: any,
  predicate: (node: any) => boolean,
  results: any[] = []
): any[] {
  if (!tree) return results;
  if (predicate(tree)) results.push(tree);
  if (tree.props && tree.props.children) {
    const children = Array.isArray(tree.props.children)
      ? tree.props.children
      : [tree.props.children];
    for (const child of children) {
      findNodes(child, predicate, results);
    }
  }
  return results;
}

function findText(tree: any): string {
  if (!tree) return "";
  if (typeof tree === "string" || typeof tree === "number") return String(tree);
  if (tree.props && tree.props.children) {
    const children = Array.isArray(tree.props.children)
      ? tree.props.children
      : [tree.props.children];
    return children.map(findText).join(" ");
  }
  return "";
}

describe("DeckifyOverlay Component", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    resetHooks();
    vi.useRealTimers();
  });

  describe("Non-blocking and Positioning (HUD-01)", () => {
    it("enforces pointer-events: none, position: fixed, and z-index 9999", () => {
      const { getTree } = render({
        track: { name: "Test Song", artist: "Test Artist" },
        visible: true,
        isPlaying: true,
      });

      const tree = getTree();
      expect(tree).not.toBeNull();
      expect(tree.props.style.pointerEvents).toBe("none");
      expect(tree.props.style.position).toBe("fixed");
      expect(tree.props.style.zIndex).toBe(9999);
      expect(tree.props.style.margin).toBe(16);
    });

    it("positions correctly in all 4 corners", () => {
      // top-right (default)
      const r1 = render({
        track: { name: "Song" },
        position: "top-right",
      });
      expect(r1.getTree().props.style.top).toBe(16);
      expect(r1.getTree().props.style.right).toBe(16);
      expect(r1.getTree().props.style.bottom).toBeUndefined();
      expect(r1.getTree().props.style.left).toBeUndefined();

      // top-left
      const r2 = render({
        track: { name: "Song" },
        position: "top-left",
      });
      expect(r2.getTree().props.style.top).toBe(16);
      expect(r2.getTree().props.style.left).toBe(16);
      expect(r2.getTree().props.style.bottom).toBeUndefined();
      expect(r2.getTree().props.style.right).toBeUndefined();

      // bottom-left
      const r3 = render({
        track: { name: "Song" },
        position: "bottom-left",
      });
      expect(r3.getTree().props.style.bottom).toBe(16);
      expect(r3.getTree().props.style.left).toBe(16);
      expect(r3.getTree().props.style.top).toBeUndefined();
      expect(r3.getTree().props.style.right).toBeUndefined();

      // bottom-right
      const r4 = render({
        track: { name: "Song" },
        position: "bottom-right",
      });
      expect(r4.getTree().props.style.bottom).toBe(16);
      expect(r4.getTree().props.style.right).toBe(16);
      expect(r4.getTree().props.style.top).toBeUndefined();
      expect(r4.getTree().props.style.left).toBeUndefined();
    });

    it("returns null when track is missing or has no name", () => {
      const r1 = render({ track: null });
      expect(r1.getTree()).toBeNull();

      const r2 = render({ track: { name: "" } });
      expect(r2.getTree()).toBeNull();
    });
  });

  describe("Artwork & Track Metadata (HUD-02)", () => {
    it("renders DeckifyImage when artwork_url or image_url is available", () => {
      const { getTree } = render({
        track: {
          name: "Cover Song",
          artwork_url: "https://i.scdn.co/image/abc1234",
        },
        isPlaying: true,
      });

      const images = findNodes(
        getTree(),
        (node) =>
          node.type === DeckifyImage ||
          node.type === "DeckifyImage" ||
          node.type?.name === "DeckifyImage"
      );
      expect(images.length).toBe(1);
      expect(images[0].props.src).toBe("https://i.scdn.co/image/abc1234");
      expect(images[0].props.width).toBe(36);
      expect(images[0].props.height).toBe(36);
    });

    it("renders FaMusic fallback icon when no artwork is provided", () => {
      const { getTree } = render({
        track: { name: "Acoustic Song", artist: "Folk" },
        isPlaying: true,
      });

      const images = findNodes(
        getTree(),
        (node) =>
          node.type === DeckifyImage ||
          node.type === "DeckifyImage" ||
          node.type?.name === "DeckifyImage"
      );
      expect(images.length).toBe(0);

      // FaMusic icon exists in children
      const text = findText(getTree());
      expect(text).toContain("Acoustic Song");
      expect(text).toContain("Folk");
    });

    it("truncates track titles longer than 45 characters with an ellipsis", () => {
      const longTitle =
        "This is an extraordinarily long track title that will definitely exceed forty five characters";
      const { getTree } = render({
        track: { name: longTitle, artist: "Test Artist" },
        isPlaying: true,
      });

      const text = findText(getTree());
      const expectedTruncated = `${longTitle.slice(0, 45)}...`;
      expect(text).toContain(expectedTruncated);
      expect(text).not.toContain(longTitle);
    });

    it("renders play indicator when playing and pause indicator when paused", () => {
      const rPlay = render({
        track: { name: "Playing Song" },
        isPlaying: true,
      });
      const playIcons = findNodes(
        rPlay.getTree(),
        (n) => n.props && n.props.color === "#1db954" && n.props.size === 9
      );
      expect(playIcons.length).toBe(1);

      const rPause = render({
        track: { name: "Paused Song" },
        isPlaying: false,
      });
      const pauseIcons = findNodes(
        rPause.getTree(),
        (n) => n.props && n.props.color === "#888" && n.props.size === 9
      );
      expect(pauseIcons.length).toBe(1);
    });
  });

  describe("Auto-Hide 6-Second Timer (HUD-01, D-01)", () => {
    it("fades out opacity after 6000ms when autoHide is true and playing", () => {
      const { getTree } = render({
        track: { name: "Autohide Song" },
        isPlaying: true,
        autoHide: true,
        visible: true,
      });

      expect(getTree().props.style.opacity).toBe(1);

      // Advance by 5999ms: still visible
      vi.advanceTimersByTime(5999);
      expect(getTree().props.style.opacity).toBe(1);

      // Advance 1ms (6000ms total): fades out to opacity 0
      vi.advanceTimersByTime(1);
      expect(getTree().props.style.opacity).toBe(0);
    });

    it("remains visible permanently when autoHide is false", () => {
      const { getTree } = render({
        track: { name: "Permanent Song" },
        isPlaying: true,
        autoHide: false,
        visible: true,
      });

      expect(getTree().props.style.opacity).toBe(1);
      vi.advanceTimersByTime(12000);
      expect(getTree().props.style.opacity).toBe(1);
    });

    it("resets the 6000ms timer when track changes while playing", () => {
      const { getTree, rerender } = render({
        track: { name: "First Song", track_id: "1" },
        isPlaying: true,
        autoHide: true,
        visible: true,
      });

      vi.advanceTimersByTime(4000);
      expect(getTree().props.style.opacity).toBe(1);

      // Track changes at 4000ms
      rerender({
        track: { name: "Second Song", track_id: "2" },
      });

      // Advance another 4000ms (total 8000ms from start, but 4000ms from reset): still visible
      vi.advanceTimersByTime(4000);
      expect(getTree().props.style.opacity).toBe(1);

      // Advance remaining 2000ms: fades out
      vi.advanceTimersByTime(2000);
      expect(getTree().props.style.opacity).toBe(0);
    });
  });

  describe("Pause Grace Period & Fade-Out (HUD-02, D-04)", () => {
    it("maintains visibility for 3500ms after pausing before fading out", () => {
      const { getTree, rerender } = render({
        track: { name: "Grace Song" },
        isPlaying: true,
        autoHide: false,
        visible: true,
      });

      expect(getTree().props.style.opacity).toBe(1);

      // Pause playback
      rerender({ isPlaying: false });

      // Immediately after pause: still visible (opacity 1) with pause icon
      expect(getTree().props.style.opacity).toBe(1);
      const pauseIcons = findNodes(
        getTree(),
        (n) => n.props && n.props.color === "#888" && n.props.size === 9
      );
      expect(pauseIcons.length).toBe(1);

      // Advance 3499ms: still visible
      vi.advanceTimersByTime(3499);
      expect(getTree().props.style.opacity).toBe(1);

      // Advance 1ms (3500ms total): fades out
      vi.advanceTimersByTime(1);
      expect(getTree().props.style.opacity).toBe(0);
    });

    it("cancels pause grace fade if playback resumes before 3500ms", () => {
      const { getTree, rerender } = render({
        track: { name: "Resume Song" },
        isPlaying: true,
        autoHide: false,
        visible: true,
      });

      // Pause
      rerender({ isPlaying: false });
      vi.advanceTimersByTime(2000);
      expect(getTree().props.style.opacity).toBe(1);

      // Resume playback
      rerender({ isPlaying: true });
      vi.advanceTimersByTime(2000); // would have exceeded 3500ms if not cancelled
      expect(getTree().props.style.opacity).toBe(1);
    });
  });

  describe("2px Progress Bar (HUD-02, D-03)", () => {
    it("renders 2px green progress bar when showProgress is true and durationMs > 0", () => {
      const { getTree } = render({
        track: { name: "Progress Song" },
        isPlaying: true,
        showProgress: true,
        positionMs: 30000,
        durationMs: 120000,
      });

      const bars = findNodes(
        getTree(),
        (n) => n.props && n.props["data-testid"] === "overlay-progress-bar"
      );
      expect(bars.length).toBe(1);
      expect(bars[0].props.style.height).toBe(2);

      const fill = bars[0].props.children;
      expect(fill.props.style.width).toBe("25%");
      expect(fill.props.style.background).toBe("#1db954");
    });

    it("omits progress bar when showProgress is false", () => {
      const { getTree } = render({
        track: { name: "No Progress Song" },
        isPlaying: true,
        showProgress: false,
        positionMs: 30000,
        durationMs: 120000,
      });

      const bars = findNodes(
        getTree(),
        (n) => n.props && n.props["data-testid"] === "overlay-progress-bar"
      );
      expect(bars.length).toBe(0);
    });

    it("omits progress bar when durationMs is 0", () => {
      const { getTree } = render({
        track: { name: "Zero Duration Song" },
        isPlaying: true,
        showProgress: true,
        positionMs: 0,
        durationMs: 0,
      });

      const bars = findNodes(
        getTree(),
        (n) => n.props && n.props["data-testid"] === "overlay-progress-bar"
      );
      expect(bars.length).toBe(0);
    });
  });
});
