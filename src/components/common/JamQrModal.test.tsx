import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@decky/ui", () => ({
  Focusable: ({ children, ...props }: Record<string, unknown>) => ({
    type: "Focusable",
    props: { children, ...props },
  }),
  DialogButton: ({ children, ...props }: Record<string, unknown>) => ({
    type: "DialogButton",
    props: { children, ...props },
  }),
}));

vi.mock("./InteractiveRow", () => ({
  InteractiveRow: ({ children, ...props }: Record<string, unknown>) => ({
    type: "InteractiveRow",
    props: { children, ...props },
  }),
}));

vi.mock("qrcode.react", () => ({
  QRCodeSVG: (props: Record<string, unknown>) => ({
    type: "QRCodeSVG",
    props,
  }),
}));

vi.mock("react-icons/fa", () => {
  const Icon = () => ({ type: "Icon", props: {} });
  return {
    FaUsers: Icon,
    FaSignOutAlt: Icon,
    FaStopCircle: Icon,
    FaTimes: Icon,
    FaQrcode: Icon,
    FaExchangeAlt: Icon,
  };
});

vi.mock("react/jsx-dev-runtime", () => ({
  Fragment: "Fragment",
  jsxDEV: (type: unknown, props: Record<string, unknown>, key: unknown) => ({
    type,
    props: { ...props, ...(key !== undefined ? { key } : {}) },
  }),
}));

vi.mock("react/jsx-runtime", () => ({
  Fragment: "Fragment",
  jsx: (type: unknown, props: Record<string, unknown>, key: unknown) => ({
    type,
    props: { ...props, ...(key !== undefined ? { key } : {}) },
  }),
  jsxs: (type: unknown, props: Record<string, unknown>, key: unknown) => ({
    type,
    props: { ...props, ...(key !== undefined ? { key } : {}) },
  }),
}));

let refValues: Array<{ current: unknown }> = [];
let refIdx = 0;
let effectCleanups: Array<() => void> = [];

vi.mock("react", () => ({
  useEffect: (fn: () => void | (() => void)) => {
    const cleanup = fn();
    if (typeof cleanup === "function") effectCleanups.push(cleanup);
  },
  useRef: (init: unknown) => {
    const idx = refIdx++;
    if (!(idx in refValues)) {
      refValues[idx] = { current: init };
    }
    return refValues[idx];
  },
}));

import { DialogButton, Focusable } from "@decky/ui";
import { QRCodeSVG } from "qrcode.react";
import { InteractiveRow } from "./InteractiveRow";
import {
  buildSpotifyDeepLink,
  JamQrCard,
  JamQrModal,
  JamQrCardProps,
  JamQrModalProps,
} from "./JamQrModal";

interface VNode {
  type: unknown;
  props: Record<string, unknown> & { children?: unknown };
}

function findNodes(
  tree: unknown,
  predicate: (node: VNode) => boolean,
  results: VNode[] = [],
): VNode[] {
  if (!tree || typeof tree !== "object") return results;
  if (Array.isArray(tree)) {
    for (const child of tree) findNodes(child, predicate, results);
    return results;
  }
  const node = tree as VNode;
  if (predicate(node)) results.push(node);
  if (node.props && node.props.children !== undefined) {
    findNodes(node.props.children, predicate, results);
  }
  return results;
}

function collectText(tree: unknown): string {
  if (tree === null || tree === undefined || typeof tree === "boolean") return "";
  if (typeof tree === "string" || typeof tree === "number") return String(tree);
  if (Array.isArray(tree)) return tree.map(collectText).join("");
  if (typeof tree === "object") {
    const node = tree as VNode;
    if (node.props && node.props.children !== undefined) {
      return collectText(node.props.children);
    }
  }
  return "";
}

function makeCardProps(overrides: Partial<JamQrCardProps> = {}): JamQrCardProps {
  return {
    audioBackend: "spotify_client",
    jamSession: {
      active: true,
      join_url: "https://spotify.link/jam123",
      guest_count: 3,
      is_host: true,
    },
    shareUri: "spotify:track:abc123",
    shareLabel: "Test Track",
    loading: false,
    onSwitchAndStartJam: vi.fn(),
    ...overrides,
  };
}

