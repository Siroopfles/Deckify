import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  GAMEPAD_BUTTON,
  CANONICAL_GUIDE_ID,
  GUIDE_BUTTON_IDS,
  RESERVED_VALVE_TARGET_BUTTONS,
  GUIDE_EXPIRY_MS,
  MAX_CHORD_BUTTONS,
  CHORD_ACTIONS,
  DEFAULT_CHORD_BINDINGS,
  normalizeChord,
  isValveReservedChord,
  validateChordBinding,
  formatButtonName,
  formatChordChips,
  mapControllerInputButton,
  createChordMatcher,
  setChordRecordingActive,
  isChordRecordingActive,
} from "./chords";
import type { ChordBindingsMap } from "./types";

describe("chords schema and defaults", () => {
  it("exposes verified GamepadButton constants, 8 ordered CHORD_ACTIONS, and D-08 DEFAULT_CHORD_BINDINGS", () => {
    expect(GAMEPAD_BUTTON.INVALID).toBe(0);
    expect(GAMEPAD_BUTTON.OK).toBe(1);
    expect(GAMEPAD_BUTTON.CANCEL).toBe(2);
    expect(GAMEPAD_BUTTON.SECONDARY).toBe(3);
    expect(GAMEPAD_BUTTON.OPTIONS).toBe(4);
    expect(GAMEPAD_BUTTON.BUMPER_LEFT).toBe(5);
    expect(GAMEPAD_BUTTON.BUMPER_RIGHT).toBe(6);
    expect(GAMEPAD_BUTTON.DIR_UP).toBe(9);
    expect(GAMEPAD_BUTTON.DIR_DOWN).toBe(10);
    expect(GAMEPAD_BUTTON.DIR_LEFT).toBe(11);
    expect(GAMEPAD_BUTTON.DIR_RIGHT).toBe(12);
    expect(GAMEPAD_BUTTON.SELECT).toBe(13);
    expect(GAMEPAD_BUTTON.START).toBe(14);
    expect(GAMEPAD_BUTTON.REAR_LEFT_UPPER).toBe(23);
    expect(GAMEPAD_BUTTON.REAR_RIGHT_LOWER).toBe(26);
    expect(GAMEPAD_BUTTON.STEAM_GUIDE).toBe(27);
    expect(GAMEPAD_BUTTON.STEAM_QUICK_MENU).toBe(28);

    expect(CANONICAL_GUIDE_ID).toBe(27);
    expect([...GUIDE_BUTTON_IDS]).toEqual([27, 28, 13, 14]);
    expect([...RESERVED_VALVE_TARGET_BUTTONS]).toEqual([3, 5, 6]);
    expect(GUIDE_EXPIRY_MS).toBe(4000);
    expect(MAX_CHORD_BUTTONS).toBe(4);

    expect(CHORD_ACTIONS.map((a) => a.id)).toEqual([
      "previous",
      "next",
      "play_pause",
      "volume_up",
      "volume_down",
      "toggle_like",
      "cycle_pinned",
      "toggle_lyrics",
    ]);

    expect(DEFAULT_CHORD_BINDINGS).toEqual({
      previous: [],
      next: [],
      play_pause: [],
      volume_up: [],
      volume_down: [],
      toggle_like: [],
      cycle_pinned: [],
      toggle_lyrics: [],
    });
  });
});

