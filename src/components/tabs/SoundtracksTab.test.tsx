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
  NavEntryPositionPreferences: {
    FIRST: 0,
    LAST: 1,
    MAINTAIN_X: 2,
    MAINTAIN_Y: 3,
    PREFERRED_CHILD: 4,
  },
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
  FaSlidersH: () => ({ type: "FaSlidersH" }),
  FaUndo: () => ({ type: "FaUndo" }),
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
let refValues: Array<{ current: unknown }> = [];
let refIdx = 0;
let mountedEffects: boolean[] = [];
let effectIdx = 0;
let effectCleanups: Array<() => void> = [];

function unmountAndResetMount() {
  for (const cleanup of effectCleanups) cleanup();
  stateValues = [];
  stateIdx = 0;
  refValues = [];
  refIdx = 0;
  mountedEffects = [];
  effectIdx = 0;
  effectCleanups = [];
}

vi.mock("react", () => ({
  useState: (init: any) => {
    const idx = stateIdx++;
    if (idx === 0) {
      refIdx = 0;
      effectIdx = 0;
    }
    if (!(idx in stateValues)) {
      stateValues[idx] = typeof init === "function" ? init() : init;
    }
    const setter = (val: any) => {
      stateValues[idx] = typeof val === "function" ? val(stateValues[idx]) : val;
    };
    return [stateValues[idx], setter];
  },
  useEffect: (fn: any) => {
    const idx = effectIdx++;
    if (!mountedEffects[idx]) {
      mountedEffects[idx] = true;
      const cleanup = fn();
      if (typeof cleanup === "function") {
        effectCleanups.push(cleanup);
      }
    }
  },
  useCallback: (fn: any) => fn,
  useRef: (init: any) => {
    const idx = refIdx++;
    if (!(idx in refValues)) {
      refValues[idx] = { current: init };
    }
    return refValues[idx];
  },
  useMemo: (fn: any) => fn(),
}));

import { SoundtracksTab } from "./SoundtracksTab";
import { InstalledGame, SoundtrackProfile } from "../../types";
import { EQ_PRESET_CURVES } from "../common/EqBandFaders";
import {
  EQ_OVERRIDE_OPTIONS,
  defaultProfile,
  filterGames,
  formatGameProfileSubtitle,
  normalizeProfiles,
  removePlaylist,
  setDuckingLevelOverride,
  setDuckingOverride,
  setEqCustomBands,
  setEqPreset,
  setMode,
  setVolumeOverride,
} from "./soundtrackUtils";

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
    refValues = [];
    refIdx = 0;
    mountedEffects = [];
    effectIdx = 0;
    effectCleanups = [];
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

    const volToggle = findNodes(
      tree,
      (n) => typeName(n) === "ToggleField" && n.props.label === "Volume Override"
    )[0];
    const customDuckToggle = findNodes(
      tree,
      (n) => typeName(n) === "ToggleField" && n.props.label === "Custom Ducking Level"
    )[0];
    expect(volToggle).toBeDefined();
    expect(volToggle.props.checked).toBe(true);
    expect(customDuckToggle).toBeDefined();
    expect(customDuckToggle.props.checked).toBe(false);

    const sliders = findNodes(tree, (n) => typeName(n) === "SliderField");
    expect(sliders).toHaveLength(1);
    const volumeSlider = sliders.find((s) =>
      String(s.props?.label).includes("Volume Override")
    );
    expect(volumeSlider).toBeDefined();

    volumeSlider!.props.onChange(45);
    vi.advanceTimersByTime(600);

    expect(mockSaveProfile).toHaveBeenCalledWith(
      1091500,
      expect.objectContaining({ volume_override: 45 })
    );

    customDuckToggle.props.onChange(true);
    vi.advanceTimersByTime(600);
    expect(mockSaveProfile).toHaveBeenCalledWith(
      1091500,
      expect.objectContaining({ ducking_level_override: 50 })
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

  it("normalizes profiles by backfilling Phase 19 optional fields to null", () => {
    const normalized = normalizeProfiles({
      "42": {
        app_id: 42,
        app_name: "Hades",
        playlists: [],
        mode: "shuffle",
        rotation_index: 0,
        resume_mode: "remember_position",
        always_auto_start: false,
        exit_policy: "restore_snapshot",
      },
    });
    expect(normalized["42"]).toEqual(
      expect.objectContaining({
        volume_override: null,
        ducking_override: null,
        eq_preset: null,
        eq_custom_bands: null,
        ducking_level_override: null,
      })
    );
  });

  it("formats D-11 game row subtitles for linked soundtracks and audio-only profiles", () => {
    const base = defaultProfile({ app_id: 100, name: "Hades" });
    expect(formatGameProfileSubtitle(base)).toBe("No soundtrack or audio overrides configured");

    const audioOnly = setVolumeOverride(setEqPreset(base, "bass"), 70);
    expect(formatGameProfileSubtitle(audioOnly)).toBe("Audio profile only • EQ: Bass Boost • Vol: 70%");

    const onePlaylist: SoundtrackProfile = {
      ...base,
      playlists: [{ uri: "spotify:playlist:1", name: "OST" }],
    };
    expect(formatGameProfileSubtitle(onePlaylist)).toBe("1 linked soundtrack");

    const multiOverride: SoundtrackProfile = {
      ...sampleProfiles["1091500"],
      eq_preset: "gaming",
      ducking_level_override: 40,
    };
    expect(formatGameProfileSubtitle(multiOverride)).toBe(
      "2 linked soundtracks • EQ: Gaming Balance • Vol: 65% • Duck: 40%"
    );

    const duckOff = setDuckingOverride(audioOnly, false);
    expect(formatGameProfileSubtitle(duckOff)).toBe(
      "Audio profile only • EQ: Bass Boost • Vol: 70% • Duck: Off"
    );
  });

  it("updates EQ preset, custom bands, and ducking level immutably with clamping", () => {
    const base = defaultProfile({ app_id: 100, name: "Hades" });
    const withGaming = setEqPreset(base, "gaming");
    expect(withGaming.eq_preset).toBe("gaming");
    expect(setEqPreset(withGaming, "global").eq_preset).toBeNull();
    expect(setEqPreset(withGaming, null).eq_preset).toBeNull();

    const withBands = setEqCustomBands(base, [15, -20, 3.126, NaN, 1]);
    expect(withBands.eq_custom_bands).toEqual([12, -12, 3.13, 0, 1, 0, 0, 0, 0, 0]);
    expect(setEqCustomBands(withBands, null).eq_custom_bands).toBeNull();

    expect(setDuckingLevelOverride(base, -10).ducking_level_override).toBe(0);
    expect(setDuckingLevelOverride(base, 120).ducking_level_override).toBe(95);
    expect(setDuckingLevelOverride(base, 40).ducking_level_override).toBe(40);
    expect(setDuckingLevelOverride(base, null).ducking_level_override).toBeNull();
  });

  it("renders EQ Preset Override DropdownItem and persists selected preset (D-01, D-11)", () => {
    const tree = SoundtracksTab({
      initialGames: sampleGames,
      initialProfiles: sampleProfiles,
    });

    const text = findText(tree);
    expect(text).toContain("2 linked soundtracks • Vol: 65%");
    expect(text).toContain("No soundtrack or audio overrides configured");

    const eqDropdowns = findNodes(
      tree,
      (n) => typeName(n) === "DropdownItem" && n.props.label === "EQ Preset Override"
    );
    expect(eqDropdowns).toHaveLength(1);
    expect(eqDropdowns[0].props.rgOptions).toEqual(EQ_OVERRIDE_OPTIONS);
    expect(eqDropdowns[0].props.selectedOption).toBe("global");

    eqDropdowns[0].props.onChange({ data: "gaming" });
    vi.advanceTimersByTime(600);

    expect(mockSaveProfile).toHaveBeenCalledWith(
      1091500,
      expect.objectContaining({ eq_preset: "gaming" })
    );
  });
});

