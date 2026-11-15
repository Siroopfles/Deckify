---
phase: 07-game-specific-soundtracks-appid-linking-lifecycle-automation
plan: 03
subsystem: ui, api, audio, steam-integration
tags: [steam-cdn, image-proxy, showModal, vgp_oncancel, GameSessions, MainRunningApp, soundtracks]
requires:
  - phase: 07-game-specific-soundtracks-appid-linking-lifecycle-automation
    provides: "SoundtracksTab, PlaylistPickerModal, and GameSessions lifecycle scaffolding from 07-01 and 07-02"
provides:
  - "Steam CDN image proxy allowlist (steamstatic.com, steamcdn-a.akamaihd.net, steampowered.com) with User-Agent header and FaGamepad fallback"
  - "showModal() PlaylistPickerModal opening, offset=0 queries, and end-to-end playlist URI emission"
  - "Bubble-phase vgp_oncancel handling in DeckifyExpandedModal preserving SliderField B-button exit"
  - "SteamClient.GameSessions.RegisterForAppLifetimeNotifications + Router.MainRunningApp startup seeding and QAM active-game sync"
affects: [07-verify-work, steam-deck-uat]
tech-stack:
  added: []
  patterns:
    - "showModal() modal stack isolation for nested pickers inside DeckifyExpandedModal"
    - "Bubble-phase vgp_oncancel breadcrumb handling so child controls (SliderField) can stopPropagation()"
    - "Router.MainRunningApp startup seeding paired with SteamClient.GameSessions.RegisterForAppLifetimeNotifications"
key-files:
  created:
    - src/components/DeckifyExpandedModal.test.tsx
    - src/index.test.tsx
  modified:
    - py_modules/images.py
    - py_modules/rpc_library.py
    - src/components/tabs/SoundtracksTab.tsx
    - src/components/tabs/PlaylistPickerModal.tsx
    - src/components/tabs/soundtrackUtils.ts
    - src/components/DeckifyExpandedModal.tsx
    - src/index.tsx
    - tests/test_images.py
    - tests/test_soundtrack.py
    - src/components/tabs/PlaylistPickerModal.test.tsx
    - src/components/tabs/SoundtracksTab.test.tsx
decisions:
  - "Use @decky/ui showModal() for PlaylistPickerModal instead of inline ModalRoot rendering so GamepadUI focus trapping and B-button dismissal operate independently of DeckifyExpandedModal"
  - "Register attachNav vgp_oncancel in bubble phase without direct closeModal() fallback so SliderField and child controls intercept B before ModalRoot onCancel closes the modal"
  - "Seed activeGameAppId from Router.MainRunningApp.appid at plugin startup and subscribe to SteamClient.GameSessions.RegisterForAppLifetimeNotifications"
metrics:
  duration: "7m 29s"
  completed_date: "2026-11-14"
  tasks: 3
  files: 13
status: complete
plan_head_before: cd9ef5347a7332666ac17694f39c29ba5ccc2624
plan_head_after: 1ea020b6cfdd0b100781841313d07e9d744152ac
commits: 3
actuals:
  tokens: 9315
  tasks: 3
  commits: 3
---

# Phase 07 Plan 03: UAT Gap Closure Summary

**Closed all 4 Phase 07 UAT gaps: Steam CDN image proxying with User-Agent + FaGamepad fallback, `showModal()` PlaylistPickerModal with offset=0 and playlist URIs, bubble-phase `vgp_oncancel` for SliderField B-button exit, and `SteamClient.GameSessions` + `Router.MainRunningApp` startup seeding.**

## Performance

- **Duration:** 7m 29s
- **Started:** 2026-11-14T20:38:36Z
- **Completed:** 2026-11-14T20:46:09Z
- **Tasks:** 3
- **Files modified:** 13 (11 modified, 2 created)

## Accomplishments

- **Gap 1 (Steam CDN Covers & Gamepad Fallback):** Extended `ALLOWED_SPOTIFY_DOMAINS` in `py_modules/images.py` with `steamstatic.com`, `steamcdn-a.akamaihd.net`, and `steampowered.com`, added `User-Agent: Deckify/1.0` to `_fetch_spotify_image`, and passed `fallback={<FaGamepad size={18} color="#888" />}` to `<DeckifyImage>` in `SoundtracksTab.tsx`.
- **Gap 2 (PlaylistPickerModal Focus, B-button, Offset, and URIs):** Added `"uri"` with `spotify:playlist:{id}` fallback in `py_modules/rpc_library.py` (`get_playlists` and `search_spotify`), added defensive URI construction in `soundtrackUtils.ts` `toSelection`, switched `PlaylistPickerModal.tsx` queries to offset `0` with `closeModal` support, and opened `PlaylistPickerModal` via `@decky/ui` `showModal()` in `SoundtracksTab.tsx` using functional `setProfiles` updates.
- **Gap 3 (SliderField B-button Modal Close):** Updated `attachNav` in `src/components/DeckifyExpandedModal.tsx` to listen to `vgp_oncancel` in bubble phase (`false`) without calling `closeModal?.()` directly, letting `SliderField` consume B while unhandled events bubble to `ModalRoot`.
- **Gap 4 (QAM 1-Click Bind & App Lifetime Events):** Switched `src/index.tsx` from `SteamClient.Apps` to `SteamClient.GameSessions.RegisterForAppLifetimeNotifications`, seeded `activeGameAppId` from `Router.MainRunningApp?.appid` at plugin startup, and synchronized `Content`'s `activeGameAppId` on mount.

## Task Commits

Each task was committed atomically (with Husky running ESLint, `tsc --noEmit`, Vitest, Rollup build, and Python `unittest` on each commit):

1. **Task 1: Allow Steam CDN domains with User-Agent in image proxy and add FaGamepad fallback** - `3f362a1` (fix)
2. **Task 2: Open PlaylistPickerModal via showModal(), fix offset=0, and emit playlist URIs** - `a167069` (fix)
3. **Task 3: Bubble-phase vgp_oncancel and GameSessions + MainRunningApp seed** - `1ea020b` (fix)

## Verification Results

- `py -3 -m unittest discover -s tests -p "test_*.py"` — 431 tests passed (0 failures)
- `pnpm test` (Vitest) — 10 test files, 82 tests passed (0 failures)
- `pnpm typecheck` (`tsc --noEmit`) — 0 errors
- `pnpm build` (`rollup -c`) — `dist/` built cleanly

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- All modified and created files verified present on disk.
- All 3 task commits (`3f362a1`, `a167069`, `1ea020b`) verified as ancestors of `HEAD` (`1ea020b6cfdd0b100781841313d07e9d744152ac`).
