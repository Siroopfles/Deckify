import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  useEffect: (fn: () => void | (() => void)) => fn(),
  useCallback: (fn: any) => fn,
  useMemo: (fn: () => any) => fn(),
  useRef: (init: any) => {
    const idx = refIdx++;
    if (!(idx in refValues)) {
      refValues[idx] = { current: init };
    }
    return refValues[idx];
  },
}));

vi.mock("@decky/api", () => ({
  callable: () => vi.fn(),
}));

vi.mock("@decky/ui", () => ({
  DialogButton: ({ children, ...props }: any) => ({ type: "DialogButton", props: { children, ...props } }),
  Focusable: ({ children, ...props }: any) => ({ type: "Focusable", props: { children, ...props } }),
  TextField: (props: any) => ({ type: "TextField", props }),
  GamepadButton: { DIR_UP: 9, DIR_DOWN: 10 },
}));

vi.mock("../common/DeckifyImage", () => ({
  DeckifyImage: (props: any) => ({ type: "DeckifyImage", props }),
}));

import { DialogButton, Focusable, TextField } from "@decky/ui";
import { PlaylistsTab, PlaylistDeleteConfirmModal, PlaylistsTabProps } from "./PlaylistsTab";
import { InteractiveRow } from "../common/InteractiveRow";
import { TrackRowItem } from "../common/TrackRowItem";

