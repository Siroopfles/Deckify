import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSetSetting = vi.fn().mockResolvedValue({ ok: true });

vi.mock("@decky/api", () => ({
  callable: (name: string) => {
    if (name === "set_setting") {
      return (...args: any[]) => mockSetSetting(...args);
    }
    return vi.fn().mockResolvedValue({ ok: true });
  },
}));

vi.mock("@decky/ui", () => ({
  Focusable: ({ children, ...props }: any) => ({
    type: "Focusable",
    props: { children, ...props },
  }),
}));

vi.mock("react-icons/fa", () => ({
  FaSlidersH: () => ({ type: "FaSlidersH" }),
  FaClock: () => ({ type: "FaClock" }),
  FaPowerOff: () => ({ type: "FaPowerOff" }),
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

vi.mock("react", () => ({
  useState: (init: any) => [typeof init === "function" ? init() : init, vi.fn()],
  useEffect: (fn: any) => fn(),
  useCallback: (fn: any) => fn,
  useRef: (init: any) => ({ current: init }),
  useMemo: (fn: any) => fn(),
}));

import { SettingsTab } from "./SettingsTab";
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

  it("renders interactive duration pills for Fade Down (0.5s, 1.0s, 1.5s, 2.0s)", () => {
    const tree = SettingsTab({
      status: mockStatus,
      refreshStatus,
      showToast,
    });

    const fullText = findText(tree);
    expect(fullText).toContain("Fade Down Speed");
    expect(fullText).toContain("0.5s");
    expect(fullText).toContain("1s");
    expect(fullText).toContain("1.5s");
    expect(fullText).toContain("2s");
  });

  it("renders interactive duration pills for Fade Up (1.0s, 1.5s, 2.0s, 3.0s)", () => {
    const tree = SettingsTab({
      status: mockStatus,
      refreshStatus,
      showToast,
    });

    const fullText = findText(tree);
    expect(fullText).toContain("Fade Up Speed");
    expect(fullText).toContain("3s");
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

  it("renders Voice Chat Ducking toggle and Silence Hold Delay pills", () => {
    const tree = SettingsTab({
      status: mockStatus,
      refreshStatus,
      showToast,
    });

    const fullText = findText(tree);
    expect(fullText).toContain("Voice Chat Ducking (Discord / Steam Voice)");
    expect(fullText).toContain("Silence Hold Delay (Speech Hysteresis)");
    expect(fullText).toContain("0.8s");
    expect(fullText).toContain("1.2s");
    expect(fullText).toContain("1.6s");
    expect(fullText).toContain("2s");
  });

  it("invokes backendSetSetting with selected duration when clicking a Fade Down pill", async () => {
    const tree = SettingsTab({
      status: mockStatus,
      refreshStatus,
      showToast,
    });

    // Find interactive rows in tree
    const clickableRows = findNodes(tree, (n) => typeof n.props?.onClick === "function");
    // Find the one for 0.5s
    const pill05 = clickableRows.find((n) => findText(n).trim() === "0.5s");
    expect(pill05).toBeDefined();

    await pill05.props.onClick();
    expect(mockSetSetting).toHaveBeenCalledWith("duck_fade_down_duration", 0.5);
    expect(showToast).toHaveBeenCalledWith("Fade down: 0.5s");
    expect(refreshStatus).toHaveBeenCalled();
  });

  it("invokes backendSetSetting with selected duration when clicking a Fade Up pill", async () => {
    const tree = SettingsTab({
      status: mockStatus,
      refreshStatus,
      showToast,
    });

    const clickableRows = findNodes(tree, (n) => typeof n.props?.onClick === "function");
    const pill30 = clickableRows.find((n) => findText(n).trim() === "3s");
    expect(pill30).toBeDefined();

    await pill30.props.onClick();
    expect(mockSetSetting).toHaveBeenCalledWith("duck_fade_up_duration", 3.0);
    expect(showToast).toHaveBeenCalledWith("Fade up: 3s");
    expect(refreshStatus).toHaveBeenCalled();
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

  it("invokes backendSetSetting with voice_ducking_hold_delay when selecting hold delay", async () => {
    const tree = SettingsTab({
      status: mockStatus,
      refreshStatus,
      showToast,
    });

    const clickableRows = findNodes(tree, (n) => typeof n.props?.onClick === "function");
    const holdPill = clickableRows.find((n) => findText(n).trim() === "1.6s");
    expect(holdPill).toBeDefined();

    await holdPill.props.onClick();
    expect(mockSetSetting).toHaveBeenCalledWith("voice_ducking_hold_delay", 1.6);
    expect(showToast).toHaveBeenCalledWith("Hold delay: 1.6s");
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
});
