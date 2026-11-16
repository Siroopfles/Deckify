---
phase: "13"
slug: "like-button-403-fix-sink-input-guardrails"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-16"
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Python `unittest` (`IsolatedAsyncioTestCase` / `TestCase`) |
| **Config file** | None (discovered via `py -3 -m unittest discover -s tests -p "test_*.py"`) |
| **Quick run command** | `py -3 -m unittest discover -s tests -p "test_phase13.py"` |
| **Full suite command** | `py -3 -m unittest discover -s tests -p "test_*.py"` |
| **Estimated runtime** | ~28 seconds |

---

## Sampling Rate

- **After every task commit:** Run targeted module test (`test_volume.py`, `test_features.py`, `test_final_coverage.py`, or `test_phase13.py`)
- **After every plan wave:** Run `py -3 -m unittest discover -s tests -p "test_*.py"`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 13-01-01 | 01 | 1 | LIB-01 | T-13-01 | Only valid `spotify:track:{id}` URIs sent to `me/library`; CDP fallback only when `spotify_client` active | unit | `py -3 -m unittest discover -s tests -p "test_features.py"` | ✅ | ⬜ pending |
| 13-01-02 | 01 | 1 | LIB-01 | T-13-02 | Batch `me/library/contains` strictly capped at 40 URIs per request | unit | `py -3 -m unittest discover -s tests -p "test_phase13.py"` | ❌ W0 | ⬜ pending |
| 13-02-01 | 02 | 1 | LIB-02 | T-13-03 | `resolve_spotify_sink_input_ids` enforces allowlist + `steamwebhelper`/`Chromium` deny-list and no-ops on 0 matches | unit | `py -3 -m unittest discover -s tests -p "test_volume.py"` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/test_phase13.py` — covers >40 URI batching in `check_tracks_liked`, CDP `LibraryAPI` fallback in `toggle_like_track` & `get_liked_tracks`, and `resolve_spotify_sink_input_ids` / `_set_pactl_sink_input` guardrails.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live Steam Deck Spotify Desktop Client CDP `LibraryAPI` save/unsave & sink-input isolation with active game + Steam UI audio | LIB-01, LIB-02 | Requires live SteamOS PipeWire/PulseAudio daemon and running Spotify Desktop Client CEF instance | On Steam Deck, like/unlike a track in Expanded Modal and QAM; switch audio output while a game and Steam UI sounds are active and verify only Spotify/Deckify streams move. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
