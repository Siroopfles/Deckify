import {
  FC,
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  Dispatch,
  SetStateAction,
  MutableRefObject,
} from "react";
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
import { FaGamepad, FaPlus, FaTimes, FaTrash, FaSearch, FaMusic, FaSlidersH } from "react-icons/fa";
import {
  EqualizerPreset,
  InstalledGame,
  SoundtrackMode,
  SoundtrackPlaylist,
  SoundtrackProfile,
} from "../../types";
import { DeckifyImage } from "../common/DeckifyImage";
import { InteractiveRow } from "../common/InteractiveRow";
import { EQ_PRESET_CURVES, normalizeEqBands } from "../common/EqBandFaders";
import { PlaylistPickerModal } from "./PlaylistPickerModal";
import { GameEqModal } from "./GameEqModal";
import {
  EQ_OVERRIDE_OPTIONS,
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
  setEqPreset,
  setEqCustomBands,
  setVolumeOverride,
  setDuckingOverride,
  setDuckingLevelOverride,
  formatGameProfileSubtitle,
} from "./soundtrackUtils";

type TextFieldPropsLike = {
  value?: string;
  onChange?: (event: unknown) => void;
  placeholder?: string;
};

const TextFieldCompat = TextField as unknown as FC<TextFieldPropsLike>;

const SAVE_ERROR_MESSAGE =
  "Failed to save game audio profile — verify Decky storage permissions and try again.";

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
  globalEqPreset?: EqualizerPreset;
  globalEqCustomBands?: number[];
  globalDuckingPct?: number;
  showToast?: (msg: string) => void;
  onPickerOpenChange?: (open: boolean) => void;
}

type PersistFn = (appId: number, updated: SoundtrackProfile, immediate?: boolean) => void;

function extractTextFieldValue(event: unknown): string {
  if (typeof event === "string") return event;
  if (event && typeof event === "object" && "target" in event) {
    const target = (event as { target?: { value?: unknown } }).target;
    if (typeof target?.value === "string") return target.value;
  }
  return "";
}

function resolveSeedBands(
  globalEqPreset: EqualizerPreset = "flat",
  globalEqCustomBands?: number[]
): number[] {
  if (globalEqPreset === "custom") {
    return normalizeEqBands(globalEqCustomBands);
  }
  return [...(EQ_PRESET_CURVES[globalEqPreset] || EQ_PRESET_CURVES.flat)];
}

function patchProfileAppName(profile: SoundtrackProfile, fallbackName: string): SoundtrackProfile {
  const cleanFallback = fallbackName.trim();
  if (profile.app_name?.trim() || !cleanFallback) return profile;
  return { ...profile, app_name: cleanFallback };
}

function backfillProfileAppNames(
  profiles: Record<string, SoundtrackProfile>,
  games: InstalledGame[]
): Record<string, SoundtrackProfile> {
  if (games.length === 0) return profiles;
  const namesById = new Map<string, string>();
  for (const game of games) {
    const cleanName = game.name?.trim();
    if (cleanName) namesById.set(String(game.app_id), cleanName);
  }
  const next: Record<string, SoundtrackProfile> = {};
  for (const [key, prof] of Object.entries(profiles)) {
    const fallback = namesById.get(key) || namesById.get(String(prof.app_id)) || "";
    next[key] = fallback ? patchProfileAppName(prof, fallback) : prof;
  }
  return next;
}

function executeSaveProfile(
  appId: number,
  updated: SoundtrackProfile,
  showToast?: (msg: string) => void
): Promise<{ ok: boolean; error?: string }> {
  return backendSaveProfile(appId, updated)
    .then((res) => {
      if (!res?.ok) {
        showToast?.(SAVE_ERROR_MESSAGE);
        return res && typeof res === "object" ? res : { ok: false };
      }
      return res;
    })
    .catch(() => {
      showToast?.(SAVE_ERROR_MESSAGE);
      return { ok: false };
    });
}

function renderTabHeader() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <div>
        <h2
          style={{
            margin: 0,
            fontSize: 20,
            fontWeight: 700,
            lineHeight: 1.2,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <FaGamepad size={18} color="var(--deckify-accent, #1DB954)" />
          <span>Game Soundtracks</span>
        </h2>
        <div style={{ fontSize: 14, fontWeight: 400, lineHeight: 1.5, opacity: 0.65, marginTop: 4 }}>
          Link Spotify playlists or albums and configure per-game EQ &amp; volume profiles for Steam &amp; Non-Steam games.
        </div>
      </div>
    </div>
  );
}

