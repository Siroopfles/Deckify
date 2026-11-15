import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockGetInstalledGames = vi.fn();
const mockGetProfiles = vi.fn();
const mockSaveProfile = vi.fn().mockResolvedValue({ ok: true });
const mockDeleteProfile = vi.fn().mockResolvedValue({ ok: true });

vi.mock("@decky/api", () => ({
  callable: (name: string) => {
    if (name === "get_installed_games") return (...args: any[]) => mockGetInstalledGames(...args);
    if (name === "get_game_soundtrack_profiles") return (...args: any[]) => mockGetProfiles(...args);
    if (name === "save_game_soundtrack_profile") return (...args: any[]) => mockSaveProfile(...args);
    if (name === "delete_game_soundtrack_profile") return (...args: any[]) => mockDeleteProfile(...args);
    return vi.fn().mockResolvedValue({ ok: true });
  },
}));

const mockShowModal = vi.fn();

vi.mock("@decky/ui", () => ({
  Focusable: ({ children, ...props }: any) => ({ type: "Focusable", props: { children, ...props } }),
  DialogButton: ({ children, ...props }: any) => ({ type: "DialogButton", props: { children, ...props } }),
  DropdownItem: (props: any) => ({ type: "DropdownItem", props }),
  SliderField: (props: any) => ({ type: "SliderField", props }),
  ToggleField: (props: any) => ({ type: "ToggleField", props }),
  TextField: (props: any) => ({ type: "TextField", props }),
  ModalRoot: ({ children, ...props }: any) => ({ type: "ModalRoot", props: { children, ...props } }),
  showModal: (...args: any[]) => mockShowModal(...args),
}));

vi.mock("../common/DeckifyImage", () => ({
  DeckifyImage: (props: any) => ({ type: "DeckifyImage", props }),
}));

