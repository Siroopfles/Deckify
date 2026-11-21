import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

interface VNode {
  type: unknown;
  props: Record<string, unknown>;
}

function makeVNode(type: unknown, props: Record<string, unknown>, key?: unknown): VNode {
  return {
    type,
    props: key !== undefined ? { ...props, key } : { ...props },
  };
}

vi.mock("react/jsx-dev-runtime", () => ({
  Fragment: "Fragment",
  jsxDEV: (type: unknown, props: Record<string, unknown>, key?: unknown) => makeVNode(type, props, key),
}));

vi.mock("react/jsx-runtime", () => ({
  Fragment: "Fragment",
  jsx: (type: unknown, props: Record<string, unknown>, key?: unknown) => makeVNode(type, props, key),
  jsxs: (type: unknown, props: Record<string, unknown>, key?: unknown) => makeVNode(type, props, key),
}));

vi.mock("@decky/ui", () => ({
  DialogButton: (props: Record<string, unknown>) => makeVNode("DialogButton", props),
  Focusable: (props: Record<string, unknown>) => makeVNode("Focusable", props),
  ToggleField: (props: Record<string, unknown>) => makeVNode("ToggleField", props),
}));

vi.mock("react-icons/fa", () => ({
  FaGamepad: (props: Record<string, unknown>) => makeVNode("FaGamepad", props),
  FaUndo: (props: Record<string, unknown>) => makeVNode("FaUndo", props),
  FaTimes: (props: Record<string, unknown>) => makeVNode("FaTimes", props),
  FaCircle: (props: Record<string, unknown>) => makeVNode("FaCircle", props),
}));

interface EffectSlot {
  effect: () => void | (() => void);
  deps?: unknown[];
  cleanup?: () => void;
  ran?: boolean;
}

let stateSlots: unknown[] = [];
let stateIndex = 0;
let refSlots: Array<{ current: unknown }> = [];
let refIndex = 0;
let effectSlots: EffectSlot[] = [];
let effectIndex = 0;
let triggerRerender: (() => void) | null = null;

function createMockState<T>(initial: T | (() => T)): [T, (next: T | ((prev: T) => T)) => void] {
  const idx = stateIndex++;
  if (stateSlots[idx] === undefined) {
    stateSlots[idx] = typeof initial === "function" ? (initial as () => T)() : initial;
  }
  const setState = (next: T | ((prev: T) => T)) => {
    const prev = stateSlots[idx] as T;
    const val = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
    if (stateSlots[idx] !== val) {
      stateSlots[idx] = val;
      triggerRerender?.();
    }
  };
  return [stateSlots[idx] as T, setState];
}

function createMockEffect(effect: () => void | (() => void), deps?: unknown[]): void {
  const idx = effectIndex++;
  const prev = effectSlots[idx];
  let changed = true;
  if (prev && prev.deps && deps) {
    changed = deps.some((dep, i) => !Object.is(dep, prev.deps?.[i]));
  }
  if (changed) {
    prev?.cleanup?.();
    effectSlots[idx] = { effect, deps };
  }
}

vi.mock("react", () => ({
  useState: createMockState,
  useRef: <T,>(initial: T) => {
    const idx = refIndex++;
    if (refSlots[idx] === undefined) {
      refSlots[idx] = { current: initial };
    }
    return refSlots[idx] as { current: T };
  },
  useEffect: createMockEffect,
}));

import { DialogButton, Focusable, ToggleField } from "@decky/ui";
import { FaGamepad } from "react-icons/fa";
import { ChordBindingsCard, ChordBindingsCardProps } from "./ChordBindingsCard";
import {
  CHORD_ACTIONS,
  DEFAULT_CHORD_BINDINGS,
  GAMEPAD_BUTTON,
  isChordRecordingActive,
  setChordRecordingActive,
} from "../../chords";
import type { ChordBindingsMap } from "../../types";

