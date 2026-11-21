import type { ChordActionId, ChordBindingsMap } from "./types";

/**
 * Verified @decky/ui `GamepadButton` indices (`FooterLegend.ts:3-33`).
 *
 * Note: `DEFAULT_CHORD_BINDINGS.play_pause` uses `GAMEPAD_BUTTON.OK` (1 = A)
 * rather than the legacy `src/index.tsx` check for button `0` (`GAMEPAD_BUTTON.INVALID`).
 * `GUIDE_BUTTON_IDS` includes both `@decky/ui` `STEAM_GUIDE` / `STEAM_QUICK_MENU` (27/28)
 * and legacy `SELECT` / `START` (13/14) to preserve D-09 compatibility.
 */
export const GAMEPAD_BUTTON = {
  INVALID: 0,
  OK: 1,
  CANCEL: 2,
  SECONDARY: 3,
  OPTIONS: 4,
  BUMPER_LEFT: 5,
  BUMPER_RIGHT: 6,
  TRIGGER_LEFT: 7,
  TRIGGER_RIGHT: 8,
  DIR_UP: 9,
  DIR_DOWN: 10,
  DIR_LEFT: 11,
  DIR_RIGHT: 12,
  SELECT: 13,
  START: 14,
  LSTICK_CLICK: 15,
  RSTICK_CLICK: 16,
  LSTICK_TOUCH: 17,
  RSTICK_TOUCH: 18,
  LPAD_TOUCH: 19,
  LPAD_CLICK: 20,
  RPAD_TOUCH: 21,
  RPAD_CLICK: 22,
  REAR_LEFT_UPPER: 23,
  REAR_LEFT_LOWER: 24,
  REAR_RIGHT_UPPER: 25,
  REAR_RIGHT_LOWER: 26,
  STEAM_GUIDE: 27,
  STEAM_QUICK_MENU: 28,
} as const;

export const CANONICAL_GUIDE_ID = GAMEPAD_BUTTON.STEAM_GUIDE;
export const GUIDE_BUTTON_IDS = [
  GAMEPAD_BUTTON.STEAM_GUIDE,
  GAMEPAD_BUTTON.STEAM_QUICK_MENU,
  GAMEPAD_BUTTON.SELECT,
  GAMEPAD_BUTTON.START,
] as const;
export const RESERVED_VALVE_TARGET_BUTTONS = [
  GAMEPAD_BUTTON.SECONDARY,
  GAMEPAD_BUTTON.BUMPER_LEFT,
  GAMEPAD_BUTTON.BUMPER_RIGHT,
] as const;

export const GUIDE_EXPIRY_MS = 4000;
export const MAX_CHORD_BUTTONS = 4;
export const MIN_BUTTON_ID = 0;
export const MAX_BUTTON_ID = 28;

export interface ChordActionMeta {
  id: ChordActionId;
  label: string;
}

export const CHORD_ACTIONS: ReadonlyArray<ChordActionMeta> = [
  { id: "previous", label: "Previous Track" },
  { id: "next", label: "Next Track" },
  { id: "play_pause", label: "Play / Pause" },
  { id: "volume_up", label: "Volume Up" },
  { id: "volume_down", label: "Volume Down" },
  { id: "toggle_like", label: "Like / Unlike" },
  { id: "cycle_pinned", label: "Cycle Pinned Playlists" },
  { id: "toggle_lyrics", label: "Toggle Lyrics HUD" },
];

export const DEFAULT_CHORD_BINDINGS: Record<ChordActionId, number[]> = {
  previous: [],
  next: [],
  play_pause: [],
  volume_up: [],
  volume_down: [],
  toggle_like: [],
  cycle_pinned: [],
  toggle_lyrics: [],
};

