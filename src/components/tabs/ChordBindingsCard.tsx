import { FC, useEffect, useRef, useState } from "react";
import { DialogButton, Focusable, ToggleField } from "@decky/ui";
import { FaCircle, FaGamepad, FaTimes, FaUndo } from "react-icons/fa";
import {
  CHORD_ACTIONS,
  ChordActionMeta,
  DEFAULT_CHORD_BINDINGS,
  GAMEPAD_BUTTON,
  GUIDE_BUTTON_IDS,
  MAX_BUTTON_ID,
  MAX_CHORD_BUTTONS,
  MIN_BUTTON_ID,
  formatChordChips,
  normalizeChord,
  setChordRecordingActive,
  validateChordBinding,
} from "../../chords";
import type { ChordActionId, ChordBindingsMap } from "../../types";

export interface ChordBindingsCardProps {
  silentBannerEnabled: boolean;
  chordsEnabled: boolean;
  bindings: ChordBindingsMap;
  onToggleSilentBanner: (enabled: boolean) => void | Promise<void>;
  onSaveBindings: (next: ChordBindingsMap) => boolean | void | Promise<boolean | void>;
}

type UnregisterHandle = (() => void) | { Unregister?: () => void } | null | undefined;

interface GamepadInputSourceLike {
  RegisterForGamepadButtonDown?: (cb: (btn: number) => void) => UnregisterHandle;
  RegisterForGamepadButtonUp?: (cb: (btn: number) => void) => UnregisterHandle;
}

interface GamepadWindowLike {
  GamepadNavTree?: {
    m_context?: {
      m_controller?: { m_rgGamepadInputSources?: GamepadInputSourceLike[] };
    };
  };
  FocusNavController?: { m_rgGamepadInputSources?: GamepadInputSourceLike[] };
}

interface RowErrorState {
  actionId: ChordActionId;
  message: string;
}

interface RecorderRuntime {
  heldSet: Set<number>;
  peakSet: Set<number>;
  unsubDown: UnregisterHandle;
  unsubUp: UnregisterHandle;
  countdown: ReturnType<typeof setInterval> | null;
  timeout: ReturnType<typeof setTimeout> | null;
  errorTimer: ReturnType<typeof setTimeout> | null;
  recordingAction: ChordActionId | null;
  bindings: ChordBindingsMap;
  onSave: ChordBindingsCardProps["onSaveBindings"];
}

const RECORD_TIMEOUT_SECONDS = 5;
const RECORD_TIMEOUT_MS = 5000;
const ERROR_AUTO_CLEAR_MS = 5000;

function getGamepadInputSource(): GamepadInputSourceLike | null {
  if (typeof window === "undefined") return null;
  const win = window as unknown as GamepadWindowLike;
  const fc = win?.GamepadNavTree?.m_context?.m_controller || win?.FocusNavController;
  return fc?.m_rgGamepadInputSources?.[0] ?? null;
}

function unregisterGamepadHandle(handle: UnregisterHandle): void {
  if (typeof handle === "function") {
    handle();
  } else if (handle && typeof handle.Unregister === "function") {
    handle.Unregister();
  }
}

function clearRecorderErrorTimer(runtime: RecorderRuntime): void {
  if (runtime.errorTimer !== null) {
    clearTimeout(runtime.errorTimer);
    runtime.errorTimer = null;
  }
}

function clearActiveRecording(runtime: RecorderRuntime): void {
  if (runtime.countdown !== null) {
    clearInterval(runtime.countdown);
    runtime.countdown = null;
  }
  if (runtime.timeout !== null) {
    clearTimeout(runtime.timeout);
    runtime.timeout = null;
  }
  unregisterGamepadHandle(runtime.unsubDown);
  runtime.unsubDown = null;
  unregisterGamepadHandle(runtime.unsubUp);
  runtime.unsubUp = null;
  runtime.heldSet.clear();
  runtime.peakSet.clear();
  runtime.recordingAction = null;
  setChordRecordingActive(false);
}

export function buildFullBindingsMap(
  base: ChordBindingsMap,
  patch?: Partial<Record<ChordActionId, number[]>>,
): Record<ChordActionId, number[]> {
  const out = {} as Record<ChordActionId, number[]>;
  for (const meta of CHORD_ACTIONS) {
    const hasPatch = Boolean(patch && Object.prototype.hasOwnProperty.call(patch, meta.id));
    const candidate = hasPatch ? patch?.[meta.id] : base[meta.id];
    out[meta.id] = Array.isArray(candidate) ? normalizeChord(candidate) : [];
  }
  return out;
}

