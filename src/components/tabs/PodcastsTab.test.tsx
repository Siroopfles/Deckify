import { describe, it, expect, vi, beforeEach } from "vitest";
import type { EpisodeItem, ShowItem } from "../../types";
import type { PodcastsTabProps } from "./PodcastsTab";

interface VNode {
  type: unknown;
  props?: Record<string, unknown>;
}

const stateSlots: unknown[] = [];
let stateIdx = 0;

function makeNode(type: unknown, props: Record<string, unknown>, key?: unknown): VNode {
  return {
    type,
    props: { ...props, ...(key !== undefined ? { key } : {}) },
  };
}

vi.mock("react/jsx-dev-runtime", () => ({
  jsxDEV: makeNode,
}));

vi.mock("react/jsx-runtime", () => ({
  jsx: makeNode,
  jsxs: makeNode,
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
  useEffect: (fn: () => void) => fn(),
  useCallback: <T,>(fn: T) => fn,
  useRef: <T,>(init: T) => ({ current: init }),
  useMemo: <T,>(fn: () => T) => fn(),
}));

vi.mock("@decky/api", () => ({
  callable: () => vi.fn(),
}));

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

vi.mock("../common/DeckifyImage", () => ({
  DeckifyImage: (props: Record<string, unknown>) => ({
    type: "DeckifyImage",
    props,
  }),
}));

import { PodcastsTab } from "./PodcastsTab";
import { InteractiveRow } from "../common/InteractiveRow";

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

function renderPodcastsTab(props: PodcastsTabProps): VNode {
  stateIdx = 0;
  return expandTree(PodcastsTab(props)) as VNode;
}

