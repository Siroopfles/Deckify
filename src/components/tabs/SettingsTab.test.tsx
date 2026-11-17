import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSetSetting = vi.fn().mockResolvedValue({ ok: true });
const mockSetEqBands = vi.fn().mockResolvedValue({ ok: true });
const mockRestoreBookmark = vi.fn().mockResolvedValue({ ok: true });
const mockDismissBookmark = vi.fn().mockResolvedValue({ ok: true });
const mockAddEventListener = vi.fn(() => "listener-token");
const mockRemoveEventListener = vi.fn();

vi.mock("@decky/api", () => ({
  callable: (name: string) => {
    if (name === "set_setting") {
      return (...args: any[]) => mockSetSetting(...args);
    }
    if (name === "set_eq_bands") {
      return (...args: any[]) => mockSetEqBands(...args);
    }
    if (name === "restore_bookmark") {
      return (...args: any[]) => mockRestoreBookmark(...args);
    }
    if (name === "dismiss_bookmark") {
      return (...args: any[]) => mockDismissBookmark(...args);
    }
    return vi.fn().mockResolvedValue({ ok: true });
  },
  addEventListener: (...args: any[]) => (mockAddEventListener as any)(...args),
  removeEventListener: (...args: any[]) => (mockRemoveEventListener as any)(...args),
}));

vi.mock("@decky/ui", () => ({
  DialogButton: ({ children, ...props }: any) => ({
    type: "DialogButton",
    props: { children, ...props },
  }),
  Focusable: ({ children, ...props }: any) => ({
    type: "Focusable",
    props: { children, ...props },
  }),
  SliderField: (props: any) => ({
    type: "SliderField",
    props,
  }),
  ToggleField: (props: any) => ({
    type: "ToggleField",
    props,
  }),
}));

vi.mock("react-icons/fa", () => ({
  FaSlidersH: () => ({ type: "FaSlidersH" }),
  FaClock: () => ({ type: "FaClock" }),
  FaPowerOff: () => ({ type: "FaPowerOff" }),
  FaPlug: () => ({ type: "FaPlug" }),
}));

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

let mockAudioSinksState: any[] | null = null;

vi.mock("react", () => ({
  useState: (init: any) => {
    const val = typeof init === "function" ? init() : init;
    if (Array.isArray(val) && val.length === 0 && mockAudioSinksState !== null) {
      return [mockAudioSinksState, vi.fn()];
    }
    return [val, vi.fn()];
  },
  useEffect: (fn: any) => fn(),
  useCallback: (fn: any) => fn,
  useRef: (init: any) => ({ current: init }),
  useMemo: (fn: any) => fn(),
}));

import { SettingsTab } from "./SettingsTab";
import { DialogButton, Focusable, SliderField, ToggleField } from "@decky/ui";
import { InteractiveRow } from "../common/InteractiveRow";
import { StatusResponse } from "../../types";

function findNodes(tree: any, predicate: (node: any) => boolean, results: any[] = []): any[] {
  if (!tree) return results;
  if (Array.isArray(tree)) {
    for (const item of tree) {
      findNodes(item, predicate, results);
    }
    return results;
  }
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
  if (Array.isArray(tree)) return tree.map(findText).join("");
  if (tree.props && tree.props.children) {
    const children = Array.isArray(tree.props.children)
      ? tree.props.children
      : [tree.props.children];
    return children.map(findText).join("");
  }
  return "";
}