function renderSearchBar(searchQuery: string, onChangeQuery: (value: string) => void) {
  return (
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
      <div style={{ flex: 1, minWidth: 0 }}>
        <TextFieldCompat
          value={searchQuery}
          onChange={(e) => onChangeQuery(extractTextFieldValue(e))}
          placeholder="Filter installed games..."
        />
      </div>
    </Focusable>
  );
}

function renderStatusBanner(loading: boolean, gamesCount: number, visibleCount: number) {
  if (loading && gamesCount === 0) {
    return (
      <div style={{ padding: 24, textAlign: "center", opacity: 0.6, fontSize: 14, lineHeight: 1.5 }}>
        Scanning installed Steam &amp; Non-Steam games...
      </div>
    );
  }
  if (!loading && visibleCount === 0) {
    return (
      <div style={{ padding: 24, textAlign: "center", display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.2 }}>
          No Game Profiles Configured
        </div>
        <div style={{ fontSize: 14, fontWeight: 400, lineHeight: 1.5, opacity: 0.65 }}>
          No Steam or Non-Steam games matched your search. Clear the filter box above to browse all installed games.
        </div>
      </div>
    );
  }
  return null;
}

function renderGameThumbnail(iconUrl?: string) {
  if (iconUrl) {
    return (
      <DeckifyImage
        src={iconUrl}
        width={48}
        height={48}
        style={{ borderRadius: 6, flexShrink: 0 }}
        fallback={<FaGamepad size={18} color="#888" />}
      />
    );
  }
  return (
    <div
      style={{
        width: 48,
        height: 48,
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
  );
}

function renderGameBadges(isRunning: boolean, isNonSteam?: boolean) {
  return [
    isRunning ? (
      <span
        key="running"
        style={{
          background: "rgba(var(--deckify-accent-rgb, 29, 185, 84), 0.2)",
          color: "var(--deckify-accent, #1DB954)",
          fontSize: 12,
          fontWeight: 700,
          lineHeight: 1.3,
          padding: "2px 6px",
          borderRadius: 4,
          flexShrink: 0,
        }}
      >
        Running
      </span>
    ) : null,
    isNonSteam ? (
      <span
        key="non-steam"
        style={{
          background: "rgba(255,255,255,0.1)",
          color: "#fff",
          fontSize: 12,
          fontWeight: 700,
          lineHeight: 1.3,
          padding: "2px 6px",
          borderRadius: 4,
          flexShrink: 0,
        }}
      >
        Non-Steam
      </span>
    ) : null,
  ];
}

function renderGameHeader(opts: {
  game: InstalledGame;
  profile: SoundtrackProfile;
  isRunning: boolean;
  onToggle: () => void;
}) {
  const { game, profile, isRunning, onToggle } = opts;
  return (
    <InteractiveRow
      data-deckify-list-item="true"
      data-deckify-label={game.name || ""}
      onClick={onToggle}
      style={{ gap: 10, padding: "4px 6px" }}
    >
      {renderGameThumbnail(game.icon_url)}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span
            style={{
              fontSize: 16,
              fontWeight: 700,
              lineHeight: 1.2,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {game.name}
          </span>
          {renderGameBadges(isRunning, game.is_non_steam)}
        </div>
        <div style={{ fontSize: 12, fontWeight: 400, lineHeight: 1.3, opacity: 0.65, marginTop: 2 }}>
          {formatGameProfileSubtitle(profile)}
        </div>
      </div>
    </InteractiveRow>
  );
}

function renderPlaylistSection(opts: {
  game: InstalledGame;
  profile: SoundtrackProfile;
  onPersist: PersistFn;
  onOpenPicker: (game: InstalledGame) => void;
}) {
  const { game, profile, onPersist, onOpenPicker } = opts;
  return (
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
            <FaMusic size={12} color="var(--deckify-accent, #1DB954)" />
          )}
          <span style={{ fontSize: 12, fontWeight: 700 }}>{pl.name}</span>
          <DialogButton
            onClick={() => onPersist(game.app_id, removePlaylist(profile, pl.uri))}
            aria-label={`Remove ${pl.name}`}
            style={{
              width: "auto",
              minWidth: 24,
              flexShrink: 0,
              padding: "2px 6px",
              fontSize: 12,
              background: "transparent",
            }}
          >
            <FaTimes size={10} />
          </DialogButton>
        </Focusable>
      ))}

      <DialogButton
        onClick={() => onOpenPicker(game)}
        style={{
          width: "auto",
          minWidth: "auto",
          display: "flex",
          alignItems: "center",
          gap: 6,
          minHeight: 44,
          padding: "6px 12px",
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        <FaPlus size={11} />
        <span>Add Playlist / Album</span>
      </DialogButton>
    </Focusable>
  );
}

function renderPlaybackDropdowns(opts: {
  game: InstalledGame;
  profile: SoundtrackProfile;
  onPersist: PersistFn;
}) {
  const { game, profile, onPersist } = opts;
  return (
    <Focusable
      flow-children="horizontal"
      style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
    >
      <div style={{ flex: "1 1 180px", minWidth: 0 }}>
        <DropdownItem
          label="Playback Mode"
          rgOptions={MODE_OPTIONS}
          selectedOption={profile.mode}
          onChange={(opt: { data: SoundtrackMode }) =>
            onPersist(game.app_id, setMode(profile, opt.data))
          }
        />
      </div>
      <div style={{ flex: "1 1 180px", minWidth: 0 }}>
        <DropdownItem
          label="Resume Mode"
          rgOptions={RESUME_OPTIONS}
          selectedOption={profile.resume_mode}
          onChange={(opt: { data: "remember_position" | "fresh_start" }) =>
            onPersist(game.app_id, { ...profile, resume_mode: opt.data })
          }
        />
      </div>
      <div style={{ flex: "1 1 180px", minWidth: 0 }}>
        <DropdownItem
          label="On Game Exit"
          rgOptions={EXIT_OPTIONS}
          selectedOption={profile.exit_policy}
          onChange={(opt: { data: "restore_snapshot" | "pause" | "keep_playing" }) =>
            onPersist(game.app_id, { ...profile, exit_policy: opt.data })
          }
        />
      </div>
    </Focusable>
  );
}

function renderEqPresetRow(opts: {
  game: InstalledGame;
  profile: SoundtrackProfile;
  isRunning: boolean;
  onPersist: PersistFn;
  onOpenEqModal: (game: InstalledGame, profile: SoundtrackProfile, isRunning: boolean) => void;
}) {
  const { game, profile, isRunning, onPersist, onOpenEqModal } = opts;
  return (
    <Focusable
      flow-children="horizontal"
      style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}
    >
      <div style={{ flex: "1 1 220px", minWidth: 0 }}>
        <DropdownItem
          label="EQ Preset Override"
          rgOptions={EQ_OVERRIDE_OPTIONS}
          selectedOption={profile.eq_preset ?? "global"}
          onChange={(opt: { data: "global" | EqualizerPreset }) =>
            onPersist(game.app_id, setEqPreset(profile, opt.data), isRunning)
          }
        />
      </div>
      {profile.eq_preset === "custom" && (
        <DialogButton
          onClick={() => onOpenEqModal(game, profile, isRunning)}
          style={{
            width: "auto",
            minWidth: "auto",
            minHeight: 44,
            padding: "8px 12px",
            fontSize: 12,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexShrink: 0,
          }}
        >
          <FaSlidersH size={12} />
          <span>Edit Game EQ</span>
        </DialogButton>
      )}
    </Focusable>
  );
}