const CONTROLLER_INPUT_TO_GAMEPAD_BUTTON: Record<number, number> = {
  0: GAMEPAD_BUTTON.OK,
  1: GAMEPAD_BUTTON.CANCEL,
  2: GAMEPAD_BUTTON.SECONDARY,
  3: GAMEPAD_BUTTON.OPTIONS,
  4: GAMEPAD_BUTTON.DIR_UP,
  5: GAMEPAD_BUTTON.DIR_RIGHT,
  6: GAMEPAD_BUTTON.DIR_DOWN,
  7: GAMEPAD_BUTTON.DIR_LEFT,
  8: GAMEPAD_BUTTON.START,
  9: GAMEPAD_BUTTON.SELECT,
  20: GAMEPAD_BUTTON.DIR_UP,
  21: GAMEPAD_BUTTON.DIR_RIGHT,
  22: GAMEPAD_BUTTON.DIR_DOWN,
  23: GAMEPAD_BUTTON.DIR_LEFT,
  25: GAMEPAD_BUTTON.LSTICK_CLICK,
  28: GAMEPAD_BUTTON.TRIGGER_LEFT,
  29: GAMEPAD_BUTTON.TRIGGER_RIGHT,
  30: GAMEPAD_BUTTON.BUMPER_LEFT,
  31: GAMEPAD_BUTTON.BUMPER_RIGHT,
  32: GAMEPAD_BUTTON.REAR_LEFT_LOWER,
  33: GAMEPAD_BUTTON.REAR_RIGHT_LOWER,
  34: GAMEPAD_BUTTON.STEAM_GUIDE,
  35: GAMEPAD_BUTTON.SELECT,
  36: GAMEPAD_BUTTON.START,
  37: GAMEPAD_BUTTON.LPAD_CLICK,
  38: GAMEPAD_BUTTON.LPAD_TOUCH,
  39: GAMEPAD_BUTTON.RPAD_CLICK,
  40: GAMEPAD_BUTTON.RPAD_TOUCH,
  41: GAMEPAD_BUTTON.RSTICK_CLICK,
  42: GAMEPAD_BUTTON.RSTICK_TOUCH,
  43: GAMEPAD_BUTTON.LSTICK_TOUCH,
  44: GAMEPAD_BUTTON.REAR_LEFT_UPPER,
  45: GAMEPAD_BUTTON.REAR_RIGHT_UPPER,
};

export function mapControllerInputButton(btn: number): number | null {
  if (!Number.isInteger(btn)) return null;
  return CONTROLLER_INPUT_TO_GAMEPAD_BUTTON[btn] ?? null;
}

export type ChordValidationFailureReason = "over_limit" | "reserved" | "duplicate";

export type ChordValidationResult =
  | { ok: true; normalized: number[] }
  | {
      ok: false;
      reason: ChordValidationFailureReason;
      message: string;
      conflictActionId?: ChordActionId;
    };

export interface ChordMatcherOptions {
  getNow?: () => number;
  onFire?: (actionId: ChordActionId) => void;
}

export interface ChordMatcher {
  onButtonDown: (btn: number, nowOverride?: number) => ChordActionId | null;
  onButtonUp: (btn: number) => void;
  setBindings: (bindings: ChordBindingsMap) => void;
  setSuppressed: (suppressed: boolean) => void;
  isGuideHeld: (nowOverride?: number) => boolean;
  reset: () => void;
  dispose: () => void;
}

const GUIDE_ID_SET = new Set<number>(GUIDE_BUTTON_IDS);
const RESERVED_TARGET_SET = new Set<number>(RESERVED_VALVE_TARGET_BUTTONS);

const BUTTON_LABELS: Record<number, string> = {
  1: "A",
  2: "B",
  3: "X",
  4: "Y",
  5: "L1",
  6: "R1",
  7: "L2",
  8: "R2",
  9: "D-Pad Up",
  10: "D-Pad Down",
  11: "D-Pad Left",
  12: "D-Pad Right",
  13: "View",
  14: "Menu",
  15: "L3",
  16: "R3",
  17: "LStick Touch",
  18: "RStick Touch",
  19: "LPad Touch",
  20: "LPad Click",
  21: "RPad Touch",
  22: "RPad Click",
  23: "L4",
  24: "L5",
  25: "R4",
  26: "R5",
  27: "STEAM / QAM",
  28: "STEAM / QAM",
};

let chordRecordingActive = false;

export function setChordRecordingActive(active: boolean): void {
  chordRecordingActive = Boolean(active);
}

export function isChordRecordingActive(): boolean {
  return chordRecordingActive;
}

function isValidButtonId(btn: number): boolean {
  return Number.isInteger(btn) && btn >= MIN_BUTTON_ID && btn <= MAX_BUTTON_ID;
}

function isGuideButton(btn: number): boolean {
  return GUIDE_ID_SET.has(btn);
}

export function normalizeChord(buttons: readonly number[]): number[] {
  const seen = new Set<number>();
  for (const btn of buttons) {
    if (!isValidButtonId(btn)) continue;
    const canon = btn === GAMEPAD_BUTTON.STEAM_QUICK_MENU ? CANONICAL_GUIDE_ID : btn;
    seen.add(canon);
  }
  return Array.from(seen).sort((a, b) => a - b);
}

