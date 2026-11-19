import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPreviewEqBands = vi.fn();
const mockClearEqPreview = vi.fn();

vi.mock("@decky/api", () => ({
  callable: (name: string) => {
    if (name === "preview_eq_bands") return (...args: any[]) => mockPreviewEqBands(...args);
    if (name === "clear_eq_preview") return (...args: any[]) => mockClearEqPreview(...args);
    return vi.fn().mockResolvedValue({ ok: true });
  },
}));

vi.mock("@decky/ui", () => ({
  ModalRoot: ({ children, ...props }: any) => ({ type: "ModalRoot", props: { children, ...props } }),
  Focusable: ({ children, ...props }: any) => ({ type: "Focusable", props: { children, ...props } }),
  DialogButton: ({ children, ...props }: any) => ({ type: "DialogButton", props: { children, ...props } }),
  NavEntryPositionPreferences: {
    FIRST: 0,
    LAST: 1,
    MAINTAIN_X: 2,
    MAINTAIN_Y: 3,
    PREFERRED_CHILD: 4,
  },
}));

vi.mock("react-icons/fa", () => ({
  FaSlidersH: () => ({ type: "FaSlidersH" }),
  FaTimes: () => ({ type: "FaTimes" }),
  FaUndo: () => ({ type: "FaUndo" }),
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

let stateValues: any[] = [];
let stateIdx = 0;
let refValues: any[] = [];
let refIdx = 0;
let mountedEffects: boolean[] = [];
let effectIdx = 0;
let effectCleanups: Array<() => void> = [];

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
  useRef: (init: any) => {
    const idx = refIdx++;
    if (!(idx in refValues)) {
      refValues[idx] = { current: init };
    }
    return refValues[idx];
  },
  useEffect: (fn: any) => {
    const idx = effectIdx++;
    if (!mountedEffects[idx]) {
      mountedEffects[idx] = true;
      const cleanup = fn();
      if (typeof cleanup === "function") {
        effectCleanups.push(cleanup);
      }
    }
  },
}));

import { GameEqModal, GameEqModalProps } from "./GameEqModal";
import { InteractiveRow } from "../common/InteractiveRow";
import {
  EQ_BAND_LABELS,
  EQ_PRESET_CURVES,
  EqBandFaders,
  normalizeEqBands,
} from "../common/EqBandFaders";

function renderModal(props: GameEqModalProps) {
  stateIdx = 0;
  refIdx = 0;
  effectIdx = 0;
  return GameEqModal(props);
}

function unmountModal() {
  for (const cleanup of effectCleanups) {
    cleanup();
  }
}

function typeName(n: any): string {
  return typeof n?.type === "string" ? n.type : n?.type?.name || "";
}

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

function findText(tree: any): string {
  if (!tree) return "";
  if (typeof tree === "string" || typeof tree === "number") return String(tree);
  if (Array.isArray(tree)) return tree.map(findText).join(" ");
  if (tree.props && tree.props.children) return findText(tree.props.children);
  return "";
}