function resetHooks(): void {
  for (const entry of effectSlots) {
    entry?.cleanup?.();
  }
  stateSlots = [];
  stateIndex = 0;
  refSlots = [];
  refIndex = 0;
  effectSlots = [];
  effectIndex = 0;
  triggerRerender = null;
}

function flushEffects(): void {
  for (let i = 0; i < effectSlots.length; i += 1) {
    const entry = effectSlots[i];
    if (entry && !entry.ran) {
      entry.ran = true;
      const cleanup = entry.effect();
      if (typeof cleanup === "function") {
        entry.cleanup = cleanup;
      }
    }
  }
}

interface GamepadTestHarness {
  unregDown: ReturnType<typeof vi.fn>;
  unregUp: ReturnType<typeof vi.fn>;
  pressDown: (btn: number) => void;
  releaseUp: (btn: number) => void;
  pressChord: (...btns: number[]) => void;
  restore: () => void;
}

function installMockGamepad(): GamepadTestHarness {
  const originalDesc = Object.getOwnPropertyDescriptor(globalThis, "window");
  let downCb: ((btn: number) => void) | null = null;
  let upCb: ((btn: number) => void) | null = null;
  const unregDown = vi.fn(() => {
    downCb = null;
  });
  const unregUp = vi.fn(() => {
    upCb = null;
  });

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    writable: true,
    value: {
      FocusNavController: {
        m_rgGamepadInputSources: [
          {
            RegisterForGamepadButtonDown: (cb: (btn: number) => void) => {
              downCb = cb;
              return unregDown;
            },
            RegisterForGamepadButtonUp: (cb: (btn: number) => void) => {
              upCb = cb;
              return unregUp;
            },
          },
        ],
      },
    },
  });

  return {
    unregDown,
    unregUp,
    pressDown: (btn: number) => {
      if (!downCb) throw new Error("Expected button-down listener to be registered");
      downCb(btn);
    },
    releaseUp: (btn: number) => {
      if (!upCb) throw new Error("Expected button-up listener to be registered");
      upCb(btn);
    },
    pressChord: (...btns: number[]) => {
      for (const b of btns) downCb?.(b);
      for (let i = btns.length - 1; i >= 0; i -= 1) upCb?.(btns[i]);
    },
    restore: () => {
      if (originalDesc) Object.defineProperty(globalThis, "window", originalDesc);
      else Reflect.deleteProperty(globalThis, "window");
    },
  };
}

function isVNode(value: unknown): value is VNode {
  return Boolean(value && typeof value === "object" && "type" in value && "props" in value);
}

function findNodes(tree: unknown, predicate: (node: VNode) => boolean, results: VNode[] = []): VNode[] {
  if (!tree) return results;
  if (Array.isArray(tree)) {
    for (const item of tree) findNodes(item, predicate, results);
    return results;
  }
  if (!isVNode(tree)) return results;
  if (predicate(tree)) results.push(tree);
  if (tree.props.children !== undefined) {
    findNodes(tree.props.children, predicate, results);
  }
  return results;
}

function findText(tree: unknown): string {
  if (tree === null || tree === undefined || typeof tree === "boolean") return "";
  if (typeof tree === "string" || typeof tree === "number") return String(tree);
  if (Array.isArray(tree)) return tree.map(findText).join(" ").replace(/\s+/g, " ").trim();
  if (isVNode(tree)) return findText(tree.props.children);
  return "";
}

function cloneDefaultBindings(): Record<string, number[]> {
  return {
    previous: [...DEFAULT_CHORD_BINDINGS.previous],
    next: [...DEFAULT_CHORD_BINDINGS.next],
    play_pause: [...DEFAULT_CHORD_BINDINGS.play_pause],
    volume_up: [...DEFAULT_CHORD_BINDINGS.volume_up],
    volume_down: [...DEFAULT_CHORD_BINDINGS.volume_down],
    toggle_like: [...DEFAULT_CHORD_BINDINGS.toggle_like],
    cycle_pinned: [...DEFAULT_CHORD_BINDINGS.cycle_pinned],
    toggle_lyrics: [...DEFAULT_CHORD_BINDINGS.toggle_lyrics],
  };
}

