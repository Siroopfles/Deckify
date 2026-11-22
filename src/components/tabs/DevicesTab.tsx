import { FC, useState, useEffect, useCallback, useRef } from "react";
import { DialogButton, Focusable, SliderField } from "@decky/ui";
import { callable } from "@decky/api";
import {
  FaCar,
  FaDesktop,
  FaGamepad,
  FaMobileAlt,
  FaSpotify,
  FaSyncAlt,
  FaTabletAlt,
  FaTv,
  FaVolumeMute,
  FaVolumeUp,
} from "react-icons/fa";
import { DevicesResponse, SpotifyDevice } from "../../types";
import { InteractiveRow } from "../common/InteractiveRow";

const backendGetDevices = callable<[], DevicesResponse>("get_devices");
const backendTransferPlayback = callable<[string], { ok: boolean; error?: string }>("transfer_playback");
const backendPullPlaybackToDeck = callable<[], { ok: boolean; device?: SpotifyDevice; error?: string }>(
  "pull_playback_to_deck",
);
const backendSetDeviceVolume = callable<[string, number], { ok: boolean; volume_percent?: number; error?: string }>(
  "set_device_volume",
);
const backendStartLibrespot = callable<[], { ok: boolean; error?: string }>("start_librespot");
const backendStartSpotifyClient = callable<[], { ok: boolean; error?: string }>("start_spotify_client");

export interface DevicesTabProps {
  showToast: (msg: string) => void;
}

export function getDeviceTypeIcon(type: string, isLocal: boolean) {
  if (isLocal || type === "GameConsole") return <FaGamepad size={18} />;
  if (type === "Computer") return <FaDesktop size={18} />;
  if (type === "Smartphone") return <FaMobileAlt size={18} />;
  if (type === "Tablet") return <FaTabletAlt size={18} />;
  if (type === "Speaker" || type === "AVR" || type === "CastAudio" || type === "AudioDongle") {
    return <FaVolumeUp size={18} />;
  }
  if (type === "TV" || type === "STB" || type === "CastVideo") return <FaTv size={18} />;
  if (type === "Automobile") return <FaCar size={18} />;
  return <FaSpotify size={18} />;
}

export function getEngineBadgeLabel(audioBackend?: string): string {
  if (audioBackend === "spotify_client") return "Spotify Client";
  if (audioBackend === "spotifyd") return "spotifyd";
  return "librespot";
}

export function isLocalDevice(device: SpotifyDevice, localName: string): boolean {
  const norm = (device.name ?? "").trim().toLowerCase();
  const target = (localName ?? "").trim().toLowerCase();
  return (target.length > 0 && norm === target) || norm === "deckify";
}

export function canControlVolume(device: SpotifyDevice): boolean {
  return device.volume_percent !== null && !device.is_restricted && device.supports_volume !== false;
}

interface LocalDeckStatusCardProps {
  localDeviceName: string;
  engineLabel: string;
  engineStatus: "Active" | "Ready" | "Sleeping" | "Stopped";
  showPullCta: boolean;
  isPulling: boolean;
  onPullPlayback: () => void;
}

const LocalDeckStatusCard: FC<LocalDeckStatusCardProps> = ({
  localDeviceName,
  engineLabel,
  engineStatus,
  showPullCta,
  isPulling,
  onPullPlayback,
}) => {
  const statusColor = engineStatus === "Active" ? "var(--deckify-accent, #1DB954)" : "rgba(255,255,255,0.72)";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "12px 16px",
        borderRadius: 10,
        background: "rgba(255,255,255,0.06)",
        marginBottom: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1 }}>
        <FaGamepad size={18} style={{ flexShrink: 0, color: statusColor }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <span
              style={{
                fontSize: 14,
                fontWeight: 700,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {localDeviceName}
            </span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: "2px 8px",
                borderRadius: 999,
                background: "rgba(255,255,255,0.12)",
                flexShrink: 0,
              }}
            >
              {engineLabel}
            </span>
          </div>
          <div style={{ fontSize: 12, opacity: 0.65 }}>
            Steam Deck Engine · <span style={{ color: statusColor, fontWeight: 600 }}>{engineStatus}</span>
          </div>
        </div>
      </div>
      {showPullCta && (
        <DialogButton
          disabled={isPulling}
          onClick={onPullPlayback}
          style={{ width: "auto", minWidth: "auto", minHeight: 44, padding: "0 14px", flexShrink: 0 }}
        >
          {isPulling ? "Pulling..." : "Pull Playback to Steam Deck"}
        </DialogButton>
      )}
    </div>
  );
};

interface RemoteVolumeSectionProps {
  device: SpotifyDevice;
  volumeValue: number;
  onVolumeChange: (val: number) => void;
}