function renderAutoAndDuckTogglesRow(opts: {
  game: InstalledGame;
  profile: SoundtrackProfile;
  isRunning: boolean;
  onPersist: PersistFn;
}) {
  const { game, profile, isRunning, onPersist } = opts;
  return (
    <Focusable
      flow-children="horizontal"
      style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}
    >
      <div style={{ flex: "1 1 220px", minWidth: 0 }}>
        <ToggleField
          label="Always auto-start soundtrack"
          checked={profile.always_auto_start}
          onChange={(val: boolean) =>
            onPersist(game.app_id, { ...profile, always_auto_start: val })
          }
        />
      </div>
      <div style={{ flex: "1 1 220px", minWidth: 0 }}>
        <ToggleField
          label="Ducking Override (Skip game ducking when off)"
          checked={profile.ducking_override !== false}
          onChange={(val: boolean) =>
            onPersist(game.app_id, setDuckingOverride(profile, val), isRunning)
          }
        />
      </div>
    </Focusable>
  );
}

function renderVolumeOverrideRow(opts: {
  game: InstalledGame;
  profile: SoundtrackProfile;
  isRunning: boolean;
  onPersist: PersistFn;
}) {
  const { game, profile, isRunning, onPersist } = opts;
  const volumeEnabled = profile.volume_override != null;
  return (
    <Focusable
      flow-children="column"
      style={{ display: "flex", flexDirection: "column", gap: 4 }}
    >
      <ToggleField
        label="Volume Override"
        description={
          volumeEnabled
            ? `Capped at ${profile.volume_override}% relative to global volume`
            : "Disabled — using global volume"
        }
        checked={volumeEnabled}
        onChange={(enabled: boolean) =>
          onPersist(game.app_id, setVolumeOverride(profile, enabled ? 80 : null), isRunning)
        }
      />
      {volumeEnabled && profile.volume_override != null && (
        <SliderField
          label={`Volume Override (${profile.volume_override}%)`}
          value={profile.volume_override}
          min={0}
          max={100}
          step={5}
          showValue
          onChange={(val: number) =>
            onPersist(game.app_id, setVolumeOverride(profile, val), isRunning)
          }
        />
      )}
    </Focusable>
  );
}