vi.mock("react-icons/fa", () => ({
  FaGamepad: () => ({ type: "FaGamepad" }),
  FaPlus: () => ({ type: "FaPlus" }),
  FaTimes: () => ({ type: "FaTimes" }),
  FaTrash: () => ({ type: "FaTrash" }),
  FaSearch: () => ({ type: "FaSearch" }),
  FaMusic: () => ({ type: "FaMusic" }),
  FaCompactDisc: () => ({ type: "FaCompactDisc" }),
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

import { SoundtracksTab } from "./SoundtracksTab";
import { InstalledGame, SoundtrackProfile } from "../../types";
import { filterGames, removePlaylist, setMode, setVolumeOverride, setDuckingOverride } from "./soundtrackUtils";

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

const sampleGames: InstalledGame[] = [
  {
    app_id: 1091500,
    name: "Cyberpunk 2077",
    is_steam: true,
    is_non_steam: false,
    icon_url: "https://cdn.akamai.steamstatic.com/1091500.jpg",
  },
  {
    app_id: 2147483649,
    name: "RetroArch",
    is_steam: false,
    is_non_steam: true,
    icon_url: "https://example.com/retroarch.png",
  },
];

const sampleProfiles: Record<string, SoundtrackProfile> = {
  "1091500": {
    app_id: 1091500,
    app_name: "Cyberpunk 2077",
    playlists: [
      { uri: "spotify:playlist:nightcity", name: "Night City FM", image: "https://i.scdn.co/nc.jpg" },
      { uri: "spotify:album:phantom", name: "Phantom Liberty", image: "https://i.scdn.co/pl.jpg" },
    ],
    mode: "shuffle",
    rotation_index: 0,
    resume_mode: "remember_position",
    always_auto_start: true,
    exit_policy: "restore_snapshot",
    volume_override: 65,
    ducking_override: true,
  },
};

describe("SoundtracksTab Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    stateValues = [];
    stateIdx = 0;
    mockGetInstalledGames.mockResolvedValue(sampleGames);
    mockGetProfiles.mockResolvedValue(sampleProfiles);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders installed games list with cover thumbnails, titles, and Non-Steam badges (D-03, D-07)", () => {
    const tree = SoundtracksTab({
      initialGames: sampleGames,
      initialProfiles: sampleProfiles,
    });

    const text = findText(tree);
    expect(text).toContain("Cyberpunk 2077");
    expect(text).toContain("RetroArch");
    expect(text).toContain("Non-Steam");

    const images = findNodes(tree, (n) => typeName(n) === "DeckifyImage");
    expect(images.some((img) => img.props.src === "https://cdn.akamai.steamstatic.com/1091500.jpg")).toBe(true);
    expect(images.some((img) => img.props.src === "https://example.com/retroarch.png")).toBe(true);
  });

  it("filters installed games instantly via search query", () => {
    const filtered = filterGames(sampleGames, "retro");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe("RetroArch");

    const tree = SoundtracksTab({
      initialGames: sampleGames,
      initialProfiles: sampleProfiles,
    });
    const searchInputs = findNodes(tree, (n) => typeName(n) === "TextField");
    expect(searchInputs.length).toBeGreaterThan(0);
    searchInputs[0].props.onChange({ target: { value: "Cyber" } });
    // stateValues[2] is searchQuery
    expect(stateValues[2]).toBe("Cyber");
  });

  it("updates playback mode between shuffle, random, and rotation (D-02)", () => {
    const tree = SoundtracksTab({
      initialGames: sampleGames,
      initialProfiles: sampleProfiles,
    });

    const dropdowns = findNodes(tree, (n) => typeName(n) === "DropdownItem" && n.props.label === "Playback Mode");
    expect(dropdowns).toHaveLength(1);

    dropdowns[0].props.onChange({ data: "rotation" });
    vi.advanceTimersByTime(600);

    expect(mockSaveProfile).toHaveBeenCalledWith(
      1091500,
      expect.objectContaining({ mode: "rotation" })
    );

    const next = setMode(sampleProfiles["1091500"], "random");
    expect(next.mode).toBe("random");
  });

  it("updates volume override and ducking override and persists to backend (D-06, D-20)", () => {
    const tree = SoundtracksTab({
      initialGames: sampleGames,
      initialProfiles: sampleProfiles,
    });

    const sliders = findNodes(tree, (n) => typeName(n) === "SliderField");
    expect(sliders).toHaveLength(1);
    sliders[0].props.onChange(45);
    vi.advanceTimersByTime(600);

    expect(mockSaveProfile).toHaveBeenCalledWith(
      1091500,
      expect.objectContaining({ volume_override: 45 })
    );

    const duckToggle = findNodes(
      tree,
      (n) => typeName(n) === "ToggleField" && String(n.props.label).includes("Ducking Override")
    )[0];
    expect(duckToggle).toBeDefined();
    duckToggle.props.onChange(false);
    vi.advanceTimersByTime(600);

    expect(mockSaveProfile).toHaveBeenCalledWith(
      1091500,
      expect.objectContaining({ ducking_override: false })
    );

    expect(setVolumeOverride(sampleProfiles["1091500"], 120).volume_override).toBe(100);
    expect(setDuckingOverride(sampleProfiles["1091500"], false).ducking_override).toBe(false);
  });

  it("removes an assigned playlist when clicking its X button (D-08)", () => {
    const tree = SoundtracksTab({
      initialGames: sampleGames,
      initialProfiles: sampleProfiles,
    });

    const removeBtn = findNodes(
      tree,
      (n) => typeName(n) === "DialogButton" && n.props["aria-label"] === "Remove Night City FM"
    )[0];
    expect(removeBtn).toBeDefined();

    removeBtn.props.onClick();
    vi.advanceTimersByTime(600);

    expect(mockSaveProfile).toHaveBeenCalledWith(
      1091500,
      expect.objectContaining({
        playlists: [expect.objectContaining({ uri: "spotify:album:phantom" })],
      })
    );

    const removed = removePlaylist(sampleProfiles["1091500"], "spotify:playlist:nightcity");
    expect(removed.playlists).toHaveLength(1);
  });

  it("uses flow-children='horizontal' on button groups for spatial navigation", () => {
    const tree = SoundtracksTab({
      initialGames: sampleGames,
      initialProfiles: sampleProfiles,
    });
    const horizontalRows = findNodes(
      tree,
      (n) => typeName(n) === "Focusable" && n.props["flow-children"] === "horizontal"
    );
    expect(horizontalRows.length).toBeGreaterThanOrEqual(4);
  });

  it("passes FaGamepad fallback to game cover DeckifyImage (Gap 1)", () => {
    const tree = SoundtracksTab({
      initialGames: sampleGames,
      initialProfiles: sampleProfiles,
    });
    const images = findNodes(tree, (n) => typeName(n) === "DeckifyImage");
    const gameCover = images.find((img) => img.props.src === sampleGames[0].icon_url);
    expect(gameCover).toBeDefined();
    expect(gameCover.props.fallback).toBeDefined();
    expect(typeName(gameCover.props.fallback)).toBe("FaGamepad");
  });

  it("opens PlaylistPickerModal via showModal() and updates profile functionally onSelect (Gap 2)", () => {
    const tree = SoundtracksTab({
      initialGames: sampleGames,
      initialProfiles: sampleProfiles,
    });

    const addBtn = findNodes(
      tree,
      (n) => typeName(n) === "DialogButton" && findText(n).includes("Add Playlist / Album")
    )[0];
    expect(addBtn).toBeDefined();
    addBtn.props.onClick();

    expect(mockShowModal).toHaveBeenCalledTimes(1);
    const modalElement = mockShowModal.mock.calls[0][0];
    expect(modalElement.props.onSelect).toBeTypeOf("function");

    modalElement.props.onSelect({
      uri: "spotify:playlist:new123",
      name: "New OST",
    });

    vi.advanceTimersByTime(600);
    expect(mockSaveProfile).toHaveBeenCalledWith(
      1091500,
      expect.objectContaining({
        playlists: expect.arrayContaining([
          expect.objectContaining({ uri: "spotify:playlist:new123", name: "New OST" }),
        ]),
      })
    );
  });

  it("notifies onPickerOpenChange(true) on openPlaylistPicker and onPickerOpenChange(false) on modal close", () => {
    const onPickerOpenChange = vi.fn();
    const tree = SoundtracksTab({
      initialGames: sampleGames,
      initialProfiles: sampleProfiles,
      onPickerOpenChange,
    });

    const addBtn = findNodes(
      tree,
      (n) => typeName(n) === "DialogButton" && findText(n).includes("Add Playlist / Album")
    )[0];
    expect(addBtn).toBeDefined();
    addBtn.props.onClick();

    expect(onPickerOpenChange).toHaveBeenCalledWith(true);
    expect(mockShowModal).toHaveBeenCalledTimes(1);
    const modalElement = mockShowModal.mock.calls[0][0];
    expect(modalElement.props.onClose).toBeTypeOf("function");

    modalElement.props.onClose();
    expect(onPickerOpenChange).toHaveBeenCalledWith(false);
  });
});
