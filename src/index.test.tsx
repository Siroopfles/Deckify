import { describe, it, expect, vi, beforeEach } from "vitest";

const mockHandleAppLifetimeEvent = vi.fn().mockResolvedValue({ ok: true });
const mockTriggerDucking = vi.fn().mockResolvedValue({ ok: true });
const mockRegisterForAppLifetime = vi.fn().mockReturnValue({ unregister: vi.fn() });

let capturedPluginFactory: (() => any) | null = null;

vi.mock("@decky/api", () => ({
  callable: (name: string) => {
    if (name === "handle_app_lifetime_event") return (...args: any[]) => mockHandleAppLifetimeEvent(...args);
    if (name === "trigger_ducking") return (...args: any[]) => mockTriggerDucking(...args);
    return vi.fn().mockResolvedValue({ ok: true });
  },
  addEventListener: vi.fn(() => vi.fn()),
  removeEventListener: vi.fn(),
  definePlugin: (fn: () => any) => {
    capturedPluginFactory = fn;
    return fn;
  },
  routerHook: {
    addGlobalComponent: vi.fn(),
    removeGlobalComponent: vi.fn(),
    addRoute: vi.fn(),
    removeRoute: vi.fn(),
  },
  toaster: { toast: vi.fn() },
}));

vi.mock("@decky/ui", () => ({
  PanelSection: ({ children }: any) => ({ type: "PanelSection", props: { children } }),
  PanelSectionRow: ({ children }: any) => ({ type: "PanelSectionRow", props: { children } }),
  ToggleField: (props: any) => ({ type: "ToggleField", props }),
  Field: (props: any) => ({ type: "Field", props }),
  DropdownItem: (props: any) => ({ type: "DropdownItem", props }),
  ButtonItem: ({ children, ...props }: any) => ({ type: "ButtonItem", props: { children, ...props } }),
  SliderField: (props: any) => ({ type: "SliderField", props }),
  Focusable: ({ children, ...props }: any) => ({ type: "Focusable", props: { children, ...props } }),
  DialogButton: ({ children, ...props }: any) => ({ type: "DialogButton", props: { children, ...props } }),
  Navigation: { Navigate: vi.fn() },
  Router: { MainRunningApp: { appid: 1091500 } },
  showModal: vi.fn(),
  staticClasses: { Title: "Title" },
}));

vi.mock("./steamMenu", () => ({ registerSteamMenu: vi.fn(() => vi.fn()) }));
vi.mock("./components/DeckifyExpandedModal", () => ({ DeckifyExpandedModal: () => ({ type: "Modal", props: {} }) }));
vi.mock("./components/DeckifyOverlay", () => ({ DeckifyOverlay: () => ({ type: "Overlay", props: {} }) }));
vi.mock("./hooks/usePlaybackClock", () => ({ usePlaybackClock: () => ({ positionMs: 0, notifySeek: vi.fn() }) }));
vi.mock("./components/common/InteractiveRow", () => ({ formatMs: (ms: number) => String(ms) }));
vi.mock("react-icons/fa", () => {
  const Icon = () => ({ type: "Icon", props: {} });
  return {
    FaMusic: Icon,
    FaSpotify: Icon,
    FaPlay: Icon,
    FaPause: Icon,
    FaStepBackward: Icon,
    FaStepForward: Icon,
    FaRandom: Icon,
    FaRedo: Icon,
    FaHeart: Icon,
    FaRegHeart: Icon,
    FaPlus: Icon,
  };
});
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

vi.mock("react", () => ({
  useState: (init: any) => [typeof init === "function" ? init() : init, vi.fn()],
  useEffect: (fn: any) => fn(),
  useCallback: (fn: any) => fn,
}));

describe("src/index.tsx GameSessions AppLifetime & Router.MainRunningApp startup seed (Gap 4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).window = {
      SteamClient: {
        GameSessions: {
          RegisterForAppLifetimeNotifications: mockRegisterForAppLifetime,
        },
        Input: {},
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
  });

  it("seeds running appId from Router.MainRunningApp and registers on SteamClient.GameSessions", async () => {
    await import("./index");
    expect(capturedPluginFactory).toBeTypeOf("function");

    const plugin = capturedPluginFactory!();
    expect(mockHandleAppLifetimeEvent).toHaveBeenCalledWith(1091500, true);
    expect(mockRegisterForAppLifetime).toHaveBeenCalledTimes(1);

    const lifecycleCb = mockRegisterForAppLifetime.mock.calls[0][0];
    await lifecycleCb({ unAppID: 440, bRunning: true });
    expect(mockHandleAppLifetimeEvent).toHaveBeenCalledWith(440, true);

    plugin.onDismount?.();
  });
});