describe("SoundtracksTab Phase 19 EQ Modal, Dual Sliders, Hot-Apply & Delete UX", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    stateValues = [];
    stateIdx = 0;
    refValues = [];
    refIdx = 0;
    mountedEffects = [];
    effectIdx = 0;
    effectCleanups = [];
    mockGetInstalledGames.mockResolvedValue(sampleGames);
    mockGetProfiles.mockResolvedValue(sampleProfiles);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders Edit Game EQ button only when eq_preset is custom, opens GameEqModal with seeded bands, and saves immediately (D-01, D-02, D-04)", () => {
    const baseTree = SoundtracksTab({
      initialGames: sampleGames,
      initialProfiles: sampleProfiles,
    });
    expect(
      findNodes(baseTree, (n) => typeName(n) === "DialogButton" && findText(n).includes("Edit Game EQ"))
    ).toHaveLength(0);

    unmountAndResetMount();
    const onPickerOpenChange = vi.fn();
    const showToast = vi.fn();
    const customProfiles: Record<string, SoundtrackProfile> = {
      "1091500": {
        ...sampleProfiles["1091500"],
        eq_preset: "custom",
        eq_custom_bands: [3, 2, 1, 0, -1, -2, 0, 1, 2, 3],
      },
    };
    const customTree = SoundtracksTab({
      initialGames: sampleGames,
      initialProfiles: customProfiles,
      globalEqPreset: "bass",
      onPickerOpenChange,
      showToast,
    });

    const editEqBtn = findNodes(
      customTree,
      (n) => typeName(n) === "DialogButton" && findText(n).includes("Edit Game EQ")
    )[0];
    expect(editEqBtn).toBeDefined();
    editEqBtn.props.onClick();

    expect(onPickerOpenChange).toHaveBeenCalledWith(true);
    expect(mockShowModal).toHaveBeenCalledTimes(1);
    const modalEl = mockShowModal.mock.calls[0][0];
    expect(typeName(modalEl)).toBe("GameEqModal");
    expect(modalEl.props.gameName).toBe("Cyberpunk 2077");
    expect(modalEl.props.initialBands).toEqual([3, 2, 1, 0, -1, -2, 0, 1, 2, 3]);
    expect(modalEl.props.seedBands).toEqual(EQ_PRESET_CURVES.bass);

    const newBands = [4, 3, 2, 1, 0, 0, 1, 2, 3, 4];
    modalEl.props.onSave(newBands);
    expect(mockSaveProfile).toHaveBeenCalledTimes(1);
    expect(mockSaveProfile).toHaveBeenCalledWith(
      1091500,
      expect.objectContaining({
        eq_preset: "custom",
        eq_custom_bands: newBands,
      })
    );

    modalEl.props.onClose();
    expect(onPickerOpenChange).toHaveBeenCalledWith(false);
  });

  it("seeds GameEqModal from globalEqCustomBands when globalEqPreset is custom and preserves eq_custom_bands on Use Global", () => {
    const customGlobal = [1, 2, 3, 4, 0, -1, -2, 0, 1, 2];
    const customProfiles: Record<string, SoundtrackProfile> = {
      "1091500": {
        ...sampleProfiles["1091500"],
        eq_preset: "custom",
        eq_custom_bands: [5, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      },
    };
    const tree = SoundtracksTab({
      initialGames: sampleGames,
      initialProfiles: customProfiles,
      globalEqPreset: "custom",
      globalEqCustomBands: customGlobal,
    });

    const editEqBtn = findNodes(
      tree,
      (n) => typeName(n) === "DialogButton" && findText(n).includes("Edit Game EQ")
    )[0];
    editEqBtn.props.onClick();
    expect(mockShowModal.mock.calls[0][0].props.seedBands).toEqual(customGlobal);

    const eqDropdown = findNodes(
      tree,
      (n) => typeName(n) === "DropdownItem" && n.props.label === "EQ Preset Override"
    )[0];
    eqDropdown.props.onChange({ data: "global" });
    vi.advanceTimersByTime(600);
    expect(mockSaveProfile).toHaveBeenCalledWith(
      1091500,
      expect.objectContaining({
        eq_preset: null,
        eq_custom_bands: [5, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      })
    );
  });

  it("gates Volume Override and Ducking Attenuation Override SliderFields behind explicit ToggleFields without inline Reset DialogButtons (D-06)", () => {
    const unsetProfiles: Record<string, SoundtrackProfile> = {
      "1091500": {
        ...sampleProfiles["1091500"],
        volume_override: null,
        ducking_override: false,
        ducking_level_override: null,
      },
    };
    const unsetTree = SoundtracksTab({
      initialGames: sampleGames,
      initialProfiles: unsetProfiles,
      globalDuckingPct: 120,
    });

    expect(findNodes(unsetTree, (n) => typeName(n) === "SliderField")).toHaveLength(0);
    const volToggleOff = findNodes(
      unsetTree,
      (n) => typeName(n) === "ToggleField" && n.props.label === "Volume Override"
    )[0];
    const duckToggleOff = findNodes(
      unsetTree,
      (n) => typeName(n) === "ToggleField" && n.props.label === "Custom Ducking Level"
    )[0];
    expect(volToggleOff.props.checked).toBe(false);
    expect(duckToggleOff.props.checked).toBe(false);
    expect(duckToggleOff.props.disabled).toBe(true);
    expect(
      findNodes(unsetTree, (n) => typeName(n) === "DialogButton" && findText(n).includes("Clear Volume Override"))
    ).toHaveLength(0);
    expect(
      findNodes(unsetTree, (n) => typeName(n) === "DialogButton" && findText(n).includes("Use Global Ducking"))
    ).toHaveLength(0);

    volToggleOff.props.onChange(true);
    vi.advanceTimersByTime(600);
    expect(mockSaveProfile).toHaveBeenCalledWith(
      1091500,
      expect.objectContaining({ volume_override: 80 })
    );

    duckToggleOff.props.onChange(true);
    vi.advanceTimersByTime(600);
    expect(mockSaveProfile).toHaveBeenCalledWith(
      1091500,
      expect.objectContaining({ ducking_level_override: 95 })
    );

    unmountAndResetMount();
    const activeProfiles: Record<string, SoundtrackProfile> = {
      "1091500": {
        ...sampleProfiles["1091500"],
        volume_override: 65,
        ducking_override: true,
        ducking_level_override: 40,
      },
    };
    const activeTree = SoundtracksTab({
      initialGames: sampleGames,
      initialProfiles: activeProfiles,
    });

    const activeSliders = findNodes(activeTree, (n) => typeName(n) === "SliderField");
    expect(activeSliders).toHaveLength(2);
    const volSlider = activeSliders.find((s) => String(s.props?.label) === "Volume Override (65%)");
    const duckSlider = activeSliders.find(
      (s) => String(s.props?.label) === "Ducking Attenuation Override (40%)"
    );
    expect(volSlider).toBeDefined();
    expect(duckSlider).toBeDefined();
    expect(duckSlider!.props.min).toBe(0);
    expect(duckSlider!.props.max).toBe(95);
    expect(duckSlider!.props.step).toBe(5);
    expect(duckSlider!.props.disabled).toBe(false);
    duckSlider!.props.onChange(75);
    vi.advanceTimersByTime(600);
    expect(mockSaveProfile).toHaveBeenCalledWith(
      1091500,
      expect.objectContaining({ ducking_level_override: 75 })
    );

    expect(
      findNodes(activeTree, (n) => typeName(n) === "DialogButton" && findText(n).includes("Clear Volume Override"))
    ).toHaveLength(0);
    expect(
      findNodes(activeTree, (n) => typeName(n) === "DialogButton" && findText(n).includes("Use Global Ducking"))
    ).toHaveLength(0);

    const volToggleOn = findNodes(
      activeTree,
      (n) => typeName(n) === "ToggleField" && n.props.label === "Volume Override"
    )[0];
    const duckToggleOn = findNodes(
      activeTree,
      (n) => typeName(n) === "ToggleField" && n.props.label === "Custom Ducking Level"
    )[0];
    expect(volToggleOn.props.checked).toBe(true);
    expect(duckToggleOn.props.checked).toBe(true);

    volToggleOn.props.onChange(false);
    vi.advanceTimersByTime(600);
    expect(mockSaveProfile).toHaveBeenCalledWith(
      1091500,
      expect.objectContaining({ volume_override: null })
    );

    duckToggleOn.props.onChange(false);
    vi.advanceTimersByTime(600);
    expect(mockSaveProfile).toHaveBeenCalledWith(
      1091500,
      expect.objectContaining({ ducking_level_override: null })
    );
  });

  it("flushes running-game EQ, volume, and ducking toggle/slider edits immediately without 500ms debounce (D-04, D-08)", () => {
    const runningProfiles: Record<string, SoundtrackProfile> = {
      "1091500": {
        ...sampleProfiles["1091500"],
        ducking_level_override: 45,
      },
    };
    const tree = SoundtracksTab({
      runningAppId: 1091500,
      initialGames: sampleGames,
      initialProfiles: runningProfiles,
    });

    const eqDropdown = findNodes(
      tree,
      (n) => typeName(n) === "DropdownItem" && n.props.label === "EQ Preset Override"
    )[0];
    eqDropdown.props.onChange({ data: "vocal" });
    expect(mockSaveProfile).toHaveBeenCalledWith(
      1091500,
      expect.objectContaining({ eq_preset: "vocal" })
    );

    const volToggle = findNodes(
      tree,
      (n) => typeName(n) === "ToggleField" && n.props.label === "Volume Override"
    )[0];
    volToggle.props.onChange(false);
    expect(mockSaveProfile).toHaveBeenCalledWith(
      1091500,
      expect.objectContaining({ volume_override: null })
    );

    const volSlider = findNodes(
      tree,
      (n) => typeName(n) === "SliderField" && String(n.props?.label).includes("Volume Override")
    )[0];
    volSlider.props.onChange(50);
    expect(mockSaveProfile).toHaveBeenCalledWith(
      1091500,
      expect.objectContaining({ volume_override: 50 })
    );

    const customDuckToggle = findNodes(
      tree,
      (n) => typeName(n) === "ToggleField" && n.props.label === "Custom Ducking Level"
    )[0];
    customDuckToggle.props.onChange(false);
    expect(mockSaveProfile).toHaveBeenCalledWith(
      1091500,
      expect.objectContaining({ ducking_level_override: null })
    );

    const duckSlider = findNodes(
      tree,
      (n) =>
        typeName(n) === "SliderField" &&
        String(n.props?.label).includes("Ducking Attenuation Override")
    )[0];
    duckSlider.props.onChange(30);
    expect(mockSaveProfile).toHaveBeenCalledWith(
      1091500,
      expect.objectContaining({ ducking_level_override: 30 })
    );
  });

  it("applies style.width === 'auto' to every compact/inline DialogButton and backfills empty app_name", async () => {
    const emptyNameProfiles: Record<string, SoundtrackProfile> = {
      "1091500": {
        ...sampleProfiles["1091500"],
        app_name: "",
        eq_preset: "custom",
      },
    };
    mockGetInstalledGames.mockResolvedValue(sampleGames);
    mockGetProfiles.mockResolvedValue(emptyNameProfiles);

    const tree1 = SoundtracksTab({
      initialGames: sampleGames,
      initialProfiles: emptyNameProfiles,
    });
    expect(stateValues[1]["1091500"].app_name).toBe("Cyberpunk 2077");

    const buttons1 = findNodes(tree1, (n) => typeName(n) === "DialogButton");
    expect(buttons1.length).toBeGreaterThanOrEqual(5);
    for (const btn of buttons1) {
      expect(btn.props.style?.width).toBe("auto");
    }
    expect(findNodes(tree1, (n) => typeName(n) === "DialogButton" && n.props["aria-label"] === "Remove Night City FM")[0].props.style.width).toBe("auto");
    expect(findNodes(tree1, (n) => typeName(n) === "DialogButton" && findText(n).includes("Add Playlist / Album"))[0].props.style.width).toBe("auto");
    expect(findNodes(tree1, (n) => typeName(n) === "DialogButton" && findText(n).includes("Edit Game EQ"))[0].props.style.width).toBe("auto");
    const deleteBtn = findNodes(
      tree1,
      (n) => typeName(n) === "DialogButton" && findText(n).includes("Delete Game Profile")
    )[0];
    expect(deleteBtn.props.style.width).toBe("auto");

    deleteBtn.props.onClick();
    stateIdx = 0;
    const tree2 = SoundtracksTab({
      initialGames: sampleGames,
      initialProfiles: emptyNameProfiles,
    });
    const keepBtn = findNodes(
      tree2,
      (n) => typeName(n) === "DialogButton" && findText(n).includes("Keep Profile")
    )[0];
    const confirmBtn = findNodes(
      tree2,
      (n) => typeName(n) === "DialogButton" && findText(n).includes("Confirm Delete")
    )[0];
    expect(keepBtn.props.style.width).toBe("auto");
    expect(confirmBtn.props.style.width).toBe("auto");

    const volToggle = findNodes(
      tree1,
      (n) => typeName(n) === "ToggleField" && n.props.label === "Volume Override"
    )[0];
    volToggle.props.onChange(false);
    vi.advanceTimersByTime(600);
    expect(mockSaveProfile).toHaveBeenCalledWith(
      1091500,
      expect.objectContaining({ app_name: "Cyberpunk 2077", volume_override: null })
    );

    await Promise.resolve();
    await Promise.resolve();
    expect(stateValues[1]["1091500"].app_name).toBe("Cyberpunk 2077");
  });

  it("ignores whitespace-only game.name and stores padded game.name trimmed when backfilling or patching app_name", async () => {
    const emptyNameProfiles: Record<string, SoundtrackProfile> = {
      "1091500": {
        ...sampleProfiles["1091500"],
        app_name: "",
        eq_preset: "custom",
      },
    };
    const whitespaceGames: InstalledGame[] = [{ ...sampleGames[0], name: "   " }];
    mockGetInstalledGames.mockResolvedValueOnce(whitespaceGames);
    mockGetProfiles.mockResolvedValueOnce(emptyNameProfiles);

    const wsTree = SoundtracksTab({
      initialGames: whitespaceGames,
      initialProfiles: emptyNameProfiles,
    });
    expect(stateValues[1]["1091500"].app_name).toBe("");

    const wsVolToggle = findNodes(
      wsTree,
      (n) => typeName(n) === "ToggleField" && n.props.label === "Volume Override"
    )[0];
    wsVolToggle.props.onChange(false);
    vi.advanceTimersByTime(600);
    expect(mockSaveProfile).toHaveBeenLastCalledWith(
      1091500,
      expect.objectContaining({ app_name: "", volume_override: null })
    );

    await Promise.resolve();
    await Promise.resolve();
    expect(stateValues[1]["1091500"].app_name).toBe("");

    // Padded game.name is trimmed during initial backfill
    unmountAndResetMount();
    const paddedGames: InstalledGame[] = [{ ...sampleGames[0], name: "  Cyberpunk 2077  " }];
    mockGetInstalledGames.mockResolvedValueOnce(paddedGames);
    mockGetProfiles.mockResolvedValueOnce(emptyNameProfiles);

    SoundtracksTab({
      initialGames: paddedGames,
      initialProfiles: emptyNameProfiles,
    });
    expect(stateValues[1]["1091500"].app_name).toBe("Cyberpunk 2077");

    await Promise.resolve();
    await Promise.resolve();
    expect(stateValues[1]["1091500"].app_name).toBe("Cyberpunk 2077");

    // Padded game.name is also trimmed when patchProfileAppName runs directly via renderGamesList / GameEqModal onSave
    unmountAndResetMount();
    mockGetInstalledGames.mockResolvedValueOnce([]);
    mockGetProfiles.mockResolvedValueOnce(emptyNameProfiles);
    SoundtracksTab({
      initialGames: paddedGames,
    });
    for (let i = 0; i < 6; i += 1) {
      await Promise.resolve();
    }
    expect(stateValues[1]["1091500"].app_name).toBe("");

    stateIdx = 0;
    const unpatchedTree = SoundtracksTab({
      initialGames: paddedGames,
    });
    const editEqBtn = findNodes(
      unpatchedTree,
      (n) => typeName(n) === "DialogButton" && findText(n).includes("Edit Game EQ")
    )[0];
    editEqBtn.props.onClick();
    const modalEl = mockShowModal.mock.calls[0][0];
    await modalEl.props.onSave([1, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(mockSaveProfile).toHaveBeenLastCalledWith(
      1091500,
      expect.objectContaining({ app_name: "Cyberpunk 2077" })
    );
  });

  it("guards profile deletion with two-step Delete Game Profile -> Keep Profile / Confirm Delete", async () => {
    const showToast = vi.fn();
    const tree1 = SoundtracksTab({
      initialGames: sampleGames,
      initialProfiles: sampleProfiles,
      showToast,
    });

    const deleteBtn = findNodes(
      tree1,
      (n) => typeName(n) === "DialogButton" && findText(n).includes("Delete Game Profile")
    )[0];
    expect(deleteBtn).toBeDefined();
    deleteBtn.props.onClick();
    expect(mockDeleteProfile).not.toHaveBeenCalled();

    stateIdx = 0;
    const tree2 = SoundtracksTab({
      initialGames: sampleGames,
      initialProfiles: sampleProfiles,
      showToast,
    });

    const keepBtn = findNodes(
      tree2,
      (n) => typeName(n) === "DialogButton" && findText(n).includes("Keep Profile")
    )[0];
    const confirmBtn = findNodes(
      tree2,
      (n) => typeName(n) === "DialogButton" && findText(n).includes("Confirm Delete")
    )[0];
    expect(keepBtn).toBeDefined();
    expect(confirmBtn).toBeDefined();
    expect(confirmBtn.props.style.background).toBe("#E53935");

    keepBtn.props.onClick();
    expect(stateValues[5]).toBeNull();
    expect(mockDeleteProfile).not.toHaveBeenCalled();

    stateIdx = 0;
    const tree3 = SoundtracksTab({
      initialGames: sampleGames,
      initialProfiles: sampleProfiles,
      showToast,
    });
    const deleteBtnAgain = findNodes(
      tree3,
      (n) => typeName(n) === "DialogButton" && findText(n).includes("Delete Game Profile")
    )[0];
    deleteBtnAgain.props.onClick();

    stateIdx = 0;
    const tree4 = SoundtracksTab({
      initialGames: sampleGames,
      initialProfiles: sampleProfiles,
      showToast,
    });
    const confirmBtnAgain = findNodes(
      tree4,
      (n) => typeName(n) === "DialogButton" && findText(n).includes("Confirm Delete")
    )[0];
    await confirmBtnAgain.props.onClick();

    expect(mockDeleteProfile).toHaveBeenCalledWith(1091500);
    expect(stateValues[1]["1091500"]).toBeUndefined();
    expect(showToast).toHaveBeenCalledWith("Game audio & soundtrack profile deleted");
  });

  it("renders empty, loading, audio-only, long-text truncation, and error recovery UI states", async () => {
    const loadingTree = SoundtracksTab({});
    expect(findText(loadingTree)).toContain("Scanning installed Steam & Non-Steam games...");

    unmountAndResetMount();
    const emptyTree = SoundtracksTab({ initialGames: [], initialProfiles: {} });
    const emptyText = findText(emptyTree);
    expect(emptyText).toContain("No Game Profiles Configured");
    expect(emptyText).toContain(
      "No Steam or Non-Steam games matched your search. Clear the filter box above to browse all installed games."
    );

    unmountAndResetMount();
    const longGame: InstalledGame = {
      app_id: 999,
      name: "A Very Long Game Title That Must Truncate Cleanly With Ellipsis",
      is_steam: true,
      is_non_steam: false,
    };
    const audioOnlyProfiles: Record<string, SoundtrackProfile> = {
      "999": {
        ...defaultProfile(longGame),
        eq_preset: "bass",
        volume_override: 70,
      },
    };
    const showToast = vi.fn();
    mockGetInstalledGames.mockResolvedValue([longGame]);
    mockGetProfiles.mockResolvedValue(audioOnlyProfiles);
    mockSaveProfile.mockResolvedValueOnce({ ok: false, error: "disk error" });
    const audioTree = SoundtracksTab({
      runningAppId: 999,
      initialGames: [longGame],
      initialProfiles: audioOnlyProfiles,
      showToast,
    });
    expect(findText(audioTree)).toContain("Audio profile only • EQ: Bass Boost • Vol: 70%");

    const titleSpan = findNodes(
      audioTree,
      (n) => n.type === "span" && findText(n) === longGame.name
    )[0];
    expect(titleSpan.props.style).toEqual(
      expect.objectContaining({
        minWidth: 0,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      })
    );

    const volSlider = findNodes(
      audioTree,
      (n) => typeName(n) === "SliderField" && String(n.props?.label).includes("Volume Override")
    )[0];
    volSlider.props.onChange(35);
    await Promise.resolve();
    await Promise.resolve();
    expect(stateValues[1]["999"].volume_override).toBe(35);
    expect(showToast).toHaveBeenCalledWith(
      "Failed to save game audio profile — verify Decky storage permissions and try again."
    );

    mockDeleteProfile.mockResolvedValueOnce({ ok: false });
    const delBtn = findNodes(
      audioTree,
      (n) => typeName(n) === "DialogButton" && findText(n).includes("Delete Game Profile")
    )[0];
    delBtn.props.onClick();
    stateIdx = 0;
    const confirmTree = SoundtracksTab({
      runningAppId: 999,
      initialGames: [longGame],
      initialProfiles: audioOnlyProfiles,
      showToast,
    });
    const confirmBtn = findNodes(
      confirmTree,
      (n) => typeName(n) === "DialogButton" && findText(n).includes("Confirm Delete")
    )[0];
    await confirmBtn.props.onClick();
    expect(stateValues[1]["999"]).toBeDefined();
    expect(showToast).toHaveBeenCalledWith(
      "Failed to save game audio profile — verify Decky storage permissions and try again."
    );
  });
});

describe("SoundtracksTab Debounced Unmount Flush", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    stateValues = [];
    stateIdx = 0;
    refValues = [];
    refIdx = 0;
    mountedEffects = [];
    effectIdx = 0;
    effectCleanups = [];
    mockGetInstalledGames.mockResolvedValue(sampleGames);
    mockGetProfiles.mockResolvedValue(sampleProfiles);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("flushes pending debounced profile edits on unmount without duplicating after timers advance", () => {
    const tree = SoundtracksTab({
      initialGames: sampleGames,
      initialProfiles: sampleProfiles,
    });
    const volSlider = findNodes(
      tree,
      (n) => typeName(n) === "SliderField" && String(n.props?.label).includes("Volume Override")
    )[0];
    volSlider.props.onChange(55);
    expect(mockSaveProfile).not.toHaveBeenCalled();

    for (const cleanup of effectCleanups) cleanup();
    expect(mockSaveProfile).toHaveBeenCalledTimes(1);
    expect(mockSaveProfile).toHaveBeenCalledWith(
      1091500,
      expect.objectContaining({ volume_override: 55 })
    );

    vi.advanceTimersByTime(600);
    expect(mockSaveProfile).toHaveBeenCalledTimes(1);
  });

  it("does not flush a pending debounced save on unmount after profile deletion", async () => {
    const tree = SoundtracksTab({
      initialGames: sampleGames,
      initialProfiles: sampleProfiles,
    });
    const eqDropdown = findNodes(
      tree,
      (n) => typeName(n) === "DropdownItem" && n.props.label === "EQ Preset Override"
    )[0];
    eqDropdown.props.onChange({ data: "gaming" });
    expect(mockSaveProfile).not.toHaveBeenCalled();

    const delBtn = findNodes(
      tree,
      (n) => typeName(n) === "DialogButton" && findText(n).includes("Delete Game Profile")
    )[0];
    delBtn.props.onClick();
    stateIdx = 0;
    const confirmTree = SoundtracksTab({
      initialGames: sampleGames,
      initialProfiles: sampleProfiles,
    });
    const confirmBtn = findNodes(
      confirmTree,
      (n) => typeName(n) === "DialogButton" && findText(n).includes("Confirm Delete")
    )[0];
    await confirmBtn.props.onClick();

    for (const cleanup of effectCleanups) cleanup();
    expect(mockDeleteProfile).toHaveBeenCalledWith(1091500);
    expect(mockSaveProfile).not.toHaveBeenCalled();
  });
});

describe("SoundtracksTab GameEqModal Save Result", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    stateValues = [];
    stateIdx = 0;
    refValues = [];
    refIdx = 0;
    mountedEffects = [];
    effectIdx = 0;
    effectCleanups = [];
    mockGetInstalledGames.mockResolvedValue(sampleGames);
    mockGetProfiles.mockResolvedValue(sampleProfiles);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns backend save result promise from GameEqModal onSave callback", async () => {
    const customProfiles: Record<string, SoundtrackProfile> = {
      "1091500": {
        ...sampleProfiles["1091500"],
        eq_preset: "custom",
        eq_custom_bands: [3, 2, 1, 0, -1, -2, 0, 1, 2, 3],
      },
    };
    const showToast = vi.fn();
    mockSaveProfile.mockResolvedValueOnce({ ok: false, error: "write error" });
    const tree = SoundtracksTab({
      runningAppId: 1091500,
      initialGames: sampleGames,
      initialProfiles: customProfiles,
      showToast,
    });
    const editEqBtn = findNodes(
      tree,
      (n) => typeName(n) === "DialogButton" && findText(n).includes("Edit Game EQ")
    )[0];
    editEqBtn.props.onClick();
    const modalEl = mockShowModal.mock.calls[0][0];
    const res = await modalEl.props.onSave([1, 1, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(res).toEqual({ ok: false, error: "write error" });
    expect(showToast).toHaveBeenCalledWith(
      "Failed to save game audio profile — verify Decky storage permissions and try again."
    );
  });
});

