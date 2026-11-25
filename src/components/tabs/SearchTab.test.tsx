import { describe, it, expect, vi, beforeEach } from "vitest";
import type { EpisodeItem, PlaylistItem, ShowItem, TrackItem } from "../../types";
import type { SearchTabProps } from "./SearchTab";

interface VNode {
  type: unknown;
  props?: Record<string, unknown>;
}

const stateSlots: unknown[] = [];
let stateIdx = 0;
const { mockSearchSpotify, mockGetSearchBrowseCategories } = vi.hoisted(() => ({
  mockSearchSpotify: vi.fn(),
  mockGetSearchBrowseCategories: vi.fn(),
}));

function makeNode(type: unknown, props: Record<string, unknown>, key?: unknown): VNode {
  return {
    type,
    props: { ...props, ...(key !== undefined ? { key } : {}) },
  };
}

vi.mock("react/jsx-dev-runtime", () => ({
  jsxDEV: makeNode,
  Fragment: "Fragment",
}));

vi.mock("react/jsx-runtime", () => ({
  jsx: makeNode,
  jsxs: makeNode,
  Fragment: "Fragment",
}));

vi.mock("react", () => ({
  useState: (init: unknown) => {
    const idx = stateIdx++;
    if (!(idx in stateSlots)) {
      stateSlots[idx] = typeof init === "function" ? (init as () => unknown)() : init;
    }
    const setState = (val: unknown) => {
      stateSlots[idx] =
        typeof val === "function" ? (val as (prev: unknown) => unknown)(stateSlots[idx]) : val;
    };
    return [stateSlots[idx], setState];
  },
  useEffect: (fn: () => void) => {
    fn();
  },
  useCallback: <T,>(fn: T) => fn,
  useRef: <T,>(init: T) => ({ current: init }),
  useMemo: <T,>(fn: () => T) => fn(),
}));

vi.mock("@decky/api", () => ({
  callable: (name: string) => {
    if (name === "search_spotify") return mockSearchSpotify;
    if (name === "get_search_browse_categories") return mockGetSearchBrowseCategories;
    return vi.fn();
  },
}));

vi.mock("@decky/ui", () => ({
  Focusable: ({ children, ...props }: Record<string, unknown>) => ({
    type: "Focusable",
    props: { children, ...props },
  }),
  TextField: ({ children, ...props }: Record<string, unknown>) => ({
    type: "TextField",
    props: { children, ...props },
  }),
  DialogButton: ({ children, ...props }: Record<string, unknown>) => ({
    type: "DialogButton",
    props: { children, ...props },
  }),
}));

vi.mock("../common/DeckifyImage", () => ({
  DeckifyImage: (props: Record<string, unknown>) => ({
    type: "DeckifyImage",
    props,
  }),
}));

import { SearchTab, GAMING_MOOD_TILES } from "./SearchTab";

