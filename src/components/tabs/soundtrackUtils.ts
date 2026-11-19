import {
  EqualizerPreset,
  InstalledGame,
  SoundtrackMode,
  SoundtrackPlaylist,
  SoundtrackProfile,
} from "../../types";

export const EQ_PRESET_LABELS: Record<EqualizerPreset, string> = {
  flat: "Flat",
  bass: "Bass Boost",
  vocal: "Vocal Clarity",
  gaming: "Gaming Balance",
  deck_speakers: "Deck Speakers",
  late_night: "Late Night",
  custom: "Custom",
};

export const EQ_OVERRIDE_OPTIONS: { data: "global" | EqualizerPreset; label: string }[] = [
  { data: "global", label: "Use Global" },
  { data: "flat", label: "Flat" },
  { data: "bass", label: "Bass Boost" },
  { data: "vocal", label: "Vocal Clarity" },
  { data: "gaming", label: "Gaming Balance" },
  { data: "deck_speakers", label: "Deck Speakers" },
  { data: "late_night", label: "Late Night" },
  { data: "custom", label: "Custom" },
];

export const MODE_OPTIONS: { data: SoundtrackMode; label: string }[] = [
  { data: "shuffle", label: "Multi-playlist Shuffle" },
  { data: "random", label: "Random Picker at Launch" },
  { data: "rotation", label: "Sequential Rotation" },
];

export const RESUME_OPTIONS = [
  { data: "remember_position", label: "Remember position (Seek)" },
  { data: "fresh_start", label: "Fresh start (Track 1)" },
];

export const EXIT_OPTIONS = [
  { data: "restore_snapshot", label: "Restore pre-game music" },
  { data: "pause", label: "Pause playback" },
  { data: "keep_playing", label: "Keep soundtrack playing" },
];

/** Debounce delay for persisting profile edits (T-07-04: avoid RPC thrashing). */
export const SAVE_DEBOUNCE_MS = 500;

export function defaultProfile(game: Pick<InstalledGame, "app_id" | "name">): SoundtrackProfile {
  return {
    app_id: game.app_id,
    app_name: game.name,
    playlists: [],
    mode: "shuffle",
    rotation_index: 0,
    resume_mode: "remember_position",
    always_auto_start: false,
    exit_policy: "restore_snapshot",
    volume_override: null,
    ducking_override: null,
    eq_preset: null,
    eq_custom_bands: null,
    ducking_level_override: null,
  };
}

/** Accept either `{ "<appid>": profile }` or `{ profiles: {...} }` shapes. */
export function normalizeProfiles(raw: any): Record<string, SoundtrackProfile> {
  if (!raw || typeof raw !== "object") return {};
  const source = raw.profiles && typeof raw.profiles === "object" ? raw.profiles : raw;
  const out: Record<string, SoundtrackProfile> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === "object" && Array.isArray((value as any).playlists)) {
      const v = value as any;
      out[String(key)] = {
        ...v,
        volume_override: v.volume_override ?? null,
        ducking_override: v.ducking_override ?? null,
        eq_preset: v.eq_preset ?? null,
        eq_custom_bands: Array.isArray(v.eq_custom_bands) ? v.eq_custom_bands : null,
        ducking_level_override: v.ducking_level_override ?? null,
      } as SoundtrackProfile;
    }
  }
  return out;
}

/** Running + configured games first, then alphabetical (D-03). */
export function sortGames(
  games: InstalledGame[],
  profiles: Record<string, SoundtrackProfile>,
  runningAppId: number | null = null,
): InstalledGame[] {
  const rank = (g: InstalledGame): number => {
    if (g.is_running || (runningAppId !== null && g.app_id === runningAppId)) return 0;
    if (profiles[String(g.app_id)]) return 1;
    return 2;
  };
  return [...games].sort((a, b) => {
    const d = rank(a) - rank(b);
    if (d !== 0) return d;
    return a.name.localeCompare(b.name);
  });
}

