---
phase: "20"
slug: "100-silent-hud-toasts-extended-in-game-quick-chords"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-11-21"
---

# Phase 20 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Spotify Metadata -> `SilentBanner` React DOM | Untrusted external track/artist/playlist names and artwork URLs cross into browser DOM inside Steam CEF | Track/artist/playlist text strings, cover art URLs |
| SteamOS GamepadUI CEF Overlay -> Running Game | Global overlay component shares viewport over active game processes | Rendered DOM overlay, CSS pointer/focus attributes |
| Frontend RPC / Local `settings.json` -> `main.py` / `py_modules/common.py` | Unverified JSON settings payloads cross into persistent plugin settings | `silent_banner_enabled` boolean, `gamepad_chord_bindings` button arrays |
| SteamOS Gamepad Input Source -> `createChordMatcher` | Raw hardware/CEF button indices and asynchronous ButtonUp events enter plugin chord state machine | Integer button IDs (`0..28`), timestamps |
| User Chord Triggers -> Backend Playback/Library/Settings RPCs | Concurrent or rapid button presses invoke optimistic local updates and async Spotify/settings mutations | Playback/like/pinned/lyrics RPCs |
| Settings UI `ChordBindingsCard` -> `FocusNavController` | Temporary gamepad capture hooks raw controller events inside Settings modal | Gamepad button down/up events, recording suppression state |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-20-01 | Tampering | `src/components/SilentBanner.tsx` | medium | mitigate | `renderBannerContent` (`src/components/SilentBanner.tsx:93-144`) renders `payload.text` and `payload.secondaryText` strictly as React text nodes with CSS ellipsis clamping; zero `dangerouslySetInnerHTML` or raw HTML injection | closed |
| T-20-02 | Information Disclosure | `src/components/SilentBanner.tsx` / `src/index.tsx` | medium | mitigate | `resolveSafeCoverUrl` (`src/components/SilentBanner.tsx:35-41`) and `resolveCachedArtworkSync` (`src/index.tsx:518-522`) allow only `data:` and `http://127.0.0.1` cached URIs, dropping unproxied `https://` URLs | closed |
| T-20-03 | Denial of Service | `src/components/SilentBanner.tsx` | high | mitigate | `buildBannerStyle` (`src/components/SilentBanner.tsx:59-62`) enforces `zIndex: 10000`, `pointerEvents: "none"`, zero `tabIndex`, and zero `<Focusable>` wrappers | closed |
| T-20-04 | Tampering | `py_modules/common.py` / `main.py` (`set_setting`, `_load_settings`) | high | mitigate | `_normalize_chord_buttons`, `_sanitize_chord_bindings`, `_validate_chord_bindings`, and `_load_settings` (`py_modules/common.py:231-309, 454-467`) plus `set_setting` (`main.py:767-775`) enforce `CHORD_ACTION_IDS` allowlist, `isinstance(btn, bool)` rejection, `0..28` integer bounds, max 4 buttons, Valve reserved exclusion, cross-action uniqueness, `copy.deepcopy(default_settings)`, and `silent_banner_enabled` boolean coercion | closed |
| T-20-05 | Elevation of Privilege | `src/chords.ts` (`isValveReservedChord`, `validateChordBinding`) | high | mitigate | `isValveReservedChord` and `validateChordBinding` (`src/chords.ts:176-203`) reject any 2-button combination pairing guide IDs (`13, 14, 27, 28`) with Valve reserved targets (`3=X, 5=L1, 6=R1`) | closed |
| T-20-06 | Denial of Service | `src/chords.ts` / `src/index.tsx` (`createChordMatcher`, `onDismount`) | medium | mitigate | `createChordMatcher` (`src/chords.ts:291-333, 369-414`) enforces `GUIDE_EXPIRY_MS = 4000` timer + `expireGuideIfStale` lazy timestamp eviction; `setupChordListener` (`src/index.tsx:478-516`) enforces `bigOpen` and `isChordRecordingActive()` suppression; `onDismount` (`src/index.tsx:1719-1720`) runs `cleanupChords()` to set `disposed = true` and unregister handlers | closed |
| T-20-07 | Repudiation | `src/index.tsx` (`handleLikeChord`, `handlePinnedCycleChord`) | low | accept | Monotonic `likeRequestSeq` and `pinnedCycleSeq` counters (`src/index.tsx:165-166, 360-370, 394-399`) prevent stale async RPC failures from rolling back newer user state; accepted in `20-02-PLAN.md` | closed |
| T-20-08 | Denial of Service | `src/components/tabs/ChordBindingsCard.tsx` (`useChordRecorder`) | medium | mitigate | `clearActiveRecording` (`src/components/tabs/ChordBindingsCard.tsx:87-104`) clears countdown/timeout timers, unregisters gamepad listeners, and calls `setChordRecordingActive(false)` on unmount (`lines 255-262`), `chordsEnabled=false` (`lines 251-253`), B-press, Cancel, timeout, or commit | closed |
| T-20-SC | Tampering | `package.json` / `py_modules/` | high | accept | Zero new npm or pip dependencies introduced in Phase 20 (verified via `git diff 2c0a7c9eeb375b80c547cc2c27136c0f044c4bf5..HEAD -- package.json pnpm-lock.yaml`) | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-20-01 | T-20-07 | Low-severity optimistic UI rollback race is bounded by monotonic `likeRequestSeq` / `pinnedCycleSeq` counters; no security impact | Phase 20 Plan 02 | 2026-11-21 |
| AR-20-02 | T-20-SC | Zero new npm or pip dependencies introduced across Plans 20-01, 20-02, and 20-03 | Phase 20 Plans 01–03 | 2026-11-21 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-21 | 9 | 9 | 0 | gsd-secure-phase (ASVS L1) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-21