export function isValveReservedChord(buttons: readonly number[]): boolean {
  const normalized = normalizeChord(buttons);
  if (normalized.length !== 2) return false;
  const hasGuide = normalized.some((b) => GUIDE_ID_SET.has(b));
  const hasReservedTarget = normalized.some((b) => RESERVED_TARGET_SET.has(b));
  return hasGuide && hasReservedTarget;
}

function chordsEqual(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((val, idx) => val === b[idx]);
}

export function validateChordBinding(
  actionId: ChordActionId,
  rawButtons: readonly number[],
  allBindings: ChordBindingsMap,
): ChordValidationResult {
  const normalized = normalizeChord(rawButtons);
  if (normalized.length > MAX_CHORD_BUTTONS) {
    return { ok: false, reason: "over_limit", message: "Chords support up to 4 buttons." };
  }
  if (normalized.some((b) => GUIDE_ID_SET.has(b))) {
    return {
      ok: false,
      reason: "reserved",
      message:
        "STEAM / QAM button combos are intercepted by SteamOS and don't work in-game. Use other buttons like L4, R4, L5, or R5.",
    };
  }
  if (isValveReservedChord(normalized)) {
    return {
      ok: false,
      reason: "reserved",
      message: "That combination is reserved by Steam. Choose a different one.",
    };
  }
  if (normalized.length > 0) {
    for (const meta of CHORD_ACTIONS) {
      if (meta.id === actionId) continue;
      const existing = allBindings[meta.id];
      if (!Array.isArray(existing) || existing.length === 0) continue;
      if (chordsEqual(normalized, normalizeChord(existing))) {
        return {
          ok: false,
          reason: "duplicate",
          message: `Already used by ${meta.label}. Clear that chord first or choose another.`,
          conflictActionId: meta.id,
        };
      }
    }
  }
  return { ok: true, normalized };
}

export function formatButtonName(btn: number): string {
  return BUTTON_LABELS[btn] ?? `Btn ${btn}`;
}

export function formatChordChips(buttons: readonly number[]): string[] {
  const normalized = normalizeChord(buttons);
  const ordered = normalized.includes(CANONICAL_GUIDE_ID)
    ? [CANONICAL_GUIDE_ID, ...normalized.filter((b) => b !== CANONICAL_GUIDE_ID)]
    : normalized;
  return ordered.map((b) => formatButtonName(b));
}

interface NormalizedBindingEntry {
  actionId: ChordActionId;
  buttons: number[];
}

function buildSortedBindings(source?: ChordBindingsMap): {
  byAction: Map<ChordActionId, number[]>;
  sorted: NormalizedBindingEntry[];
} {
  const resolved = source ?? DEFAULT_CHORD_BINDINGS;
  const byAction = new Map<ChordActionId, number[]>();
  const sorted: NormalizedBindingEntry[] = [];
  for (const meta of CHORD_ACTIONS) {
    const raw = resolved[meta.id];
    const buttons = Array.isArray(raw) ? normalizeChord(raw) : [];
    byAction.set(meta.id, buttons);
    if (buttons.length > 0) {
      sorted.push({ actionId: meta.id, buttons });
    }
  }
  sorted.sort((a, b) => b.buttons.length - a.buttons.length);
  return { byAction, sorted };
}

function bindingContainsButton(binding: readonly number[], btn: number): boolean {
  return binding.includes(btn) || (isGuideButton(btn) && binding.includes(CANONICAL_GUIDE_ID));
}

function isBindingSatisfied(
  binding: readonly number[],
  held: ReadonlySet<number>,
  guideHeld: boolean,
): boolean {
  return binding.every((req) =>
    req === CANONICAL_GUIDE_ID ? guideHeld || held.has(CANONICAL_GUIDE_ID) : held.has(req),
  );
}

interface MatcherState {
  byAction: Map<ChordActionId, number[]>;
  sorted: NormalizedBindingEntry[];
  held: Set<number>;
  disarmed: Set<ChordActionId>;
  guideHeld: boolean;
  guideSince: number | null;
  guideTimer: ReturnType<typeof setTimeout> | null;
  suppressed: boolean;
  disposed: boolean;
}

function clearMatcherGuideTimer(state: MatcherState): void {
  if (state.guideTimer !== null) {
    clearTimeout(state.guideTimer);
    state.guideTimer = null;
  }
}