interface AttachCallbacks {
  actionId: ChordActionId;
  runtime: RecorderRuntime;
  stopRecording: () => void;
  setLiveButtons: (buttons: number[]) => void;
  setSecondsLeft: (updater: (prev: number) => number) => void;
  setInlineError: (actionId: ChordActionId, message: string) => void;
}

function handleRecordedButtonDown(btn: number, ctx: AttachCallbacks): void {
  const { actionId, runtime, stopRecording, setLiveButtons, setInlineError } = ctx;
  if (runtime.recordingAction !== actionId) return;
  if (!Number.isInteger(btn) || btn < MIN_BUTTON_ID || btn > MAX_BUTTON_ID) return;
  if ((GUIDE_BUTTON_IDS as readonly number[]).includes(btn)) {
    stopRecording();
    setInlineError(
      actionId,
      "STEAM / QAM button combos are intercepted by SteamOS and don't work in-game. Use other buttons like L4, R4, L5, or R5.",
    );
    return;
  }
  if (btn === GAMEPAD_BUTTON.CANCEL && runtime.peakSet.size === 0) {
    stopRecording();
    return;
  }
  if (runtime.heldSet.has(btn)) return;
  runtime.heldSet.add(btn);
  runtime.peakSet.add(btn);
  const normalized = normalizeChord(Array.from(runtime.peakSet));
  if (normalized.length > MAX_CHORD_BUTTONS) {
    stopRecording();
    setInlineError(actionId, "Chords support up to 4 buttons.");
    return;
  }
  setLiveButtons(normalized);
}

function handleRecordedButtonUp(btn: number, ctx: AttachCallbacks): void {
  const { actionId, runtime, stopRecording, setInlineError } = ctx;
  if (runtime.recordingAction !== actionId) return;
  runtime.heldSet.delete(btn);
  if (runtime.heldSet.size > 0 || runtime.peakSet.size === 0) return;
  const captured = Array.from(runtime.peakSet);
  stopRecording();
  const res = validateChordBinding(actionId, captured, runtime.bindings);
  if (!res.ok) {
    setInlineError(actionId, res.message);
    return;
  }
  const next = buildFullBindingsMap(runtime.bindings, { [actionId]: res.normalized });
  void Promise.resolve(runtime.onSave(next)).catch(() => {});
}

function beginRecorderTimersAndListeners(ctx: AttachCallbacks): void {
  const { actionId, runtime, stopRecording, setSecondsLeft, setInlineError } = ctx;
  runtime.countdown = setInterval(() => {
    setSecondsLeft((prev) => (prev > 1 ? prev - 1 : 1));
  }, 1000);
  runtime.timeout = setTimeout(() => {
    const hadButtons = runtime.peakSet.size > 0;
    stopRecording();
    if (!hadButtons) {
      setInlineError(actionId, "No buttons detected — recording cancelled.");
    }
  }, RECORD_TIMEOUT_MS);
  const src = getGamepadInputSource();
  if (src?.RegisterForGamepadButtonDown) {
    runtime.unsubDown = src.RegisterForGamepadButtonDown((btn: number) => {
      handleRecordedButtonDown(btn, ctx);
    });
  }
  if (src?.RegisterForGamepadButtonUp) {
    runtime.unsubUp = src.RegisterForGamepadButtonUp((btn: number) => {
      handleRecordedButtonUp(btn, ctx);
    });
  }
}

function createRecorderRuntime(
  bindings: ChordBindingsMap,
  onSave: ChordBindingsCardProps["onSaveBindings"],
): RecorderRuntime {
  return {
    heldSet: new Set<number>(),
    peakSet: new Set<number>(),
    unsubDown: null,
    unsubUp: null,
    countdown: null,
    timeout: null,
    errorTimer: null,
    recordingAction: null,
    bindings,
    onSave,
  };
}

