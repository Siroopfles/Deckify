import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetPlaylists = vi.fn();
const mockGetSavedAlbums = vi.fn();
const mockSearchSpotify = vi.fn();

vi.mock("@decky/api", () => ({
  callable: (name: string) => {
    if (name === "get_playlists") return (...args: any[]) => mockGetPlaylists(...args);
    if (name === "get_saved_albums") return (...args: any[]) => mockGetSavedAlbums(...args);
    if (name === "search_spotify") return (...args: any[]) => mockSearchSpotify(...args);
    return vi.fn().mockResolvedValue({ ok: true });
  },
}));

vi.mock("@decky/ui", () => ({
  ModalRoot: ({ children, ...props }: any) => ({ type: "ModalRoot", props: { children, ...props } }),
  Focusable: ({ children, ...props }: any) => ({ type: "Focusable", props: { children, ...props } }),
  DialogButton: ({ children, ...props }: any) => ({ type: "DialogButton", props: { children, ...props } }),
  TextField: (props: any) => ({ type: "TextField", props }),
}));

vi.mock("../common/DeckifyImage", () => ({
  DeckifyImage: (props: any) => ({ type: "DeckifyImage", props }),
}));

vi.mock("react-icons/fa", () => ({
  FaMusic: () => ({ type: "FaMusic" }),
  FaCompactDisc: () => ({ type: "FaCompactDisc" }),
  FaSearch: () => ({ type: "FaSearch" }),
  FaTimes: () => ({ type: "FaTimes" }),
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
  useRef: (init: any) => ({ current: init }),
}));

import { PlaylistPickerModal } from "./PlaylistPickerModal";
import { InteractiveRow } from "../common/InteractiveRow";

function typeName(n: any): string {
  return typeof n?.type === "string" ? n.type : n?.type?.name || "";
}

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

function findText(tree: any): string {
  if (!tree) return "";
  if (typeof tree === "string" || typeof tree === "number") return String(tree);
  if (Array.isArray(tree)) return tree.map(findText).join(" ");
  if (tree.props && tree.props.children) return findText(tree.props.children);
  return "";
}

const samplePlaylists = [
  { id: "p1", name: "Synthwave Mix", uri: "spotify:playlist:p1", image_url: "https://i.scdn.co/p1.jpg", track_count: 25 },
];
const sampleAlbums = [
  { id: "a1", name: "Tron Legacy OST", artist: "Daft Punk", uri: "spotify:album:a1", image_url: "https://i.scdn.co/a1.jpg" },
];

describe("PlaylistPickerModal Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stateValues = [];
    stateIdx = 0;
    mockGetPlaylists.mockResolvedValue({ ok: true, playlists: samplePlaylists });
    mockGetSavedAlbums.mockResolvedValue({ ok: true, albums: sampleAlbums });
    mockSearchSpotify.mockResolvedValue({ ok: true, playlists: samplePlaylists, albums: sampleAlbums });
  });

  it("renders null when closed", () => {
    const tree = PlaylistPickerModal({
      isOpen: false,
      onClose: vi.fn(),
      onSelect: vi.fn(),
    });
    expect(tree).toBeNull();
  });

  it("renders My Playlists, My Albums, and Spotify Search tabs (D-05)", () => {
    const tree = PlaylistPickerModal({
      isOpen: true,
      onClose: vi.fn(),
      onSelect: vi.fn(),
      initialPlaylists: samplePlaylists,
      initialAlbums: sampleAlbums,
    });

    const text = findText(tree);
    expect(text).toContain("Select Soundtrack Music");
    expect(text).toContain("My Playlists");
    expect(text).toContain("My Albums");
    expect(text).toContain("Spotify Search");

    // Switch to My Albums tab
    const tabRows = findNodes(tree, (n) => n.type === InteractiveRow);
    const albumsTabBtn = tabRows.find((r) => findText(r).includes("My Albums"));
    expect(albumsTabBtn).toBeDefined();
    albumsTabBtn.props.onClick();
    expect(stateValues[0]).toBe("albums");

    // Switch to Spotify Search tab
    const searchTabBtn = tabRows.find((r) => findText(r).includes("Spotify Search"));
    expect(searchTabBtn).toBeDefined();
    searchTabBtn.props.onClick();
    expect(stateValues[0]).toBe("search");
  });

  it("invokes onSelect with { uri, name, image } and closes modal when clicking an item", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();

    const tree = PlaylistPickerModal({
      isOpen: true,
      onClose,
      onSelect,
      initialPlaylists: samplePlaylists,
      initialAlbums: sampleAlbums,
    });

    const itemRow = findNodes(
      tree,
      (n) => n.type === InteractiveRow && findText(n).includes("Synthwave Mix")
    )[0];
    expect(itemRow).toBeDefined();

    itemRow.props.onClick();
    expect(onSelect).toHaveBeenCalledWith({
      uri: "spotify:playlist:p1",
      name: "Synthwave Mix",
      image: "https://i.scdn.co/p1.jpg",
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes modal when clicking Close button", () => {
    const onClose = vi.fn();
    const tree = PlaylistPickerModal({
      isOpen: true,
      onClose,
      onSelect: vi.fn(),
      initialPlaylists: samplePlaylists,
    });

    const closeBtn = findNodes(tree, (n) => typeName(n) === "DialogButton" && findText(n).includes("Close"))[0];
    expect(closeBtn).toBeDefined();
    closeBtn.props.onClick();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
