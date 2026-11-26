import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockGetDevices = vi.fn();
const mockTransferPlayback = vi.fn();
const mockPullPlaybackToDeck = vi.fn();
const mockSetDeviceVolume = vi.fn();
const mockStartLibrespot = vi.fn();

vi.mock("@decky/api", () => ({
  callable: (name: string) => {
    if (name === "get_devices") return (...args: any[]) => mockGetDevices(...args);
    if (name === "transfer_playback") return (...args: any[]) => mockTransferPlayback(...args);
    if (name === "pull_playback_to_deck") return (...args: any[]) => mockPullPlaybackToDeck(...args);
    if (name === "set_device_volume") return (...args: any[]) => mockSetDeviceVolume(...args);
    if (name === "start_librespot") return (...args: any[]) => mockStartLibrespot(...args);
    return vi.fn().mockResolvedValue({ ok: true });
  },
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
}));

vi.mock("react-icons/fa", () => ({
  FaGamepad: (props: any) => ({ type: "FaGamepad", props }),
  FaDesktop: (props: any) => ({ type: "FaDesktop", props }),
  FaMobileAlt: (props: any) => ({ type: "FaMobileAlt", props }),
  FaQrcode: (props: any) => ({ type: "FaQrcode", props }),
  FaTabletAlt: (props: any) => ({ type: "FaTabletAlt", props }),
  FaVolumeUp: (props: any) => ({ type: "FaVolumeUp", props }),
  FaVolumeMute: (props: any) => ({ type: "FaVolumeMute", props }),
  FaTv: (props: any) => ({ type: "FaTv", props }),
  FaCar: (props: any) => ({ type: "FaCar", props }),
  FaSpotify: (props: any) => ({ type: "FaSpotify", props }),
  FaSyncAlt: (props: any) => ({ type: "FaSyncAlt", props }),
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

let stateSlots: any[] = [];
let stateIdx = 0;
let effectSlots: Array<{ deps?: any[]; cleanup?: any }> = [];
let effectIdx = 0;

function depsChanged(prev: any[] | undefined, next: any[] | undefined): boolean {
  if (!prev || !next) return true;
  if (prev.length !== next.length) return true;
  return next.some((v, i) => !Object.is(v, prev[i]));
}

vi.mock("react", () => ({
  useState: (init: any) => {
    const idx = stateIdx++;
    if (!(idx in stateSlots)) {
      stateSlots[idx] = typeof init === "function" ? init() : init;
    }
    const setState = (updater: any) => {
      stateSlots[idx] = typeof updater === "function" ? updater(stateSlots[idx]) : updater;
    };
    return [stateSlots[idx], setState];
  },
  useEffect: (fn: any, deps?: any[]) => {
    const idx = effectIdx++;
    const prev = effectSlots[idx];
    if (!prev || depsChanged(prev.deps, deps)) {
      if (typeof prev?.cleanup === "function") prev.cleanup();
      const cleanup = fn();
      effectSlots[idx] = { deps, cleanup };
    }
  },
  useCallback: (fn: any) => fn,
  useRef: (init: any) => ({ current: init }),
  useMemo: (fn: any) => fn(),
}));

import {
  DevicesTab,
  getDeviceTypeIcon,
  getEngineBadgeLabel,
} from "./DevicesTab";
import { DialogButton, Focusable, SliderField } from "@decky/ui";

function resolveTree(node: any): any {
  if (!node || typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map(resolveTree);
  if (typeof node.type === "function") {
    return resolveTree(node.type(node.props ?? {}));
  }
  if (node.props?.children !== undefined) {
    return {
      ...node,
      props: {
        ...node.props,
        children: resolveTree(node.props.children),
      },
    };
  }
  return node;
}

function renderDevicesTab(showToast = vi.fn()): any {
  stateIdx = 0;
  effectIdx = 0;
  return resolveTree(DevicesTab({ showToast }));
}

function findNodes(tree: any, predicate: (node: any) => boolean, results: any[] = []): any[] {
  if (!tree) return results;
  if (Array.isArray(tree)) {
    for (const item of tree) findNodes(item, predicate, results);
    return results;
  }
  if (typeof tree === "object") {
    if (predicate(tree)) results.push(tree);
    if (tree.props?.children !== undefined) {
      findNodes(tree.props.children, predicate, results);
    }
  }
  return results;
}

function textContent(node: any): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textContent).join(" ");
  if (typeof node === "object" && node.props?.children !== undefined) {
    return textContent(node.props.children);
  }
  return "";
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("DevicesTab (Spotify Connect Hub 2.0)", () => {
  beforeEach(() => {
    stateSlots = [];
    stateIdx = 0;
    effectSlots = [];
    effectIdx = 0;
    vi.clearAllMocks();
    mockTransferPlayback.mockResolvedValue({ ok: true });
    mockPullPlaybackToDeck.mockResolvedValue({ ok: true });
    mockSetDeviceVolume.mockResolvedValue({ ok: true, volume_percent: 65 });
    mockStartLibrespot.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders pinned local Steam Deck status card with FaGamepad, engine pill badge, and compact Refresh button", async () => {
    mockGetDevices.mockResolvedValue({
      ok: true,
      local_device_name: "Deckify-OLED",
      audio_backend: "spotify_client",
      engine_running: true,
      engine_sleeping: false,
      devices: [
        { id: "deck-1", name: "Deckify-OLED", type: "Computer", is_active: true, volume_percent: 80 },
      ],
    });

    renderDevicesTab();
    await flushMicrotasks();
    const tree = renderDevicesTab();

    expect(getEngineBadgeLabel("spotify_client")).toBe("Spotify Client");
    expect(getEngineBadgeLabel("spotifyd")).toBe("spotifyd");
    expect(getEngineBadgeLabel("librespot")).toBe("librespot");

    const fullText = textContent(tree);
    expect(fullText).toContain("Deckify-OLED");
    expect(fullText).toContain("Spotify Client");

    const gamepads = findNodes(tree, (n) => n.type === "FaGamepad");
    expect(gamepads.length).toBeGreaterThanOrEqual(1);

    const buttons = findNodes(tree, (n) => n.type === DialogButton || n.type === "DialogButton");
    const refreshBtn = buttons.find((b) => textContent(b).includes("Refresh"));
    expect(refreshBtn).toBeDefined();
    expect(refreshBtn.props.style?.width).toBe("auto");
    expect(refreshBtn.props.style?.minWidth).toBe("auto");
  });

  it("shows 'Pull Playback to Steam Deck' when external device is active and hides it when local device is active", async () => {
    mockGetDevices.mockResolvedValue({
      ok: true,
      local_device_name: "Deckify",
      local_hardware_label: "Steam Deck",
      audio_backend: "librespot",
      engine_running: true,
      engine_sleeping: false,
      devices: [
        { id: "phone-1", name: "Pixel 8", type: "Smartphone", is_active: true, volume_percent: 60 },
        { id: "deck-1", name: "Deckify", type: "Computer", is_active: false, volume_percent: 75 },
      ],
    });

    renderDevicesTab();
    await flushMicrotasks();
    const treeExternal = renderDevicesTab();

    const buttonsExternal = findNodes(
      treeExternal,
      (n) => n.type === DialogButton || n.type === "DialogButton",
    );
    const pullBtn = buttonsExternal.find((b) => textContent(b).includes("Pull Playback to Steam Deck"));
    expect(pullBtn).toBeDefined();
    expect(pullBtn.props.style?.width).toBe("auto");
    expect(pullBtn.props.style?.minWidth).toBe("auto");

    await pullBtn.props.onClick();
    expect(mockPullPlaybackToDeck).toHaveBeenCalledTimes(1);

    // Now test when local device is already active
    stateSlots = [];
    effectSlots = [];
    mockGetDevices.mockResolvedValue({
      ok: true,
      local_device_name: "Deckify",
      audio_backend: "librespot",
      engine_running: true,
      engine_sleeping: false,
      devices: [
        { id: "deck-1", name: "Deckify", type: "Computer", is_active: true, volume_percent: 75 },
      ],
    });

    renderDevicesTab();
    await flushMicrotasks();
    const treeLocalActive = renderDevicesTab();
    const buttonsLocal = findNodes(
      treeLocalActive,
      (n) => n.type === DialogButton || n.type === "DialogButton",
    );
    expect(buttonsLocal.some((b) => textContent(b).includes("Pull Playback to Steam Deck"))).toBe(false);
  });

  it("maps Connect device types to distinct react-icons/fa icons and truncates long device names", async () => {
    expect(resolveTree(getDeviceTypeIcon("Computer", false)).type).toBe("FaDesktop");
    expect(resolveTree(getDeviceTypeIcon("Smartphone", false)).type).toBe("FaMobileAlt");
    expect(resolveTree(getDeviceTypeIcon("Tablet", false)).type).toBe("FaTabletAlt");
    expect(resolveTree(getDeviceTypeIcon("Speaker", false)).type).toBe("FaVolumeUp");
    expect(resolveTree(getDeviceTypeIcon("CastAudio", false)).type).toBe("FaVolumeUp");
    expect(resolveTree(getDeviceTypeIcon("TV", false)).type).toBe("FaTv");
    expect(resolveTree(getDeviceTypeIcon("Automobile", false)).type).toBe("FaCar");
    expect(resolveTree(getDeviceTypeIcon("Unknown", false)).type).toBe("FaSpotify");
    expect(resolveTree(getDeviceTypeIcon("Computer", true)).type).toBe("FaGamepad");

    mockGetDevices.mockResolvedValue({
      ok: true,
      local_device_name: "Deckify",
      audio_backend: "librespot",
      engine_running: true,
      engine_sleeping: false,
      devices: [
        {
          id: "spk-1",
          name: "Very Long Living Room Sonos Arc Ultra Soundbar Name",
          type: "Speaker",
          is_active: true,
          volume_percent: 50,
        },
      ],
    });

    renderDevicesTab();
    await flushMicrotasks();
    const tree = renderDevicesTab();

    expect(textContent(tree)).toContain("Very Long Living Room Sonos Arc Ultra Soundbar Name");
    const ellipsisNodes = findNodes(
      tree,
      (n) => n.props?.style?.textOverflow === "ellipsis" && textContent(n).includes("Very Long Living Room"),
    );
    expect(ellipsisNodes.length).toBeGreaterThanOrEqual(1);
    const minWidthZeroNodes = findNodes(tree, (n) => n.props?.style?.minWidth === 0);
    expect(minWidthZeroNodes.length).toBeGreaterThanOrEqual(1);
  });

  it("debounces remote volume SliderField by 300ms and renders Fixed Volume badge for restricted/null devices", async () => {
    vi.useFakeTimers();
    mockGetDevices.mockResolvedValue({
      ok: true,
      local_device_name: "Deckify",
      audio_backend: "librespot",
      engine_running: true,
      engine_sleeping: false,
      devices: [
        {
          id: "spk-1",
          name: "Bedroom Speaker",
          type: "Speaker",
          is_active: true,
          volume_percent: 45,
          is_restricted: false,
          supports_volume: true,
        },
        {
          id: "tv-1",
          name: "Living Room TV",
          type: "TV",
          is_active: false,
          volume_percent: null,
          is_restricted: true,
          supports_volume: false,
        },
      ],
    });

    renderDevicesTab();
    await flushMicrotasks();
    const tree = renderDevicesTab();

    const sliders = findNodes(tree, (n) => n.type === SliderField || n.type === "SliderField");
    expect(sliders.length).toBe(1);
    expect(sliders[0].props.label).toContain("Remote Volume — Bedroom Speaker");

    sliders[0].props.onChange(65);
    expect(mockSetDeviceVolume).not.toHaveBeenCalled();

    vi.advanceTimersByTime(299);
    expect(mockSetDeviceVolume).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    await flushMicrotasks();
    expect(mockSetDeviceVolume).toHaveBeenCalledWith("spk-1", 65);

    // Fixed volume badge appears on the restricted device row
    expect(textContent(tree)).toContain("Fixed Volume");

    // When only a fixed-volume device is active, no SliderField is rendered
    stateSlots = [];
    effectSlots = [];
    mockGetDevices.mockResolvedValue({
      ok: true,
      local_device_name: "Deckify",
      audio_backend: "librespot",
      engine_running: true,
      engine_sleeping: false,
      devices: [
        {
          id: "tv-1",
          name: "Living Room TV",
          type: "TV",
          is_active: true,
          volume_percent: null,
          is_restricted: true,
          supports_volume: false,
        },
      ],
    });

    renderDevicesTab();
    await flushMicrotasks();
    const fixedTree = renderDevicesTab();
    const fixedSliders = findNodes(fixedTree, (n) => n.type === SliderField || n.type === "SliderField");
    expect(fixedSliders.length).toBe(0);
    expect(textContent(fixedTree)).toContain("This device does not support remote volume control.");
  });

  it("renders empty state card with Wake Local Engine and Refresh buttons in horizontal Focusable", async () => {
    mockGetDevices.mockResolvedValue({
      ok: true,
      local_device_name: "Deckify",
      audio_backend: "librespot",
      engine_running: false,
      engine_sleeping: false,
      devices: [],
    });

    renderDevicesTab();
    await flushMicrotasks();
    const tree = renderDevicesTab();

    expect(textContent(tree)).toContain("No Spotify Connect Devices Found");
    const horizContainers = findNodes(
      tree,
      (n) => (n.type === Focusable || n.type === "Focusable") && n.props?.["flow-children"] === "horizontal",
    );
    const emptyActions = horizContainers.find(
      (c) => textContent(c).includes("Wake Local Engine") && textContent(c).includes("Refresh"),
    );
    expect(emptyActions).toBeDefined();
  });

  it("renders Steam Machine hardware labels when local_hardware_label is 'Steam Machine'", async () => {
    mockGetDevices.mockResolvedValue({
      ok: true,
      local_device_name: "Bazzite",
      local_hostname: "bazzite",
      local_hardware_label: "Steam Machine",
      audio_backend: "librespot",
      engine_running: true,
      engine_sleeping: false,
      devices: [
        { id: "phone-1", name: "Pixel 8", type: "Smartphone", is_active: true, volume_percent: 60 },
      ],
    });

    renderDevicesTab();
    await flushMicrotasks();
    const tree = renderDevicesTab();

    const fullText = textContent(tree);
    expect(fullText).toContain("Steam Machine Engine");
    expect(fullText).toContain("Pull Playback to Steam Machine");
    expect(fullText).not.toContain("Steam Deck Engine");
    expect(fullText).not.toContain("Pull Playback to Steam Deck");
  });

  it("deduplicates local device across differing hostname capitalization", async () => {
    mockGetDevices.mockResolvedValue({
      ok: true,
      local_device_name: "bazzite",
      local_hostname: "bazzite",
      local_hardware_label: "Steam Machine",
      audio_backend: "librespot",
      engine_running: true,
      engine_sleeping: false,
      devices: [
        { id: "local-1", name: "Bazzite", type: "Computer", is_active: true, volume_percent: 80 },
        { id: "phone-1", name: "Pixel 8", type: "Smartphone", is_active: false, volume_percent: 50 },
      ],
    });

    renderDevicesTab();
    await flushMicrotasks();
    const tree = renderDevicesTab();

    const rows = findNodes(
      tree,
      (n) => (n.type === Focusable || n.type === "Focusable") && n.props?.noFocusRing === true && n.props?.tabIndex === 0,
    );
    // Only the remote device ("Pixel 8") should appear as a DeviceRow; "Bazzite" is pinned in LocalDeckStatusCard only
    expect(rows.length).toBe(1);
    expect(textContent(rows[0])).toContain("Pixel 8");
    expect(textContent(rows[0])).not.toContain("Bazzite");
  });

  it("hardens InteractiveRow and badges for 40+ character Connect device names", async () => {
    const longName = "Living Room Denon AVR-X3800H Home Theater Receiver";
    mockGetDevices.mockResolvedValue({
      ok: true,
      local_device_name: "Deckify",
      local_hardware_label: "Steam Deck",
      audio_backend: "librespot",
      engine_running: true,
      engine_sleeping: false,
      devices: [
        {
          id: "avr-1",
          name: longName,
          type: "AVR",
          is_active: true,
          volume_percent: null,
          is_restricted: true,
          supports_volume: false,
        },
      ],
    });

    renderDevicesTab();
    await flushMicrotasks();
    const tree = renderDevicesTab();

    const interactiveRows = findNodes(
      tree,
      (n) => (n.type === Focusable || n.type === "Focusable") && n.props?.noFocusRing === true && n.props?.tabIndex === 0,
    );
    expect(interactiveRows.length).toBe(1);
    expect(interactiveRows[0].props.style?.minWidth).toBe(0);
    expect(interactiveRows[0].props.style?.boxSizing).toBe("border-box");

    const nameSpan = findNodes(
      tree,
      (n) =>
        n.type === "span" &&
        n.props?.style?.textOverflow === "ellipsis" &&
        textContent(n).includes(longName),
    );
    expect(nameSpan.length).toBe(1);
    expect(nameSpan[0].props.style?.overflow).toBe("hidden");
    expect(nameSpan[0].props.style?.whiteSpace).toBe("nowrap");

    const fixedBadge = findNodes(
      tree,
      (n) => n.type === "span" && textContent(n).includes("Fixed Volume"),
    );
    expect(fixedBadge.length).toBe(1);
    expect(fixedBadge[0].props.style?.whiteSpace).toBe("nowrap");

    const activeBadge = findNodes(
      tree,
      (n) => n.type === "span" && textContent(n).trim() === "Active",
    );
    expect(activeBadge.length).toBe(1);
    expect(activeBadge[0].props.style?.whiteSpace).toBe("nowrap");
  });

  it("renders 'Start / Share Spotify Jam' and 'Jam Active' pill + 'End Jam' in DevicesTab", async () => {
    mockGetDevices.mockResolvedValueOnce({
      ok: true,
      local_device_name: "Deckify",
      local_hostname: "steamdeck",
      audio_backend: "spotify_client",
      engine_running: true,
      engine_sleeping: false,
      devices: [],
    });
    const onOpenJamModal = vi.fn();
    const onEndJam = vi.fn();
    const treeInactive = resolveTree(DevicesTab({ showToast: vi.fn(), jamSession: { active: false }, onOpenJamModal }));
    const startBtn = findNodes(treeInactive, (n) => n.props?.["data-testid"] === "devices-start-jam-btn");
    expect(startBtn).toHaveLength(1);
    expect(startBtn[0].props.style?.width).toBe("auto");
    expect(startBtn[0].props.style?.flexShrink).toBe(0);
    startBtn[0].props.onClick();
    expect(onOpenJamModal).toHaveBeenCalledTimes(1);

    const treeActive = resolveTree(
      DevicesTab({
        showToast: vi.fn(),
        jamSession: { active: true, guest_count: 2, is_host: true },
        onOpenJamModal,
        onEndJam,
      }),
    );
    const pill = findNodes(treeActive, (n) => n.props?.["data-testid"] === "devices-jam-pill");
    expect(pill).toHaveLength(1);
    expect(textContent(pill[0])).toContain("Jam Active · 2");
    const endBtn = findNodes(treeActive, (n) => n.props?.["data-testid"] === "devices-end-jam-btn");
    expect(endBtn).toHaveLength(1);
    endBtn[0].props.onClick();
    expect(onEndJam).toHaveBeenCalledTimes(1);
  });
});
