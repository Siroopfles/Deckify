import { describe, it, expect, vi } from "vitest";

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

vi.mock("@decky/ui", () => ({
  Focusable: (props: any) => ({ type: "Focusable", props }),
}));

vi.mock("../common/InteractiveRow", () => ({
  InteractiveRow: (props: any) => ({ type: "InteractiveRow", props }),
}));

import { LyricsTab, LyricsTabProps } from "./LyricsTab";

function expandTree(node: any): any {
  if (!node || typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map(expandTree);
  if (typeof node.type === "function") {
    return expandTree(node.type(node.props));
  }
  if (node.props && node.props.children !== undefined) {
    return {
      ...node,
      props: {
        ...node.props,
        children: expandTree(node.props.children),
      },
    };
  }
  return node;
}

function findNodes(node: any, predicate: (n: any) => boolean): any[] {
  const results: any[] = [];
  if (!node || typeof node !== "object") return results;
  if (Array.isArray(node)) {
    for (const child of node) {
      results.push(...findNodes(child, predicate));
    }
    return results;
  }
  if (predicate(node)) results.push(node);
  if (node.props?.children) {
    results.push(...findNodes(node.props.children, predicate));
  }
  return results;
}

function findText(node: any): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(findText).join("");
  if (node.props?.children !== undefined) return findText(node.props.children);
  return "";
}

function makeBaseProps(overrides: Partial<LyricsTabProps> = {}): LyricsTabProps {
  return {
    trackName: "Idol",
    artistName: "YOASOBI",
    lyricsSource: "LRCLIB",
    lyricsCached: false,
    handleNextLyricsSource: vi.fn(),
    onSelectLyricsSource: vi.fn(),
    loadingLyrics: false,
    syncedLyrics: [
      { timeMs: 5000, text: "無敵の笑顔で荒らすメディア", romanized: "muteki no egao de arasu media" },
      { timeMs: 9000, text: "Dancing in the moonlight" },
    ],
    plainLyrics: null,
    currentLineIndex: 0,
    onSeekPlayback: vi.fn(),
    trackOffsetMs: 0,
    onNudgeOffset: vi.fn(),
    onResetOffset: vi.fn(),
    romanizeEnabled: false,
    romanizeDisplayStyle: "dual",
    onToggleRomanize: vi.fn(),
    ...overrides,
  };
}

describe("LyricsTab", () => {
  it("displays Source: {name} (Cached) when lyricsCached is true", () => {
    const tree = expandTree(LyricsTab(makeBaseProps({ lyricsCached: true })));
    const text = findText(tree);
    expect(text).toContain("Source: LRCLIB (Cached)");
  });

  it("displays Source: {name} without (Cached) when lyricsCached is false", () => {
    const tree = expandTree(LyricsTab(makeBaseProps({ lyricsCached: false })));
    const text = findText(tree);
    expect(text).toContain("Source: LRCLIB");
    expect(text).not.toContain("(Cached)");
  });

  it("renders horizontal nudge/romanize toolbar and invokes callbacks", () => {
    const onNudgeOffset = vi.fn();
    const onResetOffset = vi.fn();
    const onToggleRomanize = vi.fn();
    const tree = expandTree(
      LyricsTab(
        makeBaseProps({
          trackOffsetMs: 1500,
          onNudgeOffset,
          onResetOffset,
          onToggleRomanize,
        }),
      ),
    );

    const text = findText(tree);
    expect(text).toContain("+1.5s");
    expect(text).toContain("X -0.5s · Y +0.5s");

    const rows = findNodes(tree, (n) => n.type === "InteractiveRow");
    const minusBtn = rows.find((r) => findText(r).includes("-0.5s"));
    const plusBtn = rows.find((r) => findText(r).includes("+0.5s"));
    const resetBtn = rows.find((r) => findText(r).includes("Reset"));
    const romanizeBtn = rows.find((r) => findText(r).includes("Romanize"));

    expect(minusBtn).toBeDefined();
    expect(plusBtn).toBeDefined();
    expect(resetBtn).toBeDefined();
    expect(romanizeBtn).toBeDefined();

    minusBtn.props.onClick();
    plusBtn.props.onClick();
    resetBtn.props.onClick();
    romanizeBtn.props.onClick();

    expect(onNudgeOffset).toHaveBeenNthCalledWith(1, -500);
    expect(onNudgeOffset).toHaveBeenNthCalledWith(2, 500);
    expect(onResetOffset).toHaveBeenCalledTimes(1);
    expect(onToggleRomanize).toHaveBeenCalledTimes(1);
  });

  it("renders dual-line CJK + romanized sub-lines and leaves non-CJK single-line", () => {
    const tree = expandTree(
      LyricsTab(
        makeBaseProps({
          romanizeEnabled: true,
          romanizeDisplayStyle: "dual",
        }),
      ),
    );
    const rows = findNodes(tree, (n) => n.type === "InteractiveRow");
    const cjkRow = rows.find((r) => findText(r).includes("無敵の笑顔で荒らすメディア"));
    const englishRow = rows.find((r) => findText(r).includes("Dancing in the moonlight"));

    expect(findText(cjkRow)).toContain("muteki no egao de arasu media");
    expect(findText(englishRow)).toBe("Dancing in the moonlight");
  });

  it("renders romanized-only when romanizeDisplayStyle is romanized_only", () => {
    const tree = expandTree(
      LyricsTab(
        makeBaseProps({
          romanizeEnabled: true,
          romanizeDisplayStyle: "romanized_only",
        }),
      ),
    );
    const rows = findNodes(tree, (n) => n.type === "InteractiveRow");
    const cjkRow = rows.find((r) => findText(r).includes("muteki no egao de arasu media"));

    expect(cjkRow).toBeDefined();
    expect(findText(cjkRow)).toBe("muteki no egao de arasu media");
    expect(findText(cjkRow)).not.toContain("無敵の笑顔で荒らすメディア");
  });

  it("seeks playback with Math.max(0, line.timeMs + trackOffsetMs)", () => {
    const onSeekPlayback = vi.fn();
    const tree = expandTree(
      LyricsTab(
        makeBaseProps({
          trackOffsetMs: -1000,
          onSeekPlayback,
        }),
      ),
    );
    const rows = findNodes(tree, (n) => n.type === "InteractiveRow");
    const cjkRow = rows.find((r) => findText(r).includes("無敵の笑顔で荒らすメディア"));
    cjkRow.props.onClick();
    expect(onSeekPlayback).toHaveBeenCalledWith(4000);
  });

  it("renders empty-state copy when no synced or plain lyrics exist", () => {
    const tree = expandTree(
      LyricsTab(
        makeBaseProps({
          syncedLyrics: [],
          plainLyrics: null,
        }),
      ),
    );
    const text = findText(tree);
    expect(text).toContain("No Lyrics Available");
    expect(text).toContain("Press Try Next Source to search another provider.");
  });
});
