import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@decky/ui", () => ({
  Focusable: ({ children, ...props }: any) => ({ type: "Focusable", props: { children, ...props } }),
  TextField: (props: any) => ({ type: "TextField", props }),
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
    FaArrowsAltV: Icon,
    FaPlus: Icon,
    FaTimes: Icon,
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

let stateValues: any[] = [];
let stateIdx = 0;
let refValues: any[] = [];
let refIdx = 0;
let effectCleanups: Array<() => void> = [];

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

import { TextField } from "@decky/ui";
import {
  TrackActionModal,
  TrackActionModalProps,
  getPlaylistAddCounts,
  recordPlaylistAddCount,
} from "./TrackActionModal";
import { DeckifyImage } from "./DeckifyImage";
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
    stateValues = [];
    stateIdx = 0;
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
    // rows[0] is "+ New Playlist with Track", rows[1] is first playlist, rows[2] is "Cancel"
    expect(rows[1].props.tabIndex).toBe(0);
    expect(rows[2].props.tabIndex).toBeUndefined(); // Cancel should not have tabIndex=0 when playlists exist

    pickerNode.props.ref.current = {
      querySelector: vi.fn((sel: string) => (sel === '[tabindex="0"]' ? firstPlaylistEl : null)),
    };
    rafQueue.shift()!.cb(16);
    expect(firstPlaylistEl.focus).toHaveBeenCalledTimes(1);

    // Empty playlists -> Cancel gets tabIndex=0
    stateIdx = 0;
    refIdx = 0;
    const emptyTree = TrackActionModal(makeProps({ showAddToPlaylistModal: true, allUserPlaylists: [] }));
    const emptyPickerNode = findNodes(emptyTree, (n) => n.props?.["data-testid"] === "playlist-picker-overlay")[0];
    const emptyRows = findNodes(emptyPickerNode, (n) => n.type === InteractiveRow);
    expect(emptyRows.length).toBe(2);
    expect(emptyRows[1].props.tabIndex).toBe(0);
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
    stateValues = [];
    stateIdx = 0;
    refValues = [];
    refIdx = 0;
    effectCleanups = [];
    (globalThis as any).document = { activeElement: null };
    (globalThis as any).requestAnimationFrame = vi.fn(() => 1);
    (globalThis as any).cancelAnimationFrame = vi.fn();
  });

  it("renders music track labels (Play Track, Start Song Radio, Go to Artist, Go to Album)", () => {
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
    expect(text).toContain("Start Song Radio");
    expect(text).toContain("Go to Artist (Band Name)");
    expect(text).toContain("Go to Album");
    expect(text).not.toContain("Play Episode");
    expect(text).not.toContain("Go to Show");
  });

  it("renders episode/show labels and hides Start Song Radio and Go to Album for podcast episodes and audiobooks", () => {
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
      expect(text).not.toContain("Start Song Radio");
      expect(text).not.toContain("Go to Artist");
      expect(text).not.toContain("Go to Album");
    }
  });
});