function useChordRecorder(opts: {
  chordsEnabled: boolean;
  bindings: ChordBindingsMap;
  onSaveBindings: ChordBindingsCardProps["onSaveBindings"];
}) {
  const [recordingAction, setRecordingAction] = useState<ChordActionId | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(RECORD_TIMEOUT_SECONDS);
  const [liveButtons, setLiveButtons] = useState<number[]>([]);
  const [rowError, setRowError] = useState<RowErrorState | null>(null);

  const runtimeRef = useRef<RecorderRuntime | null>(null);
  if (runtimeRef.current === null) {
    runtimeRef.current = createRecorderRuntime(opts.bindings, opts.onSaveBindings);
  }
  const runtime = runtimeRef.current;
  runtime.bindings = opts.bindings;
  runtime.onSave = opts.onSaveBindings;

  const clearError = () => {
    clearRecorderErrorTimer(runtime);
    setRowError(null);
  };

  const setInlineError = (actionId: ChordActionId, message: string) => {
    clearRecorderErrorTimer(runtime);
    setRowError({ actionId, message });
    runtime.errorTimer = setTimeout(() => {
      runtime.errorTimer = null;
      setRowError((prev) => (prev?.actionId === actionId ? null : prev));
    }, ERROR_AUTO_CLEAR_MS);
  };

  const stopRecording = () => {
    if (runtime.recordingAction !== null) {
      setRecordingAction(null);
      setLiveButtons([]);
      setSecondsLeft(RECORD_TIMEOUT_SECONDS);
    }
    clearActiveRecording(runtime);
  };

  const stopRef = useRef(stopRecording);
  stopRef.current = stopRecording;

  useEffect(() => {
    if (!opts.chordsEnabled) stopRef.current();
  }, [opts.chordsEnabled]);

  useEffect(() => {
    return () => {
      if (runtimeRef.current) {
        clearActiveRecording(runtimeRef.current);
        clearRecorderErrorTimer(runtimeRef.current);
      }
    };
  }, []);

  const startRecording = (actionId: ChordActionId) => {
    if (!opts.chordsEnabled) return;
    clearActiveRecording(runtime);
    clearError();
    runtime.recordingAction = actionId;
    setRecordingAction(actionId);
    setLiveButtons([]);
    setSecondsLeft(RECORD_TIMEOUT_SECONDS);
    setChordRecordingActive(true);
    beginRecorderTimersAndListeners({
      actionId,
      runtime,
      stopRecording,
      setLiveButtons,
      setSecondsLeft,
      setInlineError,
    });
  };

  return {
    recordingAction,
    secondsLeft,
    liveButtons,
    rowError,
    startRecording,
    stopRecording,
    clearError,
    setInlineError,
  };
}

function renderChordChipStrip(opts: {
  savedButtons: number[];
  isRecording: boolean;
  liveButtons: number[];
}) {
  const { savedButtons, isRecording, liveButtons } = opts;
  const showingLive = isRecording && liveButtons.length > 0;
  const sourceButtons = showingLive ? liveButtons : savedButtons;
  const chips = formatChordChips(sourceButtons);

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
      {chips.length > 0 ? (
        chips.map((label, idx) => (
          <span
            key={`${label}-${idx}`}
            style={{
              fontSize: 12,
              fontWeight: 700,
              lineHeight: 1.3,
              padding: "3px 8px",
              borderRadius: 4,
              background: showingLive ? "rgba(29, 185, 84, 0.2)" : "#1E1E1E",
              border: showingLive ? "1px solid #1DB954" : "1px solid rgba(255,255,255,0.16)",
              color: "#fff",
            }}
          >
            {label}
          </span>
        ))
      ) : (
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            lineHeight: 1.3,
            padding: "3px 8px",
            borderRadius: 4,
            background: "rgba(255,255,255,0.08)",
            color: "rgba(255,255,255,0.75)",
          }}
        >
          Unbound
        </span>
      )}
    </div>
  );
}

interface ActionRowRenderOpts {
  action: ChordActionMeta;
  savedButtons: number[];
  chordsEnabled: boolean;
  recordingAction: ChordActionId | null;
  secondsLeft: number;
  liveButtons: number[];
  errorMessage: string | null;
  onStartRecord: (actionId: ChordActionId) => void;
  onCancelRecord: () => void;
  onClearAction: (actionId: ChordActionId) => void;
  onResetAction: (actionId: ChordActionId) => void;
}

function renderRowLeftColumn(opts: {
  label: string;
  savedButtons: number[];
  isRecording: boolean;
  liveButtons: number[];
}) {
  const { label, savedButtons, isRecording, liveButtons } = opts;
  return (
    <div style={{ minWidth: 0, flex: 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.2 }}>{label}</span>
        {isRecording ? (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 12,
              fontWeight: 700,
              lineHeight: 1.3,
              color: "#1DB954",
            }}
          >
            <FaCircle size={8} color="#1DB954" />
            <span>Recording…</span>
          </span>
        ) : null}
      </div>
      {renderChordChipStrip({ savedButtons, isRecording, liveButtons })}
      {!isRecording && savedButtons.length === 0 ? (
        <div
          style={{
            fontSize: 14,
            fontWeight: 400,
            lineHeight: 1.5,
            opacity: 0.7,
            marginTop: 4,
          }}
        >
          Press Record Chord, then hold 1–4 buttons together to bind this action.
        </div>
      ) : null}
    </div>
  );
}