function renderDuckingOverrideRow(opts: {
  game: InstalledGame;
  profile: SoundtrackProfile;
  isRunning: boolean;
  globalDuckingPct: number;
  onPersist: PersistFn;
}) {
  const { game, profile, isRunning, globalDuckingPct, onPersist } = opts;
  const fallbackDucking = Math.min(95, Math.max(0, globalDuckingPct));
  const duckingDisabled = profile.ducking_override === false;
  const customDuckingEnabled = profile.ducking_level_override != null;
  const description = duckingDisabled
    ? "Game ducking disabled above"
    : customDuckingEnabled
      ? `Duck by ${profile.ducking_level_override}% during gameplay`
      : `Using global ducking (${fallbackDucking}%)`;
  return (
    <Focusable
      flow-children="column"
      style={{ display: "flex", flexDirection: "column", gap: 4 }}
    >
      <ToggleField
        label="Custom Ducking Level"
        description={description}
        checked={customDuckingEnabled}
        disabled={duckingDisabled}
        onChange={(enabled: boolean) =>
          onPersist(
            game.app_id,
            setDuckingLevelOverride(profile, enabled ? fallbackDucking : null),
            isRunning
          )
        }
      />
      {customDuckingEnabled && profile.ducking_level_override != null && (
        <SliderField
          label={`Ducking Attenuation Override (${profile.ducking_level_override}%)`}
          value={profile.ducking_level_override}
          min={0}
          max={95}
          step={5}
          showValue
          disabled={duckingDisabled}
          onChange={(val: number) =>
            onPersist(game.app_id, setDuckingLevelOverride(profile, val), isRunning)
          }
        />
      )}
    </Focusable>
  );
}

