---
phase: 10-in-game-hud-overlay-2-0-live-synced-lyrics
verified: 2026-11-15T11:04:34Z
status: human_needed
score: 16/17 must-haves verified
covered_files:
  - ".planning/phases/10-in-game-hud-overlay-2-0-live-synced-lyrics/10-01-PLAN.md"
  - ".planning/phases/10-in-game-hud-overlay-2-0-live-synced-lyrics/10-01-SUMMARY.md"
  - ".planning/phases/10-in-game-hud-overlay-2-0-live-synced-lyrics/10-02-PLAN.md"
  - ".planning/phases/10-in-game-hud-overlay-2-0-live-synced-lyrics/10-02-SUMMARY.md"
  - ".planning/phases/10-in-game-hud-overlay-2-0-live-synced-lyrics/10-03-PLAN.md"
  - ".planning/phases/10-in-game-hud-overlay-2-0-live-synced-lyrics/10-03-SUMMARY.md"
  - "main.py"
  - "py_modules/common.py"
  - "src/components/DeckifyExpandedModal.test.tsx"
  - "src/components/DeckifyExpandedModal.tsx"
  - "src/components/DeckifyOverlay.test.tsx"
  - "src/components/DeckifyOverlay.tsx"
  - "src/components/tabs/LyricsTab.tsx"
  - "src/components/tabs/SettingsTab.test.tsx"
  - "src/components/tabs/SettingsTab.tsx"
  - "src/index.test.tsx"
  - "src/index.tsx"
  - "src/types.ts"
  - "tests/test_e2e_requirements.py"
  - "tests/test_plugin_api.py"
covered_digest: "v4:sha256:430ab92012d59a392cbf938aae09e3a649e86eea250c58e8e413b31fa907bc75"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 13/14
  gaps_closed:
    - "G-10-1 / G-10-2: main.py:get_status() public_keys allowlist now exposes overlay_lyrics_enabled, overlay_lyrics_offset_ms, overlay_autohide_duration_s, trigger_nav_enabled, trigger_seek_seconds, trigger_page_size, and show_controller_hints"
    - "G-10-1 / G-10-2: DeckifyOverlayWrapper merges incoming get_status().settings and settings_changed payloads instead of overwriting"
    - "G-10-2: SettingsTab uses optimistic localSettings + settings_changed listener for Overlay Lyrics toggle and all 4 SliderFields"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Play a track with long synced lyric lines in SteamOS Gamescope with Overlay Lyrics enabled"
    expected: "Overlay Lyrics toggle persists past 4s polls; long lyric lines truncate cleanly to a single 18px line with ellipsis within maxWidth: 320px without resizing or wrapping the HUD, and cross-fade smoothly at 200ms with no in-game frame drops."
    why_human: "Marked verification: backstop (insufficient_spec); jsdom unit tests verify CSS properties (maxWidth: 320, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', height: 18) but cannot measure actual Gamescope CEF text layout, overflow clipping, or 60/90 FPS frame pacing."
  - test: "Open Quick Access Menu -> Deckify while Overlay is enabled, toggle Overlay Lyrics, then open Settings -> In-Game Mini Overlay (HUD) and adjust Auto-Hide Duration and Lyrics Latency Offset sliders"
    expected: "QAM stays compact with persistent Overlay Lyrics toggle and dynamic Auto-Hide Overlay (Ns) label; SettingsTab Overlay Lyrics toggle and sliders smoothly adjust autohide duration (3-15s) and lyric sync offset (-2000..2000ms) in real time without snapping back."
    why_human: "Visual layout, controller D-pad/slider ergonomics, and live SteamOS CEF rendering require on-device verification after gap-closure plan 10-03."
---

# Phase 10: In-Game HUD Overlay 2.0 (Live Synced Lyrics) Verification Report