function forceExpireMatcherGuide(state: MatcherState): void {
  clearMatcherGuideTimer(state);
  state.guideHeld = false;
  state.guideSince = null;
  for (const g of GUIDE_BUTTON_IDS) state.held.delete(g);
  for (const actionId of Array.from(state.disarmed)) {
    const btns = state.byAction.get(actionId) ?? [];
    if (btns.some((b) => isGuideButton(b))) {
      state.disarmed.delete(actionId);
    }
  }
}

function expireGuideIfStale(state: MatcherState, now: number): void {
  if (state.guideSince !== null && now - state.guideSince >= GUIDE_EXPIRY_MS) {
    forceExpireMatcherGuide(state);
  }
}

function resetMatcherState(state: MatcherState): void {
  clearMatcherGuideTimer(state);
  state.held.clear();
  state.disarmed.clear();
  state.guideHeld = false;
  state.guideSince = null;
}

function handleMatcherButtonDown(
  state: MatcherState,
  btn: number,
  now: number,
  onFire?: (actionId: ChordActionId) => void,
): ChordActionId | null {
  if (state.disposed || !isValidButtonId(btn)) return null;
  expireGuideIfStale(state, now);
  if (state.suppressed || state.held.has(btn)) return null;
  state.held.add(btn);
  if (isGuideButton(btn)) {
    state.guideHeld = true;
    state.guideSince = now;
    clearMatcherGuideTimer(state);
    state.guideTimer = setTimeout(() => forceExpireMatcherGuide(state), GUIDE_EXPIRY_MS);
  }
  const candidates = state.sorted.filter(
    (entry) =>
      bindingContainsButton(entry.buttons, btn) &&
      isBindingSatisfied(entry.buttons, state.held, state.guideHeld),
  );
  const winner = candidates[0];
  if (!winner || state.disarmed.has(winner.actionId)) return null;
  for (const c of candidates) {
    if (c.buttons.every((b) => bindingContainsButton(winner.buttons, b))) {
      state.disarmed.add(c.actionId);
    }
  }
  onFire?.(winner.actionId);
  return winner.actionId;
}

function handleMatcherButtonUp(state: MatcherState, btn: number): void {
  if (state.disposed || !isValidButtonId(btn)) return;
  state.held.delete(btn);
  if (!GUIDE_BUTTON_IDS.some((g) => state.held.has(g))) {
    clearMatcherGuideTimer(state);
    state.guideHeld = false;
    state.guideSince = null;
  }
  for (const actionId of Array.from(state.disarmed)) {
    const btns = state.byAction.get(actionId) ?? [];
    if (
      btns.includes(btn) ||
      (isGuideButton(btn) && !state.guideHeld && btns.includes(CANONICAL_GUIDE_ID))
    ) {
      state.disarmed.delete(actionId);
    }
  }
}

export function createChordMatcher(
  initialBindings?: ChordBindingsMap,
  opts?: ChordMatcherOptions,
): ChordMatcher {
  const getNow = opts?.getNow ?? (() => Date.now());
  const initial = buildSortedBindings(initialBindings);
  const state: MatcherState = {
    byAction: initial.byAction,
    sorted: initial.sorted,
    held: new Set<number>(),
    disarmed: new Set<ChordActionId>(),
    guideHeld: false,
    guideSince: null,
    guideTimer: null,
    suppressed: false,
    disposed: false,
  };

  return {
    onButtonDown: (btn: number, nowOverride?: number) =>
      handleMatcherButtonDown(state, btn, nowOverride ?? getNow(), opts?.onFire),
    onButtonUp: (btn: number) => handleMatcherButtonUp(state, btn),
    setBindings: (bindings: ChordBindingsMap) => {
      const next = buildSortedBindings(bindings);
      state.byAction = next.byAction;
      state.sorted = next.sorted;
      state.disarmed.clear();
    },
    setSuppressed: (nextSuppressed: boolean) => {
      const next = Boolean(nextSuppressed);
      if (next === state.suppressed) return;
      state.suppressed = next;
      resetMatcherState(state);
    },
    isGuideHeld: (nowOverride?: number) => {
      if (state.disposed) return false;
      expireGuideIfStale(state, nowOverride ?? getNow());
      return state.guideHeld;
    },
    reset: () => resetMatcherState(state),
    dispose: () => {
      state.disposed = true;
      resetMatcherState(state);
    },
  };
}
