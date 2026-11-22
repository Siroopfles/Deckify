import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@decky/ui", () => ({
  Focusable: ({ children, ...props }: any) => ({ type: "Focusable", props: { children, ...props } }),
}));

vi.mock("./DeckifyImage", () => ({
  DeckifyImage: (props: any) => ({ type: "DeckifyImage", props }),
}));

vi.mock("./InteractiveRow", () => ({
  InteractiveRow: ({ children, ...props }: any) => ({ type: "InteractiveRow", props: { children, ...props } }),
}));

vi.mock("react-icons/fa", () => {
  const Icon = () => ({ type: "Icon", props: {} });
  return {
    FaPlay: Icon,
    FaListUl: Icon,
    FaFolder: Icon,
    FaBroadcastTower: Icon,
    FaUser: Icon,
    FaCompactDisc: Icon,
    FaTrash: Icon,
    FaHeart: Icon,
  };
});

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

let refValues: any[] = [];
let refIdx = 0;
let effectCleanups: Array<() => void> = [];

vi.mock("react", () => ({
  useEffect: (fn: () => void | (() => void)) => {
    const cleanup = fn();
    if (typeof cleanup === "function") effectCleanups.push(cleanup);
  },
  useRef: (init: any) => {
    const idx = refIdx++;
    if (!(idx in refValues)) {
      refValues[idx] = { current: init };
    }
    return refValues[idx];
  },
}));

import { TrackActionModal, TrackActionModalProps } from "./TrackActionModal";
import { InteractiveRow } from "./InteractiveRow";

function findNodes(tree: any, predicate: (node: any) => boolean, results: any[] = []): any[] {
  if (!tree) return results;
  if (Array.isArray(tree)) {
    for (const child of tree) findNodes(child, predicate, results);
    return results;
  }
  if (predicate(tree)) results.push(tree);
  if (tree.props && tree.props.children) {
    findNodes(tree.props.children, predicate, results);
  }
  return results;
}

function makeProps(overrides: Partial<TrackActionModalProps> = {}): TrackActionModalProps {
  return {
    actionTrack: { id: "trk-1", name: "Song One", artist: "Artist", uri: "spotify:track:trk-1" },
    activePlaylist: null,
    showAddToPlaylistModal: false,
    allUserPlaylists: [{ id: "pl-1", name: "Favorites", uri: "spotify:playlist:pl-1" }],
    onClose: vi.fn(),
    onPlayTrack: vi.fn(),
    onAddToQueue: vi.fn(),
    onOpenAddToPlaylist: vi.fn(),
    onCloseAddToPlaylist: vi.fn(),
    onAddTrackToPlaylist: vi.fn(),
    onStartRadio: vi.fn(),
    onOpenArtist: vi.fn(),
    onOpenAlbum: vi.fn(),
    onToggleLike: vi.fn(),
    setMode: vi.fn(),
    ...overrides,
  };
}

