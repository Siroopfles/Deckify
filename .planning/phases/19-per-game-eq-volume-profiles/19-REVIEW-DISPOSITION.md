---
phase: 19
review: 19-REVIEW.md
titles: json
findings:
  - id: WR-08
    severity: warning
    disposition: fixed
    title: "`handleQuickBind` allows missing or zero `Router.MainRunningApp.appid` to forward an unverified `display_name`"
  - id: WR-09
    severity: warning
    disposition: fixed
    title: "`SoundtrackManager._resolve_app_name` executes synchronous `vdf_parser.get_installed_games()` disk I/O on the asyncio event loop (including on unbound game launches)"
  - id: IN-06
    severity: info
    disposition: fixed
    title: "`Reset to Flat` `DialogButton` uses `minWidth: \"auto\"` instead of `minWidth: 0`, and `patchProfileAppName` skips `.trim()` on `fallbackName`"
  - id: WR-01
    severity: warning
    disposition: fixed
    title: "Async race in `EqualizerManager.preview_bands` / `set_bands` can overwrite restored EQ after `clear_preview` or `apply_ephemeral_preset`"
  - id: WR-02
    severity: warning
    disposition: fixed
    title: "Concurrent `VolumeFader.fade_to` task replacement race during rapid `SoundtracksTab` slider hot-apply"
  - id: WR-03
    severity: warning
    disposition: fixed
    title: "`boost_pa_volume` overwrites active per-game volume ceiling, ducking, and sleep lock when `librespot` stream initializes late"
  - id: WR-04
    severity: warning
    disposition: fixed
    title: "`EqualizerManager.cleanup_stale_process` sends `SIGTERM` as `root` without verifying `/proc/{pid}/cmdline`"
  - id: WR-05
    severity: warning
    disposition: fixed
    title: "`SoundtracksTab` cancels pending debounced saves on unmount instead of flushing them"
  - id: WR-06
    severity: warning
    disposition: fixed
    title: "`GameEqModal` relies on stale `isRunningRef` and leaves `_preview_active = True` if running-game save fails or game exits mid-edit"
  - id: WR-07
    severity: warning
    disposition: fixed
    title: "Already-defended-elsewhere — redundant `Number.isFinite` guard in `GameEqModal.handleBandChange`"
  - id: IN-01
    severity: info
    disposition: fixed
    title: "Unused `EqBandFaders` component export and duplicate `EQ_PID_FILE` constant"
  - id: IN-02
    severity: info
    disposition: fixed
    title: "`aria-label` props on `+`/`-` `InteractiveRow` controls in `EqBandFaders.tsx` are not forwarded to DOM"
  - id: IN-03
    severity: info
    disposition: fixed
    title: "`_validate_eq_bands` permits `float(\"inf\")` unlike `clamp_eq_bands`"
  - id: IN-04
    severity: info
    disposition: fixed
    title: "`Plugin.set_setting` broadcasts unfiltered `_settings` on `settings_changed`"
  - id: IN-05
    severity: info
    disposition: fixed
    title: "`SoundtracksTab` `confirmDeleteAppId` stays active across card clicks and configured cards cannot collapse"
open: 0
total: 15
recorded: 2026-11-19T18:15:37.195Z
---

# Phase 19: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-08 | warning | fixed | 19-REVIEW-FIX.md (not in the current review) |
| WR-09 | warning | fixed | 19-REVIEW-FIX.md (not in the current review) |
| IN-06 | info | fixed | 19-REVIEW-FIX.md (not in the current review) |
| WR-01 | warning | fixed | 19-REVIEW-FIX.md (not in the current review) |
| WR-02 | warning | fixed | 19-REVIEW-FIX.md (not in the current review) |
| WR-03 | warning | fixed | 19-REVIEW-FIX.md (not in the current review) |
| WR-04 | warning | fixed | 19-REVIEW-FIX.md (not in the current review) |
| WR-05 | warning | fixed | 19-REVIEW-FIX.md (not in the current review) |
| WR-06 | warning | fixed | 19-REVIEW-FIX.md (not in the current review) |
| WR-07 | warning | fixed | 19-REVIEW-FIX.md (not in the current review) |
| IN-01 | info | fixed | 19-REVIEW-FIX.md (not in the current review) |
| IN-02 | info | fixed | 19-REVIEW-FIX.md (not in the current review) |
| IN-03 | info | fixed | 19-REVIEW-FIX.md (not in the current review) |
| IN-04 | info | fixed | 19-REVIEW-FIX.md (not in the current review) |
| IN-05 | info | fixed | 19-REVIEW-FIX.md (not in the current review) |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