function renderCard(overrides?: Partial<ChordBindingsCardProps>) {
  resetHooks();
  let currentProps: ChordBindingsCardProps = {
    silentBannerEnabled: true,
    chordsEnabled: true,
    bindings: cloneDefaultBindings() as ChordBindingsMap,
    onToggleSilentBanner: vi.fn(),
    onSaveBindings: vi.fn(),
    ...overrides,
  };
  let currentTree: unknown = null;

  const invoke = () => {
    stateIndex = 0;
    refIndex = 0;
    effectIndex = 0;
    currentTree = ChordBindingsCard(currentProps);
    flushEffects();
  };

  triggerRerender = invoke;
  invoke();

  return {
    getTree: () => currentTree,
    rerender: (next: Partial<ChordBindingsCardProps>) => {
      currentProps = { ...currentProps, ...next };
      invoke();
      return currentTree;
    },
    unmount: () => resetHooks(),
  };
}

function findButton(tree: unknown, label: string, index = 0): VNode {
  const matches = findNodes(
    tree,
    (n) => (n.type === DialogButton || n.type === "DialogButton") && findText(n).includes(label),
  );
  const btn = matches[index];
  if (!btn) throw new Error(`Button "${label}" at index ${index} not found`);
  return btn;
}

function clickButton(btn: VNode): void {
  const onClick = btn.props.onClick as (() => void) | undefined;
  if (!onClick) throw new Error("DialogButton missing onClick");
  onClick();
}

let gamepad: GamepadTestHarness;

beforeEach(() => {
  vi.useFakeTimers();
  setChordRecordingActive(false);
  gamepad = installMockGamepad();
});

afterEach(() => {
  resetHooks();
  setChordRecordingActive(false);
  gamepad.restore();
  vi.useRealTimers();
});

describe("ChordBindingsCard layout, defaults, and SteamOS DialogButton overrides", () => {
  it("renders header, runtime copy, Silent HUD Banner toggle, all 8 action rows in order, and Unbound helpers", () => {
    const onToggleSilentBanner = vi.fn();
    const { getTree } = renderCard({ onToggleSilentBanner });
    const tree = getTree();
    const text = findText(tree);

    expect(text).toContain("In-Game Quick Chords");
    expect(text).toContain(
      "Chords work in-game and while the Quick Access Menu is open using buttons like L4, R4, L5, or R5 (without the STEAM button). They are paused while the Deckify window is open.",
    );
    const gamepadIcon = findNodes(
      tree,
      (n) => n.type === FaGamepad || n.type === "FaGamepad",
    )[0];
    expect(gamepadIcon).toBeDefined();
    expect(gamepadIcon.props.color).toBeUndefined();

    const toggle = findNodes(
      tree,
      (n) => n.type === ToggleField || n.type === "ToggleField",
    )[0];
    expect(toggle.props.label).toBe("Silent HUD Banner");
    expect(toggle.props.description).toBe(
      "Show track changes and chord confirmations as a silent in-game banner instead of a Steam toast.",
    );
    expect(toggle.props.checked).toBe(true);
    (toggle.props.onChange as (val: boolean) => void)(false);
    expect(onToggleSilentBanner).toHaveBeenCalledWith(false);

    const rows = findNodes(
      tree,
      (n) =>
        (n.type === Focusable || n.type === "Focusable") &&
        n.props["flow-children"] === "horizontal" &&
        (n.props.style as Record<string, unknown>)?.justifyContent === "space-between",
    );
    expect(rows.length).toBe(8);
    expect(rows.map((r) => CHORD_ACTIONS.find((a) => findText(r).includes(a.label))?.id)).toEqual(
      CHORD_ACTIONS.map((a) => a.id),
    );
    for (const row of rows) {
      expect(findText(row)).toContain("Unbound");
      expect(findText(row)).toContain("Press Record Chord, then hold 1–4 buttons together to bind this action.");
    }
  });

  it("sets width: auto and minWidth: auto on every compact inline DialogButton alongside flex: 1 minWidth: 0 left column", () => {
    const { getTree } = renderCard();
    const tree = getTree();
    const allButtons = findNodes(
      tree,
      (n) => n.type === DialogButton || n.type === "DialogButton",
    );
    expect(allButtons.length).toBe(25);
    for (const btn of allButtons) {
      const style = btn.props.style as Record<string, unknown>;
      expect(style.width).toBe("auto");
      expect(style.minWidth).toBe("auto");
    }
    const leftColumns = findNodes(
      tree,
      (n) => n.type === "div" && (n.props.style as Record<string, unknown>)?.flex === 1,
    );
    expect(leftColumns.length).toBe(8);
    for (const col of leftColumns) {
      expect((col.props.style as Record<string, unknown>).minWidth).toBe(0);
    }

    clickButton(findButton(tree, "Reset All Chords"));
    const confirmTree = getTree();
    const confirmBtn = findButton(confirmTree, "Confirm Reset");
    const keepBtn = findButton(confirmTree, "Keep Chords");
    expect((confirmBtn.props.style as Record<string, unknown>).width).toBe("auto");
    expect((confirmBtn.props.style as Record<string, unknown>).minWidth).toBe("auto");
    expect((keepBtn.props.style as Record<string, unknown>).width).toBe("auto");
    expect((keepBtn.props.style as Record<string, unknown>).minWidth).toBe("auto");
  });
});