describe("mapControllerInputButton", () => {
  it("maps SteamClient.Input.ControllerInputGamepadButton indices to GAMEPAD_BUTTON and returns null for unmapped", () => {
    const expected: Array<[number, number]> = [
      [0, GAMEPAD_BUTTON.OK],
      [1, GAMEPAD_BUTTON.CANCEL],
      [2, GAMEPAD_BUTTON.SECONDARY],
      [3, GAMEPAD_BUTTON.OPTIONS],
      [4, GAMEPAD_BUTTON.DIR_UP],
      [5, GAMEPAD_BUTTON.DIR_RIGHT],
      [6, GAMEPAD_BUTTON.DIR_DOWN],
      [7, GAMEPAD_BUTTON.DIR_LEFT],
      [8, GAMEPAD_BUTTON.START],
      [9, GAMEPAD_BUTTON.SELECT],
      [20, GAMEPAD_BUTTON.DIR_UP],
      [21, GAMEPAD_BUTTON.DIR_RIGHT],
      [22, GAMEPAD_BUTTON.DIR_DOWN],
      [23, GAMEPAD_BUTTON.DIR_LEFT],
      [25, GAMEPAD_BUTTON.LSTICK_CLICK],
      [28, GAMEPAD_BUTTON.TRIGGER_LEFT],
      [29, GAMEPAD_BUTTON.TRIGGER_RIGHT],
      [30, GAMEPAD_BUTTON.BUMPER_LEFT],
      [31, GAMEPAD_BUTTON.BUMPER_RIGHT],
      [32, GAMEPAD_BUTTON.REAR_LEFT_LOWER],
      [33, GAMEPAD_BUTTON.REAR_RIGHT_LOWER],
      [34, GAMEPAD_BUTTON.STEAM_GUIDE],
      [35, GAMEPAD_BUTTON.SELECT],
      [36, GAMEPAD_BUTTON.START],
      [37, GAMEPAD_BUTTON.LPAD_CLICK],
      [38, GAMEPAD_BUTTON.LPAD_TOUCH],
      [39, GAMEPAD_BUTTON.RPAD_CLICK],
      [40, GAMEPAD_BUTTON.RPAD_TOUCH],
      [41, GAMEPAD_BUTTON.RSTICK_CLICK],
      [42, GAMEPAD_BUTTON.RSTICK_TOUCH],
      [43, GAMEPAD_BUTTON.LSTICK_TOUCH],
      [44, GAMEPAD_BUTTON.REAR_LEFT_UPPER],
      [45, GAMEPAD_BUTTON.REAR_RIGHT_UPPER],
    ];
    for (const [input, mapped] of expected) {
      expect(mapControllerInputButton(input)).toBe(mapped);
    }
    for (const unmapped of [-1, 10, 46, 47, 48, 49, 50, 99, 1.5, NaN]) {
      expect(mapControllerInputButton(unmapped)).toBeNull();
    }
  });
});

describe("normalizeChord and button formatting", () => {
  it("normalizes button IDs (28->27, valid 0..28, dedupe, sort) and formats human-readable button names & chips", () => {
    expect(normalizeChord([28, 11, 27, 11, -1, 29, 1.5, NaN])).toEqual([11, 27]);
    expect(normalizeChord([25, 4, 23, 1])).toEqual([1, 4, 23, 25]);

    expect(formatButtonName(27)).toBe("STEAM / QAM");
    expect(formatButtonName(28)).toBe("STEAM / QAM");
    expect(formatButtonName(1)).toBe("A");
    expect(formatButtonName(2)).toBe("B");
    expect(formatButtonName(3)).toBe("X");
    expect(formatButtonName(4)).toBe("Y");
    expect(formatButtonName(5)).toBe("L1");
    expect(formatButtonName(6)).toBe("R1");
    expect(formatButtonName(9)).toBe("D-Pad Up");
    expect(formatButtonName(11)).toBe("D-Pad Left");
    expect(formatButtonName(23)).toBe("L4");
    expect(formatButtonName(26)).toBe("R5");
    expect(formatButtonName(0)).toBe("Btn 0");
    expect(formatButtonName(99)).toBe("Btn 99");

    expect(formatChordChips([11, 28])).toEqual(["STEAM / QAM", "D-Pad Left"]);
    expect(formatChordChips([23, 3])).toEqual(["X", "L4"]);
    expect(formatChordChips([])).toEqual([]);
  });
});

