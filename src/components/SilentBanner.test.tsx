import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@decky/api", () => ({
  callable: () => vi.fn().mockResolvedValue({ ok: true }),
}));

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

let stateSlots: any[] = [];
let stateIndex = 0;
let refSlots: any[] = [];
let refIndex = 0;
let effectSlots: Array<{
  effect: () => void | (() => void);
  deps?: any[];
  cleanup?: () => void;
  ran?: boolean;
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

import {
  SilentBanner,
  SilentBannerProps,
  BANNER_DURATION_MS,
  BANNER_FADE_START_MS,
  HUD_CLEARANCE_OFFSET_PX,
} from "./SilentBanner";
import { emitBanner, subscribeBanner, resetBannerBusForTests } from "../bannerBus";
import { syncThemeFromState, resetThemeBusForTest } from "../utils/themeBus";

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
    if (entry && !entry.ran) {
      entry.ran = true;
      const res = entry.effect();
      if (typeof res === "function") {
        entry.cleanup = res;
      }
    }
  }
}

function render(initialProps: SilentBannerProps) {
  resetHooks();
  let currentProps = { ...initialProps };
  let currentTree: any = null;

  triggerRerender = () => {
    stateIndex = 0;
    refIndex = 0;
    effectIndex = 0;
    currentTree = SilentBanner(currentProps);
    flushEffects();
  };

  stateIndex = 0;
  refIndex = 0;
  effectIndex = 0;
  currentTree = SilentBanner(currentProps);
  flushEffects();

  return {
    getTree: () => currentTree,
    rerender: (nextProps: Partial<SilentBannerProps>) => {
      currentProps = { ...currentProps, ...nextProps };
      stateIndex = 0;
      refIndex = 0;
      effectIndex = 0;
      currentTree = SilentBanner(currentProps);
      flushEffects();
      return currentTree;
    },
    unmount: () => {
      resetHooks();
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
      if (child && typeof child === "object") {
        findNodes(child, predicate, results);
      }
    }
  }
  return results;
}

function getAllText(tree: any): string[] {
  if (!tree) return [];
  if (typeof tree === "string" || typeof tree === "number") return [String(tree)];
  if (Array.isArray(tree)) return tree.flatMap(getAllText);
  if (tree.props && tree.props.children !== undefined) {
    return getAllText(tree.props.children);
  }
  return [];
}