function renderRowActionButtons(opts: {
  actionId: ChordActionId;
  savedCount: number;
  chordsEnabled: boolean;
  isRecording: boolean;
  otherRecording: boolean;
  onStartRecord: (actionId: ChordActionId) => void;
  onCancelRecord: () => void;
  onClearAction: (actionId: ChordActionId) => void;
  onResetAction: (actionId: ChordActionId) => void;
}) {
  const {
    actionId,
    savedCount,
    chordsEnabled,
    isRecording,
    otherRecording,
    onStartRecord,
    onCancelRecord,
    onClearAction,
    onResetAction,
  } = opts;
  const compactButtonStyle = {
    width: "auto",
    minWidth: "auto",
    minHeight: 44,
    padding: "8px 10px",
    fontSize: 12,
    fontWeight: 700,
    whiteSpace: "nowrap",
    display: "flex",
    alignItems: "center",
    gap: 4,
  } as const;

  return (
    <Focusable
      flow-children="horizontal"
      style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}
    >
      <DialogButton
        style={{
          width: "auto",
          minWidth: "auto",
          minHeight: 44,
          padding: "8px 12px",
          fontSize: 12,
          fontWeight: 700,
          whiteSpace: "nowrap",
        }}
        disabled={!chordsEnabled || otherRecording}
        onClick={() => (isRecording ? onCancelRecord() : onStartRecord(actionId))}
      >
        {isRecording ? "Cancel Recording" : "Record Chord"}
      </DialogButton>
      <DialogButton
        style={compactButtonStyle}
        disabled={isRecording || savedCount === 0}
        onClick={() => onClearAction(actionId)}
      >
        <FaTimes size={12} />
        <span>Clear Chord</span>
      </DialogButton>
      <DialogButton
        style={compactButtonStyle}
        disabled={isRecording}
        onClick={() => onResetAction(actionId)}
      >
        <FaUndo size={12} />
        <span>Reset Chord</span>
      </DialogButton>
    </Focusable>
  );
}

function renderActionRow(opts: ActionRowRenderOpts) {
  const { action, savedButtons, chordsEnabled, recordingAction, secondsLeft, liveButtons } = opts;
  const isRecording = recordingAction === action.id;
  const otherRecording = recordingAction !== null && !isRecording;

  return (
    <div key={action.id}>
      <Focusable
        flow-children="horizontal"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 8,
          padding: "10px 12px",
          borderRadius: 8,
          opacity: chordsEnabled ? 1 : 0.5,
          background: isRecording ? "rgba(29, 185, 84, 0.12)" : "rgba(255,255,255,0.04)",
          boxShadow: isRecording ? "0 0 0 2px #1DB954" : undefined,
        }}
      >
        {renderRowLeftColumn({
          label: action.label,
          savedButtons,
          isRecording,
          liveButtons,
        })}
        {renderRowActionButtons({
          actionId: action.id,
          savedCount: savedButtons.length,
          chordsEnabled,
          isRecording,
          otherRecording,
          onStartRecord: opts.onStartRecord,
          onCancelRecord: opts.onCancelRecord,
          onClearAction: opts.onClearAction,
          onResetAction: opts.onResetAction,
        })}
      </Focusable>
      {isRecording ? (
        <div style={{ fontSize: 14, fontWeight: 400, lineHeight: 1.5, marginTop: 4, paddingLeft: 4 }}>
          {`Hold your button combination… (${secondsLeft}s)`}
        </div>
      ) : null}
      {opts.errorMessage ? (
        <div
          role="alert"
          style={{
            fontSize: 12,
            fontWeight: 700,
            lineHeight: 1.3,
            color: "#E53935",
            marginTop: 4,
            paddingLeft: 4,
          }}
        >
          {opts.errorMessage}
        </div>
      ) : null}
    </div>
  );
}

function renderResetAllFooter(opts: {
  confirmResetAll: boolean;
  isAnyRecording: boolean;
  onOpenConfirm: () => void;
  onCancelConfirm: () => void;
  onConfirmResetAll: () => void;
}) {
  const buttonStyle = {
    width: "auto",
    minWidth: "auto",
    minHeight: 44,
    padding: "8px 12px",
    fontSize: 12,
    fontWeight: 700,
    whiteSpace: "nowrap",
  } as const;

  if (!opts.confirmResetAll) {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
        <DialogButton style={buttonStyle} disabled={opts.isAnyRecording} onClick={opts.onOpenConfirm}>
          Reset All Chords
        </DialogButton>
      </div>
    );
  }
  return (
    <Focusable
      flow-children="horizontal"
      style={{ display: "flex", justifyContent: "flex-end", gap: 8, alignItems: "center", marginTop: 12 }}
    >
      <DialogButton
        style={{ ...buttonStyle, color: "#E53935" }}
        onClick={opts.onConfirmResetAll}
      >
        Confirm Reset
      </DialogButton>
      <DialogButton style={buttonStyle} onClick={opts.onCancelConfirm}>
        Keep Chords
      </DialogButton>
    </Focusable>
  );
}

