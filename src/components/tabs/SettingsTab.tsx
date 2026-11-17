import { FC, useState, useEffect, useCallback, useRef } from "react";
import { DialogButton, Focusable, SliderField, ToggleField } from "@decky/ui";
import { callable, addEventListener, removeEventListener } from "@decky/api";
import { FaSlidersH, FaClock, FaPowerOff, FaPlug } from "react-icons/fa";
import { AudioSinkInfo, EqualizerPreset, ResilienceStatusInfo, StatusResponse, SleepTimerStatus } from "../../types";
import { InteractiveRow } from "../common/InteractiveRow";

const EQ_BAND_LABELS = [
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

const EQ_SHORT_LABELS = ["31", "62", "125", "250", "500", "1k", "2k", "4k", "8k", "16k"];

const EQ_PRESET_ROWS: Array<Array<{ id: EqualizerPreset; label: string }>> = [
  [
    { id: "flat", label: "Flat" },
    { id: "bass", label: "Bass Boost" },
    { id: "vocal", label: "Vocal Clarity" },
    { id: "gaming", label: "Gaming Balance" },
  ],
  [
    { id: "deck_speakers", label: "Deck Speakers" },
    { id: "late_night", label: "Late Night" },
    { id: "custom", label: "Custom" },
  ],
];

const EQ_PRESET_CURVES: Record<Exclude<EqualizerPreset, "custom">, number[]> = {
  flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  bass: [5, 6, 4.5, 2, 0, 0, 0.5, 1, 1.5, 1],
  vocal: [-2, -1.5, -1, 0, 1.5, 3.5, 4.5, 3.5, 1.5, 0],
  gaming: [2.5, 2, 0.5, -2.5, -3.5, -3, -1.5, 1, 2.5, 2],
  deck_speakers: [0, 1.5, 4, 2.5, -2, 0, 1.5, 3, 3.5, 2],
  late_night: [4, 3.5, 2, 0, -0.5, -1, -1.5, -1, 2, 3],
};

function normalizeEqBands(bands?: unknown): number[] {
  if (!Array.isArray(bands)) return [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  return Array.from({ length: 10 }, (_, idx) => {
    const raw = Number(bands[idx]);
    if (!Number.isFinite(raw)) return 0;
    return Math.min(12, Math.max(-12, Math.round(raw * 2) / 2));
  });
}

const backendSetSetting = callable<[string, unknown], { ok: boolean; settings?: any; error?: string }>("set_setting");
const backendSetEqBands = callable<[number[]], { ok: boolean; error?: string }>("set_eq_bands");
const backendGetAudioSinks = callable<[], { ok: boolean; sinks?: AudioSinkInfo[]; error?: string }>("get_audio_sinks");
const backendSetAudioSink = callable<[string], { ok: boolean; error?: string }>("set_audio_sink");
const backendGetSpotifyClientAuthStatus = callable<
  [],
  { ok: boolean; running: boolean; logged_in: boolean; auth_url?: string; error?: string }
>("get_spotify_client_auth_status");
const backendSetSleepTimer = callable<
  [number | null, boolean, boolean],
  { ok: boolean; sleep_timer?: SleepTimerStatus; error?: string }
>("set_sleep_timer");
const backendRestoreBookmark = callable<[], { ok: boolean; error?: string }>("restore_bookmark");
const backendDismissBookmark = callable<[], { ok: boolean }>("dismiss_bookmark");

export interface SettingsTabProps {
  status: StatusResponse | null;
  refreshStatus: () => void;
  showToast: (msg: string) => void;
}

export const SettingsTab: FC<SettingsTabProps> = ({ status, refreshStatus, showToast }) => {
  const [audioSinks, setAudioSinks] = useState<AudioSinkInfo[]>([]);
  const [officialClientStatus, setOfficialClientStatus] = useState<{ running: boolean; logged_in: boolean } | null>(null);
  const [localSettings, setLocalSettings] = useState<Record<string, any>>(() => status?.settings || {});
  const [liveResilienceStatus, setLiveResilienceStatus] = useState<ResilienceStatusInfo | null>(
    () => status?.resilience_status ?? null
  );
  const [localEqPreset, setLocalEqPreset] = useState<EqualizerPreset>(
    () => (status?.settings?.eq_preset as EqualizerPreset) || "flat"
  );
  const [localCustomBands, setLocalCustomBands] = useState<number[]>(() =>
    normalizeEqBands(status?.settings?.eq_custom_bands)
  );
  const [localBands, setLocalBands] = useState<number[]>(() => {
    const preset = (status?.settings?.eq_preset as EqualizerPreset) || "flat";
    if (preset === "custom") {
      return normalizeEqBands(status?.settings?.eq_custom_bands);
    }
    return [...(EQ_PRESET_CURVES[preset] || EQ_PRESET_CURVES.flat)];
  });
  const [steamMenuPos, setSteamMenuPos] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("DECKIFY_MENU_POSITION");
      return saved ? parseInt(saved, 10) : 5;
    } catch {
      return 5;
    }
  });

  const loadAudioSinks = useCallback(async () => {
    try {
      const res = await backendGetAudioSinks();
      if (res.ok && res.sinks) setAudioSinks(res.sinks);
    } catch {}
  }, []);

  const checkOfficialClient = useCallback(async () => {
    try {
      const res = await backendGetSpotifyClientAuthStatus();
      if (res.ok) {
        setOfficialClientStatus({ running: res.running, logged_in: res.logged_in });
      }
    } catch {}
  }, []);

  useEffect(() => {
    loadAudioSinks();
    checkOfficialClient();
  }, [loadAudioSinks, checkOfficialClient]);

  const eqDirtyUntilRef = useRef<number>(0);
  const lastSyncedEqRef = useRef<string>("");
  const localBandsRef = useRef<number[]>(localBands);
  localBandsRef.current = localBands;

  const handleBandChange = useCallback(async (idx: number, rawVal: number) => {
    const clamped = Math.min(12, Math.max(-12, Math.round(rawVal * 2) / 2));
    const nextBands = localBandsRef.current.map((b, i) => (i === idx ? clamped : b));
    localBandsRef.current = nextBands;
    eqDirtyUntilRef.current = Date.now() + 2500;
    lastSyncedEqRef.current = `custom:${nextBands.join(",")}`;
    setLocalBands(nextBands);
    setLocalCustomBands(nextBands);
    setLocalEqPreset("custom");
    const res = await backendSetEqBands(nextBands);
    if (res && res.ok === false) {
      showToast("Equalizer engine unavailable — routed directly to hardware output");
    }
  }, [showToast]);

  const handleFaderPointer = useCallback((idx: number, clientY: number, rect: DOMRect) => {
    if (rect.height <= 0) return;
    const ratio = Math.min(1, Math.max(0, (rect.bottom - clientY) / rect.height));
    const rawDb = -12 + ratio * 24;
    void handleBandChange(idx, rawDb);
  }, [handleBandChange]);

  useEffect(() => {
    if (status?.settings) {
      setLocalSettings((prev) => ({ ...prev, ...status.settings }));
      const nextPreset = (status.settings.eq_preset as EqualizerPreset) || "flat";
      const nextCustom = normalizeEqBands(status.settings.eq_custom_bands);
      const sig = `${nextPreset}:${nextCustom.join(",")}`;
      if (Date.now() >= eqDirtyUntilRef.current && sig !== lastSyncedEqRef.current) {
        lastSyncedEqRef.current = sig;
        setLocalEqPreset(nextPreset);
        setLocalCustomBands(nextCustom);
        const resolved =
          nextPreset === "custom"
            ? nextCustom
            : [...(EQ_PRESET_CURVES[nextPreset] || EQ_PRESET_CURVES.flat)];
        localBandsRef.current = resolved;
        setLocalBands(resolved);
      }
    }
  }, [status?.settings]);

  useEffect(() => {
    const handler = (st: any) => {
      if (st && typeof st === "object") {
        setLocalSettings((prev) => ({ ...prev, ...st }));
      }
    };
    const listener = addEventListener<[any]>("settings_changed", handler);
    return () => {
      removeEventListener("settings_changed", listener);
    };
  }, []);

  useEffect(() => {
    const handler = () => {
      refreshStatus();
      loadAudioSinks();
    };
    const listener = addEventListener<[any]>("dock_audio_switched", handler);
    return () => {
      removeEventListener("dock_audio_switched", listener);
    };
  }, [refreshStatus, loadAudioSinks]);

  useEffect(() => {
    if (status?.resilience_status !== undefined) {
      setLiveResilienceStatus(status.resilience_status ?? null);
    }
  }, [status?.resilience_status]);

  useEffect(() => {
    const handler = (data: any) => {
      if (data && typeof data === "object") {
        setLiveResilienceStatus(data as ResilienceStatusInfo);
      }
      refreshStatus();
    };
    const listener = addEventListener<[any]>("resilience_status", handler);
    return () => {
      removeEventListener("resilience_status", listener);
    };
  }, [refreshStatus]);

  const updateSetting = useCallback(
    async (key: string, value: unknown) => {
      setLocalSettings((prev) => ({ ...prev, [key]: value }));
      await backendSetSetting(key, value);
      refreshStatus();
    },
    [refreshStatus]
  );

  const audioBackend = status?.settings?.audio_backend || "librespot";
  const audioQuality = status?.settings?.audio_quality || "320";

  return (
    <div style={{ maxWidth: 640 }}>
      <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>Settings & Engine Features</h2>

      {/* Backend & Quality */}
      <div style={{ marginBottom: 20, padding: 14, borderRadius: 10, background: "rgba(255,255,255,0.04)" }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1db954", marginBottom: 8 }}>Playback Engine</h3>
        <Focusable flow-children="horizontal" style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          <InteractiveRow
            onClick={async () => {
              await backendSetSetting("audio_backend", "librespot");
              showToast("Switched to Librespot");
              refreshStatus();
            }}
            active={audioBackend === "librespot"}
            style={{ flex: 1, justifyContent: "center", padding: "10px", fontWeight: 700 }}
          >
            Librespot (Built-in)
          </InteractiveRow>

          <InteractiveRow
            onClick={async () => {
              await backendSetSetting("audio_backend", "spotify_client");
              showToast("Switched to Official Spotify Client");
              refreshStatus();
              checkOfficialClient();
            }}
            active={audioBackend === "spotify_client"}
            style={{ flex: 1, justifyContent: "center", padding: "10px", fontWeight: 700 }}
          >
            Official Spotify Client
          </InteractiveRow>
        </Focusable>

        {/* Official Spotify Client Connection Status */}
        {audioBackend === "spotify_client" && (
          <div
            style={{
              marginBottom: 14,
              padding: 10,
              borderRadius: 8,
              background: "rgba(255,255,255,0.06)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div style={{ fontSize: 12, fontWeight: 700 }}>Official Client Link</div>
              <div style={{ fontSize: 11, opacity: 0.6 }}>
                {officialClientStatus?.logged_in
                  ? "Connected & Logged In via Spotify Connect"
                  : officialClientStatus?.running
                  ? "Running (Awaiting Login/Zeroconf link)"
                  : "Not detected / starting"}
              </div>
            </div>
            <InteractiveRow
              onClick={checkOfficialClient}
              style={{ padding: "5px 12px", fontSize: 11, background: "#1db954", color: "#000", fontWeight: 700 }}
            >
              Check Status
            </InteractiveRow>
          </div>
        )}

        <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1db954", marginBottom: 8 }}>Audio Quality</h3>
        <Focusable flow-children="horizontal" style={{ display: "flex", gap: 8 }}>
          {["96", "160", "320", "lossless"].map((q) => {
            const active = audioQuality === q;
            const disabled = q === "lossless" && audioBackend !== "spotify_client";
            return (
              <InteractiveRow
                key={q}
                onClick={async () => {
                  if (disabled) return;
                  await backendSetSetting("audio_quality", q);
                  showToast(`Quality set to ${q === "lossless" ? "FLAC Lossless" : q + " kbps"}`);
                  refreshStatus();
                }}
                active={active}
                style={{
                  flex: 1,
                  justifyContent: "center",
                  padding: "8px",
                  fontWeight: 700,
                  fontSize: 12,
                  opacity: disabled ? 0.35 : 1,
                }}
              >
                {q === "lossless" ? "FLAC Lossless" : `${q}k`}
              </InteractiveRow>
            );
          })}
        </Focusable>
      </div>

      {/* Advanced Playback Settings (Bit-Perfect, Gapless, Normalisation, Autoplay) */}
      <div style={{ marginBottom: 20, padding: 14, borderRadius: 10, background: "rgba(255,255,255,0.04)" }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1db954", marginBottom: 10 }}>
          Playback & Audiophile Features
        </h3>

        {/* Bit-Perfect Clock */}
        <InteractiveRow
          onClick={async () => {
            const cur = status?.settings?.bit_perfect_clock ?? true;
            await backendSetSetting("bit_perfect_clock", !cur);
            showToast(!cur ? "Bit-Perfect Clock enabled" : "Bit-Perfect Clock disabled");
            refreshStatus();
          }}
          active={status?.settings?.bit_perfect_clock ?? true}
          style={{ justifyContent: "space-between", marginBottom: 10 }}
        >
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Bit-Perfect Output Clock</div>
            <div style={{ fontSize: 11, opacity: 0.6 }}>Direct sample rate sync (44.1/48kHz), prevents ALSA jitter</div>
          </div>
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: (status?.settings?.bit_perfect_clock ?? true) ? "#1db954" : "#888",
            }}
          >
            {(status?.settings?.bit_perfect_clock ?? true) ? "ON" : "OFF"}
          </span>
        </InteractiveRow>

        {/* Gapless Playback */}
        <InteractiveRow
          onClick={async () => {
            const cur = status?.settings?.gapless ?? true;
            await backendSetSetting("gapless", !cur);
            showToast(!cur ? "Gapless playback enabled" : "Gapless playback disabled");
            refreshStatus();
          }}
          active={status?.settings?.gapless ?? true}
          style={{ justifyContent: "space-between", marginBottom: 10 }}
        >
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Gapless Playback</div>
            <div style={{ fontSize: 11, opacity: 0.6 }}>Seamless transition between consecutive album tracks</div>
          </div>
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: (status?.settings?.gapless ?? true) ? "#1db954" : "#888",
            }}
          >
            {(status?.settings?.gapless ?? true) ? "ON" : "OFF"}
          </span>
        </InteractiveRow>

        {/* Autoplay */}
        <InteractiveRow
          onClick={async () => {
            const cur = status?.settings?.autoplay ?? true;
            await backendSetSetting("autoplay", !cur);
            showToast(!cur ? "Autoplay enabled" : "Autoplay disabled");
            refreshStatus();
          }}
          active={status?.settings?.autoplay ?? true}
          style={{ justifyContent: "space-between", marginBottom: 10 }}
        >
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Autoplay Similar Music</div>
            <div style={{ fontSize: 11, opacity: 0.6 }}>Keep music streaming automatically when queue finishes</div>
          </div>
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: (status?.settings?.autoplay ?? true) ? "#1db954" : "#888",
            }}
          >
            {(status?.settings?.autoplay ?? true) ? "ON" : "OFF"}
          </span>
        </InteractiveRow>

        {/* Volume Normalisation */}
        <InteractiveRow
          onClick={async () => {
            const cur = status?.settings?.normalisation ?? true;
            await backendSetSetting("normalisation", !cur);
            showToast(!cur ? "Volume Normalisation enabled" : "Volume Normalisation disabled");
            refreshStatus();
          }}
          active={status?.settings?.normalisation ?? true}
          style={{
            justifyContent: "space-between",
            marginBottom: (status?.settings?.normalisation ?? true) ? 8 : 0,
          }}
        >
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Volume Normalisation</div>
            <div style={{ fontSize: 11, opacity: 0.6 }}>Equalize track volumes (ReplayGain)</div>
          </div>
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: (status?.settings?.normalisation ?? true) ? "#1db954" : "#888",
            }}
          >
            {(status?.settings?.normalisation ?? true) ? "ON" : "OFF"}
          </span>
        </InteractiveRow>

        {(status?.settings?.normalisation ?? true) && (
          <div style={{ paddingLeft: 12, borderLeft: "2px solid rgba(29, 185, 84, 0.4)", marginTop: 6 }}>
            <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 6 }}>Normalisation Pre-Gain:</div>
            <Focusable flow-children="horizontal" style={{ display: "flex", gap: 6 }}>
              {[-5.0, 0.0, 3.0, 6.0].map((gain) => (
                <InteractiveRow
                  key={gain}
                  onClick={async () => {
                    await backendSetSetting("normalisation_pregain", gain);
                    showToast(`Pre-gain: ${gain > 0 ? "+" : ""}${gain} dB`);
                    refreshStatus();
                  }}
                  active={(status?.settings?.normalisation_pregain ?? 0.0) === gain}
                  style={{ flex: 1, justifyContent: "center", fontSize: 11, fontWeight: 700, padding: "6px" }}
                >
                  {gain > 0 ? `+${gain}` : gain} dB
                </InteractiveRow>
              ))}
            </Focusable>
          </div>
        )}
      </div>

      {/* Equalizer & Audio Presets */}
      <div style={{ marginBottom: 20, padding: 14, borderRadius: 10, background: "rgba(255,255,255,0.04)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1db954", margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
            <FaSlidersH /> Equalizer & Audio Presets
          </h3>
          {localEqPreset === "flat" ? (
            <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.6 }}>Bypass (0.0 dB)</span>
          ) : (
            <span style={{ fontSize: 12, fontWeight: 700, color: "#1db954" }}>
              {`Preamp: ${(Math.max(0, ...localBands) > 0 ? -Math.max(0, ...localBands) : 0).toFixed(1)} dB`}
            </span>
          )}
        </div>
        {EQ_PRESET_ROWS.map((row, rowIdx) => (
          <Focusable
            key={rowIdx}
            flow-children="horizontal"
            style={{ display: "flex", gap: 8, marginBottom: rowIdx === 0 ? 8 : 16 }}
          >
            {row.map((eq) => (
              <InteractiveRow
                key={eq.id}
                onClick={async () => {
                  eqDirtyUntilRef.current = Date.now() + 2500;
                  setLocalEqPreset(eq.id);
                  const resolved =
                    eq.id === "custom"
                      ? [...localCustomBands]
                      : [...EQ_PRESET_CURVES[eq.id]];
                  localBandsRef.current = resolved;
                  setLocalBands(resolved);
                  lastSyncedEqRef.current = `${eq.id}:${localCustomBands.join(",")}`;
                  const res = await backendSetSetting("eq_preset", eq.id);
                  if (res && res.ok === false) {
                    showToast("Equalizer engine unavailable — routed directly to hardware output");
                  } else {
                    showToast(`Audio preset: ${eq.label}`);
                    refreshStatus();
                  }
                }}
                active={localEqPreset === eq.id}
                style={{ flex: 1, justifyContent: "center", fontSize: 12, fontWeight: 700 }}
              >
                {eq.label}
              </InteractiveRow>
            ))}
          </Focusable>
        ))}
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
          {EQ_BAND_LABELS.map((label, idx) => {
            const gain = localBands[idx] ?? 0;
            const pct = ((gain + 12) / 24) * 100;
            const fillBottom = gain >= 0 ? 50 : pct;
            const fillHeight = Math.abs(pct - 50);
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
                  onClick={() => handleBandChange(idx, gain + 0.5)}
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
                <div
                  role="slider"
                  aria-label={label}
                  aria-valuemin={-12}
                  aria-valuemax={12}
                  aria-valuenow={gain}
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture?.(e.pointerId);
                    handleFaderPointer(idx, e.clientY, e.currentTarget.getBoundingClientRect());
                  }}
                  onPointerMove={(e) => {
                    if (e.buttons === 1) {
                      handleFaderPointer(idx, e.clientY, e.currentTarget.getBoundingClientRect());
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
                <InteractiveRow
                  onClick={() => handleBandChange(idx, gain - 0.5)}
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
                <span style={{ fontSize: 10, fontWeight: 600, opacity: 0.75, lineHeight: 1.2 }}>
                  {EQ_SHORT_LABELS[idx]}
                </span>
              </Focusable>
            );
          })}
        </Focusable>
      </div>

      {/* PipeWire Audio Output Sink Selector */}
      {audioSinks.length > 0 && (
        <div style={{ marginBottom: 20, padding: 14, borderRadius: 10, background: "rgba(255,255,255,0.04)" }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1db954", marginBottom: 8 }}>
            Audio Output Sink (PipeWire)
          </h3>
          <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {audioSinks.map((s) => {
              const isActive = s.is_active ?? s.is_default;
              return (
                <InteractiveRow
                  key={s.name}
                  onClick={async () => {
                    const res = await backendSetAudioSink(s.name);
                    if (res?.ok !== false) {
                      showToast(`Output set to ${s.description || s.name}`);
                    } else {
                      showToast(res?.error || "Failed to switch audio output");
                    }
                    await loadAudioSinks();
                    await refreshStatus();
                  }}
                  active={isActive}
                  style={{ justifyContent: "space-between" }}
                >
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{s.description || s.name}</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {s.is_default && <span style={{ fontSize: 11, opacity: 0.6, fontWeight: 600 }}>Default</span>}
                    {isActive && <span style={{ fontSize: 11, color: "#1db954", fontWeight: 700 }}>Active</span>}
                  </span>
                </InteractiveRow>
              );
            })}
          </Focusable>
        </div>
      )}

      {/* Docked Audio-Switching */}
      {(() => {
        const dockAutoSwitchEnabled = Boolean(localSettings.dock_auto_switch_enabled ?? false);
        const dockRespectBluetooth = localSettings.dock_respect_bluetooth ?? true;
        const dockPauseOnUndock = Boolean(localSettings.dock_pause_on_undock ?? false);
        const dockToastEnabled = localSettings.dock_toast_enabled ?? true;
        const dockTargetSink = (localSettings.dock_target_sink as string) || "auto";
        const dockStatus = status?.dock_status;
        const hasExternalDockSink = audioSinks.some(
          (s) =>
            s.name.startsWith("alsa_output.usb-") ||
            s.name.includes(".usb-") ||
            (s.name.startsWith("alsa_output.pci-") && s.name.toLowerCase().includes("hdmi"))
        );

        let badgeLabel = "Monitoring";
        let badgeStyle: Record<string, any> = { opacity: 0.7 };
        if (!dockAutoSwitchEnabled) {
          badgeLabel = "Disabled";
          badgeStyle = { opacity: 0.6 };
        } else if (dockStatus?.status === "docked") {
          badgeLabel = `Docked: ${dockStatus.active_sink_label || dockStatus.active_sink || "External"}`;
          badgeStyle = { color: "#1db954" };
        } else if (dockStatus?.status === "bluetooth_held") {
          badgeLabel = "Bluetooth Held";
          badgeStyle = { opacity: 0.8 };
        } else if (dockStatus?.status === "manual_override") {
          badgeLabel = "Manual Override";
          badgeStyle = { opacity: 0.8 };
        }

        return (
          <div style={{ marginBottom: 20, padding: 14, borderRadius: 10, background: "rgba(255,255,255,0.04)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1db954", display: "flex", alignItems: "center", gap: 8, margin: 0 }}>
                <FaPlug /> Docked Audio-Switching
              </h3>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  ...badgeStyle,
                }}
              >
                {badgeLabel}
              </span>
            </div>

            <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 16 }}>
              <ToggleField
                label="Auto-Switch on Dock"
                description="Automatically route Deckify to a USB-DAC or HDMI sink on startup and hotplug (with Bit-Perfect Clock)."
                checked={dockAutoSwitchEnabled}
                onChange={(v: boolean) => {
                  updateSetting("dock_auto_switch_enabled", v);
                  showToast(v ? "Docked audio-switching enabled" : "Docked audio-switching disabled");
                }}
              />
              <ToggleField
                label="Respect Bluetooth Headphones"
                description="Keep audio on active Bluetooth headphones when docking; switches to dock if Bluetooth disconnects."
                checked={dockRespectBluetooth}
                onChange={(v: boolean) => updateSetting("dock_respect_bluetooth", v)}
              />
              <ToggleField
                label="Pause on Undock"
                description="Pause Spotify playback automatically when the designated dock or DAC is disconnected."
                checked={dockPauseOnUndock}
                onChange={(v: boolean) => updateSetting("dock_pause_on_undock", v)}
              />
              <ToggleField
                label="Dock Switch Toasts"
                description="Show a brief notification when Deckify switches audio sinks on dock or undock."
                checked={dockToastEnabled}
                onChange={(v: boolean) => updateSetting("dock_toast_enabled", v)}
              />
            </Focusable>

            <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.8, marginBottom: 8 }}>
              Target Dock / DAC Sink
            </div>
            <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <InteractiveRow
                onClick={() => {
                  updateSetting("dock_target_sink", "auto");
                  showToast("Dock target: Auto (USB-DAC / HDMI)");
                }}
                active={dockTargetSink === "auto"}
                style={{ justifyContent: "space-between", gap: 8 }}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  Auto (USB-DAC / HDMI)
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  <span style={{ fontSize: 12, opacity: 0.6 }}>USB-DAC &gt; HDMI</span>
                  {dockTargetSink === "auto" && (
                    <span style={{ fontSize: 12, color: "#1db954", fontWeight: 700 }}>Active</span>
                  )}
                </span>
              </InteractiveRow>
              {audioSinks.map((s) => (
                <InteractiveRow
                  key={s.name}
                  onClick={() => {
                    updateSetting("dock_target_sink", s.name);
                    showToast(`Dock target: ${s.description || s.name}`);
                  }}
                  active={dockTargetSink === s.name}
                  style={{ justifyContent: "space-between", gap: 8 }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {s.description || s.name}
                  </span>
                  {dockTargetSink === s.name && (
                    <span style={{ fontSize: 12, color: "#1db954", fontWeight: 700, flexShrink: 0 }}>
                      Active
                    </span>
                  )}
                </InteractiveRow>
              ))}
            </Focusable>

            {!hasExternalDockSink && (
              <div style={{ marginTop: 8, opacity: 0.7 }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                  No External Dock / DAC Sinks Detected
                </div>
                <div style={{ fontSize: 14, lineHeight: 1.5 }}>
                  Connect a USB-DAC or HDMI dock/display to route Deckify automatically, or keep Auto (USB-DAC / HDMI) selected for hotplug detection.
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Playback Resilience */}
      {(() => {
        const autoResume = Boolean(
          localSettings.resilience_auto_resume ?? status?.settings?.resilience_auto_resume ?? true
        );
        const neverExpires = Boolean(
          localSettings.resilience_bookmark_never_expires ??
            status?.settings?.resilience_bookmark_never_expires ??
            false
        );
        const rawExpiryHours = Number(
          localSettings.resilience_bookmark_expiry_hours ??
            status?.settings?.resilience_bookmark_expiry_hours ??
            12
        );
        const expiryHours = Number.isFinite(rawExpiryHours)
          ? Math.min(24, Math.max(1, Math.round(rawExpiryHours)))
          : 12;
        const toastEnabled = Boolean(
          localSettings.resilience_toast_enabled ?? status?.settings?.resilience_toast_enabled ?? true
        );
        const promptHeldEnabled = Boolean(
          localSettings.resilience_prompt_held_enabled ??
            status?.settings?.resilience_prompt_held_enabled ??
            true
        );
        const resilienceStatus = liveResilienceStatus ?? status?.resilience_status ?? null;
        const isOneventLive =
          Boolean(resilienceStatus?.onevent_healthy) && resilienceStatus?.polling_mode === "onevent";
        const badgeLabel = isOneventLive ? "--onevent Live (20s poll)" : "Fallback Poll (3s)";
        const badgeStyle: Record<string, any> = isOneventLive
          ? { color: "#1db954" }
          : { opacity: 0.7 };
        const heldBookmark = resilienceStatus?.held_bookmark ?? null;
        const heldReasonLabel =
          resilienceStatus?.held_reason === "remote_active"
            ? "Yielded to another active device"
            : "Bookmark expired";

        return (
          <div style={{ marginBottom: 20, padding: 14, borderRadius: 10, background: "rgba(255,255,255,0.04)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1db954", display: "flex", alignItems: "center", gap: 8, margin: 0 }}>
                Playback Resilience
              </h3>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  ...badgeStyle,
                }}
              >
                {badgeLabel}
              </span>
            </div>

            <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <ToggleField
                label="Auto-Resume on Wake / Wi-Fi"
                description="Automatically restore active playback after Steam Deck sleep or Wi-Fi recovery."
                checked={autoResume}
                onChange={(v: boolean) => {
                  void updateSetting("resilience_auto_resume", v);
                  showToast(v ? "Auto-resume enabled" : "Auto-resume disabled");
                }}
              />
              <ToggleField
                label="Never Expire Bookmark"
                description="Keep saved session bookmarks indefinitely regardless of how long the Deck slept."
                checked={neverExpires}
                onChange={(v: boolean) => {
                  void updateSetting("resilience_bookmark_never_expires", v);
                }}
              />
              {!neverExpires && (
                <SliderField
                  label="Bookmark Expiry (Hours)"
                  min={1}
                  max={24}
                  step={1}
                  showValue
                  value={expiryHours}
                  onChange={async (val: number) => {
                    const clamped = Math.min(24, Math.max(1, Math.round(val)));
                    await updateSetting("resilience_bookmark_expiry_hours", clamped);
                  }}
                />
              )}
              <ToggleField
                label="Restore Toast Notifications"
                description="Show a brief notification when Deckify automatically resumes a saved session."
                checked={toastEnabled}
                onChange={(v: boolean) => {
                  void updateSetting("resilience_toast_enabled", v);
                }}
              />
              <ToggleField
                label="Prompt Held Bookmark in QAM"
                description="Show a compact Resume Bookmark button in the Quick Access Menu when a bookmark is held."
                checked={promptHeldEnabled}
                onChange={(v: boolean) => {
                  void updateSetting("resilience_prompt_held_enabled", v);
                }}
              />
            </Focusable>

            {heldBookmark && (
              <div
                style={{
                  marginTop: 12,
                  padding: 10,
                  borderRadius: 8,
                  background: "rgba(29, 185, 84, 0.08)",
                  border: "1px solid rgba(29, 185, 84, 0.25)",
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: "#1db954", marginBottom: 4 }}>
                  Held Session Bookmark:{" "}
                  {heldBookmark.track_name
                    ? `${heldBookmark.track_name}${heldBookmark.artist ? ` — ${heldBookmark.artist}` : ""}`
                    : heldBookmark.track_uri}
                </div>
                <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 8 }}>
                  {heldReasonLabel}
                </div>
                <Focusable flow-children="horizontal" style={{ display: "flex", gap: 8 }}>
                  <DialogButton
                    style={{ minWidth: "auto", padding: "6px 12px", fontSize: 12, color: "#1db954" }}
                    onClick={async () => {
                      const res = await backendRestoreBookmark();
                      if (res?.ok) {
                        setLiveResilienceStatus((prev) =>
                          prev ? { ...prev, held_bookmark: null, held_reason: null } : prev
                        );
                        showToast("Bookmark restored");
                        refreshStatus();
                      } else {
                        showToast(res?.error || "Failed to restore bookmark");
                      }
                    }}
                  >
                    Resume Bookmark
                  </DialogButton>
                  <DialogButton
                    style={{ minWidth: "auto", padding: "6px 12px", fontSize: 12 }}
                    onClick={async () => {
                      await backendDismissBookmark();
                      setLiveResilienceStatus((prev) =>
                        prev ? { ...prev, held_bookmark: null, held_reason: null } : prev
                      );
                      showToast("Bookmark dismissed");
                      refreshStatus();
                    }}
                  >
                    Dismiss
                  </DialogButton>
                </Focusable>
              </div>
            )}
          </div>
        );
      })()}

      {/* Backend Sleep Timer */}
      <div style={{ marginBottom: 20, padding: 14, borderRadius: 10, background: "rgba(255,255,255,0.04)" }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1db954", marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
          <FaClock /> Backend Sleep Timer
        </h3>
        <p style={{ fontSize: 12, opacity: 0.6, marginBottom: 10 }}>
          Timer runs reliably in Python background even if Steam Deck goes into sleep/standby.
          {status?.sleep_timer?.active && (
            <b style={{ color: "#1db954", marginLeft: 6 }}>
              {status.sleep_timer.fading
                ? "Fading out..."
                : `Remaining: ${Math.ceil((status.sleep_timer.remaining_seconds || 0) / 60)} min`}
            </b>
          )}
        </p>
        <Focusable flow-children="horizontal" style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          {[15, 30, 45, 60].map((mins) => (
            <InteractiveRow
              key={mins}
              onClick={async () => {
                await backendSetSleepTimer(mins, status?.sleep_timer?.shutdown_on_finish || false, false);
                showToast(`Sleep timer set to ${mins} minutes`);
                refreshStatus();
              }}
              style={{ flex: 1, justifyContent: "center", fontSize: 12, fontWeight: 700 }}
            >
              {mins}m
            </InteractiveRow>
          ))}
          <InteractiveRow
            onClick={async () => {
              await backendSetSleepTimer(null, false, true);
              showToast("Sleep timer: End of track");
              refreshStatus();
            }}
            style={{ padding: "8px 12px", fontSize: 11, fontWeight: 700 }}
          >
            End of Track
          </InteractiveRow>
          <InteractiveRow
            onClick={async () => {
              await backendSetSleepTimer(null, false, false);
              showToast("Sleep timer cancelled");
              refreshStatus();
            }}
            style={{ padding: "8px 12px", fontSize: 12 }}
          >
            Off
          </InteractiveRow>
        </Focusable>

        {/* Shutdown deck toggle */}
        <InteractiveRow
          onClick={async () => {
            const curShutdown = status?.sleep_timer?.shutdown_on_finish || false;
            const remaining = status?.sleep_timer?.active ? Math.ceil((status.sleep_timer.remaining_seconds || 0) / 60) : 30;
            await backendSetSleepTimer(remaining, !curShutdown, false);
            showToast(!curShutdown ? "Power off Deck enabled" : "Power off Deck disabled");
            refreshStatus();
          }}
          active={status?.sleep_timer?.shutdown_on_finish}
          style={{ justifyContent: "space-between", marginTop: 8 }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <FaPowerOff color={status?.sleep_timer?.shutdown_on_finish ? "#1db954" : "#888"} />
            <span style={{ fontSize: 13, fontWeight: 600 }}>Power off Steam Deck when timer finishes</span>
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: status?.sleep_timer?.shutdown_on_finish ? "#1db954" : "#888" }}>
            {status?.sleep_timer?.shutdown_on_finish ? "ON" : "OFF"}
          </span>
        </InteractiveRow>

        <div style={{ marginTop: 10 }}>
          <ToggleField
            label="Gentle Fade Out"
            description="Smoothly fade playback volume to 0% before pausing"
            checked={localSettings.sleep_timer_fade_enabled ?? status?.settings?.sleep_timer_fade_enabled ?? true}
            onChange={async (val: boolean) => {
              await updateSetting("sleep_timer_fade_enabled", val);
              showToast(val ? "Gentle fade out enabled" : "Gentle fade out disabled");
            }}
          />
          {(localSettings.sleep_timer_fade_enabled ?? status?.settings?.sleep_timer_fade_enabled ?? true) && (
            <SliderField
              label="Fade Out Duration (Seconds)"
              min={5}
              max={120}
              step={5}
              showValue
              value={localSettings.sleep_timer_fade_duration ?? status?.settings?.sleep_timer_fade_duration ?? 30}
              onChange={async (val: number) => {
                const clamped = Math.min(120, Math.max(5, Math.round(val)));
                await updateSetting("sleep_timer_fade_duration", clamped);
              }}
            />
          )}
        </div>
      </div>

      {/* Smooth Audio Ducking Engine */}
      <div style={{ marginBottom: 20, padding: 14, borderRadius: 10, background: "rgba(255,255,255,0.04)" }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1db954", marginBottom: 6 }}>
          Smooth Audio Ducking Engine
        </h3>
        <p style={{ fontSize: 12, opacity: 0.6, marginBottom: 12 }}>
          Fade music volume smoothly when games launch or during voice chat (Discord, Steam Voice).
        </p>
        <InteractiveRow
          onClick={async () => {
            const cur = status?.settings?.auto_ducking ?? true;
            await backendSetSetting("auto_ducking", !cur);
            showToast(!cur ? "Audio Ducking enabled" : "Audio Ducking disabled");
            refreshStatus();
          }}
          active={status?.settings?.auto_ducking ?? true}
          style={{ justifyContent: "space-between", marginBottom: (status?.settings?.auto_ducking ?? true) ? 14 : 0 }}
        >
          <span style={{ fontSize: 13, fontWeight: 600 }}>Game Audio Ducking</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: (status?.settings?.auto_ducking ?? true) ? "#1db954" : "#888" }}>
            {(status?.settings?.auto_ducking ?? true) ? "ON" : "OFF"}
          </span>
        </InteractiveRow>
        {(status?.settings?.auto_ducking ?? true) && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Attenuation Mode: Proportional (-50%) vs Fixed Level (25%) */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.8, marginBottom: 6 }}>
                Attenuation Mode
              </div>
              <Focusable flow-children="horizontal" style={{ display: "flex", gap: 8 }}>
                {[
                  { mode: "proportional", label: "Proportional (-50%)" },
                  { mode: "fixed", label: "Fixed Level (25%)" },
                ].map(({ mode, label }) => {
                  const currentMode = status?.settings?.ducking_mode || "proportional";
                  const isActive = currentMode === mode;
                  return (
                    <InteractiveRow
                      key={mode}
                      onClick={async () => {
                        await backendSetSetting("ducking_mode", mode);
                        showToast(`Ducking mode: ${label}`);
                        refreshStatus();
                      }}
                      active={isActive}
                      style={{ flex: 1, justifyContent: "center", fontSize: 12, fontWeight: 700 }}
                    >
                      {label}
                    </InteractiveRow>
                  );
                })}
              </Focusable>
              {(status?.settings?.ducking_mode || "proportional") === "proportional" ? (
                <div style={{ marginTop: 10 }}>
                  <SliderField
                    label="Attenuation Percentage"
                    min={10}
                    max={90}
                    step={5}
                    showValue
                    value={localSettings.ducking_proportional_pct ?? status?.settings?.ducking_proportional_pct ?? 50}
                    onChange={async (val: number) => {
                      const clamped = Math.min(90, Math.max(10, Math.round(val)));
                      await updateSetting("ducking_proportional_pct", clamped);
                    }}
                  />
                </div>
              ) : (
                <div style={{ marginTop: 10 }}>
                  <SliderField
                    label="Fixed Target Volume (%)"
                    min={0}
                    max={100}
                    step={5}
                    showValue
                    value={localSettings.auto_ducking_volume ?? status?.settings?.auto_ducking_volume ?? 30}
                    onChange={async (val: number) => {
                      const clamped = Math.min(100, Math.max(0, Math.round(val)));
                      await updateSetting("auto_ducking_volume", clamped);
                    }}
                  />
                </div>
              )}
            </div>

            {/* Fade Down Speed (0.5s - 3.0s) */}
            <SliderField
              label="Fade Down Speed (s)"
              min={0.5}
              max={3.0}
              step={0.1}
              showValue
              value={localSettings.duck_fade_down_duration ?? status?.settings?.duck_fade_down_duration ?? 1.0}
              onChange={async (val: number) => {
                const clamped = Math.min(3.0, Math.max(0.5, Math.round(val * 10) / 10));
                await updateSetting("duck_fade_down_duration", clamped);
              }}
            />

            {/* Fade Up Speed (0.5s - 3.0s) */}
            <SliderField
              label="Fade Up Speed (s)"
              min={0.5}
              max={3.0}
              step={0.1}
              showValue
              value={localSettings.duck_fade_up_duration ?? status?.settings?.duck_fade_up_duration ?? 1.5}
              onChange={async (val: number) => {
                const clamped = Math.min(3.0, Math.max(0.5, Math.round(val * 10) / 10));
                await updateSetting("duck_fade_up_duration", clamped);
              }}
            />

            {/* Voice Chat Ducking Toggle */}
            <InteractiveRow
              onClick={async () => {
                const cur = status?.settings?.voice_ducking_enabled ?? true;
                await backendSetSetting("voice_ducking_enabled", !cur);
                showToast(!cur ? "Voice Chat Ducking enabled" : "Voice Chat Ducking disabled");
                refreshStatus();
              }}
              active={status?.settings?.voice_ducking_enabled ?? true}
              style={{ justifyContent: "space-between" }}
            >
              <span style={{ fontSize: 13, fontWeight: 600 }}>Voice Chat Ducking (Discord / Steam Voice)</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: (status?.settings?.voice_ducking_enabled ?? true) ? "#1db954" : "#888" }}>
                {(status?.settings?.voice_ducking_enabled ?? true) ? "ON" : "OFF"}
              </span>
            </InteractiveRow>

            {/* Silence Hold Delay (0.5s - 3.0s) */}
            {(status?.settings?.voice_ducking_enabled ?? true) && (
              <SliderField
                label="Silence Hold Delay (s)"
                min={0.5}
                max={3.0}
                step={0.1}
                showValue
                value={localSettings.voice_ducking_hold_delay ?? status?.settings?.voice_ducking_hold_delay ?? 1.2}
                onChange={async (val: number) => {
                  const clamped = Math.min(3.0, Math.max(0.5, Math.round(val * 10) / 10));
                  await updateSetting("voice_ducking_hold_delay", clamped);
                }}
              />
            )}
          </div>
        )}
      </div>

      {/* In-Game Mini Overlay HUD */}
      <div style={{ marginBottom: 20, padding: 14, borderRadius: 10, background: "rgba(255,255,255,0.04)" }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1db954", marginBottom: 6 }}>
          In-Game Mini Overlay (HUD)
        </h3>
        <p style={{ fontSize: 12, opacity: 0.6, marginBottom: 10 }}>
          Display a compact Now Playing overlay badge while gaming.
        </p>
        <InteractiveRow
          onClick={async () => {
            const cur = status?.settings?.overlay_enabled || false;
            await backendSetSetting("overlay_enabled", !cur);
            showToast(!cur ? "Overlay HUD enabled" : "Overlay HUD disabled");
            refreshStatus();
          }}
          active={status?.settings?.overlay_enabled}
          style={{ justifyContent: "space-between", marginBottom: status?.settings?.overlay_enabled ? 10 : 0 }}
        >
          <span style={{ fontSize: 13, fontWeight: 600 }}>Mini Overlay HUD</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: status?.settings?.overlay_enabled ? "#1db954" : "#888" }}>
            {status?.settings?.overlay_enabled ? "ON" : "OFF"}
          </span>
        </InteractiveRow>
        {status?.settings?.overlay_enabled && (
          <>
            <Focusable flow-children="horizontal" style={{ display: "flex", gap: 6, marginTop: 8 }}>
              {["top-left", "top-right", "bottom-left", "bottom-right"].map((pos) => (
                <InteractiveRow
                  key={pos}
                  onClick={async () => {
                    await backendSetSetting("overlay_position", pos);
                    showToast(`Overlay position: ${pos}`);
                    refreshStatus();
                  }}
                  active={(status?.settings?.overlay_position || "top-right") === pos}
                  style={{ flex: 1, justifyContent: "center", fontSize: 11, fontWeight: 700, textTransform: "capitalize", padding: "6px" }}
                >
                  {pos.replace("-", " ")}
                </InteractiveRow>
              ))}
            </Focusable>

            {/* Auto-Hide Toggle */}
            <InteractiveRow
              onClick={async () => {
                const cur = status?.settings?.overlay_autohide || false;
                const autoHideSec = status?.settings?.overlay_autohide_duration_s ?? 6;
                await backendSetSetting("overlay_autohide", !cur);
                showToast(!cur ? `Auto-hide enabled (${autoHideSec}s)` : "Auto-hide disabled (Permanent)");
                refreshStatus();
              }}
              active={status?.settings?.overlay_autohide}
              style={{ justifyContent: "space-between", marginTop: 10 }}
            >
              <span style={{ fontSize: 13, fontWeight: 600 }}>
                Auto-Hide Overlay ({status?.settings?.overlay_autohide_duration_s ?? 6}s)
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: status?.settings?.overlay_autohide ? "#1db954" : "#888" }}>
                {status?.settings?.overlay_autohide ? "ON" : "OFF"}
              </span>
            </InteractiveRow>

            {/* Show Progress Bar Toggle */}
            <InteractiveRow
              onClick={async () => {
                const cur = status?.settings?.overlay_show_progress || false;
                await backendSetSetting("overlay_show_progress", !cur);
                showToast(!cur ? "Progress line enabled" : "Progress line disabled");
                refreshStatus();
              }}
              active={status?.settings?.overlay_show_progress}
              style={{ justifyContent: "space-between", marginTop: 8 }}
            >
              <span style={{ fontSize: 13, fontWeight: 600 }}>Show Progress Bar (2px)</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: status?.settings?.overlay_show_progress ? "#1db954" : "#888" }}>
                {status?.settings?.overlay_show_progress ? "ON" : "OFF"}
              </span>
            </InteractiveRow>

            {/* Overlay Lyrics Toggle */}
            <InteractiveRow
              onClick={async () => {
                const cur = localSettings.overlay_lyrics_enabled ?? status?.settings?.overlay_lyrics_enabled ?? false;
                showToast(!cur ? "Overlay lyrics enabled" : "Overlay lyrics disabled");
                await updateSetting("overlay_lyrics_enabled", !cur);
              }}
              active={localSettings.overlay_lyrics_enabled ?? status?.settings?.overlay_lyrics_enabled}
              style={{ justifyContent: "space-between", marginTop: 8, marginBottom: 8 }}
            >
              <span style={{ fontSize: 13, fontWeight: 600 }}>Overlay Lyrics</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: (localSettings.overlay_lyrics_enabled ?? status?.settings?.overlay_lyrics_enabled) ? "#1db954" : "#888" }}>
                {(localSettings.overlay_lyrics_enabled ?? status?.settings?.overlay_lyrics_enabled) ? "ON" : "OFF"}
              </span>
            </InteractiveRow>

            {/* Auto-Hide Duration Slider */}
            <SliderField
              label="Auto-Hide Duration (Seconds)"
              min={3}
              max={15}
              step={1}
              showValue
              value={localSettings.overlay_autohide_duration_s ?? status?.settings?.overlay_autohide_duration_s ?? 6}
              onChange={async (val: number) => {
                const clamped = Math.min(15, Math.max(3, val));
                await updateSetting("overlay_autohide_duration_s", clamped);
              }}
            />

            {/* Lyrics Latency Offset Slider */}
            <SliderField
              label="Lyrics Latency Offset (ms)"
              min={-2000}
              max={2000}
              step={100}
              showValue
              value={localSettings.overlay_lyrics_offset_ms ?? status?.settings?.overlay_lyrics_offset_ms ?? 0}
              onChange={async (val: number) => {
                const clamped = Math.min(2000, Math.max(-2000, val));
                await updateSetting("overlay_lyrics_offset_ms", clamped);
              }}
            />
          </>
        )}
      </div>

      {/* Toasts & Gamepad Quick Chords */}
      <div style={{ marginBottom: 20, padding: 14, borderRadius: 10, background: "rgba(255,255,255,0.04)" }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1db954", marginBottom: 6 }}>
          Notifications & Controller Shortcuts
        </h3>

        {/* Track Change Toasts */}
        <InteractiveRow
          onClick={async () => {
            const cur = status?.settings?.toast_enabled ?? true;
            await backendSetSetting("toast_enabled", !cur);
            showToast(!cur ? "Track change toasts enabled" : "Track change toasts disabled");
            refreshStatus();
          }}
          active={status?.settings?.toast_enabled ?? true}
          style={{ justifyContent: "space-between", marginBottom: 8 }}
        >
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Track Change Notifications</div>
            <div style={{ fontSize: 11, opacity: 0.6 }}>Shows a brief Steam toast whenever the song changes</div>
          </div>
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: (status?.settings?.toast_enabled ?? true) ? "#1db954" : "#888",
            }}
          >
            {(status?.settings?.toast_enabled ?? true) ? "ON" : "OFF"}
          </span>
        </InteractiveRow>

        {/* Notification Sound */}
        <InteractiveRow
          onClick={async () => {
            const cur = status?.settings?.toast_sound_enabled ?? false;
            await backendSetSetting("toast_sound_enabled", !cur);
            showToast(!cur ? "Notification sound enabled" : "Notification sound muted");
            refreshStatus();
          }}
          active={status?.settings?.toast_sound_enabled ?? false}
          style={{ justifyContent: "space-between", marginBottom: 8 }}
        >
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Notification Sound</div>
            <div style={{ fontSize: 11, opacity: 0.6 }}>Play Steam notification chime on track change</div>
          </div>
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: (status?.settings?.toast_sound_enabled ?? false) ? "#1db954" : "#888",
            }}
          >
            {(status?.settings?.toast_sound_enabled ?? false) ? "ON" : "OFF"}
          </span>
        </InteractiveRow>

        {/* Gamepad Quick Chords */}
        <InteractiveRow
          onClick={async () => {
            const cur = status?.settings?.gamepad_chords_enabled ?? true;
            await backendSetSetting("gamepad_chords_enabled", !cur);
            showToast(!cur ? "Gamepad chords enabled" : "Gamepad chords disabled");
            refreshStatus();
          }}
          active={status?.settings?.gamepad_chords_enabled ?? true}
          style={{ justifyContent: "space-between" }}
        >
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Gamepad Quick Chords</div>
            <div style={{ fontSize: 11, opacity: 0.6 }}>Hold STEAM or (...) + D-Pad: Left/Right (Skip), Up/Down (Volume), A (Play/Pause)</div>
          </div>
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: (status?.settings?.gamepad_chords_enabled ?? true) ? "#1db954" : "#888",
            }}
          >
            {(status?.settings?.gamepad_chords_enabled ?? true) ? "ON" : "OFF"}
          </span>
        </InteractiveRow>
      </div>

      {/* Controller & Trigger Navigation */}
      <div style={{ marginBottom: 20, padding: 14, borderRadius: 10, background: "rgba(255,255,255,0.04)" }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1db954", marginBottom: 6 }}>
          Controller & Trigger Navigation
        </h3>
        <ToggleField
          label="L2/R2 Trigger Navigation"
          description="Use L2/R2 triggers to seek in Now Playing/Lyrics and jump pages in lists"
          checked={localSettings.trigger_nav_enabled ?? status?.settings?.trigger_nav_enabled ?? true}
          onChange={async (val: boolean) => {
            showToast(val ? "L2/R2 trigger navigation enabled" : "L2/R2 trigger navigation disabled");
            await updateSetting("trigger_nav_enabled", val);
          }}
        />
        <ToggleField
          label="Controller Hint Bar"
          description="Show context-aware controller button hints in the modal footer"
          checked={localSettings.show_controller_hints ?? status?.settings?.show_controller_hints ?? true}
          onChange={async (val: boolean) => {
            await updateSetting("show_controller_hints", val);
          }}
        />
        <SliderField
          label="Seek Step (Seconds)"
          min={5}
          max={30}
          step={5}
          showValue
          value={localSettings.trigger_seek_seconds ?? status?.settings?.trigger_seek_seconds ?? 10}
          onChange={async (val: number) => {
            const clamped = Math.min(30, Math.max(5, val));
            await updateSetting("trigger_seek_seconds", clamped);
          }}
        />
        <SliderField
          label="Library Page Jump (Items)"
          min={5}
          max={50}
          step={5}
          showValue
          value={localSettings.trigger_page_size ?? status?.settings?.trigger_page_size ?? 15}
          onChange={async (val: number) => {
            const clamped = Math.min(50, Math.max(5, val));
            await updateSetting("trigger_page_size", clamped);
          }}
        />
      </div>

      {/* Steam Menu Position */}
      <div style={{ marginBottom: 20, padding: 14, borderRadius: 10, background: "rgba(255,255,255,0.04)" }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1db954", marginBottom: 6 }}>
          Steam Main Menu Position
        </h3>
        <p style={{ fontSize: 12, opacity: 0.6, marginBottom: 10 }}>
          Customize where Deckify appears in the Steam Side Menu (1 = top, 9 = bottom).
        </p>
        <Focusable flow-children="horizontal" style={{ display: "flex", gap: 6 }}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((pos) => (
            <InteractiveRow
              key={pos}
              onClick={() => {
                setSteamMenuPos(pos);
                try {
                  localStorage.setItem("DECKIFY_MENU_POSITION", String(pos));
                } catch {}
                showToast(`Menu position set to #${pos}`);
              }}
              active={steamMenuPos === pos}
              style={{ flex: 1, justifyContent: "center", fontSize: 12, fontWeight: 700 }}
            >
              {pos}
            </InteractiveRow>
          ))}
        </Focusable>
      </div>
    </div>
  );
};