**Phase Goal:** Render a subtle, real-time synced lyrics line beneath the track info in the floating Gamescope HUD overlay without dropping in-game frame rates.
**Verified:** 2026-11-15T11:04:34Z
**Status:** human_needed
**Re-verification:** Yes — after gap-closure plan 10-03 (closing UAT gaps G-10-1 and G-10-2)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Gamescope HUD overlay displays the current active synced lyric line with smooth cross-fade animation beneath the artist title when lyrics are available (ROADMAP SC 1, 10-01 T1). | ✓ VERIFIED | `src/components/DeckifyOverlay.tsx` renders `data-testid="overlay-lyric-row"` (`height: 18`, `lineHeight: "18px"`, `200ms` `deckifyLyricFadeIn` keyframe) below artwork+title/artist and above `2px` progress bar; verified by `DeckifyOverlay.test.tsx` (21 tests passed). |
| 2 | Lyrics in HUD update via discrete `setTimeout` timers anchored to `positionMs + elapsed + lyricsOffsetMs`, with zero `setInterval` or `requestAnimationFrame` loops, preserving `pointerEvents: "none"` (ROADMAP SC 2, 10-01 T2). | ✓ VERIFIED | `src/components/DeckifyOverlay.tsx` uses `posAnchorRef`, `lyricTimerRef`, recursive `scheduleNext` with `Math.max(16, ...)`, and `pointerEvents: "none"`; exercised with `vi.useFakeTimers()` in `DeckifyOverlay.test.tsx`. |
| 3 | Overlay container strictly preserves `pointerEvents: "none"` so gameplay and touchscreen inputs never stall or get blocked (ROADMAP SC 3). | ✓ VERIFIED | `src/components/DeckifyOverlay.tsx` sets `pointerEvents: "none"` on `.deckify-ingame-overlay`; asserted in `DeckifyOverlay.test.tsx`. |
| 4 | During pause (`!isPlaying`), `DeckifyOverlay` clears pending lyric `setTimeout` timers, freezes `activeLineIndex`, and dims the lyric row to `opacity: 0.5` during the 3500ms pause grace window (10-01 T3). | ✓ VERIFIED | `src/components/DeckifyOverlay.tsx` clears `lyricTimerRef.current` on `!isPlaying`, applies `opacity: isPlaying ? 1 : 0.5`, and schedules `3500`ms pause grace timer; tested in `DeckifyOverlay.test.tsx`. |
| 5 | When `lyricsLoaded` is true and `syncedLyrics` is empty, HUD displays `"No synced lyrics"`; while loading or before first timestamp / instrumental breaks, it displays `"♪ •••"` (10-01 T4). | ✓ VERIFIED | `src/components/DeckifyOverlay.tsx` implements exact fallback priority; tested in `DeckifyOverlay.test.tsx`. |
| 6 | `DeckifyOverlay` strictly respects `autoHide`: when `autoHide` is false and `isPlaying` is true, `hideTimerRef` is not scheduled; when `autoHide` is true, it hides after `autoHideDurationMs` (`3000..15000`, default `6000`) (10-01 T5). | ✓ VERIFIED | `src/components/DeckifyOverlay.tsx` clamps `autoHideDurationMs` and gates `hideTimerRef` on `if (autoHide)`; tested in `DeckifyOverlay.test.tsx`. |
| 7 | `DeckifyOverlayWrapper` suppresses the HUD while `/deckify` modal is open via `modalOpenListeners` and restores visibility on modal close or unmount (10-01 T6). | ✓ VERIFIED | `src/index.tsx` and `src/components/DeckifyExpandedModal.tsx` (`closeModalRef` unmount cleanup); tested in `src/index.test.tsx` (10 tests passed). |
| 8 | `DeckifyOverlayWrapper` fetches `get_lyrics` only when `overlay_enabled && overlay_lyrics_enabled` is true, deduplicates by track key, and ignores stale async responses (10-01 T7). | ✓ VERIFIED | `src/index.tsx:933-975` (`lastFetchedTrackKeyRef`, `currentTrackKeyRef`); tested in `src/index.test.tsx`. |
| 9 | Re-rendering `DeckifyOverlay` or calling `set_setting` is idempotent; backend clamps `overlay_lyrics_offset_ms` (`-2000..2000`) and `overlay_autohide_duration_s` (`3..15`) (10-01 T8). | ✓ VERIFIED | `py_modules/common.py`, `main.py`; tested in `tests/test_e2e_requirements.py` (`TestPhase10OverlaySettings`). |
| 10 | Long lyric lines truncate cleanly to a single line within `maxWidth: 320px` via `whiteSpace: 'nowrap'`, `overflow: 'hidden'`, `textOverflow: 'ellipsis'` without resizing the HUD (`verification: backstop`). | ? UNCERTAIN (`insufficient_spec`) | CSS styles are present in `src/components/DeckifyOverlay.tsx`, but jsdom cannot evaluate CEF layout/overflow; routed to human verification per `backstop` rule. |
| 11 | Quick Access Menu (`renderOverlayControls`) exposes an `Overlay Lyrics` `ToggleField` and displays configured Auto-Hide duration in the Auto-Hide toggle label (ROADMAP SC 4, 10-02 T1). | ✓ VERIFIED | `src/index.tsx` renders `Auto-Hide Overlay (${autoHideSec}s)` and `Overlay Lyrics` `ToggleField`; tested in `src/index.test.tsx`. |
| 12 | `SettingsTab.tsx` exposes `Overlay Lyrics` toggle, `Auto-Hide Duration (Seconds)` slider (`3..15`, step `1`), and `Lyrics Latency Offset (ms)` slider (`-2000..2000`, step `100`) (ROADMAP SC 4, 10-02 T2). | ✓ VERIFIED | `src/components/tabs/SettingsTab.tsx:688-730`; tested in `src/components/tabs/SettingsTab.test.tsx` (13 tests passed). |
| 13 | `LyricsTab.tsx` renders 5 clickable source pills (`Spotify`, `LRCLIB`, `NetEase`, `Musixmatch`, `Lyrics.ovh`) inside `<Focusable flow-children="horizontal">` alongside `"Try Next Source"` (10-02 T3). | ✓ VERIFIED | `src/components/tabs/LyricsTab.tsx`; tested in `src/components/DeckifyExpandedModal.test.tsx` (18 tests passed). |
| 14 | `DeckifyExpandedModal.tsx` wires `handleSelectLyricsSource(offset, label)` to `LyricsTab` and wraps `handleNextLyricsSource` modulo 5 (10-02 T4). | ✓ VERIFIED | `src/components/DeckifyExpandedModal.tsx`; tested in `src/components/DeckifyExpandedModal.test.tsx`. |
| 15 | `main.py:get_status()['settings']` includes all Phase 10 overlay settings (`overlay_lyrics_enabled`, `overlay_lyrics_offset_ms`, `overlay_autohide_duration_s`) and Phase 08 trigger/hint settings (`trigger_nav_enabled`, `trigger_seek_seconds`, `trigger_page_size`, `show_controller_hints`) while excluding non-public keys (10-03 T1). | ✓ VERIFIED | `main.py:494-509, 517` extends `public_keys` with all 7 keys; `tests/test_plugin_api.py` (`test_get_status_exposes_phase10_and_phase08_public_settings`) asserts all 7 keys are returned and `_internal_secret` is excluded. |
| 16 | `DeckifyOverlayWrapper` merges incoming `get_status().settings` and `settings_changed` payloads into existing `settings` state rather than replacing wholesale (10-03 T2). | ✓ VERIFIED | `src/index.tsx:888, 914` uses `setSettings((prev) => ({ ...(prev ?? ({} as EngineSettings)), ... }))`; verified by regression test in `src/index.test.tsx`. |
| 17 | `SettingsTab` renders `Overlay Lyrics` toggle and all 4 `SliderField`s (`overlay_autohide_duration_s`, `overlay_lyrics_offset_ms`, `trigger_seek_seconds`, `trigger_page_size`) plus Phase 08 toggles with optimistic `localSettings` and `settings_changed` synchronization (10-03 T2). | ✓ VERIFIED | `src/components/tabs/SettingsTab.tsx:29, 60-85, 688-730, 799-839`; verified by regression test in `src/components/tabs/SettingsTab.test.tsx`. |