const mockStatus: StatusResponse = {
  authenticated: true,
  running: true,
  librespot_running: true,
  spotify_client_running: false,
  play_state: "playing",
  track: null,
  position_ms: 0,
  is_playing: true,
  volume: 80,
  settings: {
    audio_backend: "librespot",
    audio_quality: "320",
    bitrate: 320,
    normalisation: true,
    normalisation_pregain: 0,
    gapless: true,
    autoplay: true,
    auto_ducking: true,
    auto_ducking_volume: 25,
    duck_fade_down_duration: 1.0,
    duck_fade_up_duration: 1.5,
    ducking_mode: "proportional",
    ducking_proportional_pct: 50,
    voice_ducking_enabled: true,
    voice_ducking_volume: 25,
    voice_ducking_hold_delay: 1.2,
    gamepad_chords_enabled: true,
    toast_enabled: true,
    toast_position: "top_right",
    overlay_enabled: false,
    overlay_position: "top-right",
    overlay_autohide: false,
    overlay_show_progress: false,
    eq_preset: "flat",
    eq_custom_bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
  audio_stream_info: null,
  sleep_timer: {
    active: false,
    remaining_seconds: 0,
    shutdown_on_finish: false,
    end_of_track: false,
  },
};

describe("SettingsTab - Smooth Audio Ducking Engine UI (Phase 06)", () => {
  const refreshStatus = vi.fn();
  const showToast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders Smooth Audio Ducking Engine card heading and description", () => {
    const tree = SettingsTab({
      status: mockStatus,
      refreshStatus,
      showToast,
    });

    const fullText = findText(tree);
    expect(fullText).toContain("Smooth Audio Ducking Engine");
    expect(fullText).toContain("Fade music volume smoothly when games launch or during voice chat");
    expect(fullText).toContain("Game Audio Ducking");
  });

  it("renders SliderFields for Fade Down Speed, Fade Up Speed, and Attenuation Percentage", () => {
    const tree = SettingsTab({
      status: mockStatus,
      refreshStatus,
      showToast,
    });

    const sliders = findNodes(tree, (n) => n.type === SliderField || n.type === "SliderField");
    const attenSlider = sliders.find((n) => n.props?.label === "Attenuation Percentage");
    const fadeDownSlider = sliders.find((n) => n.props?.label === "Fade Down Speed (s)");
    const fadeUpSlider = sliders.find((n) => n.props?.label === "Fade Up Speed (s)");
    expect(attenSlider?.props).toMatchObject({ min: 10, max: 90, step: 5, showValue: true, value: 50 });
    expect(fadeDownSlider?.props).toMatchObject({ min: 0.5, max: 3.0, step: 0.1, showValue: true, value: 1.0 });
    expect(fadeUpSlider?.props).toMatchObject({ min: 0.5, max: 3.0, step: 0.1, showValue: true, value: 1.5 });
  });

  it("renders Fixed Target Volume (%) SliderField when ducking_mode is fixed", () => {
    const fixedStatus: StatusResponse = {
      ...mockStatus,
      settings: {
        ...mockStatus.settings!,
        ducking_mode: "fixed",
        auto_ducking_volume: 30,
      },
    };
    const tree = SettingsTab({
      status: fixedStatus,
      refreshStatus,
      showToast,
    });

    const sliders = findNodes(tree, (n) => n.type === SliderField || n.type === "SliderField");
    const fixedSlider = sliders.find((n) => n.props?.label === "Fixed Target Volume (%)");
    expect(fixedSlider?.props).toMatchObject({ min: 0, max: 100, step: 5, showValue: true, value: 30 });
  });

  it("renders Attenuation Mode options (Proportional vs Fixed Level)", () => {
    const tree = SettingsTab({
      status: mockStatus,
      refreshStatus,
      showToast,
    });

    const fullText = findText(tree);
    expect(fullText).toContain("Attenuation Mode");
    expect(fullText).toContain("Proportional (-50%)");
    expect(fullText).toContain("Fixed Level (25%)");
  });

  it("renders Voice Chat Ducking toggle and Silence Hold Delay SliderField", () => {
    const tree = SettingsTab({
      status: mockStatus,
      refreshStatus,
      showToast,
    });

    const fullText = findText(tree);
    expect(fullText).toContain("Voice Chat Ducking (Discord / Steam Voice)");
    const sliders = findNodes(tree, (n) => n.type === SliderField || n.type === "SliderField");
    const holdSlider = sliders.find((n) => n.props?.label === "Silence Hold Delay (s)");
    expect(holdSlider?.props).toMatchObject({ min: 0.5, max: 3.0, step: 0.1, showValue: true, value: 1.2 });
  });

  it("invokes backendSetSetting when changing Fade Down Speed, Fade Up Speed, and Silence Hold Delay sliders", async () => {
    const tree = SettingsTab({
      status: mockStatus,
      refreshStatus,
      showToast,
    });

    const sliders = findNodes(tree, (n) => n.type === SliderField || n.type === "SliderField");
    const fadeDownSlider = sliders.find((n) => n.props?.label === "Fade Down Speed (s)");
    const fadeUpSlider = sliders.find((n) => n.props?.label === "Fade Up Speed (s)");
    const holdSlider = sliders.find((n) => n.props?.label === "Silence Hold Delay (s)");

    await fadeDownSlider.props.onChange(0.5);
    expect(mockSetSetting).toHaveBeenCalledWith("duck_fade_down_duration", 0.5);

    await fadeUpSlider.props.onChange(2.5);
    expect(mockSetSetting).toHaveBeenCalledWith("duck_fade_up_duration", 2.5);

    await holdSlider.props.onChange(1.6);
    expect(mockSetSetting).toHaveBeenCalledWith("voice_ducking_hold_delay", 1.6);
  });

  it("renders Notification Sound toggle and persists toast_sound_enabled", async () => {
    const tree = SettingsTab({
      status: mockStatus,
      refreshStatus,
      showToast,
    });

    const clickableRows = findNodes(tree, (n) => typeof n.props?.onClick === "function");
    const soundRow = clickableRows.find((n) => findText(n).includes("Notification Sound"));
    expect(soundRow).toBeDefined();

    await soundRow.props.onClick();
    expect(mockSetSetting).toHaveBeenCalledWith("toast_sound_enabled", true);
    expect(showToast).toHaveBeenCalledWith("Notification sound enabled");
  });

  it("invokes backendSetSetting with ducking_mode when selecting Fixed Level", async () => {
    const tree = SettingsTab({
      status: mockStatus,
      refreshStatus,
      showToast,
    });

    const clickableRows = findNodes(tree, (n) => typeof n.props?.onClick === "function");
    const fixedPill = clickableRows.find((n) => findText(n).includes("Fixed Level"));
    expect(fixedPill).toBeDefined();

    await fixedPill.props.onClick();
    expect(mockSetSetting).toHaveBeenCalledWith("ducking_mode", "fixed");
    expect(showToast).toHaveBeenCalledWith("Ducking mode: Fixed Level (25%)");
  });

  it("hides ducking options when Game Audio Ducking is disabled", () => {
    const disabledStatus: StatusResponse = {
      ...mockStatus,
      settings: {
        ...mockStatus.settings!,
        auto_ducking: false,
      },
    };
    const tree = SettingsTab({
      status: disabledStatus,
      refreshStatus,
      showToast,
    });

    const fullText = findText(tree);
    expect(fullText).toContain("Smooth Audio Ducking Engine");
    expect(fullText).not.toContain("Fade Down Speed");
    expect(fullText).not.toContain("Fade Up Speed");
    expect(fullText).not.toContain("Voice Chat Ducking");
  });

  it("renders Controller & Trigger Navigation card with ToggleFields and SliderFields and persists clamped settings", async () => {
    const tree = SettingsTab({
      status: mockStatus,
      refreshStatus,
      showToast,
    });

    const fullText = findText(tree);
    expect(fullText).toContain("Controller & Trigger Navigation");

    const toggles = findNodes(tree, (n) => n.type === ToggleField || n.type === "ToggleField");
    const navToggle = toggles.find((n) => n.props?.label === "L2/R2 Trigger Navigation");
    const hintToggle = toggles.find((n) => n.props?.label === "Controller Hint Bar");
    expect(navToggle).toBeDefined();
    expect(hintToggle).toBeDefined();
    expect(navToggle.props.checked).toBe(true);
    expect(hintToggle.props.checked).toBe(true);

    await navToggle.props.onChange(false);
    expect(mockSetSetting).toHaveBeenCalledWith("trigger_nav_enabled", false);
    expect(showToast).toHaveBeenCalledWith("L2/R2 trigger navigation disabled");

    await hintToggle.props.onChange(false);
    expect(mockSetSetting).toHaveBeenCalledWith("show_controller_hints", false);

    const sliders = findNodes(tree, (n) => n.type === SliderField || n.type === "SliderField");
    const seekSlider = sliders.find((n) => n.props?.label === "Seek Step (Seconds)");
    const pageSlider = sliders.find((n) => n.props?.label === "Library Page Jump (Items)");
    expect(seekSlider).toBeDefined();
    expect(pageSlider).toBeDefined();
    expect(seekSlider.props).toMatchObject({ min: 5, max: 30, step: 5, showValue: true, value: 10 });
    expect(pageSlider.props).toMatchObject({ min: 5, max: 50, step: 5, showValue: true, value: 15 });

    await seekSlider.props.onChange(45);
    expect(mockSetSetting).toHaveBeenCalledWith("trigger_seek_seconds", 30);

    await pageSlider.props.onChange(2);
    expect(mockSetSetting).toHaveBeenCalledWith("trigger_page_size", 5);
    expect(refreshStatus).toHaveBeenCalled();
  });

  it("renders Overlay Lyrics toggle, Auto-Hide Duration slider, and Lyrics Latency Offset slider when overlay_enabled is true and clamps values", async () => {
    const overlayEnabledStatus: StatusResponse = {
      ...mockStatus,
      settings: {
        ...mockStatus.settings!,
        overlay_enabled: true,
        overlay_lyrics_enabled: false,
        overlay_autohide_duration_s: 6,
        overlay_lyrics_offset_ms: 0,
      },
    };
    const tree = SettingsTab({
      status: overlayEnabledStatus,
      refreshStatus,
      showToast,
    });

    const rows = findNodes(tree, (n) => n.type === InteractiveRow);
    const overlayLyricsRow = rows.find((n) => findText(n).includes("Overlay Lyrics"));
    expect(overlayLyricsRow).toBeDefined();
    await overlayLyricsRow.props.onClick();
    expect(mockSetSetting).toHaveBeenCalledWith("overlay_lyrics_enabled", true);
    expect(showToast).toHaveBeenCalledWith("Overlay lyrics enabled");

    const sliders = findNodes(tree, (n) => n.type === SliderField || n.type === "SliderField");
    const durationSlider = sliders.find((n) => n.props?.label === "Auto-Hide Duration (Seconds)");
    const offsetSlider = sliders.find((n) => n.props?.label === "Lyrics Latency Offset (ms)");
    expect(durationSlider).toBeDefined();
    expect(offsetSlider).toBeDefined();
    expect(durationSlider.props).toMatchObject({ min: 3, max: 15, step: 1, showValue: true, value: 6 });
    expect(offsetSlider.props).toMatchObject({ min: -2000, max: 2000, step: 100, showValue: true, value: 0 });

    await durationSlider.props.onChange(20);
    expect(mockSetSetting).toHaveBeenCalledWith("overlay_autohide_duration_s", 15);
    await durationSlider.props.onChange(1);
    expect(mockSetSetting).toHaveBeenCalledWith("overlay_autohide_duration_s", 3);

    await offsetSlider.props.onChange(2500);
    expect(mockSetSetting).toHaveBeenCalledWith("overlay_lyrics_offset_ms", 2000);
    await offsetSlider.props.onChange(-3000);
    expect(mockSetSetting).toHaveBeenCalledWith("overlay_lyrics_offset_ms", -2000);
  });

  it("registers and cleans up settings_changed listener and applies optimistic updates", async () => {
    mockAddEventListener.mockClear();
    mockRemoveEventListener.mockClear();
    mockSetSetting.mockClear();

    const overlayEnabledStatus: StatusResponse = {
      ...mockStatus,
      settings: {
        ...mockStatus.settings!,
        overlay_enabled: true,
        overlay_lyrics_enabled: false,
        overlay_autohide_duration_s: 6,
        overlay_lyrics_offset_ms: 0,
      },
    };
    const cleanup = SettingsTab({
      status: overlayEnabledStatus,
      refreshStatus,
      showToast,
    });
    expect(cleanup).toBeDefined();

    const settingsListenerCall = (mockAddEventListener.mock.calls as any[][]).find(
      (c) => c[0] === "settings_changed"
    );
    expect(settingsListenerCall).toBeDefined();

    const sliders = findNodes(cleanup, (n) => n.type === SliderField || n.type === "SliderField");
    const durationSlider = sliders.find((n) => n.props?.label === "Auto-Hide Duration (Seconds)");
    const offsetSlider = sliders.find((n) => n.props?.label === "Lyrics Latency Offset (ms)");
    const seekSlider = sliders.find((n) => n.props?.label === "Seek Step (Seconds)");
    const pageSlider = sliders.find((n) => n.props?.label === "Library Page Jump (Items)");

    await durationSlider.props.onChange(20);
    expect(mockSetSetting).toHaveBeenCalledWith("overlay_autohide_duration_s", 15);
    await offsetSlider.props.onChange(-2500);
    expect(mockSetSetting).toHaveBeenCalledWith("overlay_lyrics_offset_ms", -2000);
    await seekSlider.props.onChange(45);
    expect(mockSetSetting).toHaveBeenCalledWith("trigger_seek_seconds", 30);
    await pageSlider.props.onChange(2);
    expect(mockSetSetting).toHaveBeenCalledWith("trigger_page_size", 5);
  });

  it("renders Sleep Timer Fade Out ToggleField and SliderField", () => {
    const tree = SettingsTab({
      status: mockStatus,
      refreshStatus,
      showToast,
    });
    const toggles = findNodes(tree, (n) => n.type === ToggleField || n.type === "ToggleField");
    const fadeToggle = toggles.find((n) => n.props?.label === "Gentle Fade Out");
    expect(fadeToggle).toBeDefined();
    expect(fadeToggle.props.checked).toBe(true);

    const sliders = findNodes(tree, (n) => n.type === SliderField || n.type === "SliderField");
    const fadeSlider = sliders.find((n) => n.props?.label === "Fade Out Duration (Seconds)");
    expect(fadeSlider).toBeDefined();
    expect(fadeSlider.props.min).toBe(5);
    expect(fadeSlider.props.max).toBe(120);
    expect(fadeSlider.props.step).toBe(5);
    expect(fadeSlider.props.value).toBe(30);

    const disabledStatus: StatusResponse = {
      ...mockStatus,
      settings: {
        ...mockStatus.settings!,
        sleep_timer_fade_enabled: false,
      },
    };
    const disabledTree = SettingsTab({
      status: disabledStatus,
      refreshStatus,
      showToast,
    });
    const disabledSliders = findNodes(disabledTree, (n) => n.type === SliderField || n.type === "SliderField");
    expect(disabledSliders.find((n) => n.props?.label === "Fade Out Duration (Seconds)")).toBeUndefined();
  });

  it("updates sleep_timer_fade_enabled and sleep_timer_fade_duration via set_setting", async () => {
    mockSetSetting.mockClear();
    const tree = SettingsTab({
      status: mockStatus,
      refreshStatus,
      showToast,
    });
    const toggles = findNodes(tree, (n) => n.type === ToggleField || n.type === "ToggleField");
    const fadeToggle = toggles.find((n) => n.props?.label === "Gentle Fade Out");
    await fadeToggle.props.onChange(false);
    expect(mockSetSetting).toHaveBeenCalledWith("sleep_timer_fade_enabled", false);

    const sliders = findNodes(tree, (n) => n.type === SliderField || n.type === "SliderField");
    const fadeSlider = sliders.find((n) => n.props?.label === "Fade Out Duration (Seconds)");
    await fadeSlider.props.onChange(2);
    expect(mockSetSetting).toHaveBeenCalledWith("sleep_timer_fade_duration", 5);
    await fadeSlider.props.onChange(200);
    expect(mockSetSetting).toHaveBeenCalledWith("sleep_timer_fade_duration", 120);
  });

  it("displays 'Fading out...' when sleep_timer.fading is true", () => {
    const fadingStatus: StatusResponse = {
      ...mockStatus,
      sleep_timer: {
        active: true,
        remaining_seconds: 15,
        shutdown_on_finish: false,
        fading: true,
      },
    };
    const tree = SettingsTab({
      status: fadingStatus,
      refreshStatus,
      showToast,
    });
    const text = findText(tree);
    expect(text).toContain("Fading out...");
    expect(text).not.toContain("Remaining:");
  });
});

