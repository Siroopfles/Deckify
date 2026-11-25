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

let stateOverrideQueue: unknown[] = [];

vi.mock("react", () => ({
  useState: (init: unknown) => {
    const val = stateOverrideQueue.length > 0 ? stateOverrideQueue.shift() : init;
    return [val, vi.fn()];
  },
  useEffect: (fn: () => void) => fn(),
  useCallback: (fn: unknown) => fn,
  useRef: (init: unknown) => ({ current: init }),
  useMemo: (fn: () => unknown) => fn(),
}));

vi.mock("@decky/api", () => ({
  callable: () => vi.fn(),
}));

vi.mock("@decky/ui", () => ({
  Focusable: ({ children, ...props }: any) => ({
    type: "Focusable",
    props: { children, ...props },
  }),
  GamepadButton: {
    DIR_UP: 9,
    DIR_DOWN: 10,
  },
}));

vi.mock("../common/DeckifyImage", () => ({
  DeckifyImage: (props: any) => ({
    type: "DeckifyImage",
    props,
  }),
}));

import { Focusable } from "@decky/ui";
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

  it("assigns distinct data-row-key values for duplicate track URIs and renders inline reorder/remove controls", () => {
    const dupQueue: TrackItem[] = [
      { id: "d1", name: "Repeat Song", artist: "Artist", uri: "spotify:track:dup", duration_ms: 120000 },
      { id: "d1", name: "Repeat Song", artist: "Artist", uri: "spotify:track:dup", duration_ms: 120000 },
    ];

    const tree = QueueTab({
      queueTracks: dupQueue,
      handleToggleLike: vi.fn(),
      onReorderQueueTrack: vi.fn(),
      onRemoveQueueTrack: vi.fn(),
    });

    const itemRows = findNodes(tree, (n) => n.type === InteractiveRow && n.props?.["data-deckify-list-item"] === "true");
    expect(itemRows.length).toBe(2);
    expect(itemRows[0].props["data-row-key"]).toBeTruthy();
    expect(itemRows[1].props["data-row-key"]).toBeTruthy();
    expect(itemRows[0].props["data-row-key"]).not.toBe(itemRows[1].props["data-row-key"]);

    const reorderBtns = findNodes(tree, (n) => n.type === InteractiveRow && n.props?.["aria-label"] === "Reorder track");
    const removeBtns = findNodes(tree, (n) => n.type === InteractiveRow && n.props?.["aria-label"] === "Remove track");
    expect(reorderBtns.length).toBe(2);
    expect(removeBtns.length).toBe(2);
  });

  it("invokes onRemoveQueueTrack for the specific row without triggering playback", () => {
    const onRemoveQueueTrack = vi.fn();
    const handlePlayQueueTrack = vi.fn();

    const tree = QueueTab({
      queueTracks: mockQueue,
      handlePlayQueueTrack,
      handleToggleLike: vi.fn(),
      onRemoveQueueTrack,
    });

    const removeBtns = findNodes(tree, (n) => n.type === InteractiveRow && n.props?.["aria-label"] === "Remove track");
    expect(removeBtns.length).toBe(3);

    removeBtns[1].props.onClick();

    expect(onRemoveQueueTrack).toHaveBeenCalledTimes(1);
    expect(onRemoveQueueTrack).toHaveBeenCalledWith(mockQueue[1], 1);
    expect(handlePlayQueueTrack).not.toHaveBeenCalled();
  });

  it("requires 2-tap Clear Queue confirmation before invoking onClearQueue", () => {
    const onClearQueue = vi.fn();

    // First render: confirmClear = false -> shows "Clear Queue", does not call onClearQueue on first tap
    stateOverrideQueue = [];
    const initialTree = QueueTab({
      queueTracks: mockQueue,
      handleToggleLike: vi.fn(),
      onClearQueue,
    });

    const clearBtn = findNodes(initialTree, (n) => n.type === InteractiveRow && n.props?.["aria-label"] === "Clear Queue")[0];
    expect(clearBtn).toBeDefined();
    expect(cleanText(clearBtn)).toBe("Clear Queue");
    clearBtn.props.onClick();
    expect(onClearQueue).not.toHaveBeenCalled();

    // Second render: confirmClear = true -> shows "Confirm Clear?" (#FF5555) and "Cancel"
    stateOverrideQueue = [true];
    const confirmTree = QueueTab({
      queueTracks: mockQueue,
      handleToggleLike: vi.fn(),
      onClearQueue,
    });

    const confirmBtn = findNodes(confirmTree, (n) => n.type === InteractiveRow && n.props?.["aria-label"] === "Confirm Clear Queue")[0];
    const cancelBtn = findNodes(confirmTree, (n) => n.type === InteractiveRow && n.props?.["aria-label"] === "Cancel Clear Queue")[0];
    expect(confirmBtn).toBeDefined();
    expect(cancelBtn).toBeDefined();
    expect(confirmBtn.props.style?.color).toBe("#FF5555");
    expect(cleanText(confirmBtn)).toBe("Confirm Clear?");
    expect(cleanText(cancelBtn)).toBe("Cancel");

    cancelBtn.props.onClick();
    expect(onClearQueue).not.toHaveBeenCalled();

    confirmBtn.props.onClick();
    expect(onClearQueue).toHaveBeenCalledTimes(1);
    stateOverrideQueue = [];
  });

  it("handles Grab/Move Mode highlight and DIR_UP/DIR_DOWN direction interception", () => {
    const keyedQueue: TrackItem[] = [
      { ...mockQueue[0], _rowKey: "q:1:track1" },
      { ...mockQueue[1], _rowKey: "q:2:track2" },
    ];
    const setQueueTracks = vi.fn();
    const onGrabStateChange = vi.fn();

    // QueueTab useState(confirmClear=false), useGrabMoveOrder useState(grabbedKey="q:2:track2")
    stateOverrideQueue = [false, "q:2:track2"];
    const tree = QueueTab({
      queueTracks: keyedQueue,
      handleToggleLike: vi.fn(),
      onReorderQueueTrack: vi.fn(),
      setQueueTracks,
      onGrabStateChange,
    });

    expect(onGrabStateChange).toHaveBeenCalledWith(true);

    const rows = findNodes(tree, (n) => n.type === InteractiveRow && n.props?.["data-row-key"] === "q:2:track2");
    expect(rows.length).toBe(1);
    expect(rows[0].props.style?.border).toContain("1px solid");

    const listFocusable = findNodes(tree, (n) => n.type === Focusable && typeof n.props?.onGamepadDirection === "function")[0];
    expect(listFocusable).toBeDefined();

    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    const handled = listFocusable.props.onGamepadDirection({
      detail: { button: 9 },
      preventDefault,
      stopPropagation,
    });

    expect(handled).toBe(true);
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(setQueueTracks).toHaveBeenCalledTimes(1);
    const reordered = setQueueTracks.mock.calls[0][0];
    expect(reordered[0]._rowKey).toBe("q:2:track2");
    expect(reordered[1]._rowKey).toBe("q:1:track1");
    stateOverrideQueue = [];
  });
});