function renderCardHeader(opts: {
  silentBannerEnabled: boolean;
  chordsEnabled: boolean;
  onToggleSilentBanner: ChordBindingsCardProps["onToggleSilentBanner"];
}) {
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <FaGamepad size={16} />
        <h4 style={{ margin: 0, fontSize: 16, fontWeight: 700, lineHeight: 1.2 }}>
          In-Game Quick Chords
        </h4>
      </div>
      <div style={{ fontSize: 14, fontWeight: 400, lineHeight: 1.5, opacity: 0.75, marginBottom: 10 }}>
        Chords work in-game and while the Quick Access Menu is open using buttons like L4, R4, L5, or R5 (without the STEAM button). They are paused while the Deckify window is open.
      </div>
      <ToggleField
        label="Silent HUD Banner"
        description="Show track changes and chord confirmations as a silent in-game banner instead of a Steam toast."
        checked={opts.silentBannerEnabled}
        onChange={(checked: boolean) => {
          void Promise.resolve(opts.onToggleSilentBanner(checked)).catch(() => {});
        }}
      />
      {!opts.chordsEnabled ? (
        <div style={{ fontSize: 14, fontWeight: 400, lineHeight: 1.5, opacity: 0.75, margin: "8px 0" }}>
          Enable in-game chords above to use these bindings.
        </div>
      ) : null}
    </>
  );
}

export const ChordBindingsCard: FC<ChordBindingsCardProps> = ({
  silentBannerEnabled,
  chordsEnabled,
  bindings,
  onToggleSilentBanner,
  onSaveBindings,
}) => {
  const [confirmResetAll, setConfirmResetAll] = useState(false);
  const recorder = useChordRecorder({ chordsEnabled, bindings, onSaveBindings });

  const handleClearAction = (actionId: ChordActionId) => {
    recorder.clearError();
    const next = buildFullBindingsMap(bindings, { [actionId]: [] });
    void Promise.resolve(onSaveBindings(next)).catch(() => {});
  };

  const handleResetAction = (actionId: ChordActionId) => {
    recorder.clearError();
    const defaultButtons = DEFAULT_CHORD_BINDINGS[actionId];
    const check = validateChordBinding(actionId, defaultButtons, bindings);
    if (!check.ok) {
      recorder.setInlineError(actionId, check.message);
      return;
    }
    const next = buildFullBindingsMap(bindings, { [actionId]: check.normalized });
    void Promise.resolve(onSaveBindings(next)).catch(() => {});
  };

  const handleConfirmResetAll = () => {
    setConfirmResetAll(false);
    recorder.clearError();
    const next = buildFullBindingsMap(DEFAULT_CHORD_BINDINGS);
    void Promise.resolve(onSaveBindings(next)).catch(() => {});
  };

  const handleStartRecord = (actionId: ChordActionId) => {
    setConfirmResetAll(false);
    recorder.startRecording(actionId);
  };

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
      {renderCardHeader({ silentBannerEnabled, chordsEnabled, onToggleSilentBanner })}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
        {CHORD_ACTIONS.map((action) => {
          const raw = bindings[action.id];
          const savedButtons = Array.isArray(raw) ? normalizeChord(raw) : [];
          const errorMessage =
            recorder.rowError?.actionId === action.id ? recorder.rowError.message : null;
          return renderActionRow({
            action,
            savedButtons,
            chordsEnabled,
            recordingAction: recorder.recordingAction,
            secondsLeft: recorder.secondsLeft,
            liveButtons: recorder.liveButtons,
            errorMessage,
            onStartRecord: handleStartRecord,
            onCancelRecord: recorder.stopRecording,
            onClearAction: handleClearAction,
            onResetAction: handleResetAction,
          });
        })}
      </div>
      {renderResetAllFooter({
        confirmResetAll,
        isAnyRecording: recorder.recordingAction !== null,
        onOpenConfirm: () => setConfirmResetAll(true),
        onCancelConfirm: () => setConfirmResetAll(false),
        onConfirmResetAll: handleConfirmResetAll,
      })}
    </div>
  );
};