describe("validateChordBinding", () => {
  it("validates chords: rejects STEAM/QAM guide combos, duplicates, and >4 buttons while allowing 1..4 custom buttons and same-action re-save", () => {
    const steamWarning =
      "STEAM / QAM button combos are intercepted by SteamOS and don't work in-game. Use other buttons like L4, R4, L5, or R5.";
    const guideCombos = [
      [27],
      [28],
      [13],
      [14],
      [27, 3],
      [27, 5],
      [27, 6],
      [28, 3],
      [13, 6],
      [14, 5],
      [27, 11],
      [27, 3, 4],
    ];
    for (const combo of guideCombos) {
      const res = validateChordBinding("toggle_like", combo, DEFAULT_CHORD_BINDINGS);
      expect(res).toEqual({
        ok: false,
        reason: "reserved",
        message: steamWarning,
      });
    }

    expect(isValveReservedChord([27, 3])).toBe(true);
    expect(isValveReservedChord([3])).toBe(false);
    expect(isValveReservedChord([23, 3])).toBe(false);
    expect(isValveReservedChord([27, 3, 4])).toBe(false);

    const customBindings: ChordBindingsMap = {
      ...DEFAULT_CHORD_BINDINGS,
      next: [12, 23],
    };

    const dup = validateChordBinding("toggle_like", [23, 12], customBindings);
    expect(dup).toEqual({
      ok: false,
      reason: "duplicate",
      message: "Already used by Next Track. Clear that chord first or choose another.",
      conflictActionId: "next",
    });

    const over = validateChordBinding("toggle_like", [1, 4, 23, 25, 26], customBindings);
    expect(over).toEqual({
      ok: false,
      reason: "over_limit",
      message: "Chords support up to 4 buttons.",
    });

    expect(validateChordBinding("toggle_like", [4], customBindings)).toEqual({
      ok: true,
      normalized: [4],
    });
    expect(validateChordBinding("toggle_like", [25, 4, 23, 1], customBindings)).toEqual({
      ok: true,
      normalized: [1, 4, 23, 25],
    });
    expect(validateChordBinding("toggle_like", [23, 3], customBindings)).toEqual({
      ok: true,
      normalized: [3, 23],
    });
    expect(validateChordBinding("toggle_like", [25], customBindings)).toEqual({
      ok: true,
      normalized: [25],
    });
    expect(validateChordBinding("next", [12, 23], customBindings)).toEqual({
      ok: true,
      normalized: [12, 23],
    });
  });
});

describe("createChordMatcher core matching", () => {
  it("fires multi-button chords once on last-button-down regardless of press order, ignores repeats, and re-arms on release", () => {
    const onFire = vi.fn();
    const bindings: ChordBindingsMap = {
      ...DEFAULT_CHORD_BINDINGS,
      play_pause: [1, 27],
      toggle_like: [23, 3],
    };
    const matcher = createChordMatcher(bindings, { onFire });

    expect(matcher.onButtonDown(23)).toBeNull();
    expect(matcher.onButtonDown(23)).toBeNull();
    expect(matcher.onButtonDown(3)).toBe("toggle_like");
    expect(onFire).toHaveBeenCalledTimes(1);
    expect(onFire).toHaveBeenLastCalledWith("toggle_like");

    expect(matcher.onButtonDown(3)).toBeNull();
    expect(matcher.onButtonDown(23)).toBeNull();
    expect(onFire).toHaveBeenCalledTimes(1);

    matcher.onButtonUp(3);
    expect(matcher.onButtonDown(3)).toBe("toggle_like");
    expect(onFire).toHaveBeenCalledTimes(2);

    matcher.onButtonUp(3);
    matcher.onButtonUp(23);
    expect(matcher.onButtonDown(3)).toBeNull();
    expect(matcher.onButtonDown(23)).toBe("toggle_like");
    expect(onFire).toHaveBeenCalledTimes(3);

    matcher.onButtonUp(3);
    matcher.onButtonUp(23);
    expect(matcher.onButtonDown(13)).toBeNull();
    expect(matcher.onButtonDown(1)).toBe("play_pause");
    expect(onFire).toHaveBeenCalledTimes(4);
    expect(onFire).toHaveBeenLastCalledWith("play_pause");
  });
});

describe("createChordMatcher longest-subset priority", () => {
  it("prefers longest matching super-chord over shorter subset bindings without cascading", () => {
    const onFire = vi.fn();
    const bindings: ChordBindingsMap = {
      ...DEFAULT_CHORD_BINDINGS,
      toggle_like: [23, 3],
      cycle_pinned: [3],
    };
    const matcher = createChordMatcher(bindings, { onFire });

    expect(matcher.onButtonDown(23)).toBeNull();
    expect(matcher.onButtonDown(3)).toBe("toggle_like");
    expect(onFire).toHaveBeenCalledTimes(1);
    expect(onFire).toHaveBeenCalledWith("toggle_like");

    matcher.onButtonUp(23);
    expect(onFire).toHaveBeenCalledTimes(1);

    matcher.onButtonUp(3);
    expect(matcher.onButtonDown(3)).toBe("cycle_pinned");
    expect(onFire).toHaveBeenCalledTimes(2);
    expect(onFire).toHaveBeenLastCalledWith("cycle_pinned");
  });
});