describe("ChordBindingsCard press-to-record capture, cancel, and timeout cleanup", () => {
  it("captures [23, 3] (L4 + X) on full release, saves full 8-action map, and clears recording flag", () => {
    const onSaveBindings = vi.fn();
    const { getTree } = renderCard({ onSaveBindings });

    clickButton(findButton(getTree(), "Record Chord", 5));
    expect(isChordRecordingActive()).toBe(true);
    expect(findText(getTree())).toContain("Recording…");
    expect(findText(getTree())).toContain("Hold your button combination… (5s)");
    expect(findButton(getTree(), "Cancel Recording").props.disabled).toBe(false);
    expect(findButton(getTree(), "Record Chord", 0).props.disabled).toBe(true);

    gamepad.pressDown(GAMEPAD_BUTTON.REAR_LEFT_UPPER);
    gamepad.pressDown(GAMEPAD_BUTTON.SECONDARY);
    expect(findText(getTree())).toContain("L4");
    expect(findText(getTree())).toContain("X");
    expect(onSaveBindings).not.toHaveBeenCalled();

    gamepad.releaseUp(GAMEPAD_BUTTON.REAR_LEFT_UPPER);
    expect(onSaveBindings).not.toHaveBeenCalled();
    gamepad.releaseUp(GAMEPAD_BUTTON.SECONDARY);

    expect(isChordRecordingActive()).toBe(false);
    expect(gamepad.unregDown).toHaveBeenCalledTimes(1);
    expect(gamepad.unregUp).toHaveBeenCalledTimes(1);
    expect(onSaveBindings).toHaveBeenCalledTimes(1);
    expect(onSaveBindings).toHaveBeenCalledWith({
      ...cloneDefaultBindings(),
      toggle_like: [GAMEPAD_BUTTON.SECONDARY, GAMEPAD_BUTTON.REAR_LEFT_UPPER],
    });
  });

  it("cancels cleanly on bare B press or Cancel Recording button and cleans up on unmount", () => {
    const onSaveBindings = vi.fn();
    const { getTree, unmount } = renderCard({ onSaveBindings });

    clickButton(findButton(getTree(), "Record Chord", 5));
    expect(isChordRecordingActive()).toBe(true);
    gamepad.pressDown(GAMEPAD_BUTTON.CANCEL);
    expect(isChordRecordingActive()).toBe(false);
    expect(onSaveBindings).not.toHaveBeenCalled();
    expect(gamepad.unregDown).toHaveBeenCalledTimes(1);

    clickButton(findButton(getTree(), "Record Chord", 5));
    expect(isChordRecordingActive()).toBe(true);
    clickButton(findButton(getTree(), "Cancel Recording"));
    expect(isChordRecordingActive()).toBe(false);
    expect(gamepad.unregDown).toHaveBeenCalledTimes(2);

    clickButton(findButton(getTree(), "Record Chord", 6));
    expect(isChordRecordingActive()).toBe(true);
    unmount();
    expect(isChordRecordingActive()).toBe(false);
    expect(gamepad.unregDown).toHaveBeenCalledTimes(3);
    expect(gamepad.unregUp).toHaveBeenCalledTimes(3);
  });

  it("counts down and auto-cancels at 5s with inline message when no buttons are pressed", () => {
    const onSaveBindings = vi.fn();
    const { getTree } = renderCard({ onSaveBindings });

    clickButton(findButton(getTree(), "Record Chord", 5));
    expect(findText(getTree())).toContain("Hold your button combination… (5s)");
    vi.advanceTimersByTime(1000);
    expect(findText(getTree())).toContain("Hold your button combination… (4s)");
    vi.advanceTimersByTime(3999);
    expect(isChordRecordingActive()).toBe(true);
    vi.advanceTimersByTime(1);

    expect(isChordRecordingActive()).toBe(false);
    expect(onSaveBindings).not.toHaveBeenCalled();
    expect(gamepad.unregDown).toHaveBeenCalledTimes(1);
    const alert = findNodes(getTree(), (n) => n.props.role === "alert")[0];
    expect(findText(alert)).toBe("No buttons detected — recording cancelled.");
    expect((alert.props.style as Record<string, unknown>).color).toBe("#E53935");

    vi.advanceTimersByTime(5000);
    expect(findNodes(getTree(), (n) => n.props.role === "alert")).toHaveLength(0);
  });
});

