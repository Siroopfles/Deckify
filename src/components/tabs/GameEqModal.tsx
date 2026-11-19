import { FC, ReactNode, useEffect, useRef, useState } from "react";
import { DialogButton, Focusable, ModalRoot, NavEntryPositionPreferences } from "@decky/ui";
import { callable } from "@decky/api";
import { FaSlidersH, FaTimes, FaUndo } from "react-icons/fa";
import { EqualizerPreset } from "../../types";
import { InteractiveRow } from "../common/InteractiveRow";
import {
  EQ_PRESET_CURVES,
  normalizeEqBands,
  renderEqBandFaders,
} from "../common/EqBandFaders";

type ModalRootPropsLike = {
  onCancel?: () => void;
  closeModal?: () => void;
  children?: ReactNode;
};

const ModalRootCompat = ModalRoot as unknown as FC<ModalRootPropsLike>;

const backendPreviewEqBands = callable<[number[]], { ok: boolean; error?: string }>(
  "preview_eq_bands"
);
const backendClearEqPreview = callable<[], { ok: boolean; restored?: boolean; error?: string }>(
  "clear_eq_preview"
);

const PREVIEW_ERROR_MESSAGE =
  "Equalizer preview unavailable — audio routed directly to hardware output. Check PipeWire status in Settings.";

type SeedPresetKey = "global" | Exclude<EqualizerPreset, "custom">;

type SeedBarItem =
  | { kind: "preset"; key: SeedPresetKey; label: string }
  | { kind: "reset"; label: string };

const SEED_PRESET_ROWS: SeedBarItem[][] = [
  [
    { kind: "preset", key: "global", label: "Global" },
    { kind: "preset", key: "flat", label: "Flat" },
    { kind: "preset", key: "bass", label: "Bass Boost" },
    { kind: "preset", key: "vocal", label: "Vocal Clarity" },
  ],
  [
    { kind: "preset", key: "gaming", label: "Gaming Balance" },
    { kind: "preset", key: "deck_speakers", label: "Deck Speakers" },
    { kind: "preset", key: "late_night", label: "Late Night" },
    { kind: "reset", label: "Reset to Flat" },
  ],
];

export type GameEqSaveResult = { ok?: boolean; error?: string } | void;

export interface GameEqModalProps {
  isOpen?: boolean;
  gameName: string;
  initialBands?: number[] | null;
  seedBands?: number[];
  isRunningGame?: boolean;
  showToast?: (msg: string) => void;
  onSave: (bands: number[]) => GameEqSaveResult | Promise<GameEqSaveResult>;
  onClose?: () => void;
  closeModal?: () => void;
}

export function resolveInitialModalBands(
  initialBands?: number[] | null,
  seedBands?: number[]
): number[] {
  if (Array.isArray(initialBands) && initialBands.length === 10) {
    return normalizeEqBands(initialBands);
  }
  if (Array.isArray(seedBands) && seedBands.length === 10) {
    return normalizeEqBands(seedBands);
  }
  return [...EQ_PRESET_CURVES.flat];
}

function formatPreampReadout(bands: number[]): { text: string; isBypass: boolean } {
  if (bands.every((b) => b === 0)) {
    return { text: "Bypass (0.0 dB)", isBypass: true };
  }
  const maxBoost = Math.max(0, ...bands);
  const preampDb = maxBoost > 0 ? -maxBoost : 0;
  return { text: `Preamp: ${preampDb.toFixed(1)} dB`, isBypass: false };
}

function renderModalHeader(
  gameName: string,
  bands: number[],
  onDiscard: () => void
) {
  const preamp = formatPreampReadout(bands);
  return (
    <Focusable
      flow-children="horizontal"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        width: "100%",
        minWidth: 0,
      }}
    >
      <h3
        style={{
          margin: 0,
          flex: 1,
          minWidth: 0,
          fontSize: 16,
          fontWeight: 700,
          lineHeight: 1.2,
          display: "flex",
          alignItems: "center",
          gap: 8,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        <FaSlidersH size={14} color="#1DB954" style={{ flexShrink: 0 }} />
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {`${gameName} — Custom Game EQ`}
        </span>
      </h3>
      <span
        style={{
          fontSize: 12,
          fontWeight: 700,
          lineHeight: 1.3,
          flexShrink: 0,
          whiteSpace: "nowrap",
          color: preamp.isBypass ? "rgba(255,255,255,0.6)" : "#1DB954",
        }}
      >
        {preamp.text}
      </span>
      <DialogButton
        onClick={onDiscard}
        aria-label="Close"
        style={{
          width: "auto",
          minWidth: "auto",
          minHeight: 32,
          padding: "4px 10px",
          fontSize: 12,
          fontWeight: 700,
          display: "flex",
          alignItems: "center",
          gap: 4,
          whiteSpace: "nowrap",
        }}
      >
        <FaTimes size={12} />
        <span>Close</span>
      </DialogButton>
    </Focusable>
  );
}