describe("SoundtracksTab Collapse & Confirm Delete Reset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    stateValues = [];
    stateIdx = 0;
    refValues = [];
    refIdx = 0;
    mountedEffects = [];
    effectIdx = 0;
    effectCleanups = [];
    mockGetInstalledGames.mockResolvedValue(sampleGames);
    mockGetProfiles.mockResolvedValue(sampleProfiles);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("clears active confirmDeleteAppId on a previous card when clicking another card's header", () => {
    const tree1 = SoundtracksTab({
      initialGames: sampleGames,
      initialProfiles: sampleProfiles,
    });
    const deleteBtn = findNodes(
      tree1,
      (n) => typeName(n) === "DialogButton" && findText(n).includes("Delete Game Profile")
    )[0];
    deleteBtn.props.onClick();
    expect(stateValues[5]).toBe(1091500);

    stateIdx = 0;
    const tree2 = SoundtracksTab({
      initialGames: sampleGames,
      initialProfiles: sampleProfiles,
    });
    expect(
      findNodes(tree2, (n) => typeName(n) === "DialogButton" && findText(n).includes("Confirm Delete"))
    ).toHaveLength(1);

    const retroHeader = findNodes(
      tree2,
      (n) => typeName(n) === "InteractiveRow" && n.props?.["data-deckify-label"] === "RetroArch"
    )[0];
    expect(retroHeader).toBeDefined();
    retroHeader.props.onClick();
    expect(stateValues[5]).toBeNull();

    stateIdx = 0;
    const tree3 = SoundtracksTab({
      initialGames: sampleGames,
      initialProfiles: sampleProfiles,
    });
    expect(
      findNodes(tree3, (n) => typeName(n) === "DialogButton" && findText(n).includes("Confirm Delete"))
    ).toHaveLength(0);
  });

  it("expands configured and running cards by default, collapses on header click, and re-expands on second click", () => {
    // 1. Configured card (Cyberpunk 2077) starts expanded, unconfigured card (RetroArch) starts collapsed
    const tree1 = SoundtracksTab({
      initialGames: sampleGames,
      initialProfiles: sampleProfiles,
    });
    expect(
      findNodes(tree1, (n) => typeName(n) === "DropdownItem" && n.props.label === "EQ Preset Override")
    ).toHaveLength(1);

    const cyberHeader1 = findNodes(
      tree1,
      (n) => typeName(n) === "InteractiveRow" && n.props?.["data-deckify-label"] === "Cyberpunk 2077"
    )[0];
    cyberHeader1.props.onClick();

    stateIdx = 0;
    const tree2 = SoundtracksTab({
      initialGames: sampleGames,
      initialProfiles: sampleProfiles,
    });
    expect(
      findNodes(tree2, (n) => typeName(n) === "DropdownItem" && n.props.label === "EQ Preset Override")
    ).toHaveLength(0);

    const cyberHeader2 = findNodes(
      tree2,
      (n) => typeName(n) === "InteractiveRow" && n.props?.["data-deckify-label"] === "Cyberpunk 2077"
    )[0];
    cyberHeader2.props.onClick();

    stateIdx = 0;
    const tree3 = SoundtracksTab({
      initialGames: sampleGames,
      initialProfiles: sampleProfiles,
    });
    expect(
      findNodes(tree3, (n) => typeName(n) === "DropdownItem" && n.props.label === "EQ Preset Override")
    ).toHaveLength(1);

    // 2. Running unconfigured card (RetroArch) starts expanded, collapses, and re-expands cleanly
    unmountAndResetMount();
    const runTree1 = SoundtracksTab({
      runningAppId: 2147483649,
      initialGames: sampleGames,
      initialProfiles: {},
    });
    expect(
      findNodes(runTree1, (n) => typeName(n) === "DropdownItem" && n.props.label === "EQ Preset Override")
    ).toHaveLength(1);

    const retroHeader1 = findNodes(
      runTree1,
      (n) => typeName(n) === "InteractiveRow" && n.props?.["data-deckify-label"] === "RetroArch"
    )[0];
    retroHeader1.props.onClick();

    stateIdx = 0;
    const runTree2 = SoundtracksTab({
      runningAppId: 2147483649,
      initialGames: sampleGames,
      initialProfiles: {},
    });
    expect(
      findNodes(runTree2, (n) => typeName(n) === "DropdownItem" && n.props.label === "EQ Preset Override")
    ).toHaveLength(0);

    const retroHeader2 = findNodes(
      runTree2,
      (n) => typeName(n) === "InteractiveRow" && n.props?.["data-deckify-label"] === "RetroArch"
    )[0];
    retroHeader2.props.onClick();

    stateIdx = 0;
    const runTree3 = SoundtracksTab({
      runningAppId: 2147483649,
      initialGames: sampleGames,
      initialProfiles: {},
    });
    expect(
      findNodes(runTree3, (n) => typeName(n) === "DropdownItem" && n.props.label === "EQ Preset Override")
    ).toHaveLength(1);
  });

  it("clears collapsedAppIds on profile deletion so re-configuring the game starts expanded", async () => {
    const tree1 = SoundtracksTab({
      initialGames: sampleGames,
      initialProfiles: sampleProfiles,
    });
    const cyberHeader = findNodes(
      tree1,
      (n) => typeName(n) === "InteractiveRow" && n.props?.["data-deckify-label"] === "Cyberpunk 2077"
    )[0];
    // Collapse then re-expand, click Delete -> Confirm Delete
    cyberHeader.props.onClick();
    expect(stateValues[6][1091500]).toBe(true);

    stateIdx = 0;
    const collapsedTree = SoundtracksTab({
      initialGames: sampleGames,
      initialProfiles: sampleProfiles,
    });
    const cyberHeaderReopen = findNodes(
      collapsedTree,
      (n) => typeName(n) === "InteractiveRow" && n.props?.["data-deckify-label"] === "Cyberpunk 2077"
    )[0];
    cyberHeaderReopen.props.onClick();
    expect(stateValues[6][1091500]).toBe(false);

    stateIdx = 0;
    const reopenedTree = SoundtracksTab({
      initialGames: sampleGames,
      initialProfiles: sampleProfiles,
    });
    const deleteBtn = findNodes(
      reopenedTree,
      (n) => typeName(n) === "DialogButton" && findText(n).includes("Delete Game Profile")
    )[0];
    deleteBtn.props.onClick();

    stateIdx = 0;
    const confirmTree = SoundtracksTab({
      initialGames: sampleGames,
      initialProfiles: sampleProfiles,
    });
    const confirmBtn = findNodes(
      confirmTree,
      (n) => typeName(n) === "DialogButton" && findText(n).includes("Confirm Delete")
    )[0];
    await confirmBtn.props.onClick();

    expect(stateValues[6]).not.toHaveProperty("1091500");
  });
});