function renderProfileDeleteActions(opts: {
  appId: number;
  isConfirming: boolean;
  onStartConfirm: (appId: number) => void;
  onCancelConfirm: () => void;
  onConfirmDelete: (appId: number) => void;
}) {
  const { appId, isConfirming, onStartConfirm, onCancelConfirm, onConfirmDelete } = opts;
  if (!isConfirming) {
    return (
      <Focusable
        flow-children="horizontal"
        style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}
      >
        <DialogButton
          onClick={() => onStartConfirm(appId)}
          style={{
            width: "auto",
            minWidth: "auto",
            minHeight: 44,
            padding: "6px 12px",
            fontSize: 12,
            fontWeight: 700,
            color: "#E53935",
            border: "1px solid rgba(229, 57, 53, 0.45)",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <FaTrash size={11} />
          <span>Delete Game Profile</span>
        </DialogButton>
      </Focusable>
    );
  }
  return (
    <Focusable
      flow-children="horizontal"
      style={{ display: "flex", justifyContent: "flex-end", gap: 8, alignItems: "center" }}
    >
      <DialogButton
        onClick={onCancelConfirm}
        style={{
          width: "auto",
          minWidth: "auto",
          minHeight: 44,
          padding: "6px 12px",
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        Keep Profile
      </DialogButton>
      <DialogButton
        onClick={() => onConfirmDelete(appId)}
        style={{
          width: "auto",
          minWidth: "auto",
          minHeight: 44,
          padding: "6px 12px",
          fontSize: 12,
          fontWeight: 700,
          background: "#E53935",
          color: "#fff",
          border: "1px solid #E53935",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <FaTrash size={11} />
        <span>Confirm Delete</span>
      </DialogButton>
    </Focusable>
  );
}

function renderGameCard(opts: {
  game: InstalledGame;
  existingProfile: SoundtrackProfile | undefined;
  profile: SoundtrackProfile;
  isRunning: boolean;
  isExpanded: boolean;
  isConfirmingDelete: boolean;
  globalDuckingPct: number;
  onToggleExpand: () => void;
  onPersist: PersistFn;
  onOpenPicker: (game: InstalledGame) => void;
  onOpenEqModal: (game: InstalledGame, profile: SoundtrackProfile, isRunning: boolean) => void;
  onStartConfirmDelete: (appId: number) => void;
  onCancelConfirmDelete: () => void;
  onConfirmDelete: (appId: number) => void;
}) {
  const {
    game,
    existingProfile,
    profile,
    isRunning,
    isExpanded,
    isConfirmingDelete,
    globalDuckingPct,
    onToggleExpand,
    onPersist,
    onOpenPicker,
    onOpenEqModal,
    onStartConfirmDelete,
    onCancelConfirmDelete,
    onConfirmDelete,
  } = opts;

  return (
    <Focusable
      key={game.app_id}
      flow-children="column"
      style={{
        background: isRunning ? "rgba(var(--deckify-accent-rgb, 29, 185, 84), 0.08)" : "rgba(255,255,255,0.04)",
        border: isRunning ? "1px solid rgba(var(--deckify-accent-rgb, 29, 185, 84), 0.35)" : "1px solid rgba(255,255,255,0.08)",
        borderRadius: 10,
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      {renderGameHeader({ game, profile, isRunning, onToggle: onToggleExpand })}
      {isExpanded && (
        <Focusable
          flow-children="column"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            paddingTop: 8,
            borderTop: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          {renderPlaylistSection({ game, profile, onPersist, onOpenPicker })}
          {renderPlaybackDropdowns({ game, profile, onPersist })}
          {renderEqPresetRow({ game, profile, isRunning, onPersist, onOpenEqModal })}
          {renderAutoAndDuckTogglesRow({ game, profile, isRunning, onPersist })}
          {renderVolumeOverrideRow({ game, profile, isRunning, onPersist })}
          {renderDuckingOverrideRow({ game, profile, isRunning, globalDuckingPct, onPersist })}
          {existingProfile &&
            renderProfileDeleteActions({
              appId: game.app_id,
              isConfirming: isConfirmingDelete,
              onStartConfirm: onStartConfirmDelete,
              onCancelConfirm: onCancelConfirmDelete,
              onConfirmDelete,
            })}
        </Focusable>
      )}
    </Focusable>
  );
}

type PendingSaveEntry = { appId: number; profile: SoundtrackProfile };

function clearPendingSaveTimer(
  timers: Record<string, ReturnType<typeof setTimeout>>,
  key: string
) {
  if (timers[key]) {
    clearTimeout(timers[key]);
    delete timers[key];
  }
}

function flushPendingSaves(
  timers: Record<string, ReturnType<typeof setTimeout>>,
  pendingSaves: Record<string, PendingSaveEntry>,
  showToast?: (msg: string) => void
) {
  for (const key of Object.keys(timers)) {
    clearPendingSaveTimer(timers, key);
  }
  const entries = Object.values(pendingSaves);
  for (const key of Object.keys(pendingSaves)) {
    delete pendingSaves[key];
  }
  for (const entry of entries) {
    void executeSaveProfile(entry.appId, entry.profile, showToast);
  }
}

function clearCollapsedAppId(
  setCollapsedAppIds: Dispatch<SetStateAction<Record<number, boolean>>>,
  appId: number
) {
  setCollapsedAppIds((prev) => {
    if (!(appId in prev)) return prev;
    const next = { ...prev };
    delete next[appId];
    return next;
  });
}

function useProfileSaveActions(opts: {
  setProfiles: Dispatch<SetStateAction<Record<string, SoundtrackProfile>>>;
  setConfirmDeleteAppId: Dispatch<SetStateAction<number | null>>;
  setCollapsedAppIds: Dispatch<SetStateAction<Record<number, boolean>>>;
  showToast?: (msg: string) => void;
}) {
  const { setProfiles, setConfirmDeleteAppId, setCollapsedAppIds, showToast } = opts;
  const saveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const pendingSavesRef = useRef<Record<string, PendingSaveEntry>>({});

  const saveImmediate = useCallback(
    (appId: number, updated: SoundtrackProfile) => {
      const key = String(appId);
      clearPendingSaveTimer(saveTimersRef.current, key);
      delete pendingSavesRef.current[key];
      return executeSaveProfile(appId, updated, showToast);
    },
    [showToast]
  );

  const scheduleSave = useCallback(
    (appId: number, updated: SoundtrackProfile) => {
      const key = String(appId);
      clearPendingSaveTimer(saveTimersRef.current, key);
      pendingSavesRef.current[key] = { appId, profile: updated };
      saveTimersRef.current[key] = setTimeout(() => {
        delete saveTimersRef.current[key];
        delete pendingSavesRef.current[key];
        void executeSaveProfile(appId, updated, showToast);
      }, SAVE_DEBOUNCE_MS);
    },
    [showToast]
  );

  const persistProfile: PersistFn = useCallback(
    (appId: number, updated: SoundtrackProfile, immediate = false) => {
      const key = String(appId);
      setProfiles((prev) => ({ ...prev, [key]: updated }));
      if (immediate) void saveImmediate(appId, updated);
      else scheduleSave(appId, updated);
    },
    [setProfiles, saveImmediate, scheduleSave]
  );

  const handleDeleteProfile = useCallback(
    async (appId: number) => {
      const key = String(appId);
      clearPendingSaveTimer(saveTimersRef.current, key);
      delete pendingSavesRef.current[key];
      try {
        const res = await backendDeleteProfile(appId);
        if (!res?.ok) {
          showToast?.(SAVE_ERROR_MESSAGE);
          return;
        }
        setProfiles((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
        setConfirmDeleteAppId((prev) => (prev === appId ? null : prev));
        clearCollapsedAppId(setCollapsedAppIds, appId);
        showToast?.("Game audio & soundtrack profile deleted");
      } catch {
        showToast?.(SAVE_ERROR_MESSAGE);
      }
    },
    [setProfiles, setConfirmDeleteAppId, setCollapsedAppIds, showToast]
  );

  return {
    saveTimersRef,
    pendingSavesRef,
    saveImmediate,
    scheduleSave,
    persistProfile,
    handleDeleteProfile,
  };
}

function applyGameEqBands(
  profile: SoundtrackProfile,
  fallbackName: string,
  bands: number[]
): SoundtrackProfile {
  return setEqCustomBands(setEqPreset(patchProfileAppName(profile, fallbackName), "custom"), bands);
}

function useGameModalActions(opts: {
  profilesRef: MutableRefObject<Record<string, SoundtrackProfile>>;
  setProfiles: Dispatch<SetStateAction<Record<string, SoundtrackProfile>>>;
  globalEqPreset: EqualizerPreset;
  globalEqCustomBands?: number[];
  scheduleSave: (appId: number, updated: SoundtrackProfile) => void;
  saveImmediate: (appId: number, updated: SoundtrackProfile) => Promise<{ ok: boolean; error?: string }>;
  showToast?: (msg: string) => void;
  onPickerOpenChangeRef: MutableRefObject<((open: boolean) => void) | undefined>;
}) {
  const {
    profilesRef,
    setProfiles,
    globalEqPreset,
    globalEqCustomBands,
    scheduleSave,
    saveImmediate,
    showToast,
    onPickerOpenChangeRef,
  } = opts;

  const openPlaylistPicker = useCallback(
    (game: InstalledGame) => {
      const key = String(game.app_id);
      onPickerOpenChangeRef.current?.(true);
      showModal(
        <PlaylistPickerModal
          onClose={() => onPickerOpenChangeRef.current?.(false)}
          onSelect={(item: SoundtrackPlaylist) => {
            setProfiles((prev) => {
              const current = patchProfileAppName(prev[key] || defaultProfile(game), game.name);
              const updated = addPlaylist(current, item);
              scheduleSave(game.app_id, updated);
              return { ...prev, [key]: updated };
            });
          }}
        />
      );
    },
    [setProfiles, scheduleSave, onPickerOpenChangeRef]
  );

  const openGameEqModal = useCallback(
    (game: InstalledGame, profile: SoundtrackProfile, isRunning: boolean) => {
      const key = String(game.app_id);
      const seedBands = resolveSeedBands(globalEqPreset, globalEqCustomBands);
      onPickerOpenChangeRef.current?.(true);
      showModal(
        <GameEqModal
          gameName={game.name}
          initialBands={profile.eq_custom_bands}
          seedBands={seedBands}
          isRunningGame={isRunning}
          showToast={showToast}
          onClose={() => onPickerOpenChangeRef.current?.(false)}
          onSave={(bands: number[]) => {
            const next = applyGameEqBands(profilesRef.current[key] || profile, game.name, bands);
            setProfiles((prev) => ({
              ...prev,
              [key]: applyGameEqBands(prev[key] || profile, game.name, bands),
            }));
            return saveImmediate(game.app_id, next);
          }}
        />
      );
    },
    [
      profilesRef,
      setProfiles,
      globalEqPreset,
      globalEqCustomBands,
      saveImmediate,
      showToast,
      onPickerOpenChangeRef,
    ]
  );

  return { openPlaylistPicker, openGameEqModal };
}

function useInitialSoundtrackLoad(opts: {
  setGames: Dispatch<SetStateAction<InstalledGame[]>>;
  setProfiles: Dispatch<SetStateAction<Record<string, SoundtrackProfile>>>;
  setLoading: Dispatch<SetStateAction<boolean>>;
  saveTimersRef: MutableRefObject<Record<string, ReturnType<typeof setTimeout>>>;
  pendingSavesRef: MutableRefObject<Record<string, PendingSaveEntry>>;
  showToastRef: MutableRefObject<((msg: string) => void) | undefined>;
  onPickerOpenChangeRef: MutableRefObject<((open: boolean) => void) | undefined>;
}) {
  const {
    setGames,
    setProfiles,
    setLoading,
    saveTimersRef,
    pendingSavesRef,
    showToastRef,
    onPickerOpenChangeRef,
  } = opts;
  useEffect(() => {
    let mounted = true;
    const timers = saveTimersRef.current;
    const pendingSaves = pendingSavesRef.current;
    const pickerOpenRef = onPickerOpenChangeRef;
    const toastRef = showToastRef;
    Promise.all([
      backendGetInstalledGames(false).catch(() => []),
      backendGetProfiles().catch(() => ({})),
    ]).then(([fetchedGames, fetchedProfiles]) => {
      if (!mounted) return;
      const gamesList = Array.isArray(fetchedGames) ? fetchedGames : [];
      if (gamesList.length > 0) setGames(gamesList);
      if (fetchedProfiles && typeof fetchedProfiles === "object") {
        const norm = normalizeProfiles(fetchedProfiles);
        if (Object.keys(norm).length > 0) {
          setProfiles(backfillProfileAppNames(norm, gamesList));
        }
      }
      setLoading(false);
    });
    return () => {
      mounted = false;
      pickerOpenRef.current?.(false);
      flushPendingSaves(timers, pendingSaves, toastRef.current);
    };
  }, [
    setGames,
    setProfiles,
    setLoading,
    saveTimersRef,
    pendingSavesRef,
    showToastRef,
    onPickerOpenChangeRef,
  ]);
}

function toggleGameCardExpand(opts: {
  appId: number;
  isDefaultExpanded: boolean;
  expandedAppId: number | null;
  setConfirmDeleteAppId: Dispatch<SetStateAction<number | null>>;
  setExpandedAppId: Dispatch<SetStateAction<number | null>>;
  setCollapsedAppIds: Dispatch<SetStateAction<Record<number, boolean>>>;
}) {
  const {
    appId,
    isDefaultExpanded,
    expandedAppId,
    setConfirmDeleteAppId,
    setExpandedAppId,
    setCollapsedAppIds,
  } = opts;
  setConfirmDeleteAppId(null);
  if (isDefaultExpanded) {
    setCollapsedAppIds((prev) => ({ ...prev, [appId]: !prev[appId] }));
    if (expandedAppId === appId) {
      setExpandedAppId(null);
    }
    return;
  }
  setExpandedAppId(expandedAppId === appId ? null : appId);
}

function renderGamesList(opts: {
  visibleGames: InstalledGame[];
  profiles: Record<string, SoundtrackProfile>;
  runningAppId: number | null;
  expandedAppId: number | null;
  collapsedAppIds: Record<number, boolean>;
  confirmDeleteAppId: number | null;
  globalDuckingPct: number;
  setConfirmDeleteAppId: Dispatch<SetStateAction<number | null>>;
  setExpandedAppId: Dispatch<SetStateAction<number | null>>;
  setCollapsedAppIds: Dispatch<SetStateAction<Record<number, boolean>>>;
  persistProfile: PersistFn;
  openPlaylistPicker: (game: InstalledGame) => void;
  openGameEqModal: (game: InstalledGame, profile: SoundtrackProfile, isRunning: boolean) => void;
  handleDeleteProfile: (appId: number) => Promise<void>;
}) {
  const {
    visibleGames,
    profiles,
    runningAppId,
    expandedAppId,
    collapsedAppIds,
    confirmDeleteAppId,
    globalDuckingPct,
    setConfirmDeleteAppId,
    setExpandedAppId,
    setCollapsedAppIds,
    persistProfile,
    openPlaylistPicker,
    openGameEqModal,
    handleDeleteProfile,
  } = opts;
  return (
    <Focusable flow-children="column" data-deckify-sorted="az" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {visibleGames.map((game) => {
        const existingProfile = profiles[String(game.app_id)];
        const profile = existingProfile
          ? patchProfileAppName(existingProfile, game.name)
          : defaultProfile(game);
        const isRunning = Boolean(game.is_running || (runningAppId !== null && game.app_id === runningAppId));
        const isDefaultExpanded = Boolean(existingProfile) || isRunning;
        const isExpanded = isDefaultExpanded ? !collapsedAppIds[game.app_id] : expandedAppId === game.app_id;
        return renderGameCard({
          game,
          existingProfile,
          profile,
          isRunning,
          isExpanded,
          isConfirmingDelete: confirmDeleteAppId === game.app_id,
          globalDuckingPct,
          onToggleExpand: () =>
            toggleGameCardExpand({
              appId: game.app_id,
              isDefaultExpanded,
              expandedAppId,
              setConfirmDeleteAppId,
              setExpandedAppId,
              setCollapsedAppIds,
            }),
          onPersist: persistProfile,
          onOpenPicker: openPlaylistPicker,
          onOpenEqModal: openGameEqModal,
          onStartConfirmDelete: (appId) => setConfirmDeleteAppId(appId),
          onCancelConfirmDelete: () => setConfirmDeleteAppId(null),
          onConfirmDelete: handleDeleteProfile,
        });
      })}
    </Focusable>
  );
}

export const SoundtracksTab: FC<SoundtracksTabProps> = ({
  runningAppId = null,
  initialGames,
  initialProfiles,
  globalEqPreset = "flat",
  globalEqCustomBands,
  globalDuckingPct = 50,
  showToast,
  onPickerOpenChange,
}) => {
  const [games, setGames] = useState<InstalledGame[]>(initialGames || []);
  const [profiles, setProfiles] = useState<Record<string, SoundtrackProfile>>(
    initialProfiles
      ? backfillProfileAppNames(normalizeProfiles(initialProfiles), initialGames || [])
      : {}
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedAppId, setExpandedAppId] = useState<number | null>(runningAppId ?? null);
  const [loading, setLoading] = useState(!initialGames);
  const [confirmDeleteAppId, setConfirmDeleteAppId] = useState<number | null>(null);
  const [collapsedAppIds, setCollapsedAppIds] = useState<Record<number, boolean>>({});

  const profilesRef = useRef(profiles);
  profilesRef.current = profiles;
  const onPickerOpenChangeRef = useRef(onPickerOpenChange);
  onPickerOpenChangeRef.current = onPickerOpenChange;
  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;

  const {
    saveTimersRef, pendingSavesRef, saveImmediate, scheduleSave, persistProfile, handleDeleteProfile,
  } = useProfileSaveActions({ setProfiles, setConfirmDeleteAppId, setCollapsedAppIds, showToast });

  const { openPlaylistPicker, openGameEqModal } = useGameModalActions({
    profilesRef, setProfiles, globalEqPreset, globalEqCustomBands,
    scheduleSave, saveImmediate, showToast, onPickerOpenChangeRef,
  });

  useInitialSoundtrackLoad({
    setGames, setProfiles, setLoading, saveTimersRef, pendingSavesRef, showToastRef, onPickerOpenChangeRef,
  });

  const visibleGames = useMemo(
    () => sortGames(filterGames(games, searchQuery), profiles, runningAppId),
    [games, searchQuery, profiles, runningAppId]
  );

  return (
    <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {renderTabHeader()}
      {renderSearchBar(searchQuery, setSearchQuery)}
      {renderStatusBanner(loading, games.length, visibleGames.length)}
      {renderGamesList({
        visibleGames, profiles, runningAppId, expandedAppId, collapsedAppIds, confirmDeleteAppId,
        globalDuckingPct, setConfirmDeleteAppId, setExpandedAppId, setCollapsedAppIds,
        persistProfile, openPlaylistPicker, openGameEqModal, handleDeleteProfile,
      })}
    </Focusable>
  );
};
