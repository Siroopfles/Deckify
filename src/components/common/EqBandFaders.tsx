import { FC } from "react";
import { Focusable } from "@decky/ui";
import { EqualizerPreset } from "../../types";
import { InteractiveRow } from "./InteractiveRow";

export const EQ_BAND_LABELS = [
  "31 Hz",
  "62 Hz",
  "125 Hz",
  "250 Hz",
  "500 Hz",
  "1 kHz",
  "2 kHz",
  "4 kHz",
  "8 kHz",
  "16 kHz",
];

export const EQ_SHORT_LABELS = [
  "31",
  "62",
  "125",
  "250",
  "500",
  "1k",
  "2k",
  "4k",
  "8k",
  "16k",
];

export const EQ_PRESET_CURVES: Record<Exclude<EqualizerPreset, "custom">, number[]> = {
  flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  bass: [5, 6, 4.5, 2, 0, 0, 0.5, 1, 1.5, 1],
  vocal: [-2, -1.5, -1, 0, 1.5, 3.5, 4.5, 3.5, 1.5, 0],
  gaming: [2.5, 2, 0.5, -2.5, -3.5, -3, -1.5, 1, 2.5, 2],
  deck_speakers: [0, 1.5, 4, 2.5, -2, 0, 1.5, 3, 3.5, 2],
  late_night: [4, 3.5, 2, 0, -0.5, -1, -1.5, -1, 2, 3],
};

export function normalizeEqBands(bands?: unknown): number[] {
  if (!Array.isArray(bands)) return [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  return Array.from({ length: 10 }, (_, idx) => {
    const raw = Number(bands[idx]);
    if (!Number.isFinite(raw)) return 0;
    return Math.min(12, Math.max(-12, Math.round(raw * 2) / 2));
  });
}

export interface EqBandFadersProps {
  bands: number[];
  onBandChange: (bandIndex: number, nextDb: number) => void;
}

function handleSliderPointer(
  bandIdx: number,
  clientY: number,
  rect: DOMRect,
  onBandChange: EqBandFadersProps["onBandChange"]
) {
  if (rect.height <= 0) return;
  const ratio = Math.min(1, Math.max(0, (rect.bottom - clientY) / rect.height));
  const rawDb = -12 + ratio * 24;
  onBandChange(bandIdx, rawDb);
}

function renderSliderTrack(
  idx: number,
  gain: number,
  label: string,
  onBandChange: EqBandFadersProps["onBandChange"]
) {
  const pct = ((gain + 12) / 24) * 100;
  const fillBottom = gain >= 0 ? 50 : pct;
  const fillHeight = Math.abs(pct - 50);

  return (
    <div
      role="slider"
      aria-label={label}
      aria-valuemin={-12}
      aria-valuemax={12}
      aria-valuenow={gain}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture?.(e.pointerId);
        handleSliderPointer(idx, e.clientY, e.currentTarget.getBoundingClientRect(), onBandChange);
      }}
      onPointerMove={(e) => {
        if (e.buttons === 1) {
          handleSliderPointer(idx, e.clientY, e.currentTarget.getBoundingClientRect(), onBandChange);
        }
      }}
      style={{
        position: "relative",
        width: 24,
        height: 96,
        display: "flex",
        justifyContent: "center",
        cursor: "ns-resize",
        touchAction: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          width: 4,
          borderRadius: 2,
          background: "rgba(255,255,255,0.12)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "50%",
          width: 12,
          height: 1,
          background: "rgba(255,255,255,0.28)",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: `${fillBottom}%`,
          height: `${fillHeight}%`,
          width: 4,
          borderRadius: 2,
          background: "#1db954",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: `calc(${pct}% - 6px)`,
          width: 12,
          height: 12,
          borderRadius: "50%",
          background: gain !== 0 ? "#1db954" : "#ffffff",
          boxShadow: "0 0 6px rgba(29,185,84,0.45)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

function renderSingleEqBand(
  idx: number,
  gain: number,
  onBandChange: EqBandFadersProps["onBandChange"]
) {
  const label = EQ_BAND_LABELS[idx];
  const gainText = gain > 0 ? `+${gain.toFixed(1)}` : gain.toFixed(1);

  return (
    <Focusable
      key={idx}
      flow-children="column"
      aria-label={label}
      style={{
        flex: 1,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
      }}
    >
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          color: gain !== 0 ? "#1db954" : "rgba(255,255,255,0.55)",
          lineHeight: 1.2,
        }}
      >
        {gainText}
      </span>
      <InteractiveRow
        onClick={() => onBandChange(idx, gain + 0.5)}
        aria-label={`Increase ${label}`}
        style={{
          width: "100%",
          justifyContent: "center",
          padding: "2px 0",
          minHeight: 20,
          fontSize: 11,
          fontWeight: 700,
        }}
      >
        +
      </InteractiveRow>
      {renderSliderTrack(idx, gain, label, onBandChange)}
      <InteractiveRow
        onClick={() => onBandChange(idx, gain - 0.5)}
        aria-label={`Decrease ${label}`}
        style={{
          width: "100%",
          justifyContent: "center",
          padding: "2px 0",
          minHeight: 20,
          fontSize: 11,
          fontWeight: 700,
        }}
      >
        -
      </InteractiveRow>
      <span style={{ fontSize: 10, fontWeight: 700, opacity: 0.75, lineHeight: 1.2 }}>
        {EQ_SHORT_LABELS[idx]}
      </span>
    </Focusable>
  );
}

export function renderEqBandFaders({ bands, onBandChange }: EqBandFadersProps) {
  return (
    <Focusable
      flow-children="horizontal"
      style={{
        display: "flex",
        gap: 4,
        padding: "10px 6px",
        borderRadius: 8,
        background: "rgba(0,0,0,0.22)",
      }}
    >
      {EQ_BAND_LABELS.map((_, idx) => renderSingleEqBand(idx, bands[idx] ?? 0, onBandChange))}
    </Focusable>
  );
}

/**
 * Thin JSX component wrapper over `renderEqBandFaders`.
 * `SettingsTab` and `GameEqModal` call `renderEqBandFaders` directly for shallow tree compatibility.
 */
export const EqBandFaders: FC<EqBandFadersProps> = (props) => renderEqBandFaders(props);
