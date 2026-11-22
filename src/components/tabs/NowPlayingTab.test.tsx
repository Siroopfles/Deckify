import { describe, it, expect, vi, beforeEach } from "vitest";

interface MockNode {
  type?: unknown;
  props?: Record<string, unknown> & { children?: unknown };
}

vi.mock("react/jsx-dev-runtime", () => ({
  jsxDEV: (type: unknown, props: Record<string, unknown>, key?: string) => ({
    type,
    props: { ...props, ...(key !== undefined ? { key } : {}) },
  }),
}));

vi.mock("react/jsx-runtime", () => ({
  jsx: (type: unknown, props: Record<string, unknown>, key?: string) => ({
    type,
    props: { ...props, ...(key !== undefined ? { key } : {}) },
  }),
  jsxs: (type: unknown, props: Record<string, unknown>, key?: string) => ({
    type,
    props: { ...props, ...(key !== undefined ? { key } : {}) },
  }),
}));

vi.mock("react", () => ({
  useState: (init: unknown) => [init, vi.fn()],
  useEffect: (fn: () => void) => fn(),
  useCallback: (fn: unknown) => fn,
  useRef: (init: unknown) => ({ current: init }),
  useMemo: (fn: () => unknown) => fn(),
}));

vi.mock("@decky/ui", () => ({
  Focusable: ({ children, ...props }: Record<string, unknown>) => ({
    type: "Focusable",
    props: { children, ...props },
  }),
  DialogButton: ({ children, ...props }: Record<string, unknown>) => ({
    type: "DialogButton",
    props: { children, ...props },
  }),
  Dropdown: (props: Record<string, unknown>) => ({
    type: "Dropdown",
    props,
  }),
}));

vi.mock("react-icons/fa", () => {
  const icon = (name: string) => (props: Record<string, unknown>) => ({
    type: name,
    props,
  });
  return {
    FaSpotify: icon("FaSpotify"),
    FaRandom: icon("FaRandom"),
    FaStepBackward: icon("FaStepBackward"),
    FaPlay: icon("FaPlay"),
    FaPause: icon("FaPause"),
    FaStepForward: icon("FaStepForward"),
    FaRedo: icon("FaRedo"),
    FaUndo: icon("FaUndo"),
    FaHeart: icon("FaHeart"),
    FaRegHeart: icon("FaRegHeart"),
    FaVolumeMute: icon("FaVolumeMute"),
    FaVolumeUp: icon("FaVolumeUp"),
    FaPlus: icon("FaPlus"),
  };
});

vi.mock("../common/DeckifyImage", () => ({
  DeckifyImage: (props: Record<string, unknown>) => ({
    type: "DeckifyImage",
    props,
  }),
}));

vi.mock("../common/InteractiveRow", () => ({
  InteractiveRow: ({ children, ...props }: Record<string, unknown>) => ({
    type: "InteractiveRow",
    props: { children, ...props },
  }),
  RoundBtn: ({ children, ...props }: Record<string, unknown>) => ({
    type: "RoundBtn",
    props: { children, ...props },
  }),
  focusHalo: () => ({}),
  formatMs: (ms: number) => `${Math.floor(ms / 1000)}s`,
}));

import { NowPlayingTab, NowPlayingTabProps } from "./NowPlayingTab";
import { StatusResponse } from "../../types";

function findNodes(
  tree: unknown,
  predicate: (node: MockNode) => boolean,
  results: MockNode[] = []
): MockNode[] {
  if (!tree || typeof tree !== "object") return results;
  if (Array.isArray(tree)) {
    for (const item of tree) findNodes(item, predicate, results);
    return results;
  }
  const node = tree as MockNode;
  if (predicate(node)) results.push(node);
  const children = node.props?.children;
  if (children !== undefined) {
    findNodes(children, predicate, results);
  }
  return results;
}

function collectText(tree: unknown): string {
  if (tree == null || typeof tree === "boolean") return "";
  if (typeof tree === "string" || typeof tree === "number") return String(tree);
  if (Array.isArray(tree)) return tree.map(collectText).join(" ");
  if (typeof tree === "object") {
    const node = tree as MockNode;
    return collectText(node.props?.children);
  }
  return "";
}

function makeStatus(overrides: Partial<StatusResponse> = {}): StatusResponse {
  return {
    authenticated: true,
    running: true,
    librespot_running: false,
    spotify_client_running: true,
    play_state: "playing",
    track: null,
    position_ms: 30000,
    is_playing: true,
    volume: 60,
    shuffle_state: false,
    repeat_state: "off",
    is_liked: false,
    audio_backend: "spotify_client",
    playback_speed: 1.0,
    track_meta: {
      id: "t1",
      name: "Sample Item",
      artist: "Sample Creator",
      album: "Sample Collection",
      uri: "spotify:track:t1",
      duration_ms: 240000,
      media_type: "track",
    },
    ...overrides,
  };
}

function makeProps(overrides: Partial<NowPlayingTabProps> = {}): NowPlayingTabProps {
  return {
    status: makeStatus(),
    currentPositionMs: 30000,
    handlePlayPause: vi.fn(),
    handleNext: vi.fn(),
    handlePrev: vi.fn(),
    handleToggleRepeat: vi.fn(),
    handleToggleLike: vi.fn(),
    handleSeekDelta: vi.fn(),
    handleVolumeDelta: vi.fn(),
    onSetShuffle: vi.fn(),
    onSeekPlayback: vi.fn(),
    onOpenActions: vi.fn(),
    playbackSpeed: 1.0,
    onSetPlaybackSpeed: vi.fn(),
    ...overrides,
  };
}

