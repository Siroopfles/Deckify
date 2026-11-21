---
phase: "20"
reviewed: 2026-11-21T12:08:00Z
depth: standard
files_reviewed: 15
files_reviewed_list:
  - main.py
  - py_modules/common.py
  - tests/test_chord_settings.py
  - src/types.ts
  - src/bannerBus.ts
  - src/chords.ts
  - src/chords.test.ts
  - src/components/SilentBanner.tsx
  - src/components/SilentBanner.test.tsx
  - src/components/tabs/ChordBindingsCard.tsx
  - src/components/tabs/ChordBindingsCard.test.tsx
  - src/components/tabs/SettingsTab.tsx
  - src/components/tabs/SettingsTab.test.tsx
  - src/index.tsx
  - src/index.test.tsx
findings:
  critical: 0
  warning: 4
  info: 2
  total: 6
  necessity: 0
status: issues_found
---

# Phase 20: Code Review Report

**Reviewed:** 2026-11-21T12:08:00Z
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

## Summary

Reviewed the Phase 20 implementation across the Python settings/validation layer (`main.py`, `py_modules/common.py`), TypeScript chord matcher & banner bus (`src/chords.ts`, `src/bannerBus.ts`, `src/types.ts`), UI components (`src/components/SilentBanner.tsx`, `src/components/tabs/ChordBindingsCard.tsx`, `src/components/tabs/SettingsTab.tsx`), and plugin runtime wiring (`src/index.tsx`).

All 91 Vitest tests across the 5 Phase 20 frontend test suites passed (`npx vitest run ...`). `pytest` could not be executed in this Windows environment because `python` is not installed on `PATH`.

No critical security, Steam CEF CSP, or data-loss defects were found:
- `SilentBanner` enforces `pointerEvents: "none"`, restricts cover URLs to `data:` / `http://127.0.0.1`, and uses latest-wins timer replacement.
- `ChordBindingsCard` is rendered as JSX (`<ChordBindingsCard />`), uses `flow-children="horizontal"` with `width: "auto"` on action buttons, and guards `bool` / out-of-range button IDs on both frontend and backend.
- `createChordMatcher` implements the 4s `guideHeld` expiry, modal/recording suppression, and dismount cleanup.

Four warnings and two info items were identified, primarily around controller-UX edge cases during chord recording and async race/concurrency guards in `src/index.tsx`.

## Warnings

### WR-01: Focused "Cancel Recording" button intercepts `A` (`OK`) during chord capture

**File:** `src/components/tabs/ChordBindingsCard.tsx:444-458`
**Issue:** When a user activates `Record Chord` using the controller `A` button, focus remains on that `<DialogButton>`, which switches to `Cancel Recording` with `onClick={() => (isRecording ? onCancelRecord() : onStartRecord(actionId))}`. If the user then presses `A` (`GAMEPAD_BUTTON.OK`) to include `A` in their new chord (e.g. `A + L4` or `A`), GamepadUI activates the focused button's `onClick` and immediately cancels recording.
**Fix:** Avoid cancelling recording via `A` on the focused button while capture is active (e.g. disable `onClick` cancellation during `isRecording` and rely on `B` when `peakSet.size === 0` or the 5s timeout, or move focus / ignore `OK` activation while `isRecording` is true).

### WR-02: Recording timeout silently discards held buttons

**File:** `src/components/tabs/ChordBindingsCard.tsx:169-175`
**Issue:** When `RECORD_TIMEOUT_MS` (5s) expires while the user is still holding 1–4 buttons (`runtime.peakSet.size > 0`), `stopRecording()` runs and `if (!hadButtons)` evaluates to `false`, discarding the held chord silently with no save and no inline error feedback.
**Fix:** Show an inline message when timing out with held buttons (or validate and save `Array.from(runtime.peakSet)` on timeout):
```ts
runtime.timeout = setTimeout(() => {
  const hadButtons = runtime.peakSet.size > 0;
  stopRecording();
  setInlineError(
    actionId,
    hadButtons
      ? "Recording timed out — release buttons within 5s to save."
      : "No buttons detected — recording cancelled.",
  );
}, RECORD_TIMEOUT_MS);
```

### WR-03: Un-sequenced `handleTrackMetadataNotification` can emit stale track banners out of order

**File:** `src/index.tsx:320-344`
**Issue:** `handleTrackMetadataNotification` awaits `safeRpc(() => backendGetStatus())` (and `resolveProxiedArtworkAsync` in the Steam toast branch) without a sequence guard. If two `track_metadata` events arrive in rapid succession, the older invocation can resolve after the newer one and overwrite the latest banner/toast.
**Fix:** Track a monotonic `trackToastSeq` counter and abort if `seq !== trackToastSeq` after each `await`:
```ts
const seq = ++trackToastSeq;
const curStatus = await safeRpc(() => backendGetStatus());
if (seq !== trackToastSeq) return;
```

### WR-04: `handleToggleLyricsChord` lacks optimistic state update and concurrency guard

**File:** `src/index.tsx:409-423`
**Issue:** Unlike `handleLikeChord` (`likeRequestSeq`) and `handlePinnedCycleChord` (`pinnedCycleSeq`), `handleToggleLyricsChord` reads `cachedOverlayLyricsEnabled` before `await backendSetSetting("overlay_lyrics_enabled", nextLyrics)` and only updates it after the RPC resolves. Two rapid chord presses before the first RPC completes will both compute the same `nextLyrics` value and emit duplicate banners.
**Fix:** Optimistically set `cachedOverlayLyricsEnabled = nextLyrics` before the `await`, guard with a `lyricsToggleSeq` counter, and roll back on `!res?.ok` only when `seq === lyricsToggleSeq`.

## Info

### IN-01: `isValveReservedChord` also blocks `View` (13) / `Menu` (14) + `X/L1/R1`

**File:** `src/chords.ts:176-182` (and `py_modules/common.py:247-252`)
**Issue:** Because `GUIDE_BUTTON_IDS` includes legacy `SELECT` (13) and `START` (14) alongside `STEAM_GUIDE` (27) and `STEAM_QUICK_MENU` (28), `isValveReservedChord` rejects `[13, 3]`, `[13, 5]`, `[13, 6]`, `[14, 3]`, `[14, 5]`, and `[14, 6]` as Steam-reserved even though Valve's reserved chords are `STEAM + X / L1 / R1` (`27` + `3 / 5 / 6`).
**Fix:** If `View`/`Menu` + `X/L1/R1` should be bindable, check `normalized.includes(CANONICAL_GUIDE_ID)` instead of `GUIDE_ID_SET.has(b)` inside `isValveReservedChord` and `_normalize_chord_buttons`.

### IN-02: `Gamepad Quick Chords` row in `SettingsTab.tsx` bypasses `updateSetting`

**File:** `src/components/tabs/SettingsTab.tsx:1507-1515`
**Issue:** Clicking `Gamepad Quick Chords` calls `backendSetSetting("gamepad_chords_enabled", !cur)` directly instead of `updateSetting(...)`, so `localSettings.gamepad_chords_enabled` (read by `ChordBindingsCard` on line 1537) is not updated optimistically until `refreshStatus()` or `settings_changed` arrives.
**Fix:** Route the toggle through `updateSetting("gamepad_chords_enabled", !cur)` using `localSettings.gamepad_chords_enabled ?? status?.settings?.gamepad_chords_enabled ?? true`.

---

_Reviewed: 2026-11-21T12:08:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