**Score:** 16/17 truths verified (1 `insufficient_spec` backstop truth routed to human verification)

### Advisory (New Scope, Unevidenced)

None.

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `src/types.ts` | `overlay_lyrics_enabled`, `overlay_lyrics_offset_ms`, `overlay_autohide_duration_s` on `EngineSettings` | ✓ VERIFIED | All 3 optional fields defined |
| `src/components/DeckifyOverlay.tsx` | Discrete `setTimeout` lyric scheduler, 18px cross-fade row, strict `autoHide` & `autoHideDurationMs` | ✓ VERIFIED | Zero `setInterval`/`rAF`/`dangerouslySetInnerHTML` |
| `src/index.tsx` | `modalOpenListeners`, conditional `get_lyrics` RPC gating, QAM `Overlay Lyrics` toggle, non-destructive settings merge | ✓ VERIFIED | Lines 888, 914 merge settings; lines 933-975 gate `get_lyrics` |
| `src/components/DeckifyExpandedModal.tsx` | `closeModalRef` unmount cleanup, `handleSelectLyricsSource`, modulo-5 `handleNextLyricsSource` | ✓ VERIFIED | Verified present and tested |
| `src/components/tabs/SettingsTab.tsx` | `localSettings` + `settings_changed` listener, `Overlay Lyrics` toggle, `Auto-Hide Duration` & `Lyrics Latency Offset` sliders, Phase 08 controls | ✓ VERIFIED | Lines 29, 60-85, 688-730, 799-839 |
| `src/components/tabs/LyricsTab.tsx` | 5 clickable source pills in `<Focusable flow-children="horizontal">` | ✓ VERIFIED | Verified present and tested |
| `py_modules/common.py` | `DEFAULT_SETTINGS` and `_load_settings` clamping for all 3 overlay keys | ✓ VERIFIED | Verified present and tested |
| `main.py` | `set_setting` validation/clamping and complete `get_status()` `public_keys` allowlist | ✓ VERIFIED | Lines 494-509, 517, 538+ |
| `tests/test_plugin_api.py` | Unit test for `get_status()["settings"]` Phase 10 & Phase 08 public keys and private key exclusion | ✓ VERIFIED | Passed in `unittest` suite |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `main.py:get_status` | `src/index.tsx:DeckifyOverlayWrapper` | `backendGetStatus()` 4s poll returning complete `public_keys` + non-destructive merge | ✓ WIRED | `main.py:494-517` -> `src/index.tsx:888` |
| `src/index.tsx` (`DeckifyOverlayWrapper`) | `src/components/DeckifyOverlay.tsx` | `syncedLyrics`, `lyricsEnabled`, `lyricsOffsetMs`, `lyricsLoaded`, `autoHideDurationMs`, `visible={!modalOpen}` props | ✓ WIRED | Verified in `src/index.tsx` |
| `src/index.tsx` (`openExpandedView`/`closeModal`) | `src/components/DeckifyExpandedModal.tsx` | `modalOpenListeners` & `closeModalRef` unmount cleanup | ✓ WIRED | Verified in `src/index.tsx` & `DeckifyExpandedModal.tsx` |
| `main.py` (`set_setting`) | `py_modules/common.py` (`DEFAULT_SETTINGS`) | Validation, clamping, `_save_settings`, and `settings_changed` broadcast | ✓ WIRED | Verified in `main.py` & `common.py` |
| `src/index.tsx` (QAM `renderOverlayControls`) | `main.py` (`set_setting`) | `backendSetSetting("overlay_lyrics_enabled", val)` | ✓ WIRED | Verified in `src/index.tsx` |
| `src/components/tabs/SettingsTab.tsx` | `main.py` (`set_setting`) | Optimistic `localSettings` + `updateSetting` -> `backendSetSetting` + `settings_changed` listener | ✓ WIRED | `SettingsTab.tsx:66-85, 688-730, 799-839` |
| `src/components/tabs/LyricsTab.tsx` | `src/components/DeckifyExpandedModal.tsx` | `onSelectLyricsSource(offset, label)` -> `fetchLyrics(offset)` | ✓ WIRED | Verified in `LyricsTab.tsx` & `DeckifyExpandedModal.tsx` |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| TypeScript typechecking | `pnpm typecheck` | Exited 0 (0 errors) | ✓ PASS |
| ESLint static analysis | `pnpm lint` | Exited 0 (0 errors, pre-existing warnings only) | ✓ PASS |
| Frontend Vitest suite | `pnpm test` | 15 files, 136 tests passed | ✓ PASS |
| Backend Python unittest suite | `py -3 -m unittest discover -s tests -p "test_*.py"` | 444 tests passed in 28.624s | ✓ PASS |
| Rollup production bundle | `pnpm build` | `dist` created in 6.7s, exited 0 | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| `HUD-03` | `10-01-PLAN.md`, `10-02-PLAN.md`, `10-03-PLAN.md` | User can enable an active synced lyrics line displayed beneath the artist title in the floating Gamescope HUD overlay. | ✓ SATISFIED (pending visual/backstop UAT) | QAM & SettingsTab toggles with persistent `get_status()` sync + optimistic state, `DeckifyOverlay` 18px lyric row, `LyricsTab` 5-provider pills, backend persistence |
| `HUD-04` | `10-01-PLAN.md`, `10-03-PLAN.md` | Overlay lyrics update via discrete event-scheduled timestamps rather than continuous clock polling, preserving 60/90 FPS in games and strictly enforcing `pointerEvents: "none"`. | ✓ SATISFIED | Recursive `setTimeout` scheduler (`lyricTimerRef`), zero `setInterval`/`rAF`, `pointerEvents: "none"`, gated `get_lyrics` RPC, non-destructive settings merge |