function makeModalProps(overrides: Partial<JamQrModalProps> = {}): JamQrModalProps {
  return {
    ...makeCardProps(),
    onClose: vi.fn(),
    onEndJam: vi.fn(),
    onLeaveJam: vi.fn(),
    ...overrides,
  };
}

describe("buildSpotifyDeepLink", () => {
  it("converts valid spotify track, playlist, album, episode, and show URIs", () => {
    expect(buildSpotifyDeepLink("spotify:track:123")).toBe("https://open.spotify.com/track/123");
    expect(buildSpotifyDeepLink("spotify:playlist:37i9dQZF1DXcBWIGoYBM5M")).toBe(
      "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M",
    );
    expect(buildSpotifyDeepLink("spotify:album:4aawyAB9vmqN3uQ7FjRGTy")).toBe(
      "https://open.spotify.com/album/4aawyAB9vmqN3uQ7FjRGTy",
    );
    expect(buildSpotifyDeepLink("spotify:episode:5Xt5DXGzch68nYYamXrNxZ")).toBe(
      "https://open.spotify.com/episode/5Xt5DXGzch68nYYamXrNxZ",
    );
    expect(buildSpotifyDeepLink("spotify:show:4rOoJ6Egrf8K2IrywzwOMk")).toBe(
      "https://open.spotify.com/show/4rOoJ6Egrf8K2IrywzwOMk",
    );
  });

  it("returns empty string on null, empty, or malformed URIs (T-28-05)", () => {
    expect(buildSpotifyDeepLink(null)).toBe("");
    expect(buildSpotifyDeepLink(undefined)).toBe("");
    expect(buildSpotifyDeepLink("")).toBe("");
    expect(buildSpotifyDeepLink("https://open.spotify.com/track/123")).toBe("");
    expect(buildSpotifyDeepLink("spotify:user:evil")).toBe("");
    expect(buildSpotifyDeepLink("spotify:track:../evil")).toBe("");
    expect(buildSpotifyDeepLink("javascript:alert(1)")).toBe("");
  });
});

