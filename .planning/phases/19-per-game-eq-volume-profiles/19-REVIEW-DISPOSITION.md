---
phase: 19
review: 19-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: open
    title: "Async race in `EqualizerManager.preview_bands` / `set_bands` can overwrite restored EQ after `clear_preview` or `apply_ephemeral_preset`"
  - id: WR-02
    severity: warning
    disposition: open
    title: "Concurrent `VolumeFader.fade_to` task replacement race during rapid `SoundtracksTab` slider hot-apply"
  - id: WR-03
    severity: warning
    disposition: open
    title: "`boost_pa_volume` overwrites active per-game volume ceiling, ducking, and sleep lock when `librespot` stream initializes late"
  - id: WR-04
    severity: warning
    disposition: open
    title: "`EqualizerManager.cleanup_stale_process` sends `SIGTERM` as `root` without verifying `/proc/{pid}/cmdline`"
  - id: WR-05
    severity: warning
    disposition: open
    title: "`SoundtracksTab` cancels pending debounced saves on unmount instead of flushing them"
  - id: WR-06
    severity: warning
    disposition: open
    title: "`GameEqModal` relies on stale `isRunningRef` and leaves `_preview_active = True` if running-game save fails or game exits mid-edit"
  - id: WR-07
    severity: warning
    disposition: open
    title: "Already-defended-elsewhere — redundant `Number.isFinite` guard in `GameEqModal.handleBandChange`"
  - id: IN-01
    severity: info
    disposition: open
    title: "Unused `EqBandFaders` component export and duplicate `EQ_PID_FILE` constant"
  - id: IN-02
    severity: info
    disposition: open
    title: "`aria-label` props on `+`/`-` `InteractiveRow` controls in `EqBandFaders.tsx` are not forwarded to DOM"
  - id: IN-03
    severity: info
    disposition: open
    title: "`_validate_eq_bands` permits `float(\"inf\")` unlike `clamp_eq_bands`"
  - id: IN-04
    severity: info
    disposition: open
    title: "`Plugin.set_setting` broadcasts unfiltered `_settings` on `settings_changed`"
  - id: IN-05
    severity: info
    disposition: open
    title: "`SoundtracksTab` `confirmDeleteAppId` stays active across card clicks and configured cards cannot collapse"
open: 12
total: 12
recorded: 2026-11-19T08:27:52.999Z
---

# Phase 19: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | open | - |
| WR-02 | warning | open | - |
| WR-03 | warning | open | - |
| WR-04 | warning | open | - |
| WR-05 | warning | open | - |
| WR-06 | warning | open | - |
| WR-07 | warning | open | - |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |
| IN-04 | info | open | - |
| IN-05 | info | open | - |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
