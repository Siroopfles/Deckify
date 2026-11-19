---
phase: 19
review: 19-REVIEW.md
titles: json
findings:
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
total: 12
recorded: 2026-11-19T12:42:16.624Z
---

# Phase 19: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | fixed | 19-REVIEW-FIX.md |
| WR-02 | warning | fixed | 19-REVIEW-FIX.md |
| WR-03 | warning | fixed | 19-REVIEW-FIX.md |
| WR-04 | warning | fixed | 19-REVIEW-FIX.md |
| WR-05 | warning | fixed | 19-REVIEW-FIX.md |
| WR-06 | warning | fixed | 19-REVIEW-FIX.md |
| WR-07 | warning | fixed | 19-REVIEW-FIX.md |
| IN-01 | info | fixed | 19-REVIEW-FIX.md |
| IN-02 | info | fixed | 19-REVIEW-FIX.md |
| IN-03 | info | fixed | 19-REVIEW-FIX.md |
| IN-04 | info | fixed | 19-REVIEW-FIX.md |
| IN-05 | info | fixed | 19-REVIEW-FIX.md |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
