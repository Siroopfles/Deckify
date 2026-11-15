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

import { DiscoveryTab, DiscoveryTabProps, getGreetingForHour } from "./DiscoveryTab";
import { DeckifyImage } from "../common/DeckifyImage";

function expandTree(node: any): any {
  if (!node || typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map(expandTree);
  if (typeof node.type === "function" && node.type !== DeckifyImage) {
    // Give each child component its own isolated state slot so DiscoveryTab's stateValues[0..3] stay untouched
    const savedStateIdx = stateIdx;
    stateIdx = 100;
    const rendered = node.type(node.props);
    stateIdx = savedStateIdx;
    return expandTree(rendered);
  }
  if (node.props?.children !== undefined) {
    return {
      ...node,
      props: {
        ...node.props,
        children: expandTree(node.props.children),
      },
    };
  }
  return node;
}

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

function textOf(node: any): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (typeof node === "object" && node.props?.children !== undefined) {
    return textOf(node.props.children);
  }
  return "";
}

function makeProps(overrides: Partial<DiscoveryTabProps> = {}): DiscoveryTabProps {
  return {
    onPlayTrack: vi.fn(),
    onOpenPlaylist: vi.fn(),
    onOpenAlbum: vi.fn(),
    onOpenArtist: vi.fn(),
    onOpenActions: vi.fn(),
    onFocusTrack: vi.fn(),
    onFocusCollection: vi.fn(),
    onReauthenticate: vi.fn(),
    ...overrides,
  };
}

