import { FC, useState, useEffect, useCallback } from "react";
import { Focusable } from "@decky/ui";
import { callable } from "@decky/api";
import { FaSlidersH, FaClock, FaPowerOff } from "react-icons/fa";
import { AudioSinkInfo, StatusResponse, SleepTimerStatus } from "../../types";
import { InteractiveRow } from "../common/InteractiveRow";

const backendSetSetting = callable<[string, unknown], { ok: boolean; settings?: any; error?: string }>("set_setting");
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

export interface SettingsTabProps {
  status: StatusResponse | null;
  refreshStatus: () => void;
  showToast: (msg: string) => void;
}

export const SettingsTab: FC<SettingsTabProps> = ({ status, refreshStatus, showToast }) => {
  const [audioSinks, setAudioSinks] = useState<AudioSinkInfo[]>([]);
  const [officialClientStatus, setOfficialClientStatus] = useState<{ running: boolean; logged_in: boolean } | null>(null);
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
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1db954", marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
          <FaSlidersH /> Equalizer & Audio Presets
        </h3>
        <Focusable flow-children="horizontal" style={{ display: "flex", gap: 8 }}>
          {[
            { id: "flat", label: "Flat" },
            { id: "bass", label: "Bass Boost" },
            { id: "vocal", label: "Vocal Clarity" },
            { id: "gaming", label: "Gaming Balance" },
          ].map((eq) => {
            const curEq = status?.settings?.eq_preset || "flat";
            return (
              <InteractiveRow
                key={eq.id}
                onClick={async () => {
                  await backendSetSetting("eq_preset", eq.id);
                  showToast(`Audio preset: ${eq.label}`);
                  refreshStatus();
                }}
                active={curEq === eq.id}
                style={{ flex: 1, justifyContent: "center", fontSize: 12, fontWeight: 700 }}
              >
                {eq.label}
              </InteractiveRow>
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
            {audioSinks.map((s) => (
              <InteractiveRow
                key={s.name}
                onClick={async () => {
                  await backendSetAudioSink(s.name);
                  showToast(`Output set to ${s.description || s.name}`);
                  loadAudioSinks();
                }}
                active={s.is_default}
                style={{ justifyContent: "space-between" }}
              >
                <span style={{ fontSize: 12, fontWeight: 600 }}>{s.description || s.name}</span>
                {s.is_default && <span style={{ fontSize: 11, color: "#1db954", fontWeight: 700 }}>Default</span>}
              </InteractiveRow>
            ))}
          </Focusable>
        </div>
      )}

      {/* Backend Sleep Timer */}
      <div style={{ marginBottom: 20, padding: 14, borderRadius: 10, background: "rgba(255,255,255,0.04)" }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1db954", marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
          <FaClock /> Backend Sleep Timer
        </h3>
        <p style={{ fontSize: 12, opacity: 0.6, marginBottom: 10 }}>
          Timer runs reliably in Python background even if Steam Deck goes into sleep/standby.
          {status?.sleep_timer?.active && (
            <b style={{ color: "#1db954", marginLeft: 6 }}>
              Remaining: {Math.ceil((status.sleep_timer.remaining_seconds || 0) / 60)} min
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
      </div>

      {/* Auto-Ducking (Game Audio Balance) */}
      <div style={{ marginBottom: 20, padding: 14, borderRadius: 10, background: "rgba(255,255,255,0.04)" }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1db954", marginBottom: 6 }}>
          Auto-Ducking (Game Audio Balance)
        </h3>
        <p style={{ fontSize: 12, opacity: 0.6, marginBottom: 10 }}>
          Automatically ducks game audio volume when Spotify is playing.
        </p>
        <InteractiveRow
          onClick={async () => {
            const cur = status?.settings?.auto_ducking || false;
            await backendSetSetting("auto_ducking", !cur);
            showToast(!cur ? "Auto-Ducking enabled" : "Auto-Ducking disabled");
            refreshStatus();
          }}
          active={status?.settings?.auto_ducking}
          style={{ justifyContent: "space-between", marginBottom: 10 }}
        >
          <span style={{ fontSize: 13, fontWeight: 600 }}>Game Audio Ducking</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: status?.settings?.auto_ducking ? "#1db954" : "#888" }}>
            {status?.settings?.auto_ducking ? "ON" : "OFF"}
          </span>
        </InteractiveRow>
        {status?.settings?.auto_ducking && (
          <Focusable flow-children="horizontal" style={{ display: "flex", gap: 8 }}>
            {[30, 50, 70].map((pct) => (
              <InteractiveRow
                key={pct}
                onClick={async () => {
                  await backendSetSetting("auto_ducking_volume", pct);
                  showToast(`Ducking volume: ${pct}%`);
                  refreshStatus();
                }}
                active={(status?.settings?.auto_ducking_volume || 50) === pct}
                style={{ flex: 1, justifyContent: "center", fontSize: 12, fontWeight: 700 }}
              >
                Game -{pct}%
              </InteractiveRow>
            ))}
          </Focusable>
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
                await backendSetSetting("overlay_autohide", !cur);
                showToast(!cur ? "Auto-hide enabled (6s)" : "Auto-hide disabled (Permanent)");
                refreshStatus();
              }}
              active={status?.settings?.overlay_autohide}
              style={{ justifyContent: "space-between", marginTop: 10 }}
            >
              <span style={{ fontSize: 13, fontWeight: 600 }}>Auto-Hide Overlay (6s)</span>
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
