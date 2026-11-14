# Phase 10: In-Game HUD Overlay 2.0 (Live Synced Lyrics) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-15T00:54:00Z
**Phase:** 10-In-Game HUD Overlay 2.0 (Live Synced Lyrics)
**Areas discussed:** Lyric Line Presentation & Styling, Autohide & Lyrics Interaction, No-Lyrics Fallback & Fetching, QAM, Settings & LyricsTab Controls, Pause Grace & Seek Resync, HUD Modal-Open Detection

---

## Lyric Line Presentation & Styling

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed-height single line with ellipsis | 1-line truncated text (e.g. 16-18px height) so the HUD never resizes or jumps mid-game | ✓ |
| Fixed-height 2-line wrap with line-clamp | Allows longer lyrics to wrap up to 2 lines without resizing the HUD | |
| Auto-sizing 1–2 lines | Expands/shrinks dynamically to fit each lyric line | |

**User's choice:** Fixed-height single line with ellipsis

| Option | Description | Selected |
|--------|-------------|----------|
| Subtle ♪ / ••• placeholder in the fixed slot | Keeps the fixed height steady during intros/instrumentals without jarring collapse | ✓ |
| Empty transparent space (keeps height) | Blank fixed-height slot until the next lyric line arrives | |
| Collapse the lyric row when empty | Hide the row during instrumentals and expand when singing resumes | |

**User's choice:** Subtle ♪ / ••• placeholder in the fixed slot

| Option | Description | Selected |
|--------|-------------|----------|
| Full-width row below artwork+artist (above progress bar) | Gives ~296px width for lyrics with subtle top border/gap, keeping 1-line text readable | ✓ (via best UX) |
| Nested under artist inside the right text column | Keeps lyrics aligned with title/artist (~250px width) without expanding HUD height as much | |

**User's choice:** "Configurable options" → "Whats best for the user erxpierence"
**Notes:** Selected full-width row below artwork+artist (above progress bar) with crisp 11px text and 200ms opacity cross-fade for maximum readability and minimal truncation.

---

## Autohide & Lyrics Interaction

| Option | Description | Selected |
|--------|-------------|----------|
| Respect autohide strictly | If Auto-hide is ON, HUD still hides after the configured duration even when lyrics are enabled (re-appearing on track change); if Auto-hide is OFF, HUD stays visible continuously | ✓ |
| Keep HUD visible while synced lyrics are active | Override autohide whenever synced lyrics are playing for the current track | |

**User's choice:** Respect autohide strictly

| Option | Description | Selected |
|--------|-------------|----------|
| 3s to 15s (step 1s, default 6s) | Covers quick glances (3s) up to lingering lyrics (15s) while keeping current 6s default | ✓ |
| 2s to 30s (step 1s, default 6s) | Wider range for users who want a longer lyric window before hiding | |

**User's choice:** 3s to 15s (step 1s, default 6s)

---

## No-Lyrics Fallback & Fetching

| Option | Description | Selected |
|--------|-------------|----------|
| Hide the lyric slot cleanly | Keep the compact track+artist HUD without any 'No lyrics' clutter when only plain or no lyrics exist | |
| Show a subtle 'No synced lyrics' indicator | Explicitly inform the user when LRCLIB has no synced timestamps | ✓ |

**User's choice:** Show a subtle 'No synced lyrics' indicator

---

## QAM, Settings & LyricsTab Controls

| Option | Description | Selected |
|--------|-------------|----------|
| Toggle + Offset slider in BOTH QAM and SettingsTab | Lets you calibrate latency mid-game in QAM or in full settings | |
| Toggle in QAM + SettingsTab, Offset slider only in SettingsTab | Keeps QAM compact while still exposing the toggle mid-game | ✓ |

**User's choice:** Toggle in QAM + SettingsTab, Offset slider only in SettingsTab

| Option | Description | Selected |
|--------|-------------|----------|
| 100ms steps (default 0ms) | Easy to adjust with D-pad Left/Right without 40+ tiny clicks | ✓ |
| 250ms steps (default 0ms) | Fast coarse adjustment (16 steps across -2000ms to +2000ms) | |
| 50ms steps (default 0ms) | Fine-grained calibration for tight vocal sync | |

**User's choice:** 100ms steps (default 0ms)

| Option | Description | Selected |
|--------|-------------|----------|
| Clickable source pills/tabs in LyricsTab | Let users click/select any lyrics source directly (keeping Try Next Source as a fallback cycle) | ✓ |
| Dropdown / modal picker for lyrics source | Open a small source list when clicking the current source badge | |

**User's choice:** Clickable source pills/tabs in LyricsTab

---

## Pause Grace & Seek Resync

| Option | Description | Selected |
|--------|-------------|----------|
| Freeze & dim slightly (e.g. 50% opacity) | Shows where the song paused without advancing timers until resumed | ✓ |
| Keep full brightness while frozen | Stay at normal opacity for the 3.5s grace period before HUD fades out | |

**User's choice:** Freeze & dim slightly (e.g. 50% opacity)

---

## HUD Modal-Open Detection

| Option | Description | Selected |
|--------|-------------|----------|
| Hide immediately while /deckify modal is open, and restore cleanly on close | Resets autohide timer on return to game if autohide is enabled | ✓ |
| Hide while /deckify modal is open, and keep hidden until next track change if autohide was enabled | | |

**User's choice:** Hide immediately while /deckify modal is open, and restore cleanly on close

---

## the agent's Discretion
- Exact backend settings keys and defaults in `py_modules/common.py` (`overlay_lyrics_enabled`, `overlay_lyrics_offset_ms`, `overlay_autohide_duration_s`).
- Exact mechanism in `src/index.tsx` / `DeckifyOverlayWrapper` to detect `/deckify` modal open/close state and avoid redundant `get_lyrics` RPCs when `overlay_enabled && overlay_lyrics_enabled` is false.
- Exact CSS/inline styling details for the `200ms` cross-fade and subtle `"No synced lyrics"` / `♪` placeholder.

## Deferred Ideas
None — discussion stayed within Phase 10 scope (plus the 4 user-selected folded todos).