describe("Equalizer & Audio Presets", () => {
  const refreshStatus = vi.fn();
  const showToast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders 7 preset pills across two horizontal Focusable rows with no flow-children='row'", () => {
    const tree = SettingsTab({
      status: mockStatus,
      refreshStatus,
      showToast,
    });
    const rowFocusables = findNodes(tree, (n) => n.props?.["flow-children"] === "row");
    expect(rowFocusables.length).toBe(0);

    const horizontalRows = findNodes(
      tree,
      (n) => (n.type === "Focusable" || n.props?.["flow-children"] === "horizontal") && n.props?.["flow-children"] === "horizontal"
    );
    const eqRows = horizontalRows.filter((row) => {
      const text = findText(row);
      return text.includes("Flat") || text.includes("Deck Speakers");
    });
    expect(eqRows.length).toBe(2);

    const row1Pills = findNodes(eqRows[0], (n) => n.type === InteractiveRow);
    const row2Pills = findNodes(eqRows[1], (n) => n.type === InteractiveRow);
    expect(row1Pills.map((p) => findText(p))).toEqual([
      "Flat",
      "Bass Boost",
      "Vocal Clarity",
      "Gaming Balance",
    ]);
    expect(row2Pills.map((p) => findText(p))).toEqual([
      "Deck Speakers",
      "Late Night",
      "Custom",
    ]);
  });

  it("renders all 10 vertical ISO graphic EQ sliders (31 Hz to 16 kHz) side-by-side with +/-12 dB range", () => {
    const tree = SettingsTab({
      status: mockStatus,
      refreshStatus,
      showToast,
    });
    const sliders = findNodes(tree, (n) => n.props?.role === "slider");
    const expectedLabels = ["31 Hz", "62 Hz", "125 Hz", "250 Hz", "500 Hz", "1 kHz", "2 kHz", "4 kHz", "8 kHz", "16 kHz"];
    expect(sliders.length).toBe(10);
    expect(sliders.map((s) => s.props?.["aria-label"])).toEqual(expectedLabels);
    for (const s of sliders) {
      expect(s.props["aria-valuemin"]).toBe(-12);
      expect(s.props["aria-valuemax"]).toBe(12);
    }
  });

  it("calls set_setting on preset click and set_eq_bands (+0.5 dB) preserving curve on band adjustment", async () => {
    mockSetSetting.mockClear();
    mockSetEqBands.mockClear();
    const bassStatus: StatusResponse = {
      ...mockStatus,
      settings: {
        ...mockStatus.settings!,
        eq_preset: "bass",
      },
    };
    const tree = SettingsTab({
      status: bassStatus,
      refreshStatus,
      showToast,
    });
    const pills = findNodes(tree, (n) => n.type === InteractiveRow);
    const deckSpeakersPill = pills.find((p) => findText(p) === "Deck Speakers");
    const lateNightPill = pills.find((p) => findText(p) === "Late Night");
    expect(deckSpeakersPill).toBeDefined();
    expect(lateNightPill).toBeDefined();

    await deckSpeakersPill.props.onClick();
    expect(mockSetSetting).toHaveBeenCalledWith("eq_preset", "deck_speakers");

    await lateNightPill.props.onClick();
    expect(mockSetSetting).toHaveBeenCalledWith("eq_preset", "late_night");

    const inc31 = pills.find((p) => p.props?.["aria-label"] === "Increase 31 Hz");
    expect(inc31).toBeDefined();
    await inc31.props.onClick();
    expect(mockSetEqBands).toHaveBeenCalledTimes(1);
    const sentBands = mockSetEqBands.mock.calls[0][0];
    expect(sentBands).toHaveLength(10);
    expect(sentBands[0]).toBe(5.5);
    expect(sentBands[1]).toBe(3.5);
  });

  it("displays 'Bypass (0.0 dB)' for flat and 'Preamp: -6.0 dB' for bass preset", () => {
    const flatTree = SettingsTab({
      status: mockStatus,
      refreshStatus,
      showToast,
    });
    expect(findText(flatTree)).toContain("Bypass (0.0 dB)");

    const bassStatus: StatusResponse = {
      ...mockStatus,
      settings: {
        ...mockStatus.settings!,
        eq_preset: "bass",
      },
    };
    const bassTree = SettingsTab({
      status: bassStatus,
      refreshStatus,
      showToast,
    });
    expect(findText(bassTree)).toContain("Preamp: -6.0 dB");
  });
});