describe("TrackActionModal focus management (Gap 3)", () => {
  let rafQueue: Array<{ id: number; cb: FrameRequestCallback }>;
  let nextRafId: number;
  let origDoc: any;
  let origRaf: any;
  let origCancelRaf: any;

  beforeEach(() => {
    refValues = [];
    refIdx = 0;
    effectCleanups = [];
    rafQueue = [];
    nextRafId = 1;

    origDoc = (globalThis as any).document;
    origRaf = (globalThis as any).requestAnimationFrame;
    origCancelRaf = (globalThis as any).cancelAnimationFrame;

    (globalThis as any).document = { activeElement: null };
    (globalThis as any).requestAnimationFrame = vi.fn((cb: FrameRequestCallback) => {
      const id = nextRafId++;
      rafQueue.push({ id, cb });
      return id;
    });
    (globalThis as any).cancelAnimationFrame = vi.fn((id: number) => {
      rafQueue = rafQueue.filter((item) => item.id !== id);
    });
  });

  afterEach(() => {
    (globalThis as any).document = origDoc;
    (globalThis as any).requestAnimationFrame = origRaf;
    (globalThis as any).cancelAnimationFrame = origCancelRaf;
  });

  it("saves document.activeElement and focuses first InteractiveRow (tabIndex=0) via requestAnimationFrame on open", () => {
    const previousFocusEl = { focus: vi.fn() };
    const playRowEl = { focus: vi.fn() };
    (globalThis as any).document.activeElement = previousFocusEl;

    const tree = TrackActionModal(makeProps());
    const modalNode = findNodes(tree, (n) => n.props?.["data-testid"] === "track-action-modal")[0];
    expect(modalNode).toBeDefined();

    // First InteractiveRow ("Play Track") has tabIndex=0
    const rows = findNodes(modalNode, (n) => n.type === InteractiveRow);
    expect(rows[0].props.tabIndex).toBe(0);

    // Wire modalContainerRef.current before flushing rAF
    modalNode.props.ref.current = {
      querySelector: vi.fn((sel: string) => (sel === '[tabindex="0"]' ? playRowEl : null)),
    };

    expect(rafQueue.length).toBe(1);
    rafQueue.shift()!.cb(16);
    expect(playRowEl.focus).toHaveBeenCalledTimes(1);
  });

  it("restores focus to previously active element when actionTrack becomes null or unmounts", () => {
    const previousFocusEl = { focus: vi.fn() };
    (globalThis as any).document.activeElement = previousFocusEl;

    TrackActionModal(makeProps());
    expect(previousFocusEl.focus).not.toHaveBeenCalled();

    // Close modal (actionTrack -> null)
    refIdx = 0;
    TrackActionModal(makeProps({ actionTrack: null }));
    expect(previousFocusEl.focus).toHaveBeenCalledTimes(1);

    // Re-open and test unmount cleanup
    refValues = [];
    refIdx = 0;
    effectCleanups = [];
    const secondPrevEl = { focus: vi.fn() };
    (globalThis as any).document.activeElement = secondPrevEl;
    TrackActionModal(makeProps());
    for (const cleanup of effectCleanups) cleanup();
    expect(secondPrevEl.focus).toHaveBeenCalledTimes(1);
  });

  it("transfers focus to first playlist row (or Cancel when empty) inside playlist-picker-overlay", () => {
    const previousFocusEl = { focus: vi.fn() };
    const firstPlaylistEl = { focus: vi.fn() };
    (globalThis as any).document.activeElement = previousFocusEl;

    const tree = TrackActionModal(makeProps({ showAddToPlaylistModal: true }));
    const pickerNode = findNodes(tree, (n) => n.props?.["data-testid"] === "playlist-picker-overlay")[0];
    expect(pickerNode).toBeDefined();

    const rows = findNodes(pickerNode, (n) => n.type === InteractiveRow);
    expect(rows[0].props.tabIndex).toBe(0);
    expect(rows[1].props.tabIndex).toBeUndefined(); // Cancel should not have tabIndex=0 when playlists exist

    pickerNode.props.ref.current = {
      querySelector: vi.fn((sel: string) => (sel === '[tabindex="0"]' ? firstPlaylistEl : null)),
    };
    rafQueue.shift()!.cb(16);
    expect(firstPlaylistEl.focus).toHaveBeenCalledTimes(1);

    // Empty playlists -> Cancel gets tabIndex=0
    refIdx = 0;
    const emptyTree = TrackActionModal(makeProps({ showAddToPlaylistModal: true, allUserPlaylists: [] }));
    const emptyPickerNode = findNodes(emptyTree, (n) => n.props?.["data-testid"] === "playlist-picker-overlay")[0];
    const emptyRows = findNodes(emptyPickerNode, (n) => n.type === InteractiveRow);
    expect(emptyRows.length).toBe(1);
    expect(emptyRows[0].props.tabIndex).toBe(0);
  });
});

function collectText(tree: any): string {
  if (tree == null || typeof tree === "boolean") return "";
  if (typeof tree === "string" || typeof tree === "number") return String(tree);
  if (Array.isArray(tree)) return tree.map(collectText).join(" ");
  if (typeof tree === "object" && tree.props) return collectText(tree.props.children);
  return "";
}

describe("TrackActionModal spoken content labels (G-24-2)", () => {
  beforeEach(() => {
    refValues = [];
    refIdx = 0;
    effectCleanups = [];
    (globalThis as any).document = { activeElement: null };
    (globalThis as any).requestAnimationFrame = vi.fn(() => 1);
    (globalThis as any).cancelAnimationFrame = vi.fn();
  });

  it("renders music track labels (Play Track, Start Track Radio, Go to Artist, Go to Album)", () => {
    const tree = TrackActionModal(
      makeProps({
        actionTrack: {
          id: "trk-1",
          name: "Song One",
          artist: "Band Name",
          artist_id: "art-1",
          album: "Album Name",
          album_id: "alb-1",
          uri: "spotify:track:trk-1",
          media_type: "track",
        },
      })
    );
    const text = collectText(tree);
    expect(text).toContain("Play Track");
    expect(text).toContain("Start Track Radio");
    expect(text).toContain("Go to Artist (Band Name)");
    expect(text).toContain("Go to Album");
    expect(text).not.toContain("Play Episode");
    expect(text).not.toContain("Go to Show");
  });

  it("renders episode/show labels and hides Start Track Radio and Go to Album for podcast episodes and audiobooks", () => {
    for (const mediaType of ["episode", "audiobook"] as const) {
      refValues = [];
      refIdx = 0;
      const tree = TrackActionModal(
        makeProps({
          actionTrack: {
            id: "ep-1",
            name: "Episode One",
            artist: "Podcast Show",
            artist_id: "show-1",
            album: "Podcast Show",
            album_id: "alb-should-hide",
            uri: `spotify:${mediaType}:ep-1`,
            media_type: mediaType,
          },
        })
      );
      const text = collectText(tree);
      expect(text).toContain("Play Episode");
      expect(text).toContain("Go to Show (Podcast Show)");
      expect(text).not.toContain("Play Track");
      expect(text).not.toContain("Start Track Radio");
      expect(text).not.toContain("Go to Artist");
      expect(text).not.toContain("Go to Album");
    }
  });
});
