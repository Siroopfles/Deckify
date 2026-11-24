---
phase: "26"
slug: "unified-cdp-platform-bridge-deep-discovery-2-0"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-24"
---

# Phase 26 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Python `unittest` (stdlib) + Vitest 5.1.0 |
| **Config file** | `package.json` (`test`, `lint`, `typecheck`, `build`) |
| **Quick run command** | `py -3 -m unittest tests/test_cdp_bridge.py -q` |
| **Full suite command** | `py -3 -m unittest discover -s tests -p "test_*.py" -q && pnpm test -- --run && pnpm run lint && pnpm run typecheck && pnpm run build` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Targeted Python `unittest` or Vitest file for the modified module (`< 2s`)
- **After every plan wave:** Full Python + Vitest suites + `pnpm run lint` + `pnpm run typecheck`
- **Before `/gsd-verify-work`:** Full suite must be green (`py -3 -m unittest discover -s tests -p "test_*.py" -q`, `pnpm test -- --run`, `pnpm run lint`, `pnpm run typecheck`, `pnpm run build`)
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 26-01-01 | 01 | 1 | DISC-04 | T-26-01 / T-26-02 | Serialize dynamic IDs/URIs via `json.dumps`; `4.0s` timeout & clean fallback; `engine.py` wrappers preserve signatures | unit | `py -3 -m unittest tests/test_cdp_bridge.py tests/test_device_and_engine.py tests/test_podcast_suite.py -q` | ❌ W0 (`test_cdp_bridge.py`) / ✅ existing | ⬜ pending |
| 26-02-01 | 02 | 2 | DISC-04 | T-26-03 | Atomic `tmp` + `os.replace` writes to `~/.cache/deckify/discovery_mixes.json`; no expiry on `librespot` | unit | `py -3 -m unittest tests/test_discovery.py -q` | ✅ (`tests/test_discovery.py`) | ⬜ pending |
| 26-03-01 | 03 | 2 | DISC-04 | T-26-04 | `0ms` fast-fail in `_try_cdp_station_radio` when `spotify_client` not running; valid `spotify:station:` URI resolution | unit | `py -3 -m unittest tests/test_phase25_radio_search.py -q` | ✅ (`tests/test_phase25_radio_search.py`) | ⬜ pending |
| 26-04-01 | 04 | 3 | DISC-04 | — | `DiscoveryTab` `" · Cached"` rendering, `SearchTab` CDP categories + 12 static tiles fallback, `DeckifyExpandedModal` `B` clear-search & hint bar | unit | `pnpm test -- --run src/components/tabs/DiscoveryTab.test.tsx src/components/tabs/SearchTab.test.tsx src/components/DeckifyExpandedModal.test.tsx` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/test_cdp_bridge.py` — covers `cdp_bridge.evaluate_with_registry` (`window.__deckifyRegistry` reuse/invalidation JS, `4.0s` timeout, error fallback), `cdp_fetch_discovery_mixes`, `cdp_fetch_station_radio_uris`, `cdp_fetch_browse_categories`, and `engine.py` wrapper delegation.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live Spotify Desktop Client CDP `Platform.Registry` mix discovery, radio station resolution, and `librespot` playback on Steam Deck | DISC-04 | Port `9229` Spotify Desktop Client CEF is only available on Steam Deck / Linux with Official Spotify Client running | Switch engine to `spotify_client`, open `DiscoveryTab` to verify *Made For You* mixes load, switch to `librespot` and verify mixes show `" · Cached"` and play/browse in `PlaylistsTab` and QAM Pinned Pills. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
