# Phase 22: Spotify Connect Hub 2.0 & Native Crossfade - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-22
**Phase:** 22-Spotify Connect Hub 2.0 & Native Crossfade
**Areas discussed:** DevicesTab Hub Layout & Engine Badges, 1-Click Pull Playback & Remote Volume, Native Crossfade Configuration & Engine Sync, Error Handling & Refresh Behavior

---

## DevicesTab Hub Layout & Engine Badges

| Option | Description | Selected |
|--------|-------------|----------|
| Distinct device icons + inline engine pill badge (Recommended) | Show react-icons per device type, inline engine badge (`librespot` / `spotifyd` / `Spotify Client`), and highlight local Steam Deck card at top with Refresh | ✓ |
| Minimal text list | Keep existing plain text `d.type` string without icons or engine badge | |

**User's choice:** Auto-selected recommended option (`--auto` mode)
**Notes:** `[auto] DevicesTab Hub Layout & Engine Badges — Q: "How should device type icons and engine badges be displayed?" → Selected: "Distinct device icons + inline engine pill badge" (recommended default)`

---

## 1-Click Pull Playback & Remote Volume

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-waking Pull button + 300ms debounced remote volume slider (Recommended) | Wake local engine via PowerGovernor/start_engine, poll get_devices, transfer playback with play=True; add 300ms debounced SliderField for remote device volume | ✓ |
| Transfer only without auto-wake | Require user to manually start engine before transferring | |

**User's choice:** Auto-selected recommended option (`--auto` mode)
**Notes:** `[auto] 1-Click Pull Playback & Remote Volume — Q: "How should Pull Playback and remote volume work?" → Selected: "Auto-waking Pull button + 300ms debounced remote volume slider" (recommended default)`

---

## Native Crossfade Configuration & Engine Sync

| Option | Description | Selected |
|--------|-------------|----------|
| SettingsTab 0–12s slider + 3-path engine sync (Recommended) | Add 0–12s SliderField in SettingsTab, sync CDP prefs + engine config + local VolumeFader boundary fallback | ✓ |
| CDP-only crossfade | Only configure crossfade when Spotify Client CDP is active | |

**User's choice:** Auto-selected recommended option (`--auto` mode)
**Notes:** `[auto] Native Crossfade Configuration & Engine Sync — Q: "How should Crossfade (0–12s) be configured and synchronized?" → Selected: "SettingsTab 0–12s slider + 3-path engine sync" (recommended default)`

---

## Error Handling & Refresh Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Inline empty state + Fixed Volume badge + toast errors (Recommended) | Show Wake Local Engine / Refresh buttons when empty, Fixed Volume badge when volume_percent is null, and showToast on errors | ✓ |
| Silent fallback | Hide controls when unavailable without user feedback | |

**User's choice:** Auto-selected recommended option (`--auto` mode)
**Notes:** `[auto] Error Handling & Refresh Behavior — Q: "How should empty device lists and fixed-volume devices be handled?" → Selected: "Inline empty state + Fixed Volume badge + toast errors" (recommended default)`

---

## the agent's Discretion
- Exact `react-icons` icon mapping for Spotify Connect device types
- Exact polling interval/retry count during *"Pull Playback to Steam Deck"*
- Exact CDP preference evaluation script and `VolumeFader` boundary-fade timing details

## Deferred Ideas
None — discussion stayed within Phase 22 scope.