function expandTree(node: unknown): unknown {
  if (!node || typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map(expandTree);
  const vnode = node as VNode;
  if (typeof vnode.type === "function") {
    const fn = vnode.type as (p: Record<string, unknown>) => unknown;
    return expandTree(fn(vnode.props || {}));
  }
  if (vnode.props && vnode.props.children !== undefined) {
    return {
      ...vnode,
      props: {
        ...vnode.props,
        children: expandTree(vnode.props.children),
      },
    };
  }
  return vnode;
}

function renderSearchTab(props: Partial<SearchTabProps> = {}): VNode {
  stateIdx = 0;
  const fullProps: SearchTabProps = {
    onPlayTrack: vi.fn(),
    onToggleLike: vi.fn(),
    onOpenActions: vi.fn(),
    onOpenPlaylist: vi.fn(),
    onOpenArtist: vi.fn(),
    onOpenAlbum: vi.fn(),
    onOpenShow: vi.fn(),
    showToast: vi.fn(),
    ...props,
  };
  return expandTree(SearchTab(fullProps)) as VNode;
}

function findNodes(
  tree: unknown,
  predicate: (node: VNode) => boolean,
  results: VNode[] = [],
): VNode[] {
  if (!tree || typeof tree !== "object") return results;
  if (Array.isArray(tree)) {
    for (const item of tree) findNodes(item, predicate, results);
    return results;
  }
  const vnode = tree as VNode;
  if (predicate(vnode)) results.push(vnode);
  if (vnode.props && vnode.props.children !== undefined) {
    findNodes(vnode.props.children, predicate, results);
  }
  return results;
}

function findText(tree: unknown): string {
  if (tree == null || typeof tree === "boolean") return "";
  if (typeof tree === "string" || typeof tree === "number") return String(tree);
  if (Array.isArray(tree)) {
    return tree.every((c) => typeof c === "string" || typeof c === "number")
      ? tree.map(String).join("")
      : tree.map(findText).join(" ");
  }
  const vnode = tree as VNode;
  if (vnode.props && vnode.props.children !== undefined) {
    return findText(vnode.props.children);
  }
  return "";
}

function cleanText(tree: unknown): string {
  return findText(tree).replace(/\s+/g, " ").trim();
}

const mockTracks: TrackItem[] = [
  { id: "t1", name: "Track One", artist: "Artist A", uri: "spotify:track:t1" },
];

const mockPlaylists: PlaylistItem[] = [
  { id: "pl1", name: "Epic Gaming Mix", track_count: 40, uri: "spotify:playlist:pl1" },
];

const mockShows: ShowItem[] = [
  {
    id: "show1",
    name: "Deck Cast",
    publisher: "Valve Fans",
    image_url: "https://i.scdn.co/image/show1",
    uri: "spotify:show:show1",
  },
];

const mockEpisodes: EpisodeItem[] = [
  {
    id: "ep1",
    name: "Finished Ep",
    show_name: "Deck Cast",
    image_url: "https://i.scdn.co/image/ep1",
    duration_ms: 1800000,
    uri: "spotify:episode:ep1",
    resume_position_ms: 1800000,
    fully_played: true,
  },
  {
    id: "ep2",
    name: "In Progress Ep",
    show_name: "Deck Cast",
    image_url: "https://i.scdn.co/image/ep2",
    duration_ms: 1200000,
    uri: "spotify:episode:ep2",
    resume_position_ms: 300000,
    fully_played: false,
  },
  {
    id: "ep3",
    name: "Fresh Ep",
    show_name: "Deck Cast",
    duration_ms: 600000,
    uri: "spotify:episode:ep3",
    resume_position_ms: 0,
    fully_played: false,
  },
];

describe("SearchTab Search 2.0 idle screen & history", () => {
  beforeEach(() => {
    stateSlots.length = 0;
    stateIdx = 0;
    mockSearchSpotify.mockReset();
    mockSearchSpotify.mockResolvedValue({ ok: true, tracks: mockTracks, playlists: mockPlaylists });
  });

  it("renders Recent Searches pills, Clear All, and 12 Gaming & Mood tiles in horizontal rows on idle screen", () => {
    const tree = renderSearchTab({ searchQuery: "", searchHistory: ["lofi", "synthwave"] });
    const text = cleanText(tree);
    expect(text).toContain("Recent Searches");
    expect(text).toContain("Clear All");
    expect(text).toContain("lofi");
    expect(text).toContain("synthwave");
    expect(text).toContain("Browse Gaming & Mood");
    expect(GAMING_MOOD_TILES).toHaveLength(12);
    for (const tile of GAMING_MOOD_TILES) expect(text).toContain(tile.label);

    const focusables = findNodes(tree, (n) => n.type === "Focusable");
    expect(focusables.filter((f) => f.props?.["flow-children"] === "horizontal").length).toBeGreaterThanOrEqual(4);
    expect(focusables.some((f) => f.props?.["flow-children"] === "row")).toBe(false);

    const emptyTree = renderSearchTab({ searchQuery: "", searchHistory: [] });
    expect(cleanText(emptyTree)).not.toContain("Recent Searches");
    expect(cleanText(emptyTree)).toContain("Browse Gaming & Mood");
  });

  it("supports clicking a history pill, deleting a single pill, and Clear All", () => {
    const onSearchQueryChange = vi.fn();
    const onUpdateSearchHistory = vi.fn();
    const tree = renderSearchTab({
      searchQuery: "",
      searchHistory: ["lofi", "synthwave"],
      onSearchQueryChange,
      onUpdateSearchHistory,
    });

    const lofiPill = findNodes(tree, (n) => n.type === "Focusable" && n.props?.["data-deckify-label"] === "lofi")[0];
    (lofiPill.props?.onClick as () => void)();
    expect(onSearchQueryChange).toHaveBeenCalledWith("lofi");
    expect(mockSearchSpotify).toHaveBeenCalledWith("lofi", "track,artist,album,playlist,show,episode", 10, 0);

    const removeBtn = findNodes(lofiPill, (n) => n.type === "span" && n.props?.["aria-label"] === "Remove lofi")[0];
    (removeBtn.props?.onClick as (e: { stopPropagation: () => void }) => void)({ stopPropagation: vi.fn() });
    expect(onUpdateSearchHistory).toHaveBeenCalledWith(["synthwave"]);

    const clearAll = findNodes(tree, (n) => n.type === "Focusable" && cleanText(n) === "Clear All")[0];
    (clearAll.props?.onClick as () => void)();
    expect(onUpdateSearchHistory).toHaveBeenCalledWith([]);
  });
});

describe("SearchTab Search 2.0 tiles, filters & results", () => {
  beforeEach(() => {
    stateSlots.length = 0;
    stateIdx = 0;
    mockSearchSpotify.mockReset();
    mockSearchSpotify.mockResolvedValue({ ok: true, tracks: mockTracks, playlists: mockPlaylists });
  });

  it("clicking a Gaming & Mood tile enables tileSearchMode without focusing TextField and orders Playlists first", () => {
    const onSearchQueryChange = vi.fn();
    const onTileSearchModeChange = vi.fn();
    const idleTree = renderSearchTab({ searchQuery: "", onSearchQueryChange, onTileSearchModeChange });

    const epicTile = findNodes(idleTree, (n) => n.type === "Focusable" && n.props?.["data-deckify-label"] === "Epic Gaming")[0];
    (epicTile.props?.onClick as () => void)();
    expect(onTileSearchModeChange).toHaveBeenCalledWith(true);
    expect(onSearchQueryChange).toHaveBeenCalledWith("epic gaming soundtrack");
    expect(mockSearchSpotify).toHaveBeenCalledWith("epic gaming soundtrack", "track,artist,album,playlist,show,episode", 10, 0);

    const tileResultsTree = renderSearchTab({
      searchQuery: "epic gaming soundtrack",
      searchTab: "all",
      tileSearchMode: true,
      searchResults: { tracks: mockTracks, playlists: mockPlaylists },
    });
    const text = cleanText(tileResultsTree);
    expect(text.indexOf("Playlists")).toBeGreaterThan(-1);
    expect(text.indexOf("Playlists")).toBeLessThan(text.indexOf("Tracks"));
  });

  it("renders 7 filter chips, Podcasts calling onOpenShow, and Episodes reusing EpisodeRow", () => {
    const onOpenShow = vi.fn();
    const onPlayTrack = vi.fn();
    const tree = renderSearchTab({
      searchQuery: "deck",
      searchTab: "all",
      searchResults: { tracks: mockTracks, playlists: mockPlaylists, shows: mockShows, episodes: mockEpisodes },
      onOpenShow,
      onPlayTrack,
    });

    for (const label of ["all", "tracks", "artists", "albums", "playlists", "podcasts", "episodes"]) {
      expect(findNodes(tree, (n) => n.type === "Focusable" && cleanText(n).toLowerCase() === label).length).toBeGreaterThanOrEqual(1);
    }

    const showRow = findNodes(tree, (n) => n.type === "Focusable" && n.props?.["data-deckify-label"] === "Deck Cast")[0];
    (showRow.props?.onClick as () => void)();
    expect(onOpenShow).toHaveBeenCalledWith(mockShows[0]);

    const text = cleanText(tree);
    expect(text).toContain("Played");
    expect(text).toContain("15m left");
    expect(text).toContain("Fresh Ep");

    const epRow = findNodes(tree, (n) => n.type === "Focusable" && n.props?.["data-deckify-label"] === "In Progress Ep")[0];
    (epRow.props?.onClick as () => void)();
    expect(onPlayTrack).toHaveBeenCalledWith("spotify:episode:ep2");
  });

  it("renders No Results Found when non-empty query has zero matches while keeping filter chips", () => {
    const tree = renderSearchTab({
      searchQuery: "nonexistentxyz",
      searchTab: "podcasts",
      searchResults: { tracks: [], artists: [], albums: [], playlists: [], shows: [], episodes: [] },
    });
    const text = cleanText(tree);
    expect(text).toContain("No Results Found");
    expect(text).toContain("nonexistentxyz");
    expect(text).toContain("podcasts");
  });

function makeTenTracks(prefix = "t", start = 1): TrackItem[] {
  return Array.from({ length: 10 }, (_, idx) => {
    const n = start + idx;
    return {
      id: `${prefix}${n}`,
      name: `Track ${n}`,
      artist: `Artist ${n}`,
      uri: `spotify:track:${prefix}${n}`,
    };
  });
}

function makeTenPlaylists(prefix = "pl", start = 1): PlaylistItem[] {
  return Array.from({ length: 10 }, (_, idx) => {
    const n = start + idx;
    return {
      id: `${prefix}${n}`,
      name: `Playlist ${n}`,
      track_count: 10,
      uri: `spotify:playlist:${prefix}${n}`,
    };
  });
}

describe("SearchTab per-section Load More paging (G-26-2)", () => {
  beforeEach(() => {
    stateSlots.length = 0;
    stateIdx = 0;
    mockSearchSpotify.mockReset();
  });

  it("renders per-section Load More rows for categories with >= 10 items and removes global Load More Results", () => {
    const tenTracks = makeTenTracks();
    const tenPlaylists = makeTenPlaylists();
    const tree = renderSearchTab({
      searchQuery: "lofi",
      searchTab: "all",
      searchResults: {
        tracks: tenTracks,
        playlists: tenPlaylists,
        shows: mockShows,
      },
    });

    const text = cleanText(tree);
    expect(text).not.toContain("Load More Results");
    expect(findNodes(tree, (n) => n.type === "Focusable" && n.props?.["data-testid"] === "search-load-more-tracks")).toHaveLength(1);
    expect(findNodes(tree, (n) => n.type === "Focusable" && n.props?.["data-testid"] === "search-load-more-playlists")).toHaveLength(1);
    expect(findNodes(tree, (n) => n.type === "Focusable" && n.props?.["data-testid"] === "search-load-more-podcasts")).toHaveLength(0);
    expect(text).toContain("Load More Tracks");
    expect(text).toContain("Load More Playlists");
    expect(text).not.toContain("Load More Podcasts");
  });

  it("clicking Load More Tracks queries singular 'track' type at offset=10 and appends only tracks", async () => {
    const tenTracks = makeTenTracks();
    const onSearchResultsChange = vi.fn();
    mockSearchSpotify.mockResolvedValueOnce({
      ok: true,
      tracks: [
        tenTracks[0],
        {
          id: "t11",
          name: "Track 11",
          artist: "Artist 11",
          uri: "spotify:track:t11",
        },
      ],
    });

    const tree = renderSearchTab({
      searchQuery: "lofi",
      searchTab: "all",
      searchResults: { tracks: tenTracks, playlists: mockPlaylists, shows: mockShows },
      onSearchResultsChange,
    });

    const loadMoreTracks = findNodes(
      tree,
      (n) => n.type === "Focusable" && n.props?.["data-testid"] === "search-load-more-tracks",
    )[0];
    expect(loadMoreTracks).toBeDefined();
    (loadMoreTracks.props?.onClick as () => void)();
    await new Promise((r) => setTimeout(r, 0));

    expect(mockSearchSpotify).toHaveBeenCalledWith("lofi", "track", 10, 10);
    expect(onSearchResultsChange).toHaveBeenCalledTimes(1);
    const merged = onSearchResultsChange.mock.calls[0][0];
    expect(merged.tracks).toHaveLength(11);
    expect(merged.tracks[10].id).toBe("t11");
    expect(merged.playlists).toEqual(mockPlaylists);
    expect(merged.shows).toEqual(mockShows);
  });

  it("hides only the exhausted section's Load More row when fewer than 10 items return", async () => {
    const tenTracks = makeTenTracks();
    const tenPlaylists = makeTenPlaylists();
    let results = { tracks: tenTracks, playlists: tenPlaylists };
    const onSearchResultsChange = vi.fn((next) => {
      results = next;
    });
    mockSearchSpotify.mockResolvedValueOnce({
      ok: true,
      tracks: [{ id: "t11", name: "Track 11", artist: "Artist 11", uri: "spotify:track:t11" }],
    });

    const tree1 = renderSearchTab({
      searchQuery: "lofi",
      searchTab: "all",
      searchResults: results,
      onSearchResultsChange,
    });
    const loadMoreTracks = findNodes(
      tree1,
      (n) => n.type === "Focusable" && n.props?.["data-testid"] === "search-load-more-tracks",
    )[0];
    (loadMoreTracks.props?.onClick as () => void)();
    await new Promise((r) => setTimeout(r, 0));

    const tree2 = renderSearchTab({
      searchQuery: "lofi",
      searchTab: "all",
      searchResults: results,
      onSearchResultsChange,
    });
    expect(findNodes(tree2, (n) => n.type === "Focusable" && n.props?.["data-testid"] === "search-load-more-tracks")).toHaveLength(0);
    expect(findNodes(tree2, (n) => n.type === "Focusable" && n.props?.["data-testid"] === "search-load-more-playlists")).toHaveLength(1);
  });

  it("resets per-section offsets and hasMore flags when starting a new search", async () => {
    const tenTracks = makeTenTracks();
    let results = { tracks: tenTracks };
    const onSearchResultsChange = vi.fn((next) => {
      results = next;
    });
    mockSearchSpotify
      .mockResolvedValueOnce({
        ok: true,
        tracks: [{ id: "t11", name: "Track 11", artist: "Artist 11", uri: "spotify:track:t11" }],
      })
      .mockResolvedValueOnce({
        ok: true,
        tracks: makeTenTracks("newt", 1),
      });

    // 1. Exhaust tracks on initial query
    const tree1 = renderSearchTab({
      searchQuery: "lofi",
      searchTab: "all",
      searchResults: results,
      onSearchResultsChange,
    });
    const loadMore1 = findNodes(
      tree1,
      (n) => n.type === "Focusable" && n.props?.["data-testid"] === "search-load-more-tracks",
    )[0];
    (loadMore1.props?.onClick as () => void)();
    await new Promise((r) => setTimeout(r, 0));

    // 2. Trigger a new search via Gaming & Mood tile
    const idleTree = renderSearchTab({
      searchQuery: "",
      searchResults: results,
      onSearchResultsChange,
    });
    const epicTile = findNodes(
      idleTree,
      (n) => n.type === "Focusable" && n.props?.["data-deckify-label"] === "Epic Gaming",
    )[0];
    (epicTile.props?.onClick as () => void)();
    await new Promise((r) => setTimeout(r, 0));

    expect(mockSearchSpotify).toHaveBeenLastCalledWith(
      "epic gaming soundtrack",
      "track,artist,album,playlist,show,episode",
      10,
      0,
    );
    const tree3 = renderSearchTab({
      searchQuery: "epic gaming soundtrack",
      searchTab: "all",
      searchResults: results,
      onSearchResultsChange,
    });
    expect(findNodes(tree3, (n) => n.type === "Focusable" && n.props?.["data-testid"] === "search-load-more-tracks")).toHaveLength(1);
  });
});

  it("renders explicit Search Error banner instead of No Results Found when search_spotify returns ok: false", async () => {
    mockSearchSpotify.mockResolvedValueOnce({ ok: false, error: "HTTP 403" });
    const showToast = vi.fn();
    const idleTree = renderSearchTab({ searchQuery: "", searchHistory: ["lofi"], showToast });

    const lofiPill = findNodes(idleTree, (n) => n.type === "Focusable" && n.props?.["data-deckify-label"] === "lofi")[0];
    (lofiPill.props?.onClick as () => void)();
    await new Promise((r) => setTimeout(r, 0));

    expect(showToast).toHaveBeenCalledWith("HTTP 403");
    const errTree = renderSearchTab({
      searchQuery: "lofi",
      searchTab: "all",
      searchResults: {},
    });
    const text = cleanText(errTree);
    expect(text).toContain("Search Error");
    expect(text).toContain("HTTP 403");
    expect(text).not.toContain("No Results Found");
  });

  it("invokes onFocusHistoryPill(q) on pill focus and onFocusHistoryPill(null) on blur", () => {
    const onFocusHistoryPill = vi.fn();
    const tree = renderSearchTab({
      searchQuery: "",
      searchHistory: ["Daft Punk", "Synthwave"],
      onFocusHistoryPill,
    });

    const pill = findNodes(
      tree,
      (n) => n.type === "Focusable" && n.props?.["data-deckify-label"] === "Daft Punk",
    )[0];
    expect(pill).toBeDefined();

    (pill.props?.onFocus as () => void)();
    expect(onFocusHistoryPill).toHaveBeenLastCalledWith("Daft Punk");

    (pill.props?.onBlur as () => void)();
    expect(onFocusHistoryPill).toHaveBeenLastCalledWith(null);
  });

  it("renders optional CDP Browse Categories below the 12 Gaming & Mood tiles and omits silently on empty or error", async () => {
    // 1. Populated CDP Browse Categories
    mockGetSearchBrowseCategories.mockResolvedValue({
      ok: true,
      categories: [
        { id: "cat-1", name: "Gaming", image_url: "https://i.scdn.co/cat1" },
        { id: "cat-2", name: "Electronic", image_url: "https://i.scdn.co/cat2" },
      ],
    });
    const onSearchQueryChange = vi.fn();
    renderSearchTab({ searchQuery: "", onSearchQueryChange });
    await new Promise((r) => setTimeout(r, 0));
    const populatedTree = renderSearchTab({ searchQuery: "", onSearchQueryChange });

    const text = cleanText(populatedTree);
    expect(text).toContain("Browse Gaming & Mood");
    expect(text).toContain("Browse Categories");
    expect(text.indexOf("Browse Gaming & Mood")).toBeLessThan(text.indexOf("Browse Categories"));
    expect(text).toContain("Gaming");
    expect(text).toContain("Electronic");

    const rowFocusables = findNodes(populatedTree, (n) => n.props?.["flow-children"] === "row");
    expect(rowFocusables).toHaveLength(0);
    const images = findNodes(populatedTree, (n) => n.type === "DeckifyImage");
    expect(images.length).toBeGreaterThanOrEqual(2);

    const catTile = findNodes(populatedTree, (n) => n.type === "Focusable" && n.props?.["data-deckify-label"] === "Electronic")[0];
    (catTile.props?.onClick as () => void)();
    expect(onSearchQueryChange).toHaveBeenCalledWith("Electronic");

    // 2. Empty categories -> silently omitted, 12 Gaming & Mood tiles still rendered
    stateSlots.length = 0;
    stateIdx = 0;
    mockGetSearchBrowseCategories.mockResolvedValue({ ok: true, categories: [] });
    renderSearchTab({ searchQuery: "" });
    await new Promise((r) => setTimeout(r, 0));
    const emptyTree = renderSearchTab({ searchQuery: "" });
    expect(cleanText(emptyTree)).toContain("Browse Gaming & Mood");
    expect(cleanText(emptyTree)).not.toContain("Browse Categories");

    // 3. Rejection -> silently omitted, no error banner
    stateSlots.length = 0;
    stateIdx = 0;
    mockGetSearchBrowseCategories.mockRejectedValue(new Error("CDP offline"));
    renderSearchTab({ searchQuery: "" });
    await new Promise((r) => setTimeout(r, 0));
    const errTree = renderSearchTab({ searchQuery: "" });
    expect(cleanText(errTree)).toContain("Browse Gaming & Mood");
    expect(cleanText(errTree)).not.toContain("Browse Categories");
  });
});
