import { describe, it, expect, vi, beforeEach } from "vitest";

const { FocusableMock, InteractiveRowMock } = vi.hoisted(() => ({
  FocusableMock: ({ children, ...props }: any) => ({
    type: "Focusable",
    props: { children, ...props },
  }),
  InteractiveRowMock: ({ children, ...props }: any) => ({
    type: "InteractiveRow",
    props: { children, ...props },
  }),
}));

vi.mock("@decky/ui", () => ({
  Focusable: FocusableMock,
}));

vi.mock("./InteractiveRow", () => ({
  InteractiveRow: InteractiveRowMock,
}));

vi.mock("./DeckifyImage", () => ({
  DeckifyImage: (props: any) => ({ type: "DeckifyImage", props }),
}));

vi.mock("react-icons/fa", () => {
  const Icon = () => ({ type: "Icon", props: {} });
  return {
    FaPlay: Icon,
    FaMicrophone: Icon,
    FaFolder: Icon,
    FaHeart: Icon,
    FaCompactDisc: Icon,
    FaUser: Icon,
    FaHistory: Icon,
    FaPodcast: Icon,
    FaSearch: Icon,
    FaListUl: Icon,
    FaTv: Icon,
    FaCog: Icon,
    FaMusic: Icon,
    FaGamepad: Icon,
  };
});

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
}));

import { Sidebar } from "./Sidebar";

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

describe("Sidebar pinned Back to Steam (B) footer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses Focusable flow-children='column' as root with overflow: hidden", () => {
    const tree: any = Sidebar({
      mode: "now_playing",
      onSelectMode: vi.fn(),
      status: null,
      closeModal: vi.fn(),
    });

    expect(tree.type).toBe(FocusableMock);
    expect(tree.props["flow-children"]).toBe("column");
    expect(tree.props.style.overflow).toBe("hidden");
    expect(tree.props.style.display).toBe("flex");
    expect(tree.props.style.flexDirection).toBe("column");
  });

  it("wraps navigation tabs in a scrollable container (flex: 1, minHeight: 0, overflowY: auto)", () => {
    const tree: any = Sidebar({
      mode: "now_playing",
      onSelectMode: vi.fn(),
      status: null,
      closeModal: vi.fn(),
    });

    const scrollWrappers = findNodes(
      tree,
      (n) =>
        n.type === "div" &&
        n.props?.style?.overflowY === "auto" &&
        n.props?.style?.flex === 1 &&
        n.props?.style?.minHeight === 0
    );
    expect(scrollWrappers.length).toBe(1);

    const innerFocusables = findNodes(
      scrollWrappers[0],
      (n) => n.type === FocusableMock && n.props?.["flow-children"] === "column"
    );
    expect(innerFocusables.length).toBe(1);
  });

  it("renders Back to Steam (B) in a flexShrink: 0 pinned footer outside the scrollable wrapper and invokes closeModal", () => {
    const closeModal = vi.fn();
    const tree: any = Sidebar({
      mode: "now_playing",
      onSelectMode: vi.fn(),
      status: null,
      closeModal,
    });

    const scrollWrapper = findNodes(
      tree,
      (n) => n.type === "div" && n.props?.style?.overflowY === "auto"
    )[0];
    const backInScroll = findNodes(
      scrollWrapper,
      (n) => typeof n === "string" && n.includes("Back to Steam (B)")
    );
    expect(backInScroll.length).toBe(0);

    const footerDivs = findNodes(
      tree,
      (n) =>
        n.type === "div" &&
        n.props?.style?.flexShrink === 0 &&
        typeof n.props?.style?.borderTop === "string"
    );
    expect(footerDivs.length).toBe(1);

    const backRow = findNodes(footerDivs[0], (n) => n.type === InteractiveRowMock)[0];
    expect(backRow).toBeDefined();
    expect(backRow.props.style.minHeight).toBe(44);

    backRow.props.onClick();
    expect(closeModal).toHaveBeenCalledTimes(1);
  });
});
