---
phase: "02"
slug: "artwork-image-pipeline-stabilization"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-11"
---

# Phase 02 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Python `unittest` standard library + Vitest 5.1.0 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `& "C:\Users\djdje\AppData\Local\Python\pythoncore-3.14-64\python.exe" -m unittest tests/test_images.py ; pnpm test` |
| **Full suite command** | `& "C:\Users\djdje\AppData\Local\Python\pythoncore-3.14-64\python.exe" -m unittest discover tests ; pnpm test ; pnpm typecheck ; pnpm build` |
| **Estimated runtime** | ~20 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick run command (`unittest tests/test_images.py` + `pnpm test`)
- **After every plan wave:** Run full suite command
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 25 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 0 | IMG-01, IMG-02 | T-02-01 | SSRF test stubs & LRU cache test suites | unit | `& "C:\Users\djdje\AppData\Local\Python\pythoncore-3.14-64\python.exe" -m unittest tests/test_images.py ; pnpm test` | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 1 | IMG-01 | T-02-01 | Strict Spotify CDN whitelist + mosaic normalization | unit | `& "C:\Users\djdje\AppData\Local\Python\pythoncore-3.14-64\python.exe" -m unittest tests/test_images.py` | ✅ | ⬜ pending |
| 02-01-03 | 01 | 2 | IMG-02 | T-02-02 | Request queue (max 4 concurrent) + 200 LRU cache + skeleton shimmer | unit | `pnpm test ; pnpm typecheck ; pnpm build` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/test_images.py` — add test cases for `*.spotifycdn.com`, `*.spotifycdn.net`, `mosaic.scdn.co`, `seeded-session-images.scdn.co`, and SSRF spoofed domains.
- [ ] `src/components/common/DeckifyImage.test.ts` — test suites for `ImageLruCache` (eviction at 200), `ImageQueue` (max 4 concurrent), and request deduplication.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Skeleton shimmer visuals | IMG-02 | Visual animation in Steam GamepadUI CEF | Open modal, observe smooth dark shimmer before artwork renders |
| Standard fallback icon | IMG-02 | Visual rendering in Steam GamepadUI CEF | Inspect tracks/podcasts without covers to verify `FaMusic` neutral icon |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 25s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