function renderStatusCaption(bands: number[], previewError: string | null) {
  if (previewError) {
    return (
      <div
        role="alert"
        style={{
          fontSize: 14,
          fontWeight: 400,
          lineHeight: 1.5,
          color: "#E53935",
        }}
      >
        {previewError}
      </div>
    );
  }
  const isAllFlat = bands.every((b) => b === 0);
  return (
    <div
      style={{
        fontSize: 14,
        fontWeight: 400,
        lineHeight: 1.5,
        opacity: 0.78,
      }}
    >
      {isAllFlat
        ? "Flat Curve (0.0 dB) — Adjust any band slider or choose Copy from Preset to sculpt this game's EQ."
        : "Live PipeWire audio preview active"}
    </div>
  );
}

function renderSeedBarItem(
  item: SeedBarItem,
  activeSeedKey: string | null,
  onCopyPreset: (key: SeedPresetKey) => void,
  onResetFlat: () => void
) {
  if (item.kind === "reset") {
    return (
      <DialogButton
        key="reset-flat"
        onClick={onResetFlat}
        style={{
          width: "auto",
          minWidth: 0,
          flex: 1,
          minHeight: 44,
          padding: "6px 8px",
          fontSize: 12,
          fontWeight: 700,
          lineHeight: 1.3,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
        }}
      >
        <FaUndo size={11} />
        <span>{item.label}</span>
      </DialogButton>
    );
  }
  return (
    <InteractiveRow
      key={item.key}
      active={activeSeedKey === item.key}
      onClick={() => onCopyPreset(item.key)}
      style={{
        flex: 1,
        minWidth: 0,
        minHeight: 44,
        padding: "6px 8px",
        fontSize: 12,
        fontWeight: 700,
        lineHeight: 1.3,
        justifyContent: "center",
      }}
    >
      {item.label}
    </InteractiveRow>
  );
}

function renderPresetSeedBar(
  activeSeedKey: string | null,
  onCopyPreset: (key: SeedPresetKey) => void,
  onResetFlat: () => void
) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.3, opacity: 0.85 }}>
        Copy from Preset
      </div>
      {SEED_PRESET_ROWS.map((row, rowIdx) => (
        <Focusable
          key={rowIdx}
          flow-children="horizontal"
          preferredFocus={rowIdx === 0 ? true : undefined}
          navEntryPreferPosition={NavEntryPositionPreferences.MAINTAIN_X}
          style={{ display: "flex", gap: 8, alignItems: "stretch" }}
        >
          {row.map((item) => renderSeedBarItem(item, activeSeedKey, onCopyPreset, onResetFlat))}
        </Focusable>
      ))}
    </div>
  );
}

function renderModalFooter(onDiscard: () => void, onSave: () => void) {
  return (
    <Focusable
      flow-children="horizontal"
      navEntryPreferPosition={NavEntryPositionPreferences.MAINTAIN_X}
      style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 4 }}
    >
      <DialogButton
        onClick={onDiscard}
        style={{
          width: "auto",
          flex: 1,
          minWidth: 0,
          minHeight: 44,
          padding: "8px 16px",
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        Discard Changes
      </DialogButton>
      <DialogButton
        onClick={onSave}
        style={{
          width: "auto",
          flex: 1,
          minWidth: 0,
          minHeight: 44,
          padding: "8px 16px",
          fontSize: 12,
          fontWeight: 700,
          background: "#1DB954",
          color: "#000",
        }}
      >
        Save Game EQ
      </DialogButton>
    </Focusable>
  );
}

function sendPreviewRequest(
  nextBands: number[],
  setPreviewError: (msg: string | null) => void,
  showToast?: (msg: string) => void
) {
  setPreviewError(null);
  return backendPreviewEqBands(nextBands)
    .then((res) => {
      if (res && res.ok === false) {
        setPreviewError(PREVIEW_ERROR_MESSAGE);
        showToast?.(PREVIEW_ERROR_MESSAGE);
      }
    })
    .catch(() => {
      setPreviewError(PREVIEW_ERROR_MESSAGE);
      showToast?.(PREVIEW_ERROR_MESSAGE);
    });
}

function invokeSaveWithClear(opts: {
  onSave: GameEqModalProps["onSave"];
  bands: number[];
  isRunningRef: { current: boolean };
  clearedRef: { current: boolean };
  closeModal?: () => void;
  onClose?: () => void;
}) {
  const { onSave, bands, isRunningRef, clearedRef, closeModal, onClose } = opts;
  const finish = (saveRes?: GameEqSaveResult) => {
    const failed = Boolean(saveRes && saveRes.ok === false);
    if ((!isRunningRef.current || failed) && !clearedRef.current) {
      clearedRef.current = true;
      backendClearEqPreview().catch(() => {});
    }
    closeModal?.();
    onClose?.();
  };
  let result: unknown;
  try {
    result = onSave(bands);
  } catch {
    finish({ ok: false });
    return Promise.resolve();
  }
  if (result && typeof (result as PromiseLike<unknown>).then === "function") {
    return Promise.resolve(result as PromiseLike<GameEqSaveResult>).then(
      (res) => finish(res),
      () => finish({ ok: false })
    );
  }
  finish(result as GameEqSaveResult);
  return undefined;
}