describe("createChordMatcher guideHeld expiry", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("expires guideHeld automatically at 4000ms via timer and timestamp guard across all guide IDs (27, 28, 13, 14)", () => {
    vi.useFakeTimers();

    const guideBindings: ChordBindingsMap = { ...DEFAULT_CHORD_BINDINGS, next: [12, 27] };
    for (const guideId of [27, 28, 13, 14]) {
      const onFire = vi.fn();
      const matcher = createChordMatcher(guideBindings, { onFire });

      expect(matcher.onButtonDown(guideId)).toBeNull();
      expect(matcher.isGuideHeld()).toBe(true);

      vi.advanceTimersByTime(3999);
      expect(matcher.isGuideHeld()).toBe(true);
      expect(matcher.onButtonDown(guideId)).toBeNull();

      vi.advanceTimersByTime(1);
      expect(matcher.isGuideHeld()).toBe(false);
      expect(matcher.onButtonDown(GAMEPAD_BUTTON.DIR_RIGHT)).toBeNull();
      expect(onFire).not.toHaveBeenCalled();

      matcher.dispose();
    }

    let fakeNow = 1000;
    const onFireLazy = vi.fn();
    const lazyMatcher = createChordMatcher(guideBindings, {
      getNow: () => fakeNow,
      onFire: onFireLazy,
    });
    lazyMatcher.onButtonDown(27, 1000);
    expect(lazyMatcher.isGuideHeld(4999)).toBe(true);
    fakeNow = 5000;
    expect(lazyMatcher.onButtonDown(12, 5000)).toBeNull();
    expect(lazyMatcher.isGuideHeld(5000)).toBe(false);
    expect(onFireLazy).not.toHaveBeenCalled();
    lazyMatcher.dispose();
  });
});

describe("createChordMatcher suppression and lifecycle", () => {
  beforeEach(() => {
    setChordRecordingActive(false);
  });

  afterEach(() => {
    setChordRecordingActive(false);
  });

  it("suppresses matching and clears held/guideHeld state on setSuppressed(true), reset(), and dispose()", () => {
    const onFire = vi.fn();
    const matcher = createChordMatcher(
      { ...DEFAULT_CHORD_BINDINGS, toggle_lyrics: [25] },
      { onFire },
    );

    matcher.onButtonDown(27);
    expect(matcher.isGuideHeld()).toBe(true);

    matcher.setSuppressed(true);
    expect(matcher.isGuideHeld()).toBe(false);
    expect(matcher.onButtonDown(12)).toBeNull();
    expect(matcher.onButtonDown(25)).toBeNull();
    expect(onFire).not.toHaveBeenCalled();

    matcher.setSuppressed(false);
    expect(matcher.onButtonDown(25)).toBe("toggle_lyrics");
    expect(onFire).toHaveBeenCalledTimes(1);

    matcher.onButtonDown(27);
    expect(matcher.isGuideHeld()).toBe(true);
    matcher.reset();
    expect(matcher.isGuideHeld()).toBe(false);
    expect(matcher.onButtonDown(12)).toBeNull();
    matcher.onButtonUp(12);

    matcher.setBindings({ ...DEFAULT_CHORD_BINDINGS, toggle_lyrics: [24] });
    expect(matcher.onButtonDown(24)).toBe("toggle_lyrics");
    expect(onFire).toHaveBeenCalledTimes(2);

    setChordRecordingActive(true);
    expect(isChordRecordingActive()).toBe(true);
    setChordRecordingActive(false);
    expect(isChordRecordingActive()).toBe(false);

    matcher.onButtonDown(27);
    matcher.dispose();
    expect(matcher.isGuideHeld()).toBe(false);
    expect(matcher.onButtonDown(24)).toBeNull();
    expect(onFire).toHaveBeenCalledTimes(2);
  });
});