describe("GameEqModal Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stateValues = [];
    stateIdx = 0;
    refValues = [];
    refIdx = 0;
    mountedEffects = [];
    effectIdx = 0;
    effectCleanups = [];
    mockPreviewEqBands.mockResolvedValue({ ok: true });
    mockClearEqPreview.mockResolvedValue({ ok: true, restored: true });
  });

  it("renders null when isOpen is false without calling clear_eq_preview", () => {
    const tree = renderModal({
      isOpen: false,
      gameName: "Hades",
      onSave: vi.fn(),
    });
    expect(tree).toBeNull();
    expect(mockClearEqPreview).not.toHaveBeenCalled();
  });

  it("seeds initial bands from seedBands when initialBands is null and prefers initialBands when provided (D-02)", () => {
    const seed = [3, 2, 1, 0, -1, -2, 0, 1, 2, 3];
    const seededTree = renderModal({
      gameName: "Hades",
      initialBands: null,
      seedBands: seed,
      onSave: vi.fn(),
    });
    const seededSliders = findNodes(seededTree, (n) => n.props?.role === "slider");
    expect(seededSliders.map((s) => s.props["aria-valuenow"])).toEqual(seed);

    // Fresh mount with explicit initialBands overrides seedBands and clamps/rounds 0.5 dB steps
    stateValues = [];
    refValues = [];
    mountedEffects = [];
    effectCleanups = [];
    const custom = [15, -15, 3.7, 0, 0, 0, 0, 0, 0, 0];
    const customTree = renderModal({
      gameName: "Cyberpunk 2077",
      initialBands: custom,
      seedBands: seed,
      onSave: vi.fn(),
    });
    const customSliders = findNodes(customTree, (n) => n.props?.role === "slider");
    expect(customSliders.map((s) => s.props["aria-valuenow"])).toEqual([
      12, -12, 3.5, 0, 0, 0, 0, 0, 0, 0,
    ]);
  });

  it("displays neutral empty caption when all bands are 0 and Preamp readout when boosted", () => {
    const flatTree = renderModal({
      gameName: "Celeste",
      onSave: vi.fn(),
    });
    const flatText = findText(flatTree);
    expect(flatText).toContain("Celeste — Custom Game EQ");
    expect(flatText).toContain("Bypass (0.0 dB)");
    expect(flatText).toContain(
      "Flat Curve (0.0 dB) — Adjust any band slider or choose Copy from Preset to sculpt this game's EQ."
    );

    // Check 1280x800 container overflow & native ModalRoot surface constraints
    const outerFocusable = findNodes(
      flatTree,
      (n) => typeName(n) === "Focusable" && n.props?.["flow-children"] === "column"
    )[0];
    expect(outerFocusable.props.style).toMatchObject({
      width: "100%",
      maxWidth: "min(680px, 88vw)",
      maxHeight: "82vh",
      overflowY: "auto",
      overflowX: "hidden",
      boxSizing: "border-box",
      padding: 12,
    });
    expect(outerFocusable.props.style.background).toBeUndefined();
    expect(outerFocusable.props.style.minWidth).toBeUndefined();

    // Fresh mount with boosted bass curve
    stateValues = [];
    refValues = [];
    mountedEffects = [];
    effectCleanups = [];
    const bassTree = renderModal({
      gameName: "DOOM Eternal",
      initialBands: EQ_PRESET_CURVES.bass,
      onSave: vi.fn(),
    });
    const bassText = findText(bassTree);
    expect(bassText).toContain("Preamp: -6.0 dB");
    expect(bassText).toContain("Live PipeWire audio preview active");
  });

  it("renders all 10 ISO role='slider' controls and stepping +0.5 dB triggers preview_eq_bands", async () => {
    const tree = renderModal({
      gameName: "Hades",
      onSave: vi.fn(),
    });

    const sliders = findNodes(tree, (n) => n.props?.role === "slider");
    expect(sliders).toHaveLength(10);
    expect(sliders.map((s) => s.props["aria-label"])).toEqual(EQ_BAND_LABELS);
    for (const s of sliders) {
      expect(s.props["aria-valuemin"]).toBe(-12);
      expect(s.props["aria-valuemax"]).toBe(12);
    }

    const inc31 = findNodes(
      tree,
      (n) => n.type === InteractiveRow && n.props?.["aria-label"] === "Increase 31 Hz"
    )[0];
    expect(inc31).toBeDefined();
    await inc31.props.onClick();

    expect(mockPreviewEqBands).toHaveBeenCalledWith([0.5, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const updatedTree = renderModal({
      gameName: "Hades",
      onSave: vi.fn(),
    });
    expect(findText(updatedTree)).toContain("Preamp: -0.5 dB");

    // Pointer drag on slider computes dB from rect and snaps to 0.5 dB steps
    const slider3 = findNodes(updatedTree, (n) => n.props?.role === "slider")[2];
    slider3.props.onPointerDown({
      pointerId: 1,
      clientY: 25,
      currentTarget: {
        setPointerCapture: vi.fn(),
        getBoundingClientRect: () => ({ top: 0, bottom: 100, height: 100 }),
      },
    });
    expect(mockPreviewEqBands).toHaveBeenLastCalledWith([0.5, 0, 6, 0, 0, 0, 0, 0, 0, 0]);

    // Non-finite gain input from handleBandChange normalizes to 0 via normalizeEqBands
    slider3.props.onPointerDown({
      pointerId: 1,
      clientY: Number.NaN,
      currentTarget: {
        setPointerCapture: vi.fn(),
        getBoundingClientRect: () => ({ top: 0, bottom: 100, height: 100 }),
      },
    });
    expect(mockPreviewEqBands).toHaveBeenLastCalledWith([0.5, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(
      normalizeEqBands([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])
    ).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it("supports Copy from Preset pills (Bass Boost, Global) and Reset to Flat with live preview", async () => {
    const seed = [1, 1, 0, 0, 0, 0, 0, 0, 0, 0];
    const tree = renderModal({
      gameName: "Elden Ring",
      seedBands: seed,
      onSave: vi.fn(),
    });

    const rows = findNodes(tree, (n) => n.type === InteractiveRow);
    const bassPill = rows.find((r) => findText(r).includes("Bass Boost"));
    const globalPill = rows.find((r) => findText(r).includes("Global"));
    const resetBtn = findNodes(
      tree,
      (n) => typeName(n) === "DialogButton" && findText(n).includes("Reset to Flat")
    )[0];

    expect(bassPill).toBeDefined();
    expect(globalPill).toBeDefined();
    expect(resetBtn).toBeDefined();

    await bassPill.props.onClick();
    expect(mockPreviewEqBands).toHaveBeenLastCalledWith(EQ_PRESET_CURVES.bass);

    await globalPill.props.onClick();
    expect(mockPreviewEqBands).toHaveBeenLastCalledWith(seed);

    await resetBtn.props.onClick();
    expect(mockPreviewEqBands).toHaveBeenLastCalledWith(EQ_PRESET_CURVES.flat);
  });

  it("handles failed or rejected preview_eq_bands gracefully without losing local slider edits", async () => {
    const showToast = vi.fn();
    mockPreviewEqBands.mockResolvedValueOnce({ ok: false, error: "PipeWire down" });

    const tree = renderModal({
      gameName: "Hades",
      showToast,
      onSave: vi.fn(),
    });
    const inc31 = findNodes(
      tree,
      (n) => n.type === InteractiveRow && n.props?.["aria-label"] === "Increase 31 Hz"
    )[0];

    await expect(inc31.props.onClick()).resolves.toBeUndefined();
    expect(showToast).toHaveBeenCalledWith(
      "Equalizer preview unavailable — audio routed directly to hardware output. Check PipeWire status in Settings."
    );

    let reRendered = renderModal({
      gameName: "Hades",
      showToast,
      onSave: vi.fn(),
    });
    expect(findText(reRendered)).toContain(
      "Equalizer preview unavailable — audio routed directly to hardware output. Check PipeWire status in Settings."
    );
    const slidersAfterFail = findNodes(reRendered, (n) => n.props?.role === "slider");
    expect(slidersAfterFail[0].props["aria-valuenow"]).toBe(0.5);

    // Rejected promise also recovers cleanly without losing edits
    mockPreviewEqBands.mockRejectedValueOnce(new Error("RPC timeout"));
    const inc62 = findNodes(
      reRendered,
      (n) => n.type === InteractiveRow && n.props?.["aria-label"] === "Increase 62 Hz"
    )[0];
    await expect(inc62.props.onClick()).resolves.toBeUndefined();

    reRendered = renderModal({
      gameName: "Hades",
      showToast,
      onSave: vi.fn(),
    });
    const slidersAfterReject = findNodes(reRendered, (n) => n.props?.role === "slider");
    expect(slidersAfterReject[0].props["aria-valuenow"]).toBe(0.5);
    expect(slidersAfterReject[1].props["aria-valuenow"]).toBe(0.5);
  });

  it("calls clear_eq_preview on Save Game EQ, Discard Changes, onCancel, and unmount when isRunningGame is false (D-02)", async () => {
    const onSave = vi.fn();
    const closeModal = vi.fn();
    const onClose = vi.fn();

    const tree = renderModal({
      gameName: "Portal 2",
      isRunningGame: false,
      onSave,
      closeModal,
      onClose,
    });

    const bassPill = findNodes(
      tree,
      (n) => n.type === InteractiveRow && findText(n).includes("Bass Boost")
    )[0];
    await bassPill.props.onClick();

    const saveBtn = findNodes(
      tree,
      (n) => typeName(n) === "DialogButton" && findText(n).includes("Save Game EQ")
    )[0];
    saveBtn.props.onClick();

    expect(onSave).toHaveBeenCalledWith(EQ_PRESET_CURVES.bass);
    expect(mockClearEqPreview).toHaveBeenCalledTimes(1);
    expect(closeModal).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);

    // Unmount after Save should not duplicate clear_eq_preview
    unmountModal();
    expect(mockClearEqPreview).toHaveBeenCalledTimes(1);

    // Fresh mount: Discard Changes calls clear_eq_preview without onSave
    vi.clearAllMocks();
    stateValues = [];
    refValues = [];
    mountedEffects = [];
    effectCleanups = [];
    const onSave2 = vi.fn();
    const closeModal2 = vi.fn();
    const tree2 = renderModal({
      gameName: "Portal 2",
      isRunningGame: false,
      onSave: onSave2,
      closeModal: closeModal2,
    });
    const discardBtn = findNodes(
      tree2,
      (n) => typeName(n) === "DialogButton" && findText(n).includes("Discard Changes")
    )[0];
    discardBtn.props.onClick();
    expect(onSave2).not.toHaveBeenCalled();
    expect(mockClearEqPreview).toHaveBeenCalledTimes(1);
    expect(closeModal2).toHaveBeenCalledTimes(1);

    // Fresh mount: ModalRoot onCancel + unmount without clicking Save/Discard calls clear_eq_preview
    vi.clearAllMocks();
    stateValues = [];
    refValues = [];
    mountedEffects = [];
    effectCleanups = [];
    const onSave3 = vi.fn();
    const tree3 = renderModal({
      gameName: "Portal 2",
      isRunningGame: false,
      onSave: onSave3,
    });
    const modalRoot = findNodes(tree3, (n) => typeName(n) === "ModalRoot")[0];
    modalRoot.props.onCancel();
    expect(onSave3).not.toHaveBeenCalled();
    expect(mockClearEqPreview).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();
    stateValues = [];
    refValues = [];
    mountedEffects = [];
    effectCleanups = [];
    renderModal({
      gameName: "Portal 2",
      isRunningGame: false,
      onSave: vi.fn(),
    });
    unmountModal();
    expect(mockClearEqPreview).toHaveBeenCalledTimes(1);
  });

  it("skips clear_eq_preview on Save Game EQ and unmount when isRunningGame is true, while calling clear_eq_preview on Discard/onCancel/unmount-without-save", async () => {
    const onSave = vi.fn();
    const closeModal = vi.fn();
    const tree = renderModal({
      gameName: "Cyberpunk 2077",
      isRunningGame: true,
      onSave,
      closeModal,
    });

    const inc31 = findNodes(
      tree,
      (n) => n.type === InteractiveRow && n.props?.["aria-label"] === "Increase 31 Hz"
    )[0];
    await inc31.props.onClick();

    const saveBtn = findNodes(
      tree,
      (n) => typeName(n) === "DialogButton" && findText(n).includes("Save Game EQ")
    )[0];
    saveBtn.props.onClick();

    expect(onSave).toHaveBeenCalledWith([0.5, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(mockClearEqPreview).not.toHaveBeenCalled();
    expect(closeModal).toHaveBeenCalledTimes(1);

    // Unmounting after Save while game is running must STILL skip clear_eq_preview
    unmountModal();
    expect(mockClearEqPreview).not.toHaveBeenCalled();

    // Fresh mount while game is running: Discard Changes MUST restore saved game EQ via clear_eq_preview
    vi.clearAllMocks();
    stateValues = [];
    refValues = [];
    mountedEffects = [];
    effectCleanups = [];
    const onSaveDiscard = vi.fn();
    const treeDiscard = renderModal({
      gameName: "Cyberpunk 2077",
      isRunningGame: true,
      onSave: onSaveDiscard,
    });
    const discardBtn = findNodes(
      treeDiscard,
      (n) => typeName(n) === "DialogButton" && findText(n).includes("Discard Changes")
    )[0];
    discardBtn.props.onClick();
    expect(onSaveDiscard).not.toHaveBeenCalled();
    expect(mockClearEqPreview).toHaveBeenCalledTimes(1);

    // Fresh mount while game is running: unmount without saving MUST restore via clear_eq_preview
    vi.clearAllMocks();
    stateValues = [];
    refValues = [];
    mountedEffects = [];
    effectCleanups = [];
    renderModal({
      gameName: "Cyberpunk 2077",
      isRunningGame: true,
      onSave: vi.fn(),
    });
    unmountModal();
    expect(mockClearEqPreview).toHaveBeenCalledTimes(1);
  });

  it("uses flow-children='horizontal' with MAINTAIN_X alignment, two non-wrapping preset rows, auto-width Close/footer buttons, and initial body focus", () => {
    const rafCallbacks: Array<() => void> = [];
    const mockRaf = vi.fn((cb: () => void) => {
      rafCallbacks.push(cb);
      return 42;
    });
    const mockCancelRaf = vi.fn();
    vi.stubGlobal("requestAnimationFrame", mockRaf);
    vi.stubGlobal("cancelAnimationFrame", mockCancelRaf);

    try {
      const tree = renderModal({
        gameName: "Hades",
        onSave: vi.fn(),
      });
      const rowFocusables = findNodes(tree, (n) => n.props?.["flow-children"] === "row");
      expect(rowFocusables).toHaveLength(0);

      const horizontalFocusables = findNodes(
        tree,
        (n) => typeName(n) === "Focusable" && n.props?.["flow-children"] === "horizontal"
      );
      // 1) header, 2) preset row 1, 3) preset row 2, 4) 10-band EQ fader strip, 5) footer actions strip
      expect(horizontalFocusables).toHaveLength(5);

      const [headerRow, presetRow1, presetRow2, fadersStrip, footerRow] = horizontalFocusables;

      // Header Close button prevents SteamOS width: 100% overflow push
      const closeBtn = findNodes(
        headerRow,
        (n) => typeName(n) === "DialogButton" && n.props["aria-label"] === "Close"
      )[0];
      expect(closeBtn).toBeDefined();
      expect(closeBtn.props.style.width).toBe("auto");
      expect(closeBtn.props.style.flexShrink).toBeUndefined();

      // Preset rows: two non-wrapping 4-item rows with MAINTAIN_X
      expect(presetRow1.props.style.flexWrap).toBeUndefined();
      expect(presetRow1.props.preferredFocus).toBe(true);
      expect(presetRow1.props.navEntryPreferPosition).toBe(2);
      expect(presetRow1.props.children).toHaveLength(4);

      expect(presetRow2.props.style.flexWrap).toBeUndefined();
      expect(presetRow2.props.preferredFocus).toBeUndefined();
      expect(presetRow2.props.navEntryPreferPosition).toBe(2);
      expect(presetRow2.props.children).toHaveLength(4);

      const resetBtn = findNodes(
        presetRow2,
        (n) => typeName(n) === "DialogButton" && findText(n).includes("Reset to Flat")
      )[0];
      expect(resetBtn).toBeDefined();
      expect(resetBtn.props.style.width).toBe("auto");
      expect(resetBtn.props.style.flex).toBe(1);

      // EqBandFaders and footer preserve MAINTAIN_X
      expect(fadersStrip.props.navEntryPreferPosition).toBe(2);
      expect(footerRow.props.navEntryPreferPosition).toBe(2);

      const discardBtn = findNodes(
        footerRow,
        (n) => typeName(n) === "DialogButton" && findText(n).includes("Discard Changes")
      )[0];
      const saveBtn = findNodes(
        footerRow,
        (n) => typeName(n) === "DialogButton" && findText(n).includes("Save Game EQ")
      )[0];
      expect(discardBtn.props.style.width).toBe("auto");
      expect(discardBtn.props.style.flex).toBe(1);
      expect(saveBtn.props.style.width).toBe("auto");
      expect(saveBtn.props.style.flex).toBe(1);

      // Body wrapper focuses first [tabindex="0"] via requestAnimationFrame instead of top-right Close
      const bodyWrapper = findNodes(
        tree,
        (n) => n.type === "div" && n.props?.ref && typeof n.props.ref === "object"
      )[0];
      expect(bodyWrapper).toBeDefined();
      const firstBodyTargetFocus = vi.fn();
      const querySelector = vi.fn(() => ({ focus: firstBodyTargetFocus }));
      bodyWrapper.props.ref.current = { querySelector };

      expect(mockRaf).toHaveBeenCalledTimes(1);
      rafCallbacks[0]();
      expect(querySelector).toHaveBeenCalledWith('[tabindex="0"]');
      expect(firstBodyTargetFocus).toHaveBeenCalledTimes(1);

      unmountModal();
      expect(mockCancelRaf).toHaveBeenCalledWith(42);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("GameEqModal Async Save Preview Recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stateValues = [];
    stateIdx = 0;
    refValues = [];
    refIdx = 0;
    mountedEffects = [];
    effectIdx = 0;
    effectCleanups = [];
    mockPreviewEqBands.mockResolvedValue({ ok: true });
    mockClearEqPreview.mockResolvedValue({ ok: true, restored: true });
  });

  it("calls clear_eq_preview when running-game onSave resolves { ok: false } or rejects", async () => {
    const closeFail = vi.fn();
    const failTree = renderModal({
      gameName: "Cyberpunk 2077",
      isRunningGame: true,
      onSave: vi.fn().mockResolvedValue({ ok: false, error: "disk full" }),
      closeModal: closeFail,
    });
    const saveFailBtn = findNodes(
      failTree,
      (n) => typeName(n) === "DialogButton" && findText(n).includes("Save Game EQ")
    )[0];
    await saveFailBtn.props.onClick();
    expect(mockClearEqPreview).toHaveBeenCalledTimes(1);
    expect(closeFail).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();
    stateValues = [];
    refValues = [];
    mountedEffects = [];
    effectCleanups = [];
    const closeReject = vi.fn();
    const rejectTree = renderModal({
      gameName: "Cyberpunk 2077",
      isRunningGame: true,
      onSave: vi.fn().mockRejectedValue(new Error("RPC error")),
      closeModal: closeReject,
    });
    const saveRejectBtn = findNodes(
      rejectTree,
      (n) => typeName(n) === "DialogButton" && findText(n).includes("Save Game EQ")
    )[0];
    await saveRejectBtn.props.onClick();
    expect(mockClearEqPreview).toHaveBeenCalledTimes(1);
    expect(closeReject).toHaveBeenCalledTimes(1);
  });

  it("awaits running-game onSave { ok: true } before closing without calling clear_eq_preview", async () => {
    let resolveSave: ((val: { ok: boolean }) => void) | undefined;
    const onSave = vi.fn(
      () =>
        new Promise<{ ok: boolean }>((resolve) => {
          resolveSave = resolve;
        })
    );
    const closeModal = vi.fn();
    const tree = renderModal({
      gameName: "Cyberpunk 2077",
      isRunningGame: true,
      onSave,
      closeModal,
    });
    const saveBtn = findNodes(
      tree,
      (n) => typeName(n) === "DialogButton" && findText(n).includes("Save Game EQ")
    )[0];
    const savePromise = saveBtn.props.onClick();
    expect(closeModal).not.toHaveBeenCalled();

    resolveSave?.({ ok: true });
    await savePromise;
    expect(mockClearEqPreview).not.toHaveBeenCalled();
    expect(closeModal).toHaveBeenCalledTimes(1);
  });
});

describe("EqBandFaders Component Wrapper", () => {
  it("delegates directly to renderEqBandFaders and forwards band changes", () => {
    const onBandChange = vi.fn();
    const tree = EqBandFaders({
      bands: [1, 0, 0, 0, 0, 0, 0, 0, 0, -2],
      onBandChange,
    });
    const sliders = findNodes(tree, (n) => n.props?.role === "slider");
    expect(sliders).toHaveLength(10);
    expect(sliders[0].props["aria-valuenow"]).toBe(1);
    expect(sliders[9].props["aria-valuenow"]).toBe(-2);

    const inc31 = findNodes(
      tree,
      (n) => n.type === InteractiveRow && n.props?.["aria-label"] === "Increase 31 Hz"
    )[0];
    inc31.props.onClick();
    expect(onBandChange).toHaveBeenCalledWith(0, 1.5);
  });
});

describe("GameEqModal Threat Mitigations (T-19-10 & T-19-11)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stateValues = [];
    stateIdx = 0;
    refValues = [];
    refIdx = 0;
    mountedEffects = [];
    effectIdx = 0;
    effectCleanups = [];
  });

  it("renders title as JSX text with ellipsis truncation and guards null bodyRef / missing cancelAnimationFrame", () => {
    const longGame = "A".repeat(220);
    const rafCallbacks: Array<() => void> = [];
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((cb: () => void) => {
        rafCallbacks.push(cb);
        return 7;
      })
    );
    vi.stubGlobal("cancelAnimationFrame", undefined);

    try {
      const tree = renderModal({
        gameName: longGame,
        onSave: vi.fn(),
      });
      const heading = findNodes(tree, (n) => n.type === "h3")[0];
      expect(heading).toBeDefined();
      const titleSpan = findNodes(
        heading,
        (n) => n.type === "span" && findText(n) === `${longGame} — Custom Game EQ`
      )[0];
      expect(titleSpan).toBeDefined();
      expect(titleSpan.props.style).toMatchObject({
        minWidth: 0,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      });
      expect(heading.props.dangerouslySetInnerHTML).toBeUndefined();

      // Null bodyRef.current when requestAnimationFrame fires must not throw
      expect(rafCallbacks).toHaveLength(1);
      expect(() => rafCallbacks[0]()).not.toThrow();

      // Empty querySelector match must not throw
      const bodyWrapper = findNodes(
        tree,
        (n) => n.type === "div" && n.props?.ref && typeof n.props.ref === "object"
      )[0];
      bodyWrapper.props.ref.current = { querySelector: () => null };
      expect(() => rafCallbacks[0]()).not.toThrow();

      // Missing cancelAnimationFrame on unmount must not throw
      expect(() => unmountModal()).not.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
