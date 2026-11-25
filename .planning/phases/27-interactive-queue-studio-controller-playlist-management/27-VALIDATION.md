---
phase: "27"
slug: "interactive-queue-studio-controller-playlist-management"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-25"
---

# Phase 27 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.1.0 (`pnpm test -- --run`) + Python `unittest` (`py -3 -m unittest`) |
| **Config file** | `vitest.config.ts` / `package.json` |
| **Quick run command** | `pnpm test -- --run src/components/tabs/QueueTab.test.tsx src/components/tabs/PlaylistsTab.test.tsx && py -3 -m unittest tests/test_queue_studio.py tests/test_playlist_management.py -q` |
| **Full suite command** | `pnpm test -- --run && pnpm run lint && pnpm run typecheck && py -3 -m unittest discover -s tests -p "test_*.py" -q` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run targeted Vitest or Python `unittest` suite for the modified area
- **After every plan wave:** Run `pnpm test -- --run && pnpm run lint && pnpm run typecheck && py -3 -m unittest discover -s tests -p "test_*.py" -q`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 27-01-01 | 01 | 1 | QUEUE-03 | T-27-01 | `json.dumps()` escaping in CDP `PlayerAPI` calls & integer bounds | unit | `py -3 -m unittest tests/test_queue_studio.py -v` | ❌ W0 | ⬜ pending |
| 27-02-01 | 02 | 1 | PL-01 | T-27-02 | Non-empty playlist name validation, `is_editable` ownership check, `json.dumps()` escaping | unit | `py -3 -m unittest tests/test_playlist_management.py -v` | ❌ W0 | ⬜ pending |
| 27-03-01 | 03 | 2 | QUEUE-03 | T-27-03 | 2-tap `"Confirm Clear?"` guard against accidental queue clear | unit | `pnpm test -- --run src/components/tabs/QueueTab.test.tsx` | ✅ (extend) | ⬜ pending |
| 27-04-01 | 04 | 2 | PL-01 | T-27-04 | Ownership gating (`is_editable`) & Delete confirmation modal defaulting focus to `"Cancel"` | unit | `pnpm test -- --run src/components/tabs/PlaylistsTab.test.tsx src/components/common/TrackActionModal.test.tsx` | ❌ W0 (`PlaylistsTab.test.tsx`) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/test_queue_studio.py` — stubs for `QUEUE-03` (`reorder_queue_track`, `remove_queue_track`, `clear_queue`, CDP `PlayerAPI`, URI-slice fallback, optimistic snapshot)
- [ ] `tests/test_playlist_management.py` — stubs for `PL-01` (`create_playlist`, `update_playlist_details`, `delete_playlist`, `reorder_playlist_tracks`, `remove_track_from_playlist`, `is_editable`, CDP fallbacks)
- [ ] `src/components/tabs/PlaylistsTab.test.tsx` — stubs for `PlaylistsTab` CRUD, filtering, ownership gating, and Grab/Move Mode

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| SteamOS GamepadUI `FocusNavController` spatial focus lock during live Grab/Move swaps | QUEUE-03, PL-01 | Requires live SteamOS CEF / GamepadUI runtime | Enter Grab/Move Mode on `QueueTab` and `PlaylistsTab` in GamepadUI; press D-Pad Up/Down and verify focus stays on the grabbed track without jumping to sidebar/header |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