Orphaned requirements: None (`HUD-03` and `HUD-04` are the only Phase 10 requirements in `REQUIREMENTS.md` and both are claimed and implemented).

### Prohibitions & Anti-Patterns

- `setInterval` / `requestAnimationFrame` in `DeckifyOverlay.tsx`: None found.
- `dangerouslySetInnerHTML` in `DeckifyOverlay.tsx`: None found (uses JSX text interpolation).
- `pointerEvents: "none"` removal: Preserved on `.deckify-ingame-overlay`.
- `SliderField` in QAM `renderOverlayControls`: None found (QAM kept compact).
- `flow-children="row"` in `LyricsTab.tsx` source pills: None found (uses `flow-children="horizontal"`).
- `TBD` / `FIXME` / `XXX` debt markers in Phase 10 modified files (`main.py`, `py_modules/common.py`, `src/types.ts`, `src/components/DeckifyOverlay.tsx`, `src/index.tsx`, `src/components/DeckifyExpandedModal.tsx`, `src/components/tabs/SettingsTab.tsx`, `src/components/tabs/LyricsTab.tsx`): None found.

### Human Verification Required

1. **Gamescope CEF Long-Line Truncation & Frame Pacing (`verification: backstop`)**
   - **Test:** Play a track with long synced lyric lines in SteamOS Gamescope with `Overlay Lyrics` enabled.
   - **Expected:** `Overlay Lyrics` toggle stays ON past 4s status polls; long lyric lines truncate cleanly to a single 18px line with ellipsis within `maxWidth: 320px` without resizing or wrapping the HUD, and cross-fade smoothly at 200ms with no in-game frame drops.
   - **Why human:** Marked `verification: backstop` (`insufficient_spec`); jsdom cannot measure actual SteamOS CEF text layout, overflow clipping, or 60/90 FPS frame pacing.

2. **QAM & SettingsTab Live Controls (Post-10-03 UAT Re-test)**
   - **Test:** Open Quick Access Menu -> Deckify while Overlay is enabled, toggle `Overlay Lyrics`, then open Settings -> In-Game Mini Overlay (HUD) and adjust `Auto-Hide Duration` (3–15s) and `Lyrics Latency Offset` (-2000..+2000ms) sliders.
   - **Expected:** QAM stays compact with persistent `Overlay Lyrics` toggle and dynamic `Auto-Hide Overlay (Ns)` label; SettingsTab `Overlay Lyrics` toggle and sliders smoothly adjust autohide duration and lyric sync offset in real time without snapping back.
   - **Why human:** Visual layout, controller D-pad/slider ergonomics, and live SteamOS CEF rendering require on-device verification.

---

_Verified: 2026-11-15T11:04:34Z_
_Verifier: the agent (gsd-verifier)_