function renderWithFeed(feed: any, loading = false, propsOverrides: Partial<DiscoveryTabProps> = {}) {
  const props = makeProps(propsOverrides);
  // First render initializes hooks
  DiscoveryTab(props);
  // Set feed and loading in state (we'll keep state indices deterministic:
  // 0: timeRange, 1: feed, 2: loading, 3: refreshFocused, 4: reauthFocused, 5: emptyRefreshFocused)
  stateValues[1] = feed;
  stateValues[2] = loading;
  stateIdx = 0;
  return { tree: expandTree(DiscoveryTab(props)), props };
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

  it("renders time-range pills (4 Weeks / 6 Months / All Time), defaults to 6 Months (#1DB954), and supports Refresh Feed cache bypass", async () => {
    const { tree, props } = renderWithFeed(
      {
        ok: true,
        time_range: "medium_term",
        made_for_you: [{ id: "mix-1", name: "Daily Mix 1", uri: "spotify:playlist:mix-1" }],
        top_tracks: [],
        top_artists: [],
        new_releases: [],
      },
      false
    );

    const pillBar = findNodes(tree, (n) => n.props?.["data-testid"] === "discovery-time-range-bar")[0];
    expect(pillBar).toBeDefined();
    expect(pillBar.props["flow-children"]).toBe("horizontal");

    const pill4w = findNodes(pillBar, (n) => n.props?.["data-testid"] === "discovery-pill-short_term")[0];
    const pill6m = findNodes(pillBar, (n) => n.props?.["data-testid"] === "discovery-pill-medium_term")[0];
    const pillAll = findNodes(pillBar, (n) => n.props?.["data-testid"] === "discovery-pill-long_term")[0];

    expect(textOf(pill4w)).toBe("4 Weeks");
    expect(textOf(pill6m)).toBe("6 Months");
    expect(textOf(pillAll)).toBe("All Time");
    expect(pill6m.props.style.background).toBe("#1DB954");
    expect(pill4w.props.style.background).toBe("#1C1C1C");

    // Clicking 4 Weeks updates timeRange and fetches short_term without force_refresh
    mockGetDiscoveryFeed.mockClear();
    pill4w.props.onClick();
    expect(stateValues[0]).toBe("short_term");
    expect(props.onFocusTrack).toHaveBeenCalledWith(null);
    expect(props.onFocusCollection).toHaveBeenCalledWith(null);

    // Re-render so effect runs with short_term
    stateIdx = 0;
    DiscoveryTab(props);
    expect(mockGetDiscoveryFeed).toHaveBeenCalledWith("short_term", false);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // Re-render after promise resolves (loading=false) and click Refresh Feed
    mockGetDiscoveryFeed.mockClear();
    stateIdx = 0;
    const updatedTree = expandTree(DiscoveryTab(props));
    await Promise.resolve();
    const refreshBtn = findNodes(updatedTree, (n) => n.props?.["data-testid"] === "discovery-refresh-btn")[0];
    refreshBtn.props.onClick();
    expect(mockGetDiscoveryFeed).toHaveBeenCalledWith("short_term", true);

    // While loading=true, duplicate clicks on Refresh Feed are ignored
    const { tree: loadingTree } = renderWithFeed(null, true);
    mockGetDiscoveryFeed.mockClear();
    const loadingRefreshBtn = findNodes(
      loadingTree,
      (n) => n.props?.["data-testid"] === "discovery-refresh-btn"
    )[0];
    loadingRefreshBtn.props.onClick();
    expect(mockGetDiscoveryFeed).not.toHaveBeenCalled();
  });

  it("renders 4 horizontal carousels in strict order with 128x128 DeckifyImage cards and Jump Back In fallback", () => {
    const feed = {
      ok: true,
      time_range: "medium_term",
      made_for_you_fallback: true,
      made_for_you: [
        { id: "mix-1", name: "Synthwave Mix", uri: "spotify:playlist:mix-1", image_url: "https://i.scdn.co/mix1", subtitle: "Playlist" },
      ],
      top_tracks: [
        { id: "trk-1", name: "Nightcall", artist: "Kavinsky", uri: "spotify:track:trk-1", image_url: "https://i.scdn.co/trk1" },
      ],
      top_artists: [
        { id: "art-1", name: "Daft Punk", image_url: "https://i.scdn.co/art1" },
      ],
      new_releases: [
        { id: "alb-1", name: "Hyperdrama", artist: "Justice", uri: "spotify:album:alb-1", image_url: "https://i.scdn.co/alb1" },
      ],
    };

    const { tree } = renderWithFeed(feed, false);

    // No flow-children="row" anywhere and no raw <img> tags
    const rowFocusables = findNodes(tree, (n) => n.props?.["flow-children"] === "row");
    expect(rowFocusables).toHaveLength(0);
    const rawImgs = findNodes(tree, (n) => n.type === "img");
    expect(rawImgs).toHaveLength(0);

    // Headings in strict order
    const headings = findNodes(tree, (n) => n.props?.["data-testid"]?.startsWith("discovery-heading-"));
    expect(headings.map((h) => textOf(h))).toEqual([
      "Jump Back In",
      "Top Tracks",
      "Top Artists",
      "New Releases",
    ]);

    // Each carousel uses flow-children="horizontal" and 128x128 DeckifyImage
    const carousels = findNodes(tree, (n) => n.props?.["data-testid"]?.startsWith("discovery-carousel-"));
    expect(carousels).toHaveLength(4);
    for (const c of carousels) {
      expect(c.props["flow-children"]).toBe("horizontal");
    }

    const images = findNodes(tree, (n) => n.type === DeckifyImage);
    expect(images).toHaveLength(4);
    for (const img of images) {
      expect(img.props.width).toBe(128);
      expect(img.props.height).toBe(128);
    }
  });

  it("wires A (play/drill-down) and Y (focus track/collection) actions across all card types", () => {
    const feed = {
      ok: true,
      time_range: "medium_term",
      made_for_you: [
        { id: "mix-1", name: "Daily Mix 1", uri: "spotify:playlist:mix-1", image_url: "https://i.scdn.co/mix1" },
        { id: "alb-mix", name: "Recent Album", uri: "spotify:album:alb-mix", is_album: true, image_url: "https://i.scdn.co/albmix" },
      ],
      top_tracks: [
        { id: "trk-1", name: "Track One", artist: "Artist A", uri: "spotify:track:trk-1", image_url: "https://i.scdn.co/trk1" },
        { id: "trk-2", name: "Track Two", artist: "Artist B", uri: "spotify:track:trk-2", image_url: "https://i.scdn.co/trk2" },
      ],
      top_artists: [
        { id: "art-1", name: "Artist A", image_url: "https://i.scdn.co/art1" },
      ],
      new_releases: [
        { id: "alb-1", name: "New Album", artist: "Artist C", uri: "spotify:album:alb-1", image_url: "https://i.scdn.co/alb1" },
      ],
    };

    const { tree, props } = renderWithFeed(feed, false);

    // Top Track A + Y focus
    const trackCard2 = findNodes(tree, (n) => n.props?.["data-testid"] === "discovery-card-track-1")[0];
    trackCard2.props.onActivate();
    expect(props.onPlayTrack).toHaveBeenCalledWith(
      "spotify:track:trk-2",
      undefined,
      ["spotify:track:trk-1", "spotify:track:trk-2"],
      1
    );
    const mockScroll = vi.fn();
    trackCard2.props.onFocus({ currentTarget: { scrollIntoView: mockScroll } });
    expect(mockScroll).toHaveBeenCalledWith({ behavior: "smooth", inline: "nearest", block: "nearest" });
    expect(props.onFocusTrack).toHaveBeenCalledWith(feed.top_tracks[1]);

    // Mix A + Y focus
    const mixCard = findNodes(tree, (n) => n.props?.["data-testid"] === "discovery-card-mix-0")[0];
    mixCard.props.onClick();
    expect(props.onOpenPlaylist).toHaveBeenCalledWith(feed.made_for_you[0]);
    mixCard.props.onGamepadFocus({});
    expect(props.onFocusCollection).toHaveBeenCalledWith({
      uri: "spotify:playlist:mix-1",
      name: "Daily Mix 1",
      image_url: "https://i.scdn.co/mix1",
      type: "playlist",
    });

    // Jump Back In album item drills into album
    const albumMixCard = findNodes(tree, (n) => n.props?.["data-testid"] === "discovery-card-mix-1")[0];
    albumMixCard.props.onActivate();
    expect(props.onOpenAlbum).toHaveBeenCalledWith(
      expect.objectContaining({ id: "alb-mix", name: "Recent Album", uri: "spotify:album:alb-mix" })
    );

    // Top Artist A + focus clears track/collection
    const artistCard = findNodes(tree, (n) => n.props?.["data-testid"] === "discovery-card-artist-0")[0];
    artistCard.props.onActivate();
    expect(props.onOpenArtist).toHaveBeenCalledWith(feed.top_artists[0]);
    artistCard.props.onFocus({});
    expect(props.onFocusTrack).toHaveBeenCalledWith(null);
    expect(props.onFocusCollection).toHaveBeenCalledWith(null);

    // New Release A + Y focus
    const releaseCard = findNodes(tree, (n) => n.props?.["data-testid"] === "discovery-card-album-0")[0];
    releaseCard.props.onActivate();
    expect(props.onOpenAlbum).toHaveBeenCalledWith(feed.new_releases[0]);
    releaseCard.props.onFocus({});
    expect(props.onFocusCollection).toHaveBeenCalledWith({
      uri: "spotify:album:alb-1",
      name: "New Album",
      image_url: "https://i.scdn.co/alb1",
      type: "album",
    });
  });

  it("renders 403 re-auth cards, 429 stale/cooldown banners, and empty state per UI-SPEC", () => {
    // 1. 403 needs_reauth with Made For You + New Releases still functional
    const { tree: reauthTree, props: reauthProps } = renderWithFeed(
      {
        ok: true,
        needs_reauth: true,
        made_for_you: [{ id: "mix-1", name: "Mix 1", uri: "spotify:playlist:mix-1" }],
        top_tracks: [],
        top_artists: [],
        new_releases: [{ id: "alb-1", name: "Album 1", artist: "Artist", uri: "spotify:album:alb-1" }],
      },
      false
    );
    const reauthCards = findNodes(reauthTree, (n) => n.props?.["data-testid"] === "discovery-reauth-card");
    expect(reauthCards).toHaveLength(2);
    expect(textOf(reauthCards[0])).toContain("Re-authenticate to unlock Top Tracks & Top Artists");
    const reauthBtn = findNodes(reauthCards[0], (n) => n.props?.["data-testid"] === "discovery-reauth-btn")[0];
    expect(textOf(reauthBtn)).toContain("Re-authenticate Spotify");
    reauthBtn.props.onClick();
    expect(reauthProps.onReauthenticate).toHaveBeenCalledTimes(1);
    expect(findNodes(reauthTree, (n) => n.props?.["data-testid"] === "discovery-card-mix-0")).toHaveLength(1);
    expect(findNodes(reauthTree, (n) => n.props?.["data-testid"] === "discovery-card-album-0")).toHaveLength(1);

    // 2. 429 with stale cache shows banner alongside cached cards
    const { tree: staleTree } = renderWithFeed(
      {
        ok: true,
        rate_limited: true,
        stale: true,
        made_for_you: [{ id: "mix-1", name: "Cached Mix", uri: "spotify:playlist:mix-1" }],
        top_tracks: [],
        top_artists: [],
        new_releases: [],
      },
      false
    );
    const staleBanner = findNodes(staleTree, (n) => n.props?.["data-testid"] === "discovery-stale-banner")[0];
    expect(staleBanner).toBeDefined();
    expect(textOf(staleBanner)).toContain("Rate limited — showing cached feed");
    expect(findNodes(staleTree, (n) => n.props?.["data-testid"] === "discovery-card-mix-0")).toHaveLength(1);

    // 3. 429 without stale cache and no items shows cooldown notice
    const { tree: cooldownTree } = renderWithFeed(
      {
        ok: false,
        rate_limited: true,
        stale: false,
        made_for_you: [],
        top_tracks: [],
        top_artists: [],
        new_releases: [],
      },
      false
    );
    expect(textOf(cooldownTree)).toContain(
      "Spotify rate limit cooldown active. Wait a moment and select Refresh Feed to try again."
    );

    // 4. Completely empty feed (not rate limited) shows empty state copy
    const { tree: emptyTree } = renderWithFeed(
      {
        ok: true,
        made_for_you: [],
        top_tracks: [],
        top_artists: [],
        new_releases: [],
      },
      false
    );
    expect(textOf(emptyTree)).toContain("No personalized recommendations yet");
    expect(textOf(emptyTree)).toContain(
      "Play a few tracks or follow playlists on Spotify, then select Refresh Feed to populate your Discovery hub."
    );
  });
});