describe("ChordBindingsCard validation rejections, Clear/Reset, disabled state, and Reset All", () => {
  it("immediately cancels recording and warns on STEAM/QAM button press, and rejects duplicates and >4 buttons without calling onSaveBindings", () => {
    const steamWarning =
      "STEAM / QAM button combos are intercepted by SteamOS and don't work in-game. Use other buttons like L4, R4, L5, or R5.";
    const onSaveBindings = vi.fn();
    const customBindings = {
      ...cloneDefaultBindings(),
      previous: [GAMEPAD_BUTTON.DIR_LEFT, GAMEPAD_BUTTON.REAR_LEFT_UPPER],
    } as ChordBindingsMap;
    const { getTree } = renderCard({ bindings: customBindings, onSaveBindings });

    clickButton(findButton(getTree(), "Record Chord", 5));
    expect(isChordRecordingActive()).toBe(true);
    gamepad.pressDown(GAMEPAD_BUTTON.STEAM_GUIDE);
    expect(isChordRecordingActive()).toBe(false);
    expect(findText(findNodes(getTree(), (n) => n.props.role === "alert")[0])).toBe(steamWarning);

    clickButton(findButton(getTree(), "Record Chord", 5));
    expect(isChordRecordingActive()).toBe(true);
    gamepad.pressDown(GAMEPAD_BUTTON.STEAM_QUICK_MENU);
    expect(isChordRecordingActive()).toBe(false);
    expect(findText(findNodes(getTree(), (n) => n.props.role === "alert")[0])).toBe(steamWarning);

    clickButton(findButton(getTree(), "Record Chord", 5));
    gamepad.pressChord(GAMEPAD_BUTTON.DIR_LEFT, GAMEPAD_BUTTON.REAR_LEFT_UPPER);
    expect(findText(findNodes(getTree(), (n) => n.props.role === "alert")[0])).toBe(
      "Already used by Previous Track. Clear that chord first or choose another.",
    );

    clickButton(findButton(getTree(), "Record Chord", 5));
    gamepad.pressDown(1);
    gamepad.pressDown(3);
    gamepad.pressDown(4);
    gamepad.pressDown(23);
    gamepad.pressDown(25);
    expect(isChordRecordingActive()).toBe(false);
    expect(findText(findNodes(getTree(), (n) => n.props.role === "alert")[0])).toBe(
      "Chords support up to 4 buttons.",
    );
    expect(onSaveBindings).not.toHaveBeenCalled();
  });
});

