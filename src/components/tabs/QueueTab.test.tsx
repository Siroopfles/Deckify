import { describe, it, expect, vi } from "vitest";

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

vi.mock("react", () => ({
  useState: (init: any) => [init, vi.fn()],
  useEffect: (fn: any) => fn(),
  useCallback: (fn: any) => fn,
  useRef: (init: any) => ({ current: init }),
  useMemo: (fn: any) => fn(),
}));

vi.mock("@decky/api", () => ({
  callable: () => vi.fn(),
}));

vi.mock("@decky/ui", () => ({
  Focusable: ({ children, ...props }: any) => ({
    type: "Focusable",
    props: { children, ...props },
  }),
}));

vi.mock("../common/DeckifyImage", () => ({
  DeckifyImage: (props: any) => ({
    type: "DeckifyImage",
    props,
  }),
}));

import { QueueTab } from "./QueueTab";
import { InteractiveRow } from "../common/InteractiveRow";
import { TrackItem } from "../../types";

function findNodes(tree: any, predicate: (node: any) => boolean, results: any[] = []): any[] {
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

function cleanText(tree: any): string {
  return findText(tree).replace(/\s+/g, " ").trim();
}

const mockQueue: TrackItem[] = [
  {
    id: "track1",
    name: "Song One",
    artist: "Artist A",
    uri: "spotify:track:track1",
    duration_ms: 180000,
    is_liked: false,
    artwork_url: "https://i.scdn.co/image/1",
  },
  {
    id: "track2",
    name: "Song Two",
    artist: "Artist B",
    uri: "spotify:track:track2",
    duration_ms: 210000,
    is_liked: true,
    artwork_url: "https://i.scdn.co/image/2",
  },
  {
    id: "track3",
    name: "Song Three",
    artist: "Artist C",
    uri: "spotify:track:track3",
    duration_ms: 240000,
    is_liked: false,
    artwork_url: "https://i.scdn.co/image/3",
  },
];

describe("QueueTab Component", () => {
  it("renders dedicated Now Playing card when currentlyPlaying is supplied (D-02)", () => {
    const tree = QueueTab({
      queueTracks: mockQueue,
      currentlyPlaying: {
        id: "now1",
        name: "Active Hit",
        artist: "Lead Star",
        duration_ms: 205000,
        artwork_url: "https://i.scdn.co/image/now",
      },
      isPlaying: true,
      handlePlayTrack: vi.fn(),
      handleToggleLike: vi.fn(),
    });

    const card = findNodes(tree, (n) => n.props?.["data-testid"] === "now-playing-card")[0];
    expect(card).toBeDefined();

    const allCardText = findText(card);
    expect(allCardText).toContain("Active Hit");
    expect(allCardText).toContain("Lead Star");
    expect(allCardText).toContain("NOW PLAYING");
    expect(allCardText).toContain("3:25");
  });

  it("renders CURRENT TRACK badge when currentlyPlaying is paused", () => {
    const tree = QueueTab({
      queueTracks: mockQueue,
      currentlyPlaying: {
        id: "now1",
        name: "Paused Track",
        artist: "Quiet Artist",
        duration_ms: 120000,
      },
      isPlaying: false,
      handlePlayTrack: vi.fn(),
      handleToggleLike: vi.fn(),
    });

    const card = findNodes(tree, (n) => n.props?.["data-testid"] === "now-playing-card")[0];
    const allCardText = findText(card);
    expect(allCardText).toContain("CURRENT TRACK");
  });

  it("renders friendly empty state message when queueTracks is empty (D-02)", () => {
    const tree = QueueTab({
      queueTracks: [],
      handlePlayTrack: vi.fn(),
      handleToggleLike: vi.fn(),
    });

    const fullText = findText(tree);
    expect(fullText).toContain("Queue is empty. Add songs from your library or search.");
  });

  it("invokes handlePlayQueueTrack with clicked track and index when provided (D-01, D-03)", () => {
    const handlePlayQueueTrack = vi.fn();
    const handlePlayTrack = vi.fn();

    const tree = QueueTab({
      queueTracks: mockQueue,
      handlePlayQueueTrack,
      handlePlayTrack,
      handleToggleLike: vi.fn(),
    });

    const rows = findNodes(tree, (n) => n.type === InteractiveRow);
    expect(rows.length).toBe(3);

    // Click track at index 1 ("Song Two")
    rows[1].props.onClick();

    expect(handlePlayQueueTrack).toHaveBeenCalledTimes(1);
    expect(handlePlayQueueTrack).toHaveBeenCalledWith(mockQueue[1], 1);
    expect(handlePlayTrack).not.toHaveBeenCalled();
  });

  it("falls back to handlePlayTrack with sliced remaining URIs when handlePlayQueueTrack is not provided (D-01)", () => {
    const handlePlayTrack = vi.fn();

    const tree = QueueTab({
      queueTracks: mockQueue,
      handlePlayTrack,
      handleToggleLike: vi.fn(),
    });

    const rows = findNodes(tree, (n) => n.type === InteractiveRow);
    expect(rows.length).toBe(3);

    // Click track at index 1 ("Song Two")
    rows[1].props.onClick();

    expect(handlePlayTrack).toHaveBeenCalledTimes(1);
    expect(handlePlayTrack).toHaveBeenCalledWith(
      "spotify:track:track2",
      undefined,
      ["spotify:track:track2", "spotify:track:track3"],
      0
    );
  });

  it("calls handleToggleLike on heart click and prevents event propagation (D-06)", () => {
    const handleToggleLike = vi.fn();
    const handlePlayQueueTrack = vi.fn();

    const tree = QueueTab({
      queueTracks: mockQueue,
      handlePlayQueueTrack,
      handleToggleLike,
    });

    const rows = findNodes(tree, (n) => n.type === InteractiveRow);
    const row1 = rows[0];

    // Find the heart icon span inside the row
    const heartSpan = findNodes(
      row1,
      (n) => n.type === "span" && typeof n.props?.onClick === "function"
    )[0];
    expect(heartSpan).toBeDefined();

    const stopPropagation = vi.fn();
    heartSpan.props.onClick({ stopPropagation });

    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(handleToggleLike).toHaveBeenCalledWith("track1");
    // Ensure row play handler was not triggered
    expect(handlePlayQueueTrack).not.toHaveBeenCalled();
  });

  it("caps rendered upcoming tracks at 40 items when queue exceeds 40 tracks (D-06)", () => {
    const largeQueue: TrackItem[] = Array.from({ length: 50 }, (_, i) => ({
      id: `t_${i}`,
      name: `Track ${i}`,
      artist: `Artist ${i}`,
      uri: `spotify:track:${i}`,
      duration_ms: 180000,
    }));

    const tree = QueueTab({
      queueTracks: largeQueue,
      handleToggleLike: vi.fn(),
    });

    const rows = findNodes(tree, (n) => n.type === InteractiveRow);
    expect(rows.length).toBe(40);

    const fullText = cleanText(tree);
    expect(fullText).toContain("Next in Queue (50)");
  });
});