function renderTab(props: NowPlayingTabProps): MockNode {
  return NowPlayingTab(props) as unknown as MockNode;
}

describe("NowPlayingTab POD-01 transport controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders Previous/Next transport buttons and omits Dropdown for music tracks", () => {
    const props = makeProps({
      status: makeStatus({
        track_meta: {
          id: "m1",
          name: "Music Track",
          artist: "Band",
          album: "LP",
          uri: "spotify:track:m1",
          duration_ms: 180000,
          media_type: "track",
        },
      }),
    });

    const tree = renderTab(props);
    expect(findNodes(tree, (n) => n.props?.["aria-label"] === "Previous")).toHaveLength(1);
    expect(findNodes(tree, (n) => n.props?.["aria-label"] === "Next")).toHaveLength(1);
    expect(findNodes(tree, (n) => n.props?.["aria-label"] === "Rewind 15s")).toHaveLength(0);
    expect(findNodes(tree, (n) => n.props?.["aria-label"] === "Forward 15s")).toHaveLength(0);
    expect(findNodes(tree, (n) => n.props?.rgOptions !== undefined)).toHaveLength(0);
    expect(findNodes(tree, (n) => n.props?.["flow-children"] === "row")).toHaveLength(0);
  });

  it("replaces Previous/Next with -15s and +15s buttons calling handleSeekDelta for podcast episodes", () => {
    const handleSeekDelta = vi.fn();
    const props = makeProps({
      handleSeekDelta,
      status: makeStatus({
        track_meta: {
          id: "ep1",
          name: "Podcast Episode",
          artist: "Host",
          album: "Show",
          uri: "spotify:episode:ep1",
          duration_ms: 1800000,
          media_type: "episode",
        },
      }),
    });

    const tree = renderTab(props);
    expect(findNodes(tree, (n) => n.props?.["aria-label"] === "Previous")).toHaveLength(0);
    expect(findNodes(tree, (n) => n.props?.["aria-label"] === "Next")).toHaveLength(0);
    const rewindBtns = findNodes(tree, (n) => n.props?.["aria-label"] === "Rewind 15s");
    const forwardBtns = findNodes(tree, (n) => n.props?.["aria-label"] === "Forward 15s");

    expect(rewindBtns).toHaveLength(1);
    expect(forwardBtns).toHaveLength(1);
    (rewindBtns[0].props?.onClick as () => void)();
    (forwardBtns[0].props?.onClick as () => void)();
    expect(handleSeekDelta).toHaveBeenNthCalledWith(1, -15);
    expect(handleSeekDelta).toHaveBeenNthCalledWith(2, 15);
  });
});

describe("NowPlayingTab POD-01 speed Dropdown", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders speed Dropdown with 7 options (0.5x..2.0x) on spotify_client and invokes onSetPlaybackSpeed(1.5)", () => {
    const onSetPlaybackSpeed = vi.fn();
    const props = makeProps({
      playbackSpeed: 1.0,
      onSetPlaybackSpeed,
      status: makeStatus({
        audio_backend: "spotify_client",
        track_meta: {
          id: "ep2",
          name: "Episode 2",
          artist: "Host",
          album: "Show",
          uri: "spotify:episode:ep2",
          duration_ms: 900000,
          media_type: "episode",
        },
      }),
    });

    const tree = renderTab(props);
    const dropdowns = findNodes(tree, (n) => n.props?.rgOptions !== undefined);
    expect(dropdowns).toHaveLength(1);

    const dropdown = dropdowns[0];
    const options = dropdown.props?.rgOptions as Array<{ data: number; label: string }>;
    expect(options).toHaveLength(7);
    expect(options[0]).toEqual({ data: 0.5, label: "0.5x" });
    expect(options[6]).toEqual({ data: 2.0, label: "2.0x" });
    expect(dropdown.props?.disabled).toBe(false);

    const onChange = dropdown.props?.onChange as (opt: { data: unknown }) => void;
    onChange({ data: 1.5 });
    expect(onSetPlaybackSpeed).toHaveBeenCalledWith(1.5);

    onChange({ data: "not-a-number" });
    expect(onSetPlaybackSpeed).toHaveBeenCalledTimes(1);
  });

  it("disables Dropdown and renders helper caption on librespot backend", () => {
    const props = makeProps({
      status: makeStatus({
        audio_backend: "librespot",
        track_meta: {
          id: "ab1",
          name: "Audiobook Chapter",
          artist: "Author",
          album: "Book",
          uri: "spotify:chapter:ab1",
          duration_ms: 1200000,
          media_type: "audiobook",
        },
      }),
    });

    const tree = renderTab(props);
    const dropdowns = findNodes(tree, (n) => n.props?.rgOptions !== undefined);
    expect(dropdowns).toHaveLength(1);
    expect(dropdowns[0].props?.disabled).toBe(true);
    expect(collectText(tree)).toContain("Playback speed requires Official Spotify Client");
  });
});