describe("ChordBindingsCard Clear/Reset, disabled state, and Reset All", () => {
  it("handles Clear Chord, per-action Reset Chord to [], disabled chords, and two-step Reset All", () => {
    const onSaveBindings = vi.fn();
    const customBindings = {
      ...cloneDefaultBindings(),
      previous: [],
      next: [GAMEPAD_BUTTON.DIR_RIGHT, GAMEPAD_BUTTON.REAR_LEFT_UPPER],
      toggle_like: [GAMEPAD_BUTTON.SECONDARY, GAMEPAD_BUTTON.REAR_RIGHT_UPPER],
    } as ChordBindingsMap;
    const { getTree, rerender } = renderCard({ bindings: customBindings, onSaveBindings });

    expect(findButton(getTree(), "Clear Chord", 0).props.disabled).toBe(true);
    expect(findButton(getTree(), "Clear Chord", 1).props.disabled).toBe(false);
    clickButton(findButton(getTree(), "Clear Chord", 1));
    expect(onSaveBindings).toHaveBeenCalledWith({
      ...customBindings,
      next: [],
    });

    onSaveBindings.mockClear();
    clickButton(findButton(getTree(), "Reset Chord", 5));
    expect(onSaveBindings).toHaveBeenCalledWith({
      ...customBindings,
      toggle_like: [],
    });

    onSaveBindings.mockClear();
    clickButton(findButton(getTree(), "Reset All Chords"));
    clickButton(findButton(getTree(), "Keep Chords"));
    expect(onSaveBindings).not.toHaveBeenCalled();
    clickButton(findButton(getTree(), "Reset All Chords"));
    clickButton(findButton(getTree(), "Confirm Reset"));
    expect(onSaveBindings).toHaveBeenCalledWith(cloneDefaultBindings());

    rerender({ chordsEnabled: false });
    expect(findText(getTree())).toContain("Enable in-game chords above to use these bindings.");
    const rows = findNodes(
      getTree(),
      (n) =>
        (n.type === Focusable || n.type === "Focusable") &&
        n.props["flow-children"] === "horizontal" &&
        (n.props.style as Record<string, unknown>)?.justifyContent === "space-between",
    );
    expect(rows.length).toBe(8);
    expect((rows[0].props.style as Record<string, unknown>).opacity).toBe(0.5);
    expect(findButton(getTree(), "Record Chord", 0).props.disabled).toBe(true);
  });

  it("allows L4 + B capture when B is not the first button and restores single-action Reset Chord to []", () => {
    const onSaveBindings = vi.fn();
    const customBindings = {
      ...cloneDefaultBindings(),
      previous: [GAMEPAD_BUTTON.DIR_LEFT, GAMEPAD_BUTTON.REAR_LEFT_UPPER],
    } as ChordBindingsMap;
    const { getTree } = renderCard({ bindings: customBindings, onSaveBindings });

    clickButton(findButton(getTree(), "Record Chord", 5));
    gamepad.pressChord(GAMEPAD_BUTTON.REAR_LEFT_UPPER, GAMEPAD_BUTTON.CANCEL);
    expect(onSaveBindings).toHaveBeenCalledWith({
      ...customBindings,
      toggle_like: [GAMEPAD_BUTTON.CANCEL, GAMEPAD_BUTTON.REAR_LEFT_UPPER],
    });

    onSaveBindings.mockClear();
    clickButton(findButton(getTree(), "Reset Chord", 0));
    expect(onSaveBindings).toHaveBeenCalledWith({
      ...customBindings,
      previous: [],
    });
  });
});
