import { FC, useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  Focusable,
  DialogButton,
  DropdownItem,
  SliderField,
  ToggleField,
  TextField,
  showModal,
} from "@decky/ui";
import { callable } from "@decky/api";
import { FaGamepad, FaPlus, FaTimes, FaTrash, FaSearch, FaMusic } from "react-icons/fa";
import {
  InstalledGame,
  SoundtrackMode,
  SoundtrackPlaylist,
  SoundtrackProfile,
} from "../../types";
import { DeckifyImage } from "../common/DeckifyImage";
import { InteractiveRow } from "../common/InteractiveRow";
import { PlaylistPickerModal } from "./PlaylistPickerModal";
import {
  MODE_OPTIONS,
  RESUME_OPTIONS,
  EXIT_OPTIONS,
  SAVE_DEBOUNCE_MS,
  defaultProfile,
  normalizeProfiles,
  sortGames,
  filterGames,
  addPlaylist,
  removePlaylist,
  setMode,
  setVolumeOverride,
  setDuckingOverride,
} from "./soundtrackUtils";

const TextFieldAny = TextField as any;

const backendGetInstalledGames = callable<[boolean?], InstalledGame[]>("get_installed_games");
const backendGetProfiles = callable<[], Record<string, SoundtrackProfile>>("get_game_soundtrack_profiles");
const backendSaveProfile = callable<[number, SoundtrackProfile], { ok: boolean; error?: string }>(
  "save_game_soundtrack_profile"
);
const backendDeleteProfile = callable<[number], { ok: boolean; error?: string }>(
  "delete_game_soundtrack_profile"
);

export interface SoundtracksTabProps {
  runningAppId?: number | null;
  initialGames?: InstalledGame[];
  initialProfiles?: Record<string, SoundtrackProfile>;
  showToast?: (msg: string) => void;
}