describe("TrackActionModal Phase 27 Queue & Playlist actions (27-04)", () => {
  beforeEach(() => {
    stateValues = [];
    stateIdx = 0;
    refValues = [];
    refIdx = 0;
    effectCleanups = [];
    (globalThis as any).document = { activeElement: null };
    (globalThis as any).requestAnimationFrame = vi.fn(() => 1);
    (globalThis as any).cancelAnimationFrame = vi.fn();
  });

  it("renders Move in Queue and Remove from Queue in queue mode", () => {
    const onMoveInQueue = vi.fn();
    const onRemoveFromQueue = vi.fn();
    const tree = TrackActionModal(
      makeProps({
        mode: "queue",
        onMoveInQueue,
        onRemoveFromQueue,
      }),
    );
    const text = collectText(tree);
    expect(text).toContain("Move in Queue");
    expect(text).toContain("Remove from Queue");

    const rows = findNodes(tree, (n) => n.type === InteractiveRow);
    const moveRow = rows.find((r) => collectText(r).includes("Move in Queue"));
    const removeRow = rows.find((r) => collectText(r).includes("Remove from Queue"));
    moveRow.props.onClick();
    removeRow.props.onClick();
    expect(onMoveInQueue).toHaveBeenCalledTimes(1);
    expect(onRemoveFromQueue).toHaveBeenCalledTimes(1);
  });

  it("renders Move Track and Remove from Playlist only when playlist is editable", () => {
    const editableTree = TrackActionModal(
      makeProps({
        mode: "playlists",
        isEditablePlaylist: true,
        canReorderPlaylist: true,
        onMoveInPlaylist: vi.fn(),
        onRemoveFromPlaylist: vi.fn(),
      }),
    );
    expect(collectText(editableTree)).toContain("Move Track");
    expect(collectText(editableTree)).toContain("Remove from Playlist");

    stateValues = [];
    stateIdx = 0;
    refValues = [];
    refIdx = 0;
    const readOnlyTree = TrackActionModal(
      makeProps({
        mode: "playlists",
        isEditablePlaylist: false,
        onMoveInPlaylist: vi.fn(),
        onRemoveFromPlaylist: vi.fn(),
      }),
    );
    expect(collectText(readOnlyTree)).not.toContain("Move Track");
    expect(collectText(readOnlyTree)).not.toContain("Remove from Playlist");
  });

  it("filters out non-editable playlists in picker, renders + New Playlist with Track at top, and includes TextField search", () => {
    const tree = TrackActionModal(
      makeProps({
        showAddToPlaylistModal: true,
        allUserPlaylists: [
          { id: "pl-edit", name: "My Mix", uri: "spotify:playlist:pl-edit", is_editable: true },
          { id: "pl-ro", name: "Discover Weekly", uri: "spotify:playlist:pl-ro", is_editable: false },
        ],
      }),
    );
    const picker = findNodes(tree, (n) => n.props?.["data-testid"] === "playlist-picker-overlay")[0];
    const text = collectText(picker);
    expect(text).toContain("+ New Playlist with Track");
    expect(text).toContain("My Mix");
    expect(text).not.toContain("Discover Weekly");

    const textFields = findNodes(picker, (n) => n.type === TextField);
    expect(textFields.length).toBeGreaterThanOrEqual(1);
    expect(textFields[0].props.label).toBe("Search playlists");

    const rows = findNodes(picker, (n) => n.type === InteractiveRow);
    expect(collectText(rows[0])).toContain("+ New Playlist with Track");
  });

  it("renders DeckifyImage cover art on playlist picker rows and sorts frequent playlists first while preserving tie order", () => {
    const store: Record<string, string> = {
      deckify_playlist_add_counts: JSON.stringify({ "pl-3": 5, "pl-1": 2 }),
    };
    const origStorage = (globalThis as any).localStorage;
    (globalThis as any).localStorage = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
    };

    try {
      const tree = TrackActionModal(
        makeProps({
          showAddToPlaylistModal: true,
          allUserPlaylists: [
            { id: "pl-1", name: "Alpha", uri: "spotify:playlist:pl-1", image_url: "https://img/1.jpg", is_editable: true },
            { id: "pl-2", name: "Beta", uri: "spotify:playlist:pl-2", image_url: "https://img/2.jpg", is_editable: true },
            { id: "pl-3", name: "Gamma", uri: "spotify:playlist:pl-3", image_url: "https://img/3.jpg", is_editable: true },
            { id: "pl-4", name: "Delta", uri: "spotify:playlist:pl-4", is_editable: true },
          ],
        }),
      );
      const picker = findNodes(tree, (n) => n.props?.["data-testid"] === "playlist-picker-overlay")[0];
      const images = findNodes(picker, (n) => n.type === DeckifyImage);
      expect(images.length).toBe(4);
      expect(images[0].props.src).toBe("https://img/3.jpg");
      expect(images[0].props.width).toBe(28);
      expect(images[0].props.height).toBe(28);
      expect(images[1].props.src).toBe("https://img/1.jpg");
      expect(images[2].props.src).toBe("https://img/2.jpg");
      expect(images[3].props.src).toBeUndefined();

      const rows = findNodes(picker, (n) => n.type === InteractiveRow);
      // rows[0] is "+ New Playlist with Track", rows[1..4] are sorted playlists, rows[5] is "Cancel"
      expect(collectText(rows[1])).toContain("Gamma");
      expect(collectText(rows[2])).toContain("Alpha");
      // Ties (count 0) preserve original order: Beta before Delta
      expect(collectText(rows[3])).toContain("Beta");
      expect(collectText(rows[4])).toContain("Delta");

      recordPlaylistAddCount("pl-2");
      expect(getPlaylistAddCounts()["pl-2"]).toBe(1);

      store.deckify_playlist_add_counts = "{bad-json";
      expect(getPlaylistAddCounts()).toEqual({});
    } finally {
      (globalThis as any).localStorage = origStorage;
    }
  });
});
