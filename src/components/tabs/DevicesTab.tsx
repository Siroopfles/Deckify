import { FC, useState, useEffect, useCallback } from "react";
import { Focusable } from "@decky/ui";
import { callable } from "@decky/api";
import { SpotifyDevice } from "../../types";
import { InteractiveRow } from "../common/InteractiveRow";

const backendGetDevices = callable<[], { ok: boolean; devices?: SpotifyDevice[]; error?: string }>("get_devices");
const backendTransferPlayback = callable<[string], { ok: boolean; error?: string }>("transfer_playback");

export interface DevicesTabProps {
  showToast: (msg: string) => void;
}

export const DevicesTab: FC<DevicesTabProps> = ({ showToast }) => {
  const [devices, setDevices] = useState<SpotifyDevice[]>([]);

  const loadDevices = useCallback(async () => {
    try {
      const res = await backendGetDevices();
      if (res.ok && res.devices) setDevices(res.devices);
    } catch {}
  }, []);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>Spotify Connect Devices</h2>
      <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {devices.map((d) => (
          <InteractiveRow
            key={d.id}
            onClick={async () => {
              await backendTransferPlayback(d.id);
              showToast(`Transferred to ${d.name}`);
              loadDevices();
            }}
            active={d.is_active}
            style={{ justifyContent: "space-between", padding: "12px 16px" }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: d.is_active ? "#1db954" : "#fff" }}>{d.name}</div>
              <div style={{ fontSize: 11, opacity: 0.5 }}>
                {d.type} {d.is_active ? "· Active" : ""}
              </div>
            </div>
            {d.is_active && <span style={{ fontSize: 12, color: "#1db954", fontWeight: 700 }}>Active</span>}
          </InteractiveRow>
        ))}
      </Focusable>
    </div>
  );
};
