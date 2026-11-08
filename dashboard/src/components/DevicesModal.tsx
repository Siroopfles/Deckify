import React from "react";
import { FaTimes } from "react-icons/fa";
import type { SpotifyDevice } from "../api";

interface DevicesModalProps {
  isOpen: boolean;
  onClose: () => void;
  devices: SpotifyDevice[];
  onSelectDevice: (deviceId: string, deviceName: string) => void;
}

export const DevicesModal: React.FC<DevicesModalProps> = ({
  isOpen,
  onClose,
  devices,
  onSelectDevice,
}) => {
  if (!isOpen) return null;

  return (
    <div
      data-modal-scope="true"
      className="absolute top-14 right-4 z-40 w-72 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl overflow-hidden"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
        <span className="text-sm font-semibold">Connect Devices</span>
        <button
          data-focusable="true"
          onClick={onClose}
          className="text-neutral-500 hover:text-white"
        >
          <FaTimes size={14} />
        </button>
      </div>
      <div className="divide-y divide-neutral-800/50">
        {devices.length === 0 ? (
          <div className="p-4 text-xs text-neutral-500">No active Spotify devices found</div>
        ) : (
          devices.map((d) => (
            <button
              key={d.id}
              data-focusable="true"
              onClick={() => onSelectDevice(d.id, d.name)}
              className={`w-full flex items-center justify-between px-4 py-2.5 hover:bg-neutral-800 text-left text-xs ${
                d.is_active ? "text-green-400 font-semibold" : "text-neutral-200"
              }`}
            >
              <span className="truncate">{d.name}</span>
              <span className="text-[10px] uppercase text-neutral-500">{d.is_active ? "Active" : d.type}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
};
export default DevicesModal;