function expandTree(node: any): any {
  if (!node || typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map(expandTree);
  if (
    typeof node.type === "function" &&
    node.type !== InteractiveRow &&
    node.type !== TrackRowItem &&
    node.type !== TextField &&
    node.type !== Focusable &&
    node.type !== DialogButton
  ) {
    return expandTree(node.type(node.props));
  }
  if (node.props?.children) {
    return { ...node, props: { ...node.props, children: expandTree(node.props.children) } };
  }
  return node;
}

function findNodes(tree: any, predicate: (node: any) => boolean, results: any[] = []): any[] {
  if (!tree) return results;
  if (Array.isArray(tree)) {
    for (const child of tree) findNodes(child, predicate, results);
    return results;
  }
  if (predicate(tree)) results.push(tree);
  if (tree.props?.children) findNodes(tree.props.children, predicate, results);
  return results;
}

function collectText(tree: any): string {
  if (tree == null || typeof tree === "boolean") return "";
  if (typeof tree === "string" || typeof tree === "number") return String(tree);
  if (Array.isArray(tree)) return tree.map(collectText).join(" ");
  if (typeof tree === "object" && tree.props) return collectText(tree.props.children);
  return "";
}

function makeProps(overrides: Partial<PlaylistsTabProps> = {}): PlaylistsTabProps {
  return {
    folders: [],
    allUserPlaylists: [
      { id: "pl-1", name: "My Playlist", uri: "spotify:playlist:pl-1", is_editable: true, track_count: 2 },
    ],
    activePlaylist: null,
    playlistTracks: [
      { id: "t1", name: "Alpha", artist: "Artist 1", uri: "spotify:track:t1", duration_ms: 180000 },
      { id: "t2", name: "Beta", artist: "Artist 2", uri: "spotify:track:t2", duration_ms: 200000 },
    ],
    loadingContent: false,
    audioBackend: "librespot",
    mixingBusy: false,
    onOpenPlaylist: vi.fn(),
    onClosePlaylist: vi.fn(),
    onPlayTrack: vi.fn(),
    onToggleMix: vi.fn(),
    onToggleLike: vi.fn(),
    onOpenActions: vi.fn(),
    onCreatePlaylist: vi.fn(async () => {}),
    onCreateFolder: vi.fn(async () => {}),
    onRenameFolder: vi.fn(async () => {}),
    onDeleteFolder: vi.fn(async () => {}),
    ...overrides,
  };
}

describe("PlaylistsTab Phase 27 CRUD, filtering, ownership & Grab/Move (27-04)", () => {
  let origDoc: any;
  let origRaf: any;
  let origCancelRaf: any;

  beforeEach(() => {
    stateValues = [];
    stateIdx = 0;
    refValues = [];
    refIdx = 0;
    origDoc = (globalThis as any).document;
    origRaf = (globalThis as any).requestAnimationFrame;
    origCancelRaf = (globalThis as any).cancelAnimationFrame;
    (globalThis as any).document = { activeElement: null };
    (globalThis as any).requestAnimationFrame = vi.fn(() => 1);
    (globalThis as any).cancelAnimationFrame = vi.fn();
  });

  afterEach(() => {
    (globalThis as any).document = origDoc;
    (globalThis as any).requestAnimationFrame = origRaf;
    (globalThis as any).cancelAnimationFrame = origCancelRaf;
  });

  it("renders Name + Description TextFields in Create Playlist and rejects empty name", async () => {
    const onCreatePlaylist = vi.fn(async () => {});
    const props = makeProps({ onCreatePlaylist });
    const initialTree = expandTree(PlaylistsTab(props));
    const newPlBtn = findNodes(initialTree, (n) => n.type === InteractiveRow && collectText(n).includes("New Playlist"))[0];
    newPlBtn.props.onClick();

    stateIdx = 0;
    refIdx = 0;
    const formTree = expandTree(PlaylistsTab(props));
    const formPanel = findNodes(formTree, (n) => n.props?.["data-testid"] === "playlist-form-panel")[0];
    expect(formPanel).toBeDefined();

    const fields = findNodes(formPanel, (n) => n.type === TextField);
    expect(fields.map((f) => f.props.label)).toEqual(["Playlist Name", "Description (Optional)"]);

    const createBtn = findNodes(formPanel, (n) => n.type === InteractiveRow && collectText(n).includes("Create"))[0];
    await createBtn.props.onClick();
    expect(onCreatePlaylist).not.toHaveBeenCalled();

    stateIdx = 0;
    refIdx = 0;
    const errorTree = expandTree(PlaylistsTab(props));
    expect(collectText(errorTree)).toContain("Playlist name cannot be empty. Enter a name to continue.");
  });

  it("hides Edit Details, Reorder, and Remove on read-only playlists and labels delete as Unfollow Playlist", () => {
    const tree = expandTree(
      PlaylistsTab(
        makeProps({
          activePlaylist: { id: "pl-ro", name: "Discover Weekly", uri: "spotify:playlist:pl-ro", is_editable: false },
        }),
      ),
    );
    expect(collectText(tree)).not.toContain("Edit Details");
    expect(collectText(tree)).toContain("Unfollow Playlist");

    const rows = findNodes(tree, (n) => n.type === TrackRowItem);
    expect(rows.length).toBe(2);
    expect(rows[0].props.canReorder).toBe(false);
    expect(rows[0].props.canRemove).toBe(false);
  });

  it("disables Grab/Move when trackFilter is non-empty and preserves originalIndex", () => {
    const onRemovePlaylistTrack = vi.fn(async () => {});
    const props = makeProps({
      activePlaylist: { id: "pl-1", name: "My Playlist", uri: "spotify:playlist:pl-1", is_editable: true },
      onRemovePlaylistTrack,
    });
    const tree1 = expandTree(PlaylistsTab(props));
    const filterField = findNodes(tree1, (n) => n.type === TextField && n.props.label === "Filter tracks")[0];
    filterField.props.onChange({ target: { value: "Beta" } });

    stateIdx = 0;
    refIdx = 0;
    const filteredTree = expandTree(PlaylistsTab(props));
    const rows = findNodes(filteredTree, (n) => n.type === TrackRowItem);
    expect(rows.length).toBe(1);
    expect(rows[0].props.track.name).toBe("Beta");
    expect(rows[0].props.index).toBe(1);
    expect(rows[0].props.canReorder).toBe(false);

    rows[0].props.onRemoveTrack(rows[0].props.track, rows[0].props.index);
    expect(onRemovePlaylistTrack).toHaveBeenCalledWith("pl-1", rows[0].props.track, 1);
  });

  it("renders empty states for overview filter and track filter", () => {
    const props = makeProps();
    const overviewTree1 = expandTree(PlaylistsTab(props));
    const ovField = findNodes(overviewTree1, (n) => n.type === TextField && n.props.label === "Filter playlists & folders")[0];
    ovField.props.onChange({ target: { value: "zzzz" } });

    stateIdx = 0;
    refIdx = 0;
    const overviewEmpty = expandTree(PlaylistsTab(props));
    const ovText = collectText(overviewEmpty);
    expect(ovText).toContain("No playlists or folders match");
    expect(ovText).toContain("zzzz");
    expect(ovText).toContain("Clear the filter to view all playlists.");

    stateValues = [];
    stateIdx = 0;
    refIdx = 0;
    const detailProps = makeProps({
      activePlaylist: { id: "pl-1", name: "My Playlist", uri: "spotify:playlist:pl-1", is_editable: true },
    });
    const detailTree1 = expandTree(PlaylistsTab(detailProps));
    const trField = findNodes(detailTree1, (n) => n.type === TextField && n.props.label === "Filter tracks")[0];
    trField.props.onChange({ target: { value: "zzzz" } });

    stateIdx = 0;
    refIdx = 0;
    const detailEmpty = expandTree(PlaylistsTab(detailProps));
    const trText = collectText(detailEmpty);
    expect(trText).toContain("No tracks match");
    expect(trText).toContain("zzzz");
    expect(trText).toContain("Clear the track filter to view all songs.");
  });

  it("sets initial focus on Cancel in PlaylistDeleteConfirmModal", () => {
    const cancelEl = { focus: vi.fn() };
    let rafCb: FrameRequestCallback | null = null;
    (globalThis as any).requestAnimationFrame = vi.fn((cb: FrameRequestCallback) => {
      rafCb = cb;
      return 1;
    });

    const tree = PlaylistDeleteConfirmModal({
      playlist: { id: "pl-1", name: "My Playlist", uri: "spotify:playlist:pl-1", is_editable: true },
      onConfirm: vi.fn(async () => {}),
      onCancel: vi.fn(),
    });
    const modalNode = findNodes(tree, (n) => n.props?.["data-testid"] === "playlist-delete-modal")[0];
    expect(collectText(modalNode)).toContain("Delete Playlist");
    const cancelBtn = findNodes(modalNode, (n) => n.props?.["data-testid"] === "playlist-delete-cancel")[0];
    expect(cancelBtn.props.tabIndex).toBe(0);

    modalNode.props.ref.current = {
      querySelector: vi.fn((sel: string) => (sel === '[data-testid="playlist-delete-cancel"]' ? cancelEl : null)),
    };
    rafCb!(16);
    expect(cancelEl.focus).toHaveBeenCalledTimes(1);
  });

  it("traps vgp_oncancel and onCancelButton in PlaylistDeleteConfirmModal without bubbling", () => {
    const onCancel = vi.fn();
    const listeners: Record<string, (e: any) => void> = {};
    const mockEl = {
      addEventListener: vi.fn((ev: string, fn: (e: any) => void) => {
        listeners[ev] = fn;
      }),
      removeEventListener: vi.fn(),
      querySelector: vi.fn(() => null),
    };

    const props = {
      playlist: { id: "pl-1", name: "My Playlist", uri: "spotify:playlist:pl-1", is_editable: true },
      onConfirm: vi.fn(async () => {}),
      onCancel,
    };

    const tree1 = PlaylistDeleteConfirmModal(props);
    const modalNode1 = findNodes(tree1, (n) => n.props?.["data-testid"] === "playlist-delete-modal")[0];
    modalNode1.props.ref.current = mockEl;

    stateIdx = 0;
    refIdx = 0;
    const tree2 = PlaylistDeleteConfirmModal(props);

    expect(mockEl.addEventListener).toHaveBeenCalledWith("vgp_oncancel", expect.any(Function));
    const evt = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      stopImmediatePropagation: vi.fn(),
    };
    listeners["vgp_oncancel"](evt);
    expect(evt.preventDefault).toHaveBeenCalledTimes(1);
    expect(evt.stopPropagation).toHaveBeenCalledTimes(1);
    expect(evt.stopImmediatePropagation).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);

    const outerFocusable = findNodes(tree2, (n) => n.type === Focusable && n.props?.["flow-children"] === "column")[0];
    expect(typeof outerFocusable.props.onCancelButton).toBe("function");
    outerFocusable.props.onCancelButton();
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it("renders horizontal overview metadata filter chips, filters folders/uncategorized playlists, and searches description/owner_id", () => {
    const folderPlEditable: any = {
      id: "pl-f1",
      name: "Gym Mix",
      uri: "spotify:playlist:pl-f1",
      is_editable: true,
      collaborative: true,
      description: "High BPM workout",
      owner_id: "user-abc",
    };
    const folderPlFollowed: any = {
      id: "pl-f2",
      name: "Editorial Chill",
      uri: "spotify:playlist:pl-f2",
      is_editable: false,
      collaborative: false,
      description: "Curated beats",
      owner_id: "spotify",
    };
    const uncatEditable: any = {
      id: "pl-u1",
      name: "Late Night",
      uri: "spotify:playlist:pl-u1",
      is_editable: true,
      collaborative: false,
      description: "Synthwave favorites",
      owner_id: "me",
    };
    const uncatFollowed: any = {
      id: "pl-u2",
      name: "Release Radar",
      uri: "spotify:playlist:pl-u2",
      is_editable: false,
      collaborative: false,
      description: "Weekly drops",
      owner_id: "spotify",
    };

    const props = makeProps({
      folders: [{ id: "folder-1", name: "Workouts", playlist_ids: ["pl-f1", "pl-f2"], playlists: [folderPlEditable, folderPlFollowed], subfolders: [] }],
      allUserPlaylists: [folderPlEditable, folderPlFollowed, uncatEditable, uncatFollowed],
      pinnedUris: new Set(["spotify:playlist:pl-u1"]),
    });

    const tree1 = expandTree(PlaylistsTab(props));
    const chipBar = findNodes(tree1, (n) => n.props?.["data-testid"] === "overview-meta-filter-bar")[0];
    expect(chipBar).toBeDefined();
    expect(chipBar.props["flow-children"]).toBe("horizontal");

    const chips = findNodes(chipBar, (n) => n.type === DialogButton);
    expect(chips.map((c) => collectText(c).trim())).toEqual(["All", "Editable", "Followed", "Collaborative", "Pinned"]);
    expect(chips[0].props.style.width).toBe("auto");
    expect(chips[0].props.style.minWidth).toBe("auto");

    // Click Followed -> only folderPlFollowed & uncatFollowed remain
    chips.find((c) => collectText(c).trim() === "Followed")!.props.onClick();
    stateIdx = 0;
    refIdx = 0;
    const followedTree = expandTree(PlaylistsTab(props));
    expect(collectText(followedTree)).toContain("Editorial Chill");
    expect(collectText(followedTree)).toContain("Release Radar");
    expect(collectText(followedTree)).not.toContain("Gym Mix");
    expect(collectText(followedTree)).not.toContain("Late Night");

    // Click Collaborative -> only folderPlEditable remains
    const followedBar = findNodes(followedTree, (n) => n.props?.["data-testid"] === "overview-meta-filter-bar")[0];
    findNodes(followedBar, (n) => n.type === DialogButton && collectText(n).trim() === "Collaborative")[0].props.onClick();
    stateIdx = 0;
    refIdx = 0;
    const collabTree = expandTree(PlaylistsTab(props));
    expect(collectText(collabTree)).toContain("Gym Mix");
    expect(collectText(collabTree)).not.toContain("Editorial Chill");
    expect(collectText(collabTree)).not.toContain("Late Night");

    // Click Pinned -> only uncatEditable remains
    const collabBar = findNodes(collabTree, (n) => n.props?.["data-testid"] === "overview-meta-filter-bar")[0];
    findNodes(collabBar, (n) => n.type === DialogButton && collectText(n).trim() === "Pinned")[0].props.onClick();
    stateIdx = 0;
    refIdx = 0;
    const pinnedTree = expandTree(PlaylistsTab(props));
    expect(collectText(pinnedTree)).toContain("Late Night");
    expect(collectText(pinnedTree)).not.toContain("Gym Mix");

    // Clear back to All and search by description + owner_id
    const pinnedBar = findNodes(pinnedTree, (n) => n.props?.["data-testid"] === "overview-meta-filter-bar")[0];
    findNodes(pinnedBar, (n) => n.type === DialogButton && collectText(n).trim() === "Clear")[0].props.onClick();
    stateIdx = 0;
    refIdx = 0;
    const resetTree = expandTree(PlaylistsTab(props));
    const ovField = findNodes(resetTree, (n) => n.type === TextField && n.props.label === "Filter playlists & folders")[0];
    ovField.props.onChange({ target: { value: "Synthwave" } });
    stateIdx = 0;
    refIdx = 0;
    const descTree = expandTree(PlaylistsTab(props));
    expect(collectText(descTree)).toContain("Late Night");
    expect(collectText(descTree)).not.toContain("Gym Mix");

    const ovField2 = findNodes(descTree, (n) => n.type === TextField && n.props.label === "Filter playlists & folders")[0];
    ovField2.props.onChange({ target: { value: "user-abc" } });
    stateIdx = 0;
    refIdx = 0;
    const ownerTree = expandTree(PlaylistsTab(props));
    expect(collectText(ownerTree)).toContain("Gym Mix");
    expect(collectText(ownerTree)).not.toContain("Late Night");
  });

  it("renders detail track filter chips (All, Liked, Clear), searches album, and gates Grab/Move on metadata filter", () => {
    const grabTriggerRef = { current: null as ((track: any) => void) | null };
    const onGrabStateChange = vi.fn();
    const tracks = [
      { id: "t1", name: "Alpha", artist: "Artist 1", album: "Neon Nights", uri: "spotify:track:t1", duration_ms: 180000, is_liked: true },
      { id: "t2", name: "Beta", artist: "Artist 2", album: "Solar Dawn", uri: "spotify:track:t2", duration_ms: 200000, is_liked: false },
    ];
    const props = makeProps({
      activePlaylist: { id: "pl-1", name: "My Playlist", uri: "spotify:playlist:pl-1", is_editable: true },
      playlistTracks: tracks,
      grabTriggerRef,
      onGrabStateChange,
    });

    const tree1 = expandTree(PlaylistsTab(props));
    const chipBar = findNodes(tree1, (n) => n.props?.["data-testid"] === "track-meta-filter-bar")[0];
    expect(chipBar).toBeDefined();
    expect(chipBar.props["flow-children"]).toBe("horizontal");
    const chips1 = findNodes(chipBar, (n) => n.type === DialogButton);
    expect(chips1.map((c) => collectText(c).trim())).toEqual(["All", "Liked"]);

    // When no filter is active, canReorder is true
    const rowsUnfiltered = findNodes(tree1, (n) => n.type === TrackRowItem);
    expect(rowsUnfiltered[0].props.canReorder).toBe(true);

    // Activate Liked chip -> only Alpha remains, Clear chip appears, canReorder=false, grabTriggerRef blocked
    chips1.find((c) => collectText(c).trim() === "Liked")!.props.onClick();
    stateIdx = 0;
    refIdx = 0;
    const likedTree = expandTree(PlaylistsTab(props));
    const likedBar = findNodes(likedTree, (n) => n.props?.["data-testid"] === "track-meta-filter-bar")[0];
    const likedChips = findNodes(likedBar, (n) => n.type === DialogButton);
    expect(likedChips.map((c) => collectText(c).trim())).toEqual(["All", "Liked", "Clear"]);

    const rowsLiked = findNodes(likedTree, (n) => n.type === TrackRowItem);
    expect(rowsLiked.length).toBe(1);
    expect(rowsLiked[0].props.track.name).toBe("Alpha");
    expect(rowsLiked[0].props.canReorder).toBe(false);

    // grabTriggerRef should not enter grab mode while Liked filter is active
    onGrabStateChange.mockClear();
    grabTriggerRef.current?.(tracks[0]);
    stateIdx = 0;
    refIdx = 0;
    expandTree(PlaylistsTab(props));
    expect(onGrabStateChange).toHaveBeenLastCalledWith(false);

    // Clear filter and search by album name
    likedChips.find((c) => collectText(c).trim() === "Clear")!.props.onClick();
    stateIdx = 0;
    refIdx = 0;
    const clearedTree = expandTree(PlaylistsTab(props));
    const trField = findNodes(clearedTree, (n) => n.type === TextField && n.props.label === "Filter tracks")[0];
    trField.props.onChange({ target: { value: "Solar Dawn" } });
    stateIdx = 0;
    refIdx = 0;
    const albumTree = expandTree(PlaylistsTab(props));
    const albumRows = findNodes(albumTree, (n) => n.type === TrackRowItem);
    expect(albumRows.length).toBe(1);
    expect(albumRows[0].props.track.name).toBe("Beta");
    expect(albumRows[0].props.canReorder).toBe(false);
  });
});
