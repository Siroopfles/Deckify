import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@decky/api", () => ({
  callable: () => vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("@decky/ui", () => ({
  ModalRoot: ({ children, ...props }: any) => ({ type: "ModalRoot", props: { children, ...props } }),
  Focusable: ({ children, ...props }: any) => ({ type: "Focusable", props: { children, ...props } }),
  DialogButton: ({ children, ...props }: any) => ({ type: "DialogButton", props: { children, ...props } }),
  ButtonItem: ({ children, ...props }: any) => ({ type: "ButtonItem", props: { children, ...props } }),
  ToggleField: (props: any) => ({ type: "ToggleField", props }),
  DropdownItem: (props: any) => ({ type: "DropdownItem", props }),
  SliderField: (props: any) => ({ type: "SliderField", props }),
  TextField: (props: any) => ({ type: "TextField", props }),
  NavEntryPositionPreferences: { FIRST: 0 },
}));

vi.mock("./common/DeckifyImage", () => ({
  DeckifyImage: (props: any) => ({ type: "DeckifyImage", props }),
}));
vi.mock("./common/InteractiveRow", () => ({
  InteractiveRow: ({ children, ...props }: any) => ({ type: "InteractiveRow", props: { children, ...props } }),
  formatMs: (ms: number) => String(ms),
}));
vi.mock("./common/NowPlayingFooter", () => ({
  NowPlayingFooter: (props: any) => ({ type: "NowPlayingFooter", props }),
}));
vi.mock("./tabs/HomeTab", () => ({ HomeTab: () => ({ type: "HomeTab", props: {} }) }));
vi.mock("./tabs/SearchTab", () => ({ SearchTab: () => ({ type: "SearchTab", props: {} }) }));
vi.mock("./tabs/LibraryTab", () => ({ LibraryTab: () => ({ type: "LibraryTab", props: {} }) }));
vi.mock("./tabs/QueueTab", () => ({ QueueTab: () => ({ type: "QueueTab", props: {} }) }));
vi.mock("./tabs/LyricsTab", () => ({ LyricsTab: () => ({ type: "LyricsTab", props: {} }) }));
vi.mock("./tabs/SoundtracksTab", () => ({ SoundtracksTab: () => ({ type: "SoundtracksTab", props: {} }) }));
vi.mock("./tabs/SettingsTab", () => ({ SettingsTab: () => ({ type: "SettingsTab", props: {} }) }));
vi.mock("../hooks/usePlaybackClock", () => ({
  usePlaybackClock: () => ({ positionMs: 0, notifySeek: vi.fn() }),
}));
vi.mock("react-icons/fa", () => new Proxy({}, { get: () => () => ({ type: "Icon", props: {} }) }));
vi.mock("react-icons/md", () => new Proxy({}, { get: () => () => ({ type: "Icon", props: {} }) }));
vi.mock("qrcode.react", () => ({ QRCodeSVG: () => ({ type: "QRCodeSVG", props: {} }) }));

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
  useEffect: () => {},
  useCallback: (fn: any) => fn,
  useMemo: (fn: any) => fn(),
  useRef: (init: any) => {
    const idx = refIdx++;
    if (!(idx in refValues)) {
      refValues[idx] = { current: init };
    }
    return refValues[idx];
  },
}));

import { DeckifyExpandedModal } from "./DeckifyExpandedModal";

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

describe("DeckifyExpandedModal vgp_oncancel bubble handling (Gap 3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stateValues = [];
    stateIdx = 0;
    refValues = [];
    refIdx = 0;
  });

  it("registers vgp_oncancel in bubble phase (false) and does not call closeModal directly", () => {
    const closeModal = vi.fn();
    const tree = DeckifyExpandedModal({ closeModal });

    const navDiv = findNodes(tree, (n) => n.type === "div" && typeof n.props?.ref === "function")[0];
    expect(navDiv).toBeDefined();

    const listeners: Record<string, { fn: (e: any) => void; capture: any }> = {};
    const mockEl: any = {
      addEventListener: vi.fn((ev: string, fn: (e: any) => void, capture: any) => {
        listeners[ev] = { fn, capture };
      }),
    };

    navDiv.props.ref(mockEl);

    expect(mockEl.addEventListener).toHaveBeenCalledWith("vgp_oncancel", expect.any(Function), false);
    expect(listeners["vgp_oncancel"].capture).toBe(false);

    // When no breadcrumb is active (e.g., SliderField handled or bubbled), attachNav must NOT call closeModal
    const ev = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      stopImmediatePropagation: vi.fn(),
    };
    listeners["vgp_oncancel"].fn(ev);
    expect(ev.preventDefault).not.toHaveBeenCalled();
    expect(ev.stopPropagation).not.toHaveBeenCalled();
    expect(closeModal).not.toHaveBeenCalled();

    // Verify ModalRoot still has onCancel={closeModal} for unhandled bubble events
    expect((tree as any).props.onCancel).toBe(closeModal);
  });

  it("closes active breadcrumb without calling closeModal when vgp_oncancel fires", () => {
    const closeModal = vi.fn();
    const tree = DeckifyExpandedModal({ closeModal });

    const navDiv = findNodes(tree, (n) => n.type === "div" && typeof n.props?.ref === "function")[0];
    const listeners: Record<string, (e: any) => void> = {};
    navDiv.props.ref({
      addEventListener: (ev: string, fn: (e: any) => void) => {
        listeners[ev] = fn;
      },
    });

    // Activate breadcrumb refs (actionTrackRef / activeAlbumRef / activeArtistRef / activePlaylistRef)
    for (const r of refValues) {
      if (r && r.current === null) {
        r.current = { id: "pl-1", name: "Test Playlist" };
      }
    }

    const ev = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      stopImmediatePropagation: vi.fn(),
    };
    listeners["vgp_oncancel"](ev);

    expect(ev.preventDefault).toHaveBeenCalledTimes(1);
    expect(ev.stopPropagation).toHaveBeenCalledTimes(1);
    expect(closeModal).not.toHaveBeenCalled();
  });
});
