import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockGetDiscoveryFeed = vi.fn();

vi.mock("@decky/api", () => ({
  callable: (name: string) => {
    if (name === "get_discovery_feed") return (...args: any[]) => mockGetDiscoveryFeed(...args);
    return vi.fn().mockResolvedValue({ ok: true });
  },
}));

vi.mock("@decky/ui", () => ({
  Focusable: ({ children, ...props }: any) => ({ type: "Focusable", props: { children, ...props } }),
}));

vi.mock("../common/DeckifyImage", () => ({
  DeckifyImage: (props: any) => ({ type: "DeckifyImage", props }),
}));

vi.mock("react-icons/fa", () => ({
  FaSync: () => ({ type: "FaSync" }),
  FaLock: () => ({ type: "FaLock" }),
  FaExclamationTriangle: () => ({ type: "FaExclamationTriangle" }),
  FaCompass: () => ({ type: "FaCompass" }),
}));

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
  useEffect: (fn: any) => fn(),
  useCallback: (fn: any) => fn,
  useRef: (init: any) => ({ current: init }),
  useMemo: (fn: any) => fn(),
}));

import { DiscoveryTab, getGreetingForHour } from "./DiscoveryTab";

function findNodes(node: any, pred: (n: any) => boolean): any[] {
  const out: any[] = [];
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const item of node) out.push(...findNodes(item, pred));
    return out;
  }
  if (pred(node)) out.push(node);
  if (node.props?.children) out.push(...findNodes(node.props.children, pred));
  return out;
}

describe("DiscoveryTab", () => {
  beforeEach(() => {
    stateValues = [];
    stateIdx = 0;
    mockGetDiscoveryFeed.mockReset().mockResolvedValue({
      ok: true,
      time_range: "medium_term",
      made_for_you: [],
      top_tracks: [],
      top_artists: [],
      new_releases: [],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("computes time-of-day greeting for morning, afternoon, and evening hours", () => {
    expect(getGreetingForHour(5)).toBe("Good morning");
    expect(getGreetingForHour(11)).toBe("Good morning");
    expect(getGreetingForHour(12)).toBe("Good afternoon");
    expect(getGreetingForHour(17)).toBe("Good afternoon");
    expect(getGreetingForHour(18)).toBe("Good evening");
    expect(getGreetingForHour(23)).toBe("Good evening");
    expect(getGreetingForHour(0)).toBe("Good evening");
    expect(getGreetingForHour(4)).toBe("Good evening");
  });

  it("fetches discovery feed on mount and renders greeting + Refresh Feed button", async () => {
    const props = {
      onPlayTrack: vi.fn(),
      onOpenPlaylist: vi.fn(),
      onOpenAlbum: vi.fn(),
      onOpenArtist: vi.fn(),
      onOpenActions: vi.fn(),
      onFocusTrack: vi.fn(),
      onFocusCollection: vi.fn(),
    };
    const tree = DiscoveryTab(props);
    await Promise.resolve();
    await Promise.resolve();

    expect(mockGetDiscoveryFeed).toHaveBeenCalledWith("medium_term", false);

    const greetingNode = findNodes(tree, (n) => n.props?.["data-testid"] === "discovery-greeting")[0];
    expect(greetingNode).toBeDefined();
    expect(["Good morning", "Good afternoon", "Good evening"]).toContain(greetingNode.props.children);

    const refreshBtn = findNodes(tree, (n) => n.props?.["data-testid"] === "discovery-refresh-btn")[0];
    expect(refreshBtn).toBeDefined();
  });
});