export function filterGames(games: InstalledGame[], query: string): InstalledGame[] {
  const q = query.trim().toLowerCase();
  if (!q) return games;
  return games.filter((g) => g.name.toLowerCase().includes(q));
}

export function addPlaylist(
  profile: SoundtrackProfile,
  item: SoundtrackPlaylist,
): SoundtrackProfile {
  if (!item.uri || profile.playlists.some((p) => p.uri === item.uri)) return profile;
  return { ...profile, playlists: [...profile.playlists, item] };
}

export function removePlaylist(profile: SoundtrackProfile, uri: string): SoundtrackProfile {
  return { ...profile, playlists: profile.playlists.filter((p) => p.uri !== uri) };
}

export function setMode(profile: SoundtrackProfile, mode: SoundtrackMode): SoundtrackProfile {
  return { ...profile, mode };
}

export function setVolumeOverride(
  profile: SoundtrackProfile,
  value: number | null,
): SoundtrackProfile {
  if (value === null) return { ...profile, volume_override: null };
  return { ...profile, volume_override: Math.max(0, Math.min(100, Math.round(value))) };
}

export function setDuckingOverride(
  profile: SoundtrackProfile,
  value: boolean | null,
): SoundtrackProfile {
  return { ...profile, ducking_override: value };
}

export function setEqPreset(
  profile: SoundtrackProfile,
  value: "global" | EqualizerPreset | null,
): SoundtrackProfile {
  if (!value || value === "global") {
    return { ...profile, eq_preset: null };
  }
  return { ...profile, eq_preset: value };
}

export function setEqCustomBands(
  profile: SoundtrackProfile,
  bands: number[] | null,
): SoundtrackProfile {
  if (bands === null) {
    return { ...profile, eq_custom_bands: null };
  }
  const normalized = Array.from({ length: 10 }, (_, idx) => {
    const raw = Number(bands[idx]);
    if (!Number.isFinite(raw)) return 0;
    return Math.round(Math.max(-12, Math.min(12, raw)) * 100) / 100;
  });
  return { ...profile, eq_custom_bands: normalized };
}

export function setDuckingLevelOverride(
  profile: SoundtrackProfile,
  value: number | null,
): SoundtrackProfile {
  if (value === null) {
    return { ...profile, ducking_level_override: null };
  }
  return { ...profile, ducking_level_override: Math.max(0, Math.min(95, Math.round(value))) };
}

export function formatGameProfileSubtitle(profile: SoundtrackProfile): string {
  const parts: string[] = [];
  const hasAudioOverride =
    profile.eq_preset != null ||
    profile.volume_override != null ||
    profile.ducking_override === false ||
    profile.ducking_level_override != null;

  if (profile.playlists.length > 0) {
    parts.push(`${profile.playlists.length} linked soundtrack${profile.playlists.length > 1 ? "s" : ""}`);
  } else if (hasAudioOverride) {
    parts.push("Audio profile only");
  } else {
    return "No soundtrack or audio overrides configured";
  }

  if (profile.eq_preset != null) {
    parts.push(`EQ: ${EQ_PRESET_LABELS[profile.eq_preset] ?? profile.eq_preset}`);
  }
  if (profile.volume_override != null) {
    parts.push(`Vol: ${profile.volume_override}%`);
  }
  if (profile.ducking_override === false) {
    parts.push("Duck: Off");
  } else if (profile.ducking_level_override != null) {
    parts.push(`Duck: ${profile.ducking_level_override}%`);
  }

  return parts.join(" • ");
}

/** Normalise any Spotify playlist/album/search item to a picker selection. */
export function toSelection(item: any): SoundtrackPlaylist {
  let uri = item?.uri ? String(item.uri) : "";
  if (!uri && item?.id) {
    const isAlbum = "artist" in item || item?.type === "album";
    uri = isAlbum ? `spotify:album:${item.id}` : `spotify:playlist:${item.id}`;
  }
  return {
    uri,
    name: String(item?.name || ""),
    image: item?.image_url || item?.artwork_url || item?.image || undefined,
  };
}