export const SoundtracksTab: FC<SoundtracksTabProps> = ({
  runningAppId = null,
  initialGames,
  initialProfiles,
  showToast,
}) => {
  const [games, setGames] = useState<InstalledGame[]>(initialGames || []);
  const [profiles, setProfiles] = useState<Record<string, SoundtrackProfile>>(
    initialProfiles ? normalizeProfiles(initialProfiles) : {}
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedAppId, setExpandedAppId] = useState<number | null>(runningAppId ?? null);
  const [loading, setLoading] = useState(!initialGames);

  const saveTimersRef = useRef<Record<string, any>>({});

  useEffect(() => {
    let mounted = true;
    Promise.all([
      backendGetInstalledGames(false).catch(() => []),
      backendGetProfiles().catch(() => ({})),
    ]).then(([fetchedGames, fetchedProfiles]) => {
      if (!mounted) return;
      if (Array.isArray(fetchedGames) && fetchedGames.length > 0) {
        setGames(fetchedGames);
      }
      if (fetchedProfiles && typeof fetchedProfiles === "object") {
        const norm = normalizeProfiles(fetchedProfiles);
        if (Object.keys(norm).length > 0) {
          setProfiles(norm);
        }
      }
      setLoading(false);
    });
    return () => {
      mounted = false;
      for (const timer of Object.values(saveTimersRef.current)) {
        clearTimeout(timer);
      }
    };
  }, []);

  const scheduleSave = useCallback(
    (appId: number, updated: SoundtrackProfile) => {
      const key = String(appId);
      if (saveTimersRef.current[key]) {
        clearTimeout(saveTimersRef.current[key]);
      }
      saveTimersRef.current[key] = setTimeout(() => {
        delete saveTimersRef.current[key];
        backendSaveProfile(appId, updated)
          .then((res) => {
            if (res && !res.ok && showToast) {
              showToast(res.error || "Failed to save soundtrack profile");
            }
          })
          .catch(() => {});
      }, SAVE_DEBOUNCE_MS);
    },
    [showToast]
  );

  const persistProfile = useCallback(
    (appId: number, updated: SoundtrackProfile) => {
      const key = String(appId);
      setProfiles((prev) => ({ ...prev, [key]: updated }));
      scheduleSave(appId, updated);
    },
    [scheduleSave]
  );

  const openPlaylistPicker = useCallback(
    (game: InstalledGame) => {
      const key = String(game.app_id);
      showModal(
        <PlaylistPickerModal
          onSelect={(item: SoundtrackPlaylist) => {
            setProfiles((prev) => {
              const current = prev[key] || defaultProfile(game);
              const updated = addPlaylist(current, item);
              scheduleSave(game.app_id, updated);
              return { ...prev, [key]: updated };
            });
          }}
        />
      );
    },
    [scheduleSave]
  );

  const handleDeleteProfile = useCallback(
    async (appId: number) => {
      const key = String(appId);
      if (saveTimersRef.current[key]) {
        clearTimeout(saveTimersRef.current[key]);
        delete saveTimersRef.current[key];
      }
      setProfiles((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      await backendDeleteProfile(appId).catch(() => {});
      if (showToast) showToast("Soundtrack profile removed");
    },
    [showToast]
  );

  const visibleGames = useMemo(() => {
    const filtered = filterGames(games, searchQuery);
    return sortGames(filtered, profiles, runningAppId);
  }, [games, searchQuery, profiles, runningAppId]);

  const getOrInitProfile = (game: InstalledGame): SoundtrackProfile => {
    return profiles[String(game.app_id)] || defaultProfile(game);
  };

  return (
    <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, display: "flex", alignItems: "center", gap: 8 }}>
            <FaGamepad size={18} color="#1db954" />
            <span>Game Soundtracks</span>
          </h2>
          <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>
            Link Spotify playlists or albums to Steam &amp; Non-Steam games for automatic playback.
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <Focusable
        flow-children="horizontal"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "rgba(255,255,255,0.06)",
          borderRadius: 8,
          padding: "4px 10px",
        }}
      >
        <FaSearch size={12} style={{ opacity: 0.6, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <TextFieldAny
            value={searchQuery}
            onChange={(e: any) => setSearchQuery(typeof e === "string" ? e : e?.target?.value || "")}
            placeholder="Filter installed games..."
          />
        </div>
      </Focusable>

      {loading && games.length === 0 && (
        <div style={{ padding: 24, textAlign: "center", opacity: 0.6, fontSize: 13 }}>
          Scanning installed Steam &amp; Non-Steam games...
        </div>
      )}

      {!loading && visibleGames.length === 0 && (
        <div style={{ padding: 24, textAlign: "center", opacity: 0.5, fontSize: 13 }}>
          No matching games found.
        </div>
      )}

      {/* Game Cards */}
      <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {visibleGames.map((game) => {
          const key = String(game.app_id);
          const existingProfile = profiles[key];
          const profile = getOrInitProfile(game);
          const isRunning = Boolean(game.is_running || (runningAppId !== null && game.app_id === runningAppId));
          const isExpanded = expandedAppId === game.app_id || Boolean(existingProfile) || isRunning;

          return (
            <Focusable
              key={game.app_id}
              flow-children="column"
              style={{
                background: isRunning ? "rgba(29, 185, 84, 0.08)" : "rgba(255,255,255,0.04)",
                border: isRunning ? "1px solid rgba(29, 185, 84, 0.35)" : "1px solid rgba(255,255,255,0.08)",
                borderRadius: 10,
                padding: 12,
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              {/* Game Header Row */}
              <InteractiveRow
                onClick={() => setExpandedAppId(expandedAppId === game.app_id ? null : game.app_id)}
                style={{ gap: 10, padding: "4px 6px" }}
              >
                {game.icon_url ? (
                  <DeckifyImage
                    src={game.icon_url}
                    width={42}
                    height={42}
                    style={{ borderRadius: 6, flexShrink: 0 }}
                    fallback={<FaGamepad size={18} color="#888" />}
                  />
                ) : (
                  <div
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 6,
                      background: "rgba(255,255,255,0.08)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <FaGamepad size={18} color="#888" />
                  </div>
                )}

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{game.name}</span>
                    {isRunning && (
                      <span
                        style={{
                          background: "rgba(29, 185, 84, 0.2)",
                          color: "#1db954",
                          fontSize: 10,
                          fontWeight: 700,
                          padding: "2px 6px",
                          borderRadius: 4,
                        }}
                      >
                        Running
                      </span>
                    )}
                    {game.is_non_steam && (
                      <span
                        style={{
                          background: "rgba(255,255,255,0.1)",
                          color: "#fff",
                          fontSize: 10,
                          padding: "2px 6px",
                          borderRadius: 4,
                        }}
                      >
                        Non-Steam
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.55, marginTop: 2 }}>
                    {profile.playlists.length > 0
                      ? `${profile.playlists.length} linked soundtrack${profile.playlists.length > 1 ? "s" : ""}`
                      : "No soundtrack configured"}
                  </div>
                </div>
              </InteractiveRow>

              {/* Profile Configuration Section */}
              {isExpanded && (
                <Focusable
                  flow-children="column"
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                    paddingTop: 8,
                    borderTop: "1px solid rgba(255,255,255,0.07)",
                  }}
                >
                  {/* Assigned Playlists Chips (horizontal) */}
                  <Focusable
                    flow-children="horizontal"
                    style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}
                  >
                    {profile.playlists.map((pl) => (
                      <Focusable
                        key={pl.uri}
                        flow-children="horizontal"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          background: "rgba(255,255,255,0.08)",
                          borderRadius: 6,
                          padding: "4px 8px",
                        }}
                      >
                        {pl.image ? (
                          <DeckifyImage src={pl.image} width={22} height={22} style={{ borderRadius: 3 }} />
                        ) : (
                          <FaMusic size={12} color="#1db954" />
                        )}
                        <span style={{ fontSize: 12, fontWeight: 600 }}>{pl.name}</span>
                        <DialogButton
                          onClick={() => persistProfile(game.app_id, removePlaylist(profile, pl.uri))}
                          aria-label={`Remove ${pl.name}`}
                          style={{
                            minWidth: 24,
                            padding: "2px 6px",
                            fontSize: 11,
                            background: "transparent",
                          }}
                        >
                          <FaTimes size={10} />
                        </DialogButton>
                      </Focusable>
                    ))}

                    <DialogButton
                      onClick={() => openPlaylistPicker(game)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "6px 12px",
                        fontSize: 12,
                        fontWeight: 700,
                      }}
                    >
                      <FaPlus size={11} />
                      <span>Add Playlist / Album</span>
                    </DialogButton>
                  </Focusable>

                  {/* Playback Mode, Resume Mode, Exit Policy */}
                  <Focusable
                    flow-children="horizontal"
                    style={{ display: "flex", gap: 10, flexWrap: "wrap" }}
                  >
                    <div style={{ flex: "1 1 180px" }}>
                      <DropdownItem
                        label="Playback Mode"
                        rgOptions={MODE_OPTIONS}
                        selectedOption={profile.mode}
                        onChange={(opt: { data: SoundtrackMode }) =>
                          persistProfile(game.app_id, setMode(profile, opt.data))
                        }
                      />
                    </div>
                    <div style={{ flex: "1 1 180px" }}>
                      <DropdownItem
                        label="Resume Mode"
                        rgOptions={RESUME_OPTIONS}
                        selectedOption={profile.resume_mode}
                        onChange={(opt: { data: "remember_position" | "fresh_start" }) =>
                          persistProfile(game.app_id, { ...profile, resume_mode: opt.data })
                        }
                      />
                    </div>
                    <div style={{ flex: "1 1 180px" }}>
                      <DropdownItem
                        label="On Game Exit"
                        rgOptions={EXIT_OPTIONS}
                        selectedOption={profile.exit_policy}
                        onChange={(opt: { data: "restore_snapshot" | "pause" | "keep_playing" }) =>
                          persistProfile(game.app_id, { ...profile, exit_policy: opt.data })
                        }
                      />
                    </div>
                  </Focusable>

                  {/* Auto-Start & Ducking Override */}
                  <Focusable
                    flow-children="horizontal"
                    style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}
                  >
                    <div style={{ flex: "1 1 220px" }}>
                      <ToggleField
                        label="Always auto-start soundtrack"
                        checked={profile.always_auto_start}
                        onChange={(val: boolean) =>
                          persistProfile(game.app_id, { ...profile, always_auto_start: val })
                        }
                      />
                    </div>
                    <div style={{ flex: "1 1 220px" }}>
                      <ToggleField
                        label="Ducking Override (Skip game ducking when off)"
                        checked={profile.ducking_override !== false}
                        onChange={(val: boolean) =>
                          persistProfile(game.app_id, setDuckingOverride(profile, val))
                        }
                      />
                    </div>
                  </Focusable>

                  {/* Volume Override */}
                  <Focusable
                    flow-children="horizontal"
                    style={{ display: "flex", gap: 12, alignItems: "center" }}
                  >
                    <div style={{ flex: 1 }}>
                      <SliderField
                        label={
                          profile.volume_override !== null
                            ? `Volume Override (${profile.volume_override}%)`
                            : "Volume Override (Disabled)"
                        }
                        value={profile.volume_override ?? 80}
                        min={0}
                        max={100}
                        step={5}
                        showValue
                        onChange={(val: number) =>
                          persistProfile(game.app_id, setVolumeOverride(profile, val))
                        }
                      />
                    </div>
                    {profile.volume_override !== null && (
                      <DialogButton
                        onClick={() => persistProfile(game.app_id, setVolumeOverride(profile, null))}
                        style={{ minWidth: 80, padding: "6px 10px", fontSize: 11 }}
                      >
                        Disable Vol
                      </DialogButton>
                    )}
                    {existingProfile && (
                      <DialogButton
                        onClick={() => handleDeleteProfile(game.app_id)}
                        style={{
                          minWidth: 40,
                          padding: "6px 10px",
                          fontSize: 11,
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <FaTrash size={11} />
                        <span>Reset</span>
                      </DialogButton>
                    )}
                  </Focusable>
                </Focusable>
              )}
            </Focusable>
          );
        })}
      </Focusable>
    </Focusable>
  );
};