describe("SilentBanner and bannerBus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetHooks();
    resetBannerBusForTests();
    resetThemeBusForTest();
  });

  afterEach(() => {
    resetHooks();
    resetBannerBusForTests();
    resetThemeBusForTest();
    vi.useRealTimers();
  });

  it("exports expected timing and clearance constants", () => {
    expect(BANNER_DURATION_MS).toBe(3500);
    expect(BANNER_FADE_START_MS).toBe(3250);
    expect(HUD_CLEARANCE_OFFSET_PX).toBe(140);
  });

  it("returns null when idle and stays null when enabled is false even after emitBanner", () => {
    const { getTree, rerender } = render({ enabled: true });
    expect(getTree()).toBeNull();

    rerender({ enabled: false });
    emitBanner("♥ Liked: Track");
    expect(getTree()).toBeNull();

    // Turning enabled back on does not resurrect ignored events, but accepts new ones
    rerender({ enabled: true });
    expect(getTree()).toBeNull();

    emitBanner("⏭ Next");
    expect(getTree()).not.toBeNull();

    // Disabling while visible dismisses immediately
    rerender({ enabled: false });
    expect(getTree()).toBeNull();
  });

  it("renders non-interactive fixed banner when enabled=true and hudVisible=false", () => {
    const { getTree } = render({ enabled: true, hudVisible: false });
    emitBanner({ text: "▶ Pinned 1/4: Focus Mix", tone: "accent" });

    const tree = getTree();
    expect(tree).not.toBeNull();
    expect(tree.props["data-testid"]).toBe("deckify-silent-banner");
    expect(tree.props.tabIndex).toBeUndefined();
    expect(tree.props.onClick).toBeUndefined();
    expect(tree.props.style).toMatchObject({
      position: "fixed",
      zIndex: 10000,
      pointerEvents: "none",
      minWidth: 240,
      maxWidth: "min(420px, 40vw)",
      background: "rgba(18, 18, 18, 0.92)",
      borderRadius: 8,
      padding: "12px 16px",
    });

    const focusables = findNodes(
      tree,
      (n) => n.type === "Focusable" || n.props?.tabIndex !== undefined || n.props?.onClick !== undefined
    );
    expect(focusables).toHaveLength(0);
  });

  it("auto-fades at 3250ms and dismisses at exactly 3500ms (D-03)", () => {
    const { getTree } = render({ enabled: true });
    emitBanner("Track One");

    expect(getTree().props.style.opacity).toBe(1);
    expect(getTree().props.style.transition).toBe("opacity 150ms ease-out");

    vi.advanceTimersByTime(3249);
    expect(getTree()).not.toBeNull();
    expect(getTree().props.style.opacity).toBe(1);

    vi.advanceTimersByTime(1);
    expect(getTree()).not.toBeNull();
    expect(getTree().props.style.opacity).toBe(0);
    expect(getTree().props.style.transition).toBe("opacity 250ms ease-in");

    vi.advanceTimersByTime(249);
    expect(getTree()).not.toBeNull();
    expect(getTree().props.style.opacity).toBe(0);

    vi.advanceTimersByTime(1);
    expect(getTree()).toBeNull();
  });

  it("replaces active banner immediately with latest-wins semantics and resets 3500ms timer", () => {
    const { getTree } = render({ enabled: true });
    const first = emitBanner("Banner A");
    expect(getTree().props["data-banner-id"]).toBe(first.id);

    vi.advanceTimersByTime(2500);
    expect(getTree().props.style.opacity).toBe(1);

    const second = emitBanner("Banner B");
    expect(second.id).toBeGreaterThan(first.id);
    expect(getTree().props["data-banner-id"]).toBe(second.id);
    expect(getAllText(getTree())).toContain("Banner B");
    expect(getAllText(getTree())).not.toContain("Banner A");
    expect(getTree().props.style.opacity).toBe(1);

    // Passing original 3500ms deadline (only +1000ms for Banner B) must NOT dismiss Banner B
    vi.advanceTimersByTime(1500);
    expect(getTree()).not.toBeNull();
    expect(getTree().props["data-banner-id"]).toBe(second.id);
    expect(getTree().props.style.opacity).toBe(1);

    vi.advanceTimersByTime(1999);
    expect(getTree()).not.toBeNull();
    expect(getTree().props.style.opacity).toBe(0);

    vi.advanceTimersByTime(1);
    expect(getTree()).toBeNull();
  });

  it("positions across all 4 corners, normalizes underscores, and adds 140px offset only on same-corner HUD collision (D-02)", () => {
    const { getTree, rerender } = render({
      enabled: true,
      position: "top-left",
      hudVisible: false,
    });
    emitBanner("Corner Test");

    expect(getTree().props.style).toMatchObject({ top: 24, left: 24 });
    expect(getTree().props.style.bottom).toBeUndefined();
    expect(getTree().props.style.right).toBeUndefined();

    rerender({ position: "top_right", hudVisible: false });
    expect(getTree().props.style).toMatchObject({ top: 24, right: 24 });

    rerender({ position: "bottom_left", hudVisible: false });
    expect(getTree().props.style).toMatchObject({ bottom: 24, left: 24 });

    rerender({ position: "bottom-right", hudVisible: false });
    expect(getTree().props.style).toMatchObject({ bottom: 24, right: 24 });

    // Same corner with HUD visible -> 140px vertical clearance offset
    rerender({ position: "top_right", hudVisible: true, hudPosition: "top-right" });
    expect(getTree().props.style).toMatchObject({ top: 140, right: 24 });

    rerender({ position: "bottom-left", hudVisible: true, hudPosition: "bottom_left" });
    expect(getTree().props.style).toMatchObject({ bottom: 140, left: 24 });

    // Different corner with HUD visible -> stays at 24px inset
    rerender({ position: "top-right", hudVisible: true, hudPosition: "bottom-left" });
    expect(getTree().props.style).toMatchObject({ top: 24, right: 24 });

    // Unknown position falls back to top-right
    rerender({ position: "center", hudVisible: false });
    expect(getTree().props.style).toMatchObject({ top: 24, right: 24 });
  });

  it("renders accent, error, and neutral left border rules accurately", () => {
    const { getTree } = render({ enabled: true });

    emitBanner({ text: "Accent Banner", tone: "accent" });
    expect(getTree().props.style.borderLeft).toBe("3px solid var(--deckify-accent, #1DB954)");

    emitBanner({ text: "Error Banner", tone: "error" });
    expect(getTree().props.style.borderLeft).toBe("3px solid #E53935");

    emitBanner({ text: "Neutral Banner", tone: "neutral" });
    expect(getTree().props.style.borderLeft).toBe("3px solid rgba(255, 255, 255, 0.35)");
  });

  it("renders 40x40 img for data: and loopback URLs while dropping external https:// CDN URLs for Steam CEF CSP", () => {
    const { getTree } = render({ enabled: true });

    emitBanner({
      text: "Data Cover Song",
      imageUrl: "data:image/jpeg;base64,ABC123",
    });
    let imgs = findNodes(getTree(), (n) => n.type === "img");
    expect(imgs).toHaveLength(1);
    expect(imgs[0].props).toMatchObject({
      src: "data:image/jpeg;base64,ABC123",
      width: 40,
      height: 40,
    });

    emitBanner({
      text: "Loopback Cover Song",
      imageUrl: "http://127.0.0.1:39281/art.jpg",
    });
    imgs = findNodes(getTree(), (n) => n.type === "img");
    expect(imgs).toHaveLength(1);
    expect(imgs[0].props.src).toBe("http://127.0.0.1:39281/art.jpg");

    emitBanner({
      text: "External CDN Song",
      imageUrl: "https://i.scdn.co/image/blocked",
    });
    imgs = findNodes(getTree(), (n) => n.type === "img");
    expect(imgs).toHaveLength(0);
  });

  it("collapses omitted secondaryText gracefully and enforces single-line ellipsis clamping on long text", () => {
    const { getTree } = render({ enabled: true });

    emitBanner({ text: "♥ Liked: Single Line" });
    const imgs = findNodes(getTree(), (n) => n.type === "img");
    expect(imgs).toHaveLength(0);
    expect(getAllText(getTree())).toEqual(["♥ Liked: Single Line"]);

    emitBanner({
      text: "A Very Long Track Title That Must Truncate Cleanly With Ellipsis",
      secondaryText: "An Equally Long Artist Name That Should Not Overflow The Banner",
    });
    expect(getAllText(getTree())).toEqual([
      "A Very Long Track Title That Must Truncate Cleanly With Ellipsis",
      "An Equally Long Artist Name That Should Not Overflow The Banner",
    ]);

    const ellipsisNodes = findNodes(
      getTree(),
      (n) => n.props?.style?.textOverflow === "ellipsis"
    );
    expect(ellipsisNodes).toHaveLength(2);
    for (const node of ellipsisNodes) {
      expect(node.props.style).toMatchObject({
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      });
    }
    const textWrap = findNodes(getTree(), (n) => n.props?.style?.minWidth === 0);
    expect(textWrap.length).toBeGreaterThanOrEqual(1);
  });

  it("supports bannerBus subscription lifecycle and monotonic id reset for tests", () => {
    const received: number[] = [];
    const unsub = subscribeBanner((b) => received.push(b.id));

    const first = emitBanner("First");
    const second = emitBanner({ text: "Second", tone: "neutral" });
    expect(first.id).toBe(1);
    expect(second.id).toBe(2);
    expect(second.tone).toBe("neutral");
    expect(received).toEqual([1, 2]);

    unsub();
    emitBanner("Third");
    expect(received).toEqual([1, 2]);

    resetBannerBusForTests();
    const afterReset = emitBanner("After Reset");
    expect(afterReset.id).toBe(1);
  });

  it("cleans up pending timers on unmount", () => {
    const { getTree, unmount } = render({ enabled: true });
    emitBanner("Unmount Test");
    expect(getTree()).not.toBeNull();

    unmount();
    vi.advanceTimersByTime(4000);
    expect(stateSlots).toEqual([]);
  });

  it("spreads --deckify-accent, --deckify-accent-rgb, and --deckify-accent-transition from themeBus onto root style (G-21-1)", async () => {
    await syncThemeFromState({ accentTheme: "steamos_blue" });
    const { getTree } = render({ enabled: true });
    emitBanner({ text: "Theme Synced", tone: "accent" });

    const tree = getTree();
    expect(tree).not.toBeNull();
    expect(tree.props.style).toMatchObject({
      "--deckify-accent": "#1A9FFF",
      "--deckify-accent-rgb": "26, 159, 255",
      "--deckify-accent-transition": expect.any(String),
    });

    await syncThemeFromState({ accentTheme: "spotify_green", animationsSuspended: true });
    const updatedTree = getTree();
    expect(updatedTree.props.style).toMatchObject({
      "--deckify-accent": "#1DB954",
      "--deckify-accent-rgb": "29, 185, 84",
      "--deckify-accent-transition": "none",
    });
  });
});
