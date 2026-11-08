import React from "react";
import { FaTimes, FaWindowMaximize } from "react-icons/fa";
import type { EngineSettings } from "../api";

interface EngineModalProps {
  isOpen: boolean;
  onClose: () => void;
  engineSettings: EngineSettings;
  switchingEngine: boolean;
  streamFormatLabel?: string;
  onSettingChange: (newSettings: Partial<EngineSettings>) => void;
  onOpenClientWindow?: () => void;
}

export const EngineModal: React.FC<EngineModalProps> = ({
  isOpen,
  onClose,
  engineSettings,
  switchingEngine,
  streamFormatLabel,
  onSettingChange,
  onOpenClientWindow,
}) => {
  if (!isOpen) return null;

  const isSpotifyClientBackend = engineSettings.audio_backend === "spotify_client";

  return (
    <div
      data-modal-scope="true"
      className="absolute top-14 right-4 z-40 w-84 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl p-4 space-y-4"
    >
      <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
        <span className="text-sm font-semibold">Audio Engine & Quality</span>
        <button
          data-focusable="true"
          onClick={onClose}
          className="text-neutral-500 hover:text-white"
        >
          <FaTimes size={14} />
        </button>
      </div>

      {/* Audio Backend Selector */}
      <div>
        <label className="text-xs text-neutral-400 block mb-1.5">
          Spotify Connect Backend (cleanly stops the other engine)
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button
            data-focusable="true"
            disabled={switchingEngine}
            onClick={() => onSettingChange({ audio_backend: "librespot" })}
            className={`py-2 px-2.5 rounded-lg text-xs font-medium text-left transition-colors border ${
              !isSpotifyClientBackend
                ? "bg-green-500 text-black font-semibold border-green-400"
                : "bg-neutral-800 text-neutral-300 border-neutral-700 hover:bg-neutral-700"
            }`}
          >
            <div>librespot</div>
            <div className={`text-[10px] ${!isSpotifyClientBackend ? "text-black/80" : "text-neutral-500"}`}>
              Lightweight · Up to 320k
            </div>
          </button>
          <button
            data-focusable="true"
            disabled={switchingEngine}
            onClick={() => onSettingChange({ audio_backend: "spotify_client" })}
            className={`py-2 px-2.5 rounded-lg text-xs font-medium text-left transition-colors border ${
              isSpotifyClientBackend
                ? "bg-green-500 text-black font-semibold border-green-400"
                : "bg-neutral-800 text-neutral-300 border-neutral-700 hover:bg-neutral-700"
            }`}
          >
            <div>Official Client</div>
            <div className={`text-[10px] ${isSpotifyClientBackend ? "text-black/80" : "text-neutral-500"}`}>
              Lossless FLAC + Native Mix
            </div>
          </button>
        </div>
      </div>

      {/* Audio Quality Selector */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs text-neutral-400">Streaming Quality</label>
          {streamFormatLabel && (
            <span className="text-[10px] font-semibold text-green-400 bg-green-950/60 border border-green-500/30 px-1.5 py-0.5 rounded">
              PipeWire: {streamFormatLabel}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {(
            [
              { id: "96", label: "Normal (96k)", losslessOnly: false },
              { id: "160", label: "High (160k)", losslessOnly: false },
              { id: "320", label: "Very High (320k)", losslessOnly: false },
              { id: "lossless", label: "Lossless FLAC", losslessOnly: true },
            ] as const
          ).map((opt) => {
            const disabled = opt.losslessOnly && !isSpotifyClientBackend;
            const active = engineSettings.audio_quality === opt.id;
            return (
              <button
                key={opt.id}
                data-focusable={!disabled ? "true" : undefined}
                disabled={disabled || switchingEngine}
                onClick={() => onSettingChange({ audio_quality: opt.id })}
                className={`py-1.5 px-2 rounded-lg text-xs font-medium transition-colors ${
                  disabled
                    ? "bg-neutral-900 text-neutral-600 border border-neutral-800 cursor-not-allowed"
                    : active
                      ? "bg-green-500 text-black font-semibold"
                      : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
                }`}
                title={
                  disabled
                    ? "Switch to Official Spotify Client above to enable Lossless FLAC"
                    : opt.label
                }
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        {!isSpotifyClientBackend && (
          <div className="text-[11px] text-neutral-500 mt-1">
            Lossless (24-bit / 44.1 kHz FLAC) and native Spotify Playlist Mixing require the{" "}
            <span className="text-neutral-300">Official Client</span> engine.
          </div>
        )}
      </div>

      {isSpotifyClientBackend && onOpenClientWindow && (
        <button
          data-focusable="true"
          onClick={() => {
            onClose();
            onOpenClientWindow();
          }}
          className="w-full py-2 px-3 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs font-medium text-green-400 border border-green-500/30 flex items-center justify-center gap-2"
        >
          <FaWindowMaximize size={12} /> Open Headless Spotify Client Window
        </button>
      )}

      <div className="space-y-2 pt-1 border-t border-neutral-800 text-xs">
        <label className="flex items-center justify-between cursor-pointer">
          <span className="text-neutral-300">Volume Normalization</span>
          <input
            data-focusable="true"
            type="checkbox"
            checked={engineSettings.normalisation}
            onChange={(e) => onSettingChange({ normalisation: e.target.checked })}
            className="accent-green-500"
          />
        </label>
        <label className="flex items-center justify-between cursor-pointer">
          <span className="text-neutral-300">Gapless Playback</span>
          <input
            data-focusable="true"
            type="checkbox"
            checked={engineSettings.gapless}
            onChange={(e) => onSettingChange({ gapless: e.target.checked })}
            className="accent-green-500"
          />
        </label>
        <label className="flex items-center justify-between cursor-pointer">
          <span className="text-neutral-300">Autoplay Similar Music</span>
          <input
            data-focusable="true"
            type="checkbox"
            checked={engineSettings.autoplay}
            onChange={(e) => onSettingChange({ autoplay: e.target.checked })}
            className="accent-green-500"
          />
        </label>
      </div>
    </div>
  );
};
export default EngineModal;