describe("JamQrCard", () => {
  it("renders QRCodeSVG inside a solid #FFFFFF quiet-zone container when join_url is provided", () => {
    const tree = JamQrCard(makeCardProps());
    const qrNodes = findNodes(tree, (n) => n.type === QRCodeSVG);
    expect(qrNodes).toHaveLength(1);
    expect(qrNodes[0].props).toMatchObject({
      value: "https://spotify.link/jam123",
      size: 180,
      bgColor: "#FFFFFF",
      fgColor: "#000000",
      level: "M",
    });

    const quietZones = findNodes(
      tree,
      (n) =>
        n.type === "div" &&
        (n.props.style as Record<string, unknown> | undefined)?.background === "#FFFFFF",
    );
    expect(quietZones).toHaveLength(1);
    expect(quietZones[0].props.style).toMatchObject({
      background: "#FFFFFF",
      padding: 16,
      borderRadius: 12,
    });

    const fullText = collectText(tree);
    expect(fullText).toContain("https://spotify.link/jam123");
    expect(fullText).toContain("3");
  });

  it("handles empty/null join_url and missing shareUri gracefully without throwing", () => {
    const loadingTree = JamQrCard(
      makeCardProps({
        jamSession: { active: false, join_url: null },
        shareUri: null,
        loading: true,
      }),
    );
    expect(findNodes(loadingTree, (n) => n.type === QRCodeSVG)).toHaveLength(0);
    expect(collectText(loadingTree).toLowerCase()).toContain("loading");

    const emptyTree = JamQrCard(
      makeCardProps({
        jamSession: null,
        shareUri: null,
        loading: false,
      }),
    );
    expect(findNodes(emptyTree, (n) => n.type === QRCodeSVG)).toHaveLength(0);
    expect(collectText(emptyTree).length).toBeGreaterThan(0);
  });

  it("renders deep-link share QR, librespot note, and 1-click Switch CTA when audioBackend !== spotify_client", () => {
    const onSwitchAndStartJam = vi.fn();
    const tree = JamQrCard(
      makeCardProps({
        audioBackend: "librespot",
        jamSession: null,
        shareUri: "spotify:track:xyz789",
        onSwitchAndStartJam,
      }),
    );

    const qrNodes = findNodes(tree, (n) => n.type === QRCodeSVG);
    expect(qrNodes).toHaveLength(1);
    expect(qrNodes[0].props.value).toBe("https://open.spotify.com/track/xyz789");

    const text = collectText(tree);
    expect(text).toContain(
      "Playback share link — switch to Official Spotify Client to host a live Spotify Jam.",
    );

    const buttons = findNodes(tree, (n) => n.type === DialogButton);
    expect(buttons).toHaveLength(1);
    expect(collectText(buttons[0])).toContain("Switch to Spotify Client & Start Jam");
    expect(buttons[0].props.style).toMatchObject({ width: "auto", flexShrink: 0 });
    (buttons[0].props.onClick as () => void)();
    expect(onSwitchAndStartJam).toHaveBeenCalledTimes(1);
  });

  it("never falls back to track deep-link when audioBackend=spotify_client and join_url is missing, and renders Retry Jam", () => {
    const onRetryJam = vi.fn();
    const tree = JamQrCard(
      makeCardProps({
        audioBackend: "spotify_client",
        jamSession: { active: true, join_url: null, is_host: true },
        shareUri: "spotify:track:xyz789",
        loading: false,
        onRetryJam,
      }),
    );

    expect(findNodes(tree, (n) => n.type === QRCodeSVG)).toHaveLength(0);
    const text = collectText(tree);
    expect(text).not.toContain("open.spotify.com/track");
    expect(text).toContain("Could not retrieve Spotify Jam invite link");

    const retryRows = findNodes(
      tree,
      (n) => n.type === InteractiveRow && collectText(n).includes("Retry Jam"),
    );
    expect(retryRows).toHaveLength(1);
    (retryRows[0].props.onClick as () => void)();
    expect(onRetryJam).toHaveBeenCalledTimes(1);
  });
});