const RemoteVolumeSection: FC<RemoteVolumeSectionProps> = ({ device, volumeValue, onVolumeChange }) => {
  if (!canControlVolume(device)) {
    return (
      <div
        style={{
          marginTop: 12,
          padding: "12px 16px",
          borderRadius: 10,
          background: "rgba(255,255,255,0.04)",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <FaVolumeMute size={16} style={{ flexShrink: 0, opacity: 0.7 }} />
        <div>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Fixed Volume</div>
          <div style={{ fontSize: 12, opacity: 0.65 }}>This device does not support remote volume control.</div>
        </div>
      </div>
    );
  }
  return (
    <div style={{ marginTop: 12, padding: "8px 16px", borderRadius: 10, background: "rgba(255,255,255,0.04)" }}>
      <SliderField
        label={`Remote Volume — ${device.name}`}
        min={0}
        max={100}
        step={1}
        value={volumeValue}
        showValue
        valueSuffix="%"
        onChange={onVolumeChange}
      />
    </div>
  );
};

interface EmptyDevicesCardProps {
  isLoading: boolean;
  onWakeEngine: () => void;
  onRefresh: () => void;
}

const EmptyDevicesCard: FC<EmptyDevicesCardProps> = ({ isLoading, onWakeEngine, onRefresh }) => (
  <div style={{ padding: 16, borderRadius: 10, background: "rgba(255,255,255,0.04)" }}>
    <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>No Spotify Connect Devices Found</div>
    <div style={{ fontSize: 14, opacity: 0.75, marginBottom: 12 }}>
      Make sure your Steam Deck engine is awake or another Spotify Connect device is online, then select Wake Local
      Engine or Refresh.
    </div>
    <Focusable flow-children="horizontal" style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <DialogButton
        disabled={isLoading}
        onClick={onWakeEngine}
        style={{ width: "auto", minWidth: "auto", minHeight: 44, padding: "0 14px" }}
      >
        Wake Local Engine
      </DialogButton>
      <DialogButton
        disabled={isLoading}
        onClick={onRefresh}
        style={{ width: "auto", minWidth: "auto", minHeight: 44, padding: "0 14px" }}
      >
        Refresh
      </DialogButton>
    </Focusable>
  </div>
);

interface DeviceRowProps {
  device: SpotifyDevice;
  isLocal: boolean;
  engineLabel: string;
  onSelect: () => void;
}

const DeviceRow: FC<DeviceRowProps> = ({ device, isLocal, engineLabel, onSelect }) => {
  const fixedVolume = !canControlVolume(device);
  return (
    <InteractiveRow
      onClick={onSelect}
      active={device.is_active}
      style={{ justifyContent: "space-between", padding: "12px 16px", minHeight: 44, gap: 12 }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1 }}>
        <span style={{ flexShrink: 0, color: device.is_active ? "var(--deckify-accent, #1DB954)" : "#fff" }}>
          {getDeviceTypeIcon(device.type, isLocal)}
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <span
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: device.is_active ? "var(--deckify-accent, #1DB954)" : "#fff",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {device.name}
            </span>
            {isLocal && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "2px 8px",
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.12)",
                  flexShrink: 0,
                }}
              >
                {engineLabel}
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, opacity: 0.65 }}>
            {device.type}
            {isLocal ? " · This Deck" : ""}
            {device.is_active ? " · Active" : ""}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        {fixedVolume && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 11,
              padding: "2px 8px",
              borderRadius: 999,
              background: "rgba(255,255,255,0.1)",
            }}
          >
            <FaVolumeMute size={11} /> Fixed Volume
          </span>
        )}
        {device.is_active && (
          <span style={{ fontSize: 12, color: "var(--deckify-accent, #1DB954)", fontWeight: 700 }}>Active</span>
        )}
      </div>
    </InteractiveRow>
  );
};

function computeEngineStatus(
  localActive: boolean,
  engineRunning: boolean,
  engineSleeping: boolean,
): "Active" | "Ready" | "Sleeping" | "Stopped" {
  if (localActive) return "Active";
  if (engineSleeping) return "Sleeping";
  return engineRunning ? "Ready" : "Stopped";
}

function useDebouncedDeviceVolume(showToast: (msg: string) => void) {
  const [optimisticVolumes, setOptimisticVolumes] = useState<Record<string, number>>({});
  const volumeTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    const timers = volumeTimersRef.current;
    return () => {
      Object.values(timers).forEach(clearTimeout);
    };
  }, []);

  const handleVolumeChange = (device: SpotifyDevice, val: number) => {
    const fallbackVol = device.volume_percent ?? 50;
    setOptimisticVolumes((cur) => ({ ...cur, [device.id]: val }));
    const existingTimer = volumeTimersRef.current[device.id];
    if (existingTimer) clearTimeout(existingTimer);
    volumeTimersRef.current[device.id] = setTimeout(async () => {
      delete volumeTimersRef.current[device.id];
      try {
        const res = await backendSetDeviceVolume(device.id, val);
        if (!res.ok) {
          setOptimisticVolumes((cur) => ({ ...cur, [device.id]: fallbackVol }));
          showToast("Failed to adjust device volume — the device may be offline or restricted.");
        }
      } catch {
        setOptimisticVolumes((cur) => ({ ...cur, [device.id]: fallbackVol }));
        showToast("Failed to adjust device volume — the device may be offline or restricted.");
      }
    }, 300);
  };

  return { optimisticVolumes, handleVolumeChange };
}