describe("SettingsTab Docked Audio-Switching (Phase 16)", () => {
  const refreshStatus = vi.fn();
  const showToast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockAudioSinksState = null;
  });

  it("renders Docked Audio-Switching card with Disabled badge and live dock_status badges", () => {
    const disabledTree = SettingsTab({
      status: {
        ...mockStatus,
        settings: { ...mockStatus.settings!, dock_auto_switch_enabled: false },
        dock_status: {
          status: "disabled",
          active_sink: null,
          active_sink_label: "",
          pre_dock_sink: null,
          manual_override: false,
        },
      },
      refreshStatus,
      showToast,
    });
    expect(findText(disabledTree)).toContain("Docked Audio-Switching");
    expect(findText(disabledTree)).toContain("Disabled");

    const dockedTree = SettingsTab({
      status: {
        ...mockStatus,
        settings: { ...mockStatus.settings!, dock_auto_switch_enabled: true },
        dock_status: {
          status: "docked",
          active_sink: "alsa_output.usb-FiiO_K7-00.analog-stereo",
          active_sink_label: "FiiO K7 USB DAC",
          pre_dock_sink: "alsa_output.pci-0000_04_00.6.analog-stereo",
          manual_override: false,
        },
      },
      refreshStatus,
      showToast,
    });
    expect(findText(dockedTree)).toContain("Docked: FiiO K7 USB DAC");

    const btTree = SettingsTab({
      status: {
        ...mockStatus,
        settings: { ...mockStatus.settings!, dock_auto_switch_enabled: true },
        dock_status: {
          status: "bluetooth_held",
          active_sink: null,
          active_sink_label: "",
          pre_dock_sink: null,
          manual_override: false,
        },
      },
      refreshStatus,
      showToast,
    });
    expect(findText(btTree)).toContain("Bluetooth Held");

    const overrideTree = SettingsTab({
      status: {
        ...mockStatus,
        settings: { ...mockStatus.settings!, dock_auto_switch_enabled: true },
        dock_status: {
          status: "manual_override",
          active_sink: null,
          active_sink_label: "",
          pre_dock_sink: null,
          manual_override: true,
        },
      },
      refreshStatus,
      showToast,
    });
    expect(findText(overrideTree)).toContain("Manual Override");

    const monitoringTree = SettingsTab({
      status: {
        ...mockStatus,
        settings: { ...mockStatus.settings!, dock_auto_switch_enabled: true },
        dock_status: {
          status: "monitoring",
          active_sink: null,
          active_sink_label: "",
          pre_dock_sink: null,
          manual_override: false,
        },
      },
      refreshStatus,
      showToast,
    });
    expect(findText(monitoringTree)).toContain("Monitoring");
  });

  it("renders all 4 ToggleFields inside Focusable flow-children='column' and toggles Auto-Switch on Dock", async () => {
    const tree = SettingsTab({
      status: {
        ...mockStatus,
        settings: {
          ...mockStatus.settings!,
          dock_auto_switch_enabled: false,
          dock_respect_bluetooth: true,
          dock_pause_on_undock: false,
          dock_toast_enabled: true,
        },
      },
      refreshStatus,
      showToast,
    });

    const columnFocusables = findNodes(
      tree,
      (n) => (n.type === Focusable || n.type === "Focusable") && n.props?.["flow-children"] === "column"
    );
    const toggleFocusable = columnFocusables.find((f) => {
      const t = findNodes(f, (n) => n.type === ToggleField || n.type === "ToggleField");
      return t.some((x) => x.props?.label === "Auto-Switch on Dock");
    });
    expect(toggleFocusable).toBeDefined();

    const toggles = findNodes(toggleFocusable, (n) => n.type === ToggleField || n.type === "ToggleField");
    expect(toggles.map((t) => t.props?.label)).toEqual([
      "Auto-Switch on Dock",
      "Respect Bluetooth Headphones",
      "Pause on Undock",
      "Dock Switch Toasts",
    ]);

    const autoSwitchToggle = toggles.find((t) => t.props?.label === "Auto-Switch on Dock");
    await autoSwitchToggle.props.onChange(true);
    expect(mockSetSetting).toHaveBeenCalledWith("dock_auto_switch_enabled", true);
  });

  it("renders Auto (USB-DAC / HDMI) first in Target Dock / DAC Sink selector and selects detected sink", async () => {
    mockAudioSinksState = [
      {
        name: "alsa_output.pci-0000_04_00.6.analog-stereo",
        description: "Steam Deck Speakers",
        is_default: true,
      },
      {
        name: "alsa_output.usb-FiiO_K7-00.analog-stereo",
        description: "FiiO K7 USB DAC",
        is_default: false,
      },
    ];

    const tree = SettingsTab({
      status: {
        ...mockStatus,
        settings: {
          ...mockStatus.settings!,
          dock_auto_switch_enabled: true,
          dock_target_sink: "auto",
        },
      },
      refreshStatus,
      showToast,
    });

    const columnFocusables = findNodes(
      tree,
      (n) => (n.type === Focusable || n.type === "Focusable") && n.props?.["flow-children"] === "column"
    );
    const targetFocusable = columnFocusables.find((f) => {
      const rows = findNodes(f, (n) => n.type === InteractiveRow);
      return rows.some((r) => findText(r).includes("Auto (USB-DAC / HDMI)"));
    });
    expect(targetFocusable).toBeDefined();

    const rows = findNodes(targetFocusable, (n) => n.type === InteractiveRow);
    expect(findText(rows[0])).toContain("Auto (USB-DAC / HDMI)");
    const dacRow = rows.find((r) => findText(r).includes("FiiO K7 USB DAC"));
    expect(dacRow).toBeDefined();

    await dacRow.props.onClick();
    expect(mockSetSetting).toHaveBeenCalledWith(
      "dock_target_sink",
      "alsa_output.usb-FiiO_K7-00.analog-stereo"
    );
  });

  it("renders empty-state guidance when no USB-DAC or HDMI sinks are detected", () => {
    mockAudioSinksState = [
      {
        name: "alsa_output.pci-0000_04_00.6.analog-stereo",
        description: "Steam Deck Speakers",
        is_default: true,
      },
    ];

    const tree = SettingsTab({
      status: mockStatus,
      refreshStatus,
      showToast,
    });

    const text = findText(tree);
    expect(text).toContain("Auto (USB-DAC / HDMI)");
    expect(text).toContain("No External Dock / DAC Sinks Detected");
    expect(text).toContain(
      "Connect a USB-DAC or HDMI dock/display to route Deckify automatically, or keep Auto (USB-DAC / HDMI) selected for hotplug detection."
    );
  });

  it("registers dock_audio_switched listener to refresh status and sinks without firing a duplicate toast", () => {
    SettingsTab({
      status: mockStatus,
      refreshStatus,
      showToast,
    });

    const dockListenerCall = (mockAddEventListener.mock.calls as any[][]).find(
      (c) => c[0] === "dock_audio_switched"
    );
    expect(dockListenerCall).toBeDefined();

    const handler = dockListenerCall![1];
    refreshStatus.mockClear();
    showToast.mockClear();

    handler({ action: "docked", sink: "alsa_output.usb-FiiO_K7-00.analog-stereo", sink_label: "FiiO K7 USB DAC", toast_enabled: true });
    expect(refreshStatus).toHaveBeenCalledTimes(1);
    expect(showToast).not.toHaveBeenCalled();
  });
});

