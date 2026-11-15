---
phase: "10"
slug: "in-game-hud-overlay-2-0-live-synced-lyrics"
status: verified
threats_open: 0
asvs_level: 1
created: "2026-11-15"
---

# Phase 10 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| External LRCLIB/Spotify/NetEase lyrics text -> SteamOS CEF DOM | Untrusted third-party lyric strings rendered inside `DeckifyOverlay` | Lyric line strings (`string`) |
| Frontend RPC -> Python `set_setting` | User-supplied settings (`overlay_lyrics_offset_ms`, `overlay_autohide_duration_s`, `overlay_lyrics_enabled`) persisted to `settings.json` | Numeric/boolean settings |
| Backend RPC (`get_status`) -> Frontend UI | Filtered settings dictionary crosses Decky RPC boundary to React state | Non-sensitive `public_keys` settings |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-10-01 | Tampering | `src/components/DeckifyOverlay.tsx` | medium | mitigate | Lyric text rendered strictly via React JSX text interpolation (`{displayText}`), zero `dangerouslySetInnerHTML` occurrences. | closed |
| T-10-02 | Denial of Service | `py_modules/common.py`, `main.py`, `src/components/DeckifyOverlay.tsx` | low | mitigate | Clamps `overlay_lyrics_offset_ms` to `[-2000, 2000]` and `overlay_autohide_duration_s` to `[3, 15]` on backend (`set_setting`, `_load_settings`) and frontend (`DeckifyOverlay`) with `Math.max(16, ...)` timer floor. | closed |
| T-10-03 | Tampering | `src/components/tabs/SettingsTab.tsx` | low | mitigate | Clamps `SliderField` `onChange` values (`Math.min(15, Math.max(3, val))` and `Math.min(2000, Math.max(-2000, val))`) before calling `backendSetSetting`. | closed |
| T-10-04 | Information Disclosure | `main.py:get_status` | medium | mitigate | Explicit `public_keys` allowlist at `main.py:494,517` filters `self._settings`; `tests/test_plugin_api.py` asserts non-public keys remain excluded. | closed |
| T-10-SC | Tampering | npm/pip/cargo installs | high | mitigate | No new npm or Python dependencies added in Phase 10; existing locked stack only. | closed |

---

## Accepted Risks Log

No accepted risks.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-15 | 5 | 5 | 0 | verify-work (secure-phase L1) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-15