function useGameEqState({
  initialBands,
  seedBands,
  isRunningGame,
  showToast,
  onSave,
  onClose,
  closeModal,
}: Omit<GameEqModalProps, "isOpen" | "gameName">) {
  const [bands, setBands] = useState<number[]>(() =>
    resolveInitialModalBands(initialBands, seedBands)
  );
  const [activeSeedKey, setActiveSeedKey] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const savedRef = useRef(false);
  const clearedRef = useRef(false);
  const isRunningRef = useRef(Boolean(isRunningGame));
  isRunningRef.current = Boolean(isRunningGame);
  const bandsRef = useRef<number[]>(bands);
  bandsRef.current = bands;

  useEffect(
    () => () => {
      if (!clearedRef.current && !(isRunningRef.current && savedRef.current)) {
        clearedRef.current = true;
        backendClearEqPreview().catch(() => {});
      }
    },
    []
  );

  const commitBandsPreview = (nextBands: number[], seedKey: string | null) => {
    bandsRef.current = nextBands;
    clearedRef.current = false;
    setActiveSeedKey(seedKey);
    setBands(nextBands);
    return sendPreviewRequest(nextBands, setPreviewError, showToast);
  };

  const handleBandChange = (idx: number, rawGain: number) => {
    const nextBands = normalizeEqBands(
      bandsRef.current.map((b, i) => (i === idx ? rawGain : b))
    );
    return commitBandsPreview(nextBands, null);
  };

  const handleCopyPreset = (presetKey: SeedPresetKey) => {
    const nextBands =
      presetKey === "global"
        ? normalizeEqBands(seedBands)
        : [...EQ_PRESET_CURVES[presetKey]];
    return commitBandsPreview(nextBands, presetKey);
  };

  const handleDiscard = () => {
    if (!clearedRef.current) {
      clearedRef.current = true;
      backendClearEqPreview().catch(() => {});
    }
    closeModal?.();
    onClose?.();
  };

  const handleSave = () => {
    savedRef.current = true;
    return invokeSaveWithClear({
      onSave,
      bands: bandsRef.current,
      isRunningRef,
      clearedRef,
      closeModal,
      onClose,
    });
  };

  return {
    bands,
    activeSeedKey,
    previewError,
    handleBandChange,
    handleCopyPreset,
    handleResetFlat: () => handleCopyPreset("flat"),
    handleDiscard,
    handleSave,
  };
}

function useBodyInitialFocus(isOpen: boolean) {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!isOpen || typeof requestAnimationFrame !== "function") return;
    const frameId = requestAnimationFrame(() => {
      const target = bodyRef.current?.querySelector?.('[tabindex="0"]') as HTMLElement | null;
      target?.focus?.();
    });
    return () => {
      if (typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(frameId);
      }
    };
  }, [isOpen]);
  return bodyRef;
}

export const GameEqModal: FC<GameEqModalProps> = ({
  isOpen = true,
  gameName,
  initialBands,
  seedBands,
  isRunningGame = false,
  showToast,
  onSave,
  onClose,
  closeModal,
}) => {
  const {
    bands,
    activeSeedKey,
    previewError,
    handleBandChange,
    handleCopyPreset,
    handleResetFlat,
    handleDiscard,
    handleSave,
  } = useGameEqState({
    initialBands,
    seedBands,
    isRunningGame,
    showToast,
    onSave,
    onClose,
    closeModal,
  });
  const bodyRef = useBodyInitialFocus(isOpen);

  if (!isOpen) return null;

  return (
    <ModalRootCompat onCancel={handleDiscard} closeModal={handleDiscard}>
      <Focusable
        flow-children="column"
        style={{
          width: "100%",
          maxWidth: "min(680px, 88vw)",
          maxHeight: "82vh",
          overflowY: "auto",
          overflowX: "hidden",
          boxSizing: "border-box",
          padding: 12,
          color: "#fff",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {renderModalHeader(gameName, bands, handleDiscard)}
        <div ref={bodyRef} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {renderStatusCaption(bands, previewError)}
          {renderPresetSeedBar(activeSeedKey, handleCopyPreset, handleResetFlat)}
          {renderEqBandFaders({ bands, onBandChange: handleBandChange })}
          {renderModalFooter(handleDiscard, handleSave)}
        </div>
      </Focusable>
    </ModalRootCompat>
  );
};