describe("SettingsTab - Playback Resilience UI (Phase 17, RESIL-01 & RESIL-02)", () => {
  const refreshStatus = vi.fn();
  const showToast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockAudioSinksState = null;
  });

  it("renders Playback Resilience card with live status badge ('--onevent Live (20s poll)' vs 'Fallback Poll (3s)')", () => {
    const liveTree = SettingsTab({
      status: {
        ...mockStatus,
        resilience_status: {
          onevent_healthy: true,
          poll_interval_s: 20,
          polling_mode: "onevent",
          last_event_at: 100,
          held_bookmark: null,
          held_reason: null,
          recovering: false,
        },
      },
      refreshStatus,
      showToast,
    });
    const liveText = findText(liveTree);
    expect(liveText).toContain("Playback Resilience");
    expect(liveText).toContain("--onevent Live (20s poll)");

    const fallbackTree = SettingsTab({
      status: {
        ...mockStatus,
        resilience_status: {
          onevent_healthy: false,
          poll_interval_s: 3,
          polling_mode: "fallback",
          last_event_at: null,
          held_bookmark: null,
          held_reason: null,
          recovering: false,
        },
      },
      refreshStatus,
      showToast,
    });
    const fallbackText = findText(fallbackTree);
    expect(fallbackText).toContain("Playback Resilience");
    expect(fallbackText).toContain("Fallback Poll (3s)");
  });

  it("toggles all 4 resilience ToggleFields and persists resilience_* keys via set_setting", async () => {
    const tree = SettingsTab({
      status: {
        ...mockStatus,
        settings: {
          ...mockStatus.settings!,
          resilience_auto_resume: true,
          resilience_bookmark_never_expires: false,
          resilience_toast_enabled: true,
          resilience_prompt_held_enabled: true,
        },
      },
      refreshStatus,
      showToast,
    });

    const toggles = findNodes(tree, (n) => n.type === ToggleField || n.type === "ToggleField");
    const autoResumeToggle = toggles.find((t) => t.props?.label === "Auto-Resume on Wake / Wi-Fi");
    const neverExpiresToggle = toggles.find((t) => t.props?.label === "Never Expire Bookmark");
    const toastToggle = toggles.find((t) => t.props?.label === "Restore Toast Notifications");
    const promptToggle = toggles.find((t) => t.props?.label === "Prompt Held Bookmark in QAM");

    expect(autoResumeToggle?.props?.checked).toBe(true);
    expect(neverExpiresToggle?.props?.checked).toBe(false);
    expect(toastToggle?.props?.checked).toBe(true);
    expect(promptToggle?.props?.checked).toBe(true);

    await autoResumeToggle.props.onChange(false);
    expect(mockSetSetting).toHaveBeenCalledWith("resilience_auto_resume", false);

    await neverExpiresToggle.props.onChange(true);
    expect(mockSetSetting).toHaveBeenCalledWith("resilience_bookmark_never_expires", true);

    await toastToggle.props.onChange(false);
    expect(mockSetSetting).toHaveBeenCalledWith("resilience_toast_enabled", false);

    await promptToggle.props.onChange(false);
    expect(mockSetSetting).toHaveBeenCalledWith("resilience_prompt_held_enabled", false);
  });

  it("renders Bookmark Expiry (Hours) SliderField (1..24, step 1) when never_expires is false and hides when true", async () => {
    const expiringTree = SettingsTab({
      status: {
        ...mockStatus,
        settings: {
          ...mockStatus.settings!,
          resilience_bookmark_never_expires: false,
          resilience_bookmark_expiry_hours: 12,
        },
      },
      refreshStatus,
      showToast,
    });

    const sliders = findNodes(
      expiringTree,
      (n) => n.type === SliderField || n.type === "SliderField"
    );
    const expirySlider = sliders.find((s) => s.props?.label === "Bookmark Expiry (Hours)");
    expect(expirySlider).toBeDefined();
    expect(expirySlider.props).toMatchObject({
      min: 1,
      max: 24,
      step: 1,
      showValue: true,
      value: 12,
    });

    await expirySlider.props.onChange(18);
    expect(mockSetSetting).toHaveBeenCalledWith("resilience_bookmark_expiry_hours", 18);

    // Clamps out-of-range values to 1..24
    await expirySlider.props.onChange(99);
    expect(mockSetSetting).toHaveBeenCalledWith("resilience_bookmark_expiry_hours", 24);

    // Hidden when resilience_bookmark_never_expires is true
    const neverTree = SettingsTab({
      status: {
        ...mockStatus,
        settings: {
          ...mockStatus.settings!,
          resilience_bookmark_never_expires: true,
          resilience_bookmark_expiry_hours: 12,
        },
      },
      refreshStatus,
      showToast,
    });
    const neverSliders = findNodes(
      neverTree,
      (n) => n.type === SliderField || n.type === "SliderField"
    );
    expect(neverSliders.find((s) => s.props?.label === "Bookmark Expiry (Hours)")).toBeUndefined();
  });

  it("renders manual Resume Bookmark and Dismiss buttons inside flow-children='horizontal' when held_bookmark is present", async () => {
    const tree = SettingsTab({
      status: {
        ...mockStatus,
        resilience_status: {
          onevent_healthy: true,
          poll_interval_s: 20,
          polling_mode: "onevent",
          last_event_at: 100,
          held_bookmark: {
            track_uri: "spotify:track:held999",
            context_uri: "spotify:album:ctx999",
            position_ms: 95000,
            was_playing: true,
            track_name: "Nightcall",
            artist: "Kavinsky",
            saved_at: 1700000000,
          },
          held_reason: "remote_active",
          recovering: false,
        },
      },
      refreshStatus,
      showToast,
    });

    const text = findText(tree);
    expect(text).toContain("Held Session Bookmark: Nightcall — Kavinsky");
    expect(text).toContain("Yielded to another active device");

    const horizontalFocusables = findNodes(
      tree,
      (n) => (n.type === Focusable || n.type === "Focusable") && n.props?.["flow-children"] === "horizontal"
    );
    const heldButtonsGroup = horizontalFocusables.find((f) => {
      const ft = findText(f);
      return ft.includes("Resume Bookmark") && ft.includes("Dismiss");
    });
    expect(heldButtonsGroup).toBeDefined();

    const buttons = findNodes(
      heldButtonsGroup,
      (n) => n.type === DialogButton || n.type === "DialogButton"
    );
    const resumeBtn = buttons.find((b) => findText(b) === "Resume Bookmark");
    const dismissBtn = buttons.find((b) => findText(b) === "Dismiss");
    expect(resumeBtn).toBeDefined();
    expect(dismissBtn).toBeDefined();

    await resumeBtn.props.onClick();
    expect(mockRestoreBookmark).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith("Bookmark restored");

    await dismissBtn.props.onClick();
    expect(mockDismissBookmark).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith("Bookmark dismissed");
  });
});
