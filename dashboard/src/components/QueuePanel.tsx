import React from "react";
import { FaTimes, FaPlus } from "react-icons/fa";
import type { PlaylistTrack } from "../api";
import { formatMs } from "../utils";

interface QueuePanelProps {
  isOpen: boolean;
  onClose: () => void;
  loading: boolean;
  items: PlaylistTrack[];
  onPlayItem: (uri: string) => void;
  onAddToPlaylist: (item: { uri: string; name: string; artist?: string }) => void;
}

export const QueuePanel: React.FC<QueuePanelProps> = ({
  isOpen,
  onClose,
  loading,
  items,
  onPlayItem,
  onAddToPlaylist,
}) => {
  if (!isOpen) return null;

  return (
    <div
      data-modal-scope="true"
      className="absolute top-14 right-4 z-40 w-80 max-h-96 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl flex flex-col overflow-hidden"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
        <span className="text-sm font-semibold">Up Next in Queue</span>
        <button
          data-focusable="true"
          onClick={onClose}
          className="text-neutral-500 hover:text-white"
        >
          <FaTimes size={14} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto divide-y divide-neutral-800/50">
        {loading ? (
          <div className="p-4 text-xs text-neutral-500">Loading queue...</div>
        ) : items.length === 0 ? (
          <div className="p-4 text-xs text-neutral-500">Queue is empty</div>
        ) : (
          items.map((item, idx) => (
            <div
              key={item.uri + idx}
              data-focusable="true"
              data-track-id={item.id ?? ""}
              data-track-uri={item.uri}
              data-track-name={item.name}
              onClick={() => {
                onPlayItem(item.uri);
                onClose();
              }}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-800 transition-colors text-left cursor-pointer"
            >
              {item.image_url ? (
                <img src={item.image_url} alt="" className="w-8 h-8 rounded object-cover shrink-0" />
              ) : (
                <div className="w-8 h-8 rounded bg-neutral-800 shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium truncate">{item.name}</div>
                <div className="text-[11px] text-neutral-500 truncate">{item.artist}</div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAddToPlaylist({ uri: item.uri, name: item.name, artist: item.artist });
                }}
                className="p-1.5 text-neutral-500 hover:text-green-400"
                title="Add to Playlist"
              >
                <FaPlus size={11} />
              </button>
              <span className="text-[11px] text-neutral-600">{formatMs(item.duration_ms)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
export default QueuePanel;
