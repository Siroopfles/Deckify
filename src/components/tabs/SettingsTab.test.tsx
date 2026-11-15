import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSetSetting = vi.fn().mockResolvedValue({ ok: true });
const mockAddEventListener = vi.fn(() => "listener-token");
const mockRemoveEventListener = vi.fn();

vi.mock("@decky/api", () => ({
  callable: (name: string) => {
    if (name === "set_setting") {
      return (...args: any[]) => mockSetSetting(...args);
    }
    return vi.fn().mockResolvedValue({ ok: true });
  },
  addEventListener: (...args: any[]) => (mockAddEventListener as any)(...args),
  removeEventListener: (...args: any[]) => (mockRemoveEventListener as any)(...args),
}));

vi.mock("@decky/ui", () => ({
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

vi.mock("react", () => ({
  useState: (init: any) => [typeof init === "function" ? init() : init, vi.fn()],
  useEffect: (fn: any) => fn(),
  useCallback: (fn: any) => fn,
  useRef: (init: any) => ({ current: init }),
  useMemo: (fn: any) => fn(),
}));

import { SettingsTab } from "./SettingsTab";
import { SliderField, ToggleField } from "@decky/ui";
import { InteractiveRow } from "../common/InteractiveRow";
import { StatusResponse } from "../../types";

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
});