describe("JamQrModal focus & controls", () => {
  let rafQueue: Array<{ id: number; cb: FrameRequestCallback }>;
  let nextRafId: number;
  let origDoc: unknown;
  let origRaf: unknown;
  let origCancelRaf: unknown;

  beforeEach(() => {
    refValues = [];
    refIdx = 0;
    effectCleanups = [];
    rafQueue = [];
    nextRafId = 1;

    origDoc = (globalThis as Record<string, unknown>).document;
    origRaf = (globalThis as Record<string, unknown>).requestAnimationFrame;
    origCancelRaf = (globalThis as Record<string, unknown>).cancelAnimationFrame;

    (globalThis as Record<string, unknown>).document = { activeElement: null };
    (globalThis as Record<string, unknown>).requestAnimationFrame = vi.fn(
      (cb: FrameRequestCallback) => {
        const id = nextRafId++;
        rafQueue.push({ id, cb });
        return id;
      },
    );
    (globalThis as Record<string, unknown>).cancelAnimationFrame = vi.fn((id: number) => {
      rafQueue = rafQueue.filter((item) => item.id !== id);
    });
  });

  afterEach(() => {
    (globalThis as Record<string, unknown>).document = origDoc;
    (globalThis as Record<string, unknown>).requestAnimationFrame = origRaf;
    (globalThis as Record<string, unknown>).cancelAnimationFrame = origCancelRaf;
  });

  it("renders End Jam for host, Close row, and handles onCancelButton", () => {
    const onClose = vi.fn();
    const onEndJam = vi.fn();
    const hostTree = JamQrModal(
      makeModalProps({
        onClose,
        onEndJam,
        jamSession: { active: true, join_url: "https://spotify.link/jam123", is_host: true },
      }),
    );

    const hostRows = findNodes(hostTree, (n) => n.type === InteractiveRow);
    const hostLabels = hostRows.map((r) => collectText(r));
    expect(hostLabels.some((l) => l.includes("End Jam"))).toBe(true);
    expect(hostLabels.some((l) => l.includes("Leave Jam"))).toBe(false);
    expect(hostLabels.some((l) => l.includes("Close"))).toBe(true);

    const endRow = hostRows.find((r) => collectText(r).includes("End Jam"))!;
    expect(endRow.props.style).toMatchObject({ color: "#FF5555" });
    (endRow.props.onClick as () => void)();
    expect(onEndJam).toHaveBeenCalledTimes(1);

    const focusables = findNodes(hostTree, (n) => n.type === Focusable);
    expect(focusables.some((f) => f.props.onCancelButton === onClose)).toBe(true);
  });

  it("renders Leave Jam for guest", () => {
    const onLeaveJam = vi.fn();
    const guestTree = JamQrModal(
      makeModalProps({
        onLeaveJam,
        jamSession: { active: true, join_url: "https://spotify.link/jam123", is_host: false },
      }),
    );
    const guestRows = findNodes(guestTree, (n) => n.type === InteractiveRow);
    const guestLabels = guestRows.map((r) => collectText(r));
    expect(guestLabels.some((l) => l.includes("Leave Jam"))).toBe(true);
    expect(guestLabels.some((l) => l.includes("End Jam"))).toBe(false);
    const leaveRow = guestRows.find((r) => collectText(r).includes("Leave Jam"))!;
    (leaveRow.props.onClick as () => void)();
    expect(onLeaveJam).toHaveBeenCalledTimes(1);
  });
});

describe("JamQrModal focus restoration", () => {
  let rafQueue: Array<{ id: number; cb: FrameRequestCallback }>;
  let nextRafId: number;
  let origDoc: unknown;
  let origRaf: unknown;
  let origCancelRaf: unknown;

  beforeEach(() => {
    refValues = [];
    refIdx = 0;
    effectCleanups = [];
    rafQueue = [];
    nextRafId = 1;
    origDoc = (globalThis as Record<string, unknown>).document;
    origRaf = (globalThis as Record<string, unknown>).requestAnimationFrame;
    origCancelRaf = (globalThis as Record<string, unknown>).cancelAnimationFrame;
    (globalThis as Record<string, unknown>).document = { activeElement: null };
    (globalThis as Record<string, unknown>).requestAnimationFrame = vi.fn((cb: FrameRequestCallback) => {
      const id = nextRafId++;
      rafQueue.push({ id, cb });
      return id;
    });
    (globalThis as Record<string, unknown>).cancelAnimationFrame = vi.fn((id: number) => {
      rafQueue = rafQueue.filter((item) => item.id !== id);
    });
  });

  afterEach(() => {
    (globalThis as Record<string, unknown>).document = origDoc;
    (globalThis as Record<string, unknown>).requestAnimationFrame = origRaf;
    (globalThis as Record<string, unknown>).cancelAnimationFrame = origCancelRaf;
  });

  it("captures previousFocusRef on mount, focuses [tabindex=0] via rAF, and restores focus on unmount", () => {
    const prevEl = { focus: vi.fn() };
    const firstTarget = { focus: vi.fn() };
    (globalThis as Record<string, unknown>).document = { activeElement: prevEl };

    JamQrModal(makeModalProps());

    refValues[0].current = {
      querySelector: vi.fn((selector: string) => (selector === '[tabindex="0"]' ? firstTarget : null)),
    };

    expect(rafQueue).toHaveLength(1);
    rafQueue[0].cb(0);
    expect(firstTarget.focus).toHaveBeenCalledTimes(1);

    expect(effectCleanups).toHaveLength(1);
    effectCleanups[0]();
    expect(prevEl.focus).toHaveBeenCalledTimes(1);
  });
});
