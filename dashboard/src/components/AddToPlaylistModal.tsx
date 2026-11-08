import React, { useState } from "react";
import { FaTimes } from "react-icons/fa";
import type { Playlist } from "../api";

interface AddToPlaylistModalProps {
  target: {
    uri: string;
    name: string;
    artist?: string;
  } | null;
  onClose: () => void;
  playlists: Playlist[];
  loading: boolean;
  onSelectPlaylist: (playlist: Playlist) => void;
}

export const AddToPlaylistModal: React.FC<AddToPlaylistModalProps> = ({
  target,
  onClose,
  playlists,
  loading,
  onSelectPlaylist,
}) => {
  const [filter, setFilter] = useState("");

  if (!target) return null;

  const filtered = playlists.filter((p) =>
    p.name.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div
      data-modal-scope="true"
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
    >
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[80vh] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
          <div className="min-w-0 pr-2">
            <div className="text-sm font-semibold">Add to Playlist</div>
            <div className="text-xs text-neutral-400 truncate">
              {target.name}
              {target.artist ? ` — ${target.artist}` : ""}
            </div>
          </div>
          <button
            data-focusable="true"
            onClick={onClose}
            className="text-neutral-500 hover:text-white p-1"
          >
            <FaTimes size={16} />
          </button>
        </div>

        <div className="p-3 border-b border-neutral-800">
          <input
            data-focusable="true"
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter playlists..."
            className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-1.5 text-xs text-white outline-none"
          />
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-neutral-800/50">
          {loading ? (
            <div className="p-4 text-xs text-neutral-500">Loading your playlists...</div>
          ) : filtered.length === 0 ? (
            <div className="p-4 text-xs text-neutral-500">No matching playlists found</div>
          ) : (
            filtered.map((pl) => (
              <button
                key={pl.id}
                data-focusable="true"
                onClick={() => onSelectPlaylist(pl)}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-800 transition-colors text-left"
              >
                {pl.image_url ? (
                  <img src={pl.image_url} alt="" className="w-9 h-9 rounded object-cover shrink-0" />
                ) : (
                  <div className="w-9 h-9 rounded bg-neutral-800 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate">{pl.name}</div>
                  <div className="text-[11px] text-neutral-500">{pl.track_count} tracks</div>
                </div>
                <span className="text-xs text-green-400 font-semibold">+ Add</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
export default AddToPlaylistModal;
