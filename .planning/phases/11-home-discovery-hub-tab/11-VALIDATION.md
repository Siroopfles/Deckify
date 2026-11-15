---
phase: "11"
slug: "home-discovery-hub-tab"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-15"
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.1.0 (`pnpm test`) + Python `unittest` (`py -m unittest discover -s tests -p "test_*.py"`) |
| **Config file** | `package.json` / `tsconfig.json` / `tests/` |
| **Quick run command** | `pnpm test && py -m unittest tests/test_discovery.py` |
| **Full suite command** | `pnpm typecheck && pnpm lint && pnpm test && py -m unittest discover -s tests -p "test_*.py"` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test` (frontend tasks) or `py -m unittest tests/test_discovery.py` (backend tasks)
- **After every plan wave:** Run `pnpm typecheck && pnpm lint && pnpm test && py -m unittest discover -s tests -p "test_*.py"`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 11-01-01 | 01 | 1 | DISC-03 | T-11-01 | Global 429 exponential-backoff circuit breaker (`300s` cap) prevents retry storms | unit | `py -m unittest tests/test_discovery.py` | ❌ W0 | ⬜ pending |
| 11-01-02 | 01 | 1 | DISC-02, DISC-03 | T-11-02 | `time_range` whitelisted, `CURRENT_SCOPES_VERSION=7`, 403 `needs_reauth`, 1h/4h TTL cache | unit | `py -m unittest tests/test_discovery.py` | ❌ W0 | ⬜ pending |
| 11-02-01 | 02 | 2 | DISC-01 | T-11-03 | All external artwork proxied through `<DeckifyImage>`, `"discovery"` tab & idle default | unit | `pnpm test` | ❌ W0 | ⬜ pending |
| 11-02-02 | 02 | 2 | DISC-01, DISC-02 | T-11-03 | Carousels, `flow-children="horizontal"`, time-range pills, `A`/`Y` actions, 403/429 UI states | unit | `pnpm test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/test_discovery.py` — stubs/tests for `DISC-02` and `DISC-03` (circuit breaker, TTL cache, stale fallback, `needs_reauth`, `CURRENT_SCOPES_VERSION == 7`, `get_discovery_feed`)
- [ ] `src/components/tabs/DiscoveryTab.test.tsx` — stubs/tests for `DISC-01` and `DISC-02` (greeting, time-range pills, carousels, 403 re-auth card, 429 stale banner, `A`/`Y` actions)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| SteamOS GamepadUI D-pad horizontal carousel focus & `L1`/`R1` tab switching | DISC-01, DISC-02 | Requires live Steam Deck CEF spatial navigation runtime | Open Deckify modal on Steam Deck, navigate to Discovery tab via D-pad / L1-R1, verify horizontal scroll & focus halo on all 4 carousels |
| Live Spotify OAuth re-authentication prompt for `user-top-read` (`CURRENT_SCOPES_VERSION = 7`) | DISC-02 | Requires live Spotify OAuth PKCE browser flow | Trigger re-auth on existing session, complete OAuth, verify Top Tracks & Top Artists populate |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