function findNodes(
  tree: unknown,
  predicate: (node: VNode) => boolean,
  results: VNode[] = []
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

const mockShows: ShowItem[] = [
  {
    id: "show1",
    name: "Tech Talk Weekly",
    publisher: "Deck Media",
    image_url: "https://i.scdn.co/image/show1",
    total_episodes: 42,
    uri: "spotify:show:show1",
  },
];

const mockEpisodes: EpisodeItem[] = [
  {
    id: "ep_played",
    name: "Finished Episode",
    show_name: "Tech Talk Weekly",
    image_url: "https://i.scdn.co/image/ep1",
    duration_ms: 1800000,
    uri: "spotify:episode:ep_played",
    resume_position_ms: 1800000,
    fully_played: true,
  },
  {
    id: "ep_progress",
    name: "In Progress Episode",
    show_name: "Tech Talk Weekly",
    image_url: "https://i.scdn.co/image/ep2",
    duration_ms: 1800000,
    uri: "spotify:episode:ep_progress",
    resume_position_ms: 900000,
    fully_played: false,
  },
  {
    id: "ep_unplayed",
    name: "Brand New Episode",
    show_name: "Tech Talk Weekly",
    image_url: "https://i.scdn.co/image/ep3",
    duration_ms: 1200000,
    uri: "spotify:episode:ep_unplayed",
    resume_position_ms: 0,
    fully_played: false,
  },
];

describe("PodcastsTab layout and show drill-down", () => {
  beforeEach(() => {
    stateSlots.length = 0;
    stateIdx = 0;
  });

  it("renders Followed Podcasts and Saved Episodes with horizontal EpisodeFilterBar", () => {
    const tree = renderPodcastsTab({
      savedShows: mockShows,
      savedEpisodes: mockEpisodes,
      onPlayTrack: vi.fn(),
    });

    const text = cleanText(tree);
    expect(text).toContain("Followed Podcasts (1)");
    expect(text).toContain("Tech Talk Weekly");
    expect(text).toContain("Saved Episodes (3)");

    const horizontalFocusables = findNodes(
      tree,
      (n) => n.type === "Focusable" && n.props?.["flow-children"] === "horizontal"
    );
    expect(horizontalFocusables.length).toBeGreaterThanOrEqual(1);

    const rowFocusables = findNodes(
      tree,
      (n) => n.type === "Focusable" && n.props?.["flow-children"] === "row"
    );
    expect(rowFocusables).toHaveLength(0);

    const buttons = findNodes(tree, (n) => n.type === "DialogButton");
    expect(buttons.map((b) => cleanText(b))).toEqual(["All", "Unplayed", "In Progress"]);
  });

  it("opens a show on click and renders ShowEpisodesView with Back to Podcasts", () => {
    const onOpenShow = vi.fn();
    const onCloseShow = vi.fn();
    const onPlayTrack = vi.fn();

    const listTree = renderPodcastsTab({
      savedShows: mockShows,
      savedEpisodes: mockEpisodes,
      onPlayTrack,
      onOpenShow,
    });

    const showRow = findNodes(
      listTree,
      (n) => n.type === InteractiveRow || n.props?.["data-deckify-label"] === "Tech Talk Weekly"
    )[0];
    expect(showRow).toBeDefined();
    (showRow.props?.onClick as () => void)();
    expect(onOpenShow).toHaveBeenCalledWith(mockShows[0]);

    const showTree = renderPodcastsTab({
      savedShows: mockShows,
      savedEpisodes: mockEpisodes,
      onPlayTrack,
      activeShow: mockShows[0],
      showEpisodes: mockEpisodes,
      onCloseShow,
    });

    const showText = cleanText(showTree);
    expect(showText).toContain("Back to Podcasts");
    expect(showText).toContain("Tech Talk Weekly");

    const backBtn = findNodes(
      showTree,
      (n) => typeof n.props?.onClick === "function" && cleanText(n).includes("Back to Podcasts")
    )[0];
    expect(backBtn).toBeDefined();
    (backBtn.props?.onClick as () => void)();
    expect(onCloseShow).toHaveBeenCalledTimes(1);

    const horizontalFocusables = findNodes(
      showTree,
      (n) => n.type === "Focusable" && n.props?.["flow-children"] === "horizontal"
    );
    expect(horizontalFocusables.length).toBeGreaterThanOrEqual(1);
  });
});

describe("PodcastsTab progress bars and filtering", () => {
  beforeEach(() => {
    stateSlots.length = 0;
    stateIdx = 0;
  });

  it("renders Played badge + 100% bar, remaining time badge + partial bar, and omits bar/badge when unplayed", () => {
    const tree = renderPodcastsTab({
      savedShows: [],
      savedEpisodes: mockEpisodes,
      onPlayTrack: vi.fn(),
    });

    const episodeRows = findNodes(
      tree,
      (n) => n.props?.["data-deckify-list-item"] === "true"
    );
    expect(episodeRows).toHaveLength(3);

    const playedRow = episodeRows[0];
    expect(cleanText(playedRow)).toContain("Played");
    const playedBar = findNodes(
      playedRow,
      (n) =>
        n.type === "div" &&
        (n.props?.style as Record<string, unknown> | undefined)?.width === "100%" &&
        (n.props?.style as Record<string, unknown> | undefined)?.height === "100%"
    );
    expect(playedBar).toHaveLength(1);

    const progressRow = episodeRows[1];
    expect(cleanText(progressRow)).toContain("15m left");
    const progressBar = findNodes(
      progressRow,
      (n) =>
        n.type === "div" &&
        (n.props?.style as Record<string, unknown> | undefined)?.width === "50%" &&
        (n.props?.style as Record<string, unknown> | undefined)?.height === "100%"
    );
    expect(progressBar).toHaveLength(1);

    const unplayedRow = episodeRows[2];
    expect(cleanText(unplayedRow)).not.toContain("Played");
    expect(cleanText(unplayedRow)).not.toContain("left");
    const unplayedBar = findNodes(
      unplayedRow,
      (n) =>
        n.type === "div" &&
        (n.props?.style as Record<string, unknown> | undefined)?.height === "100%"
    );
    expect(unplayedBar).toHaveLength(0);
  });
});

describe("PodcastsTab episode filtering", () => {
  beforeEach(() => {
    stateSlots.length = 0;
    stateIdx = 0;
  });

  it("filters episodes via Unplayed / In Progress pills and renders No Matching Episodes when empty", () => {
    const baseProps: PodcastsTabProps = {
      savedShows: [],
      savedEpisodes: mockEpisodes,
      onPlayTrack: vi.fn(),
    };

    const tree1 = renderPodcastsTab(baseProps);
    const unplayedBtn = findNodes(
      tree1,
      (n) => n.type === "DialogButton" && cleanText(n) === "Unplayed"
    )[0];
    (unplayedBtn.props?.onClick as () => void)();

    const treeUnplayed = renderPodcastsTab(baseProps);
    const unplayedRows = findNodes(
      treeUnplayed,
      (n) => n.props?.["data-deckify-list-item"] === "true"
    );
    expect(unplayedRows).toHaveLength(1);
    expect(cleanText(unplayedRows[0])).toContain("Brand New Episode");

    const inProgressBtn = findNodes(
      treeUnplayed,
      (n) => n.type === "DialogButton" && cleanText(n) === "In Progress"
    )[0];
    (inProgressBtn.props?.onClick as () => void)();

    const treeInProgress = renderPodcastsTab(baseProps);
    const inProgressRows = findNodes(
      treeInProgress,
      (n) => n.props?.["data-deckify-list-item"] === "true"
    );
    expect(inProgressRows).toHaveLength(1);
    expect(cleanText(inProgressRows[0])).toContain("In Progress Episode");

    stateSlots.length = 0;
    const emptyFilterProps: PodcastsTabProps = {
      savedShows: [],
      savedEpisodes: [mockEpisodes[0]],
      onPlayTrack: vi.fn(),
    };
    const treeEmptyInit = renderPodcastsTab(emptyFilterProps);
    const emptyUnplayedBtn = findNodes(
      treeEmptyInit,
      (n) => n.type === "DialogButton" && cleanText(n) === "Unplayed"
    )[0];
    (emptyUnplayedBtn.props?.onClick as () => void)();

    const treeEmpty = renderPodcastsTab(emptyFilterProps);
    expect(cleanText(treeEmpty)).toContain("No Matching Episodes");
    expect(findNodes(treeEmpty, (n) => n.type === "DialogButton")).toHaveLength(3);
  });
});