function useDevicesHub(showToast: (msg: string) => void) {
  const [devices, setDevices] = useState<SpotifyDevice[]>([]);
  const [localDeviceName, setLocalDeviceName] = useState("Deckify");
  const [audioBackend, setAudioBackend] = useState("librespot");
  const [engineRunning, setEngineRunning] = useState(false);
  const [engineSleeping, setEngineSleeping] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isPulling, setIsPulling] = useState(false);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const { optimisticVolumes, handleVolumeChange } = useDebouncedDeviceVolume(showToast);

  const loadDevices = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await backendGetDevices();
      if (res.ok) {
        setDevices(res.devices ?? []);
        if (res.local_device_name) setLocalDeviceName(res.local_device_name);
        if (res.audio_backend) setAudioBackend(res.audio_backend);
        setEngineRunning(Boolean(res.engine_running));
        setEngineSleeping(Boolean(res.engine_sleeping));
      } else {
        showToast("Could not load Spotify Connect devices — check your network and press Refresh.");
      }
    } catch {
      showToast("Could not load Spotify Connect devices — check your network and press Refresh.");
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  const handlePullPlayback = async () => {
    setIsPulling(true);
    try {
      const res = await backendPullPlaybackToDeck();
      showToast(
        res.ok
          ? "Playback pulled to Steam Deck"
          : "Could not pull playback to Steam Deck — ensure the local engine is running and try again.",
      );
      await loadDevices();
    } catch {
      showToast("Could not pull playback to Steam Deck — ensure the local engine is running and try again.");
    } finally {
      setIsPulling(false);
    }
  };

  const handleWakeEngine = async () => {
    try {
      const res = audioBackend === "spotify_client" ? await backendStartSpotifyClient() : await backendStartLibrespot();
      if (!res.ok) showToast(res.error || "Failed to wake local engine");
      await loadDevices();
    } catch {
      showToast("Failed to wake local engine");
    }
  };

  return {
    devices, localDeviceName, audioBackend, engineRunning, engineSleeping,
    isLoading, isPulling, selectedDeviceId, setSelectedDeviceId,
    optimisticVolumes, loadDevices, handlePullPlayback, handleWakeEngine, handleVolumeChange,
  };
}

export const DevicesTab: FC<DevicesTabProps> = ({ showToast }) => {
  const {
    devices,
    localDeviceName,
    audioBackend,
    engineRunning,
    engineSleeping,
    isLoading,
    isPulling,
    selectedDeviceId,
    setSelectedDeviceId,
    optimisticVolumes,
    loadDevices,
    handlePullPlayback,
    handleWakeEngine,
    handleVolumeChange,
  } = useDevicesHub(showToast);

  const engineLabel = getEngineBadgeLabel(audioBackend);
  const localDevice = devices.find((d) => isLocalDevice(d, localDeviceName));
  const engineStatus = computeEngineStatus(Boolean(localDevice?.is_active), engineRunning, engineSleeping);
  const showPullCta = !localDevice?.is_active && (devices.some((d) => d.is_active) || !engineRunning || engineSleeping);
  const selectedDevice = devices.find((d) => d.id === selectedDeviceId) ?? devices.find((d) => d.is_active) ?? devices[0];

  return (
    <div>
      <Focusable
        flow-children="horizontal"
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, gap: 12 }}
      >
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Spotify Connect Devices</h2>
        <DialogButton
          disabled={isLoading}
          onClick={loadDevices}
          style={{ width: "auto", minWidth: "auto", minHeight: 44, padding: "0 14px", display: "inline-flex", alignItems: "center", gap: 8 }}
        >
          <FaSyncAlt size={13} /> {isLoading ? "Refreshing..." : "Refresh"}
        </DialogButton>
      </Focusable>

      <LocalDeckStatusCard
        localDeviceName={localDeviceName}
        engineLabel={engineLabel}
        engineStatus={engineStatus}
        showPullCta={showPullCta}
        isPulling={isPulling}
        onPullPlayback={handlePullPlayback}
      />

      {!isLoading && devices.length === 0 ? (
        <EmptyDevicesCard isLoading={isLoading} onWakeEngine={handleWakeEngine} onRefresh={loadDevices} />
      ) : (
        <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {devices.map((d) => (
            <DeviceRow
              key={d.id}
              device={d}
              isLocal={isLocalDevice(d, localDeviceName)}
              engineLabel={engineLabel}
              onSelect={async () => {
                setSelectedDeviceId(d.id);
                try {
                  const res = await backendTransferPlayback(d.id);
                  showToast(res.ok ? `Transferred to ${d.name}` : res.error || `Failed to transfer to ${d.name}`);
                  loadDevices();
                } catch {
                  showToast(`Failed to transfer to ${d.name}`);
                }
              }}
            />
          ))}
        </Focusable>
      )}

      {selectedDevice && (
        <RemoteVolumeSection
          device={selectedDevice}
          volumeValue={optimisticVolumes[selectedDevice.id] ?? selectedDevice.volume_percent ?? 50}
          onVolumeChange={(val) => handleVolumeChange(selectedDevice, val)}
        />
      )}
    </div>
  );
};
