---
phase: "28"
slug: "cdp-offline-downloads-wi-fi-travel-mode-living-room-spotify"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-11-26"
---

# Phase 28 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Deckify Backend -> Host OS (`flatpak`, `os.statvfs`) | Subprocess & filesystem calls for offline storage path and disk free-space guardrails | User-configured storage path, filesystem stats |
| Deckify Backend -> Official Spotify Client (CDP `:9222`) | Chrome DevTools Protocol JS evaluation against `Platform.Registry` (`OfflineAPI`, `SocialConnectAPI`, `JamDevicesAPI`) | Spotify URIs, download state, Jam session `join_url` |
| Deckify Frontend -> Backend RPC & SteamOS Controller | Controller focus traps, `vgp_oncancel` modal guards, bulk delete confirmation, deep-link validation | Spotify URIs, Travel Mode state, Jam QR URLs |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-28-01 | Tampering | `configure_offline_storage_path` | high | mitigate | `validate_offline_storage_path` rejects empty/control chars/relative paths; `subprocess.run` list args (`shell=False`) in `py_modules/engine.py:520-597` | closed |
| T-28-02 | Denial of Service | `check_disk_guardrail` | high | mitigate | `os.statvfs` free-space check (`f_bavail * f_frsize`) + `clamp_offline_min_free_gb` `[0.5, 50.0]` GB in `py_modules/common.py:598-637` | closed |
| T-28-03 | Tampering | `cdp_set_offline_download` | medium | mitigate | `json.dumps(norm_uri)` safe JS string escaping in `py_modules/cdp_bridge.py:1905-1908` | closed |
| T-28-04 | Denial of Service | `SessionBookmarkManager.on_poll_network_result` | low | mitigate | `WAKE_GRACE_WINDOW_S = 10.0` grace window + manual override guard in `py_modules/resilience.py:25,750-777` | closed |
| T-28-05 | Tampering | `buildSpotifyDeepLink` | low | mitigate | Strict `SPOTIFY_URI_RE` regex allowlist in `src/components/common/JamQrModal.tsx:8-15` | closed |
| T-28-06 | Denial of Service | `main.py:_poll_playback` / `get_offline_status` | high | mitigate | Active download disk guardrail check cancels downloads and marks `paused_low_space` in `main.py:1745-1771,2318-2326` | closed |
| T-28-07 | Denial of Service | `main.py` async event loop | medium | mitigate | Blocking disk/CDP calls offloaded via `await _exec(...)` in `main.py:1708-1796` | closed |
| T-28-08 | Denial of Service | Library Tab Filter & Render | low | mitigate | `clampOfflineProgress` `[0..100]` + `minWidth: 0` / `textOverflow: "ellipsis"` in `src/components/common/OfflineStatusUI.tsx:14-95,158-171` | closed |
| T-28-09 | Tampering / Repudiation | `SettingsTab` Bulk Delete | medium | mitigate | `BulkDeleteConfirmModal` explicit controller confirmation in `src/components/tabs/SettingsTab.tsx:272-335,618-637` | closed |
| T-28-10 | Tampering / Availability | `DeckifyExpandedModal.tsx` `vgp_oncancel` | low | mitigate | Modal-open refs guarded with `preventDefault`/`stopPropagation`/`stopImmediatePropagation` in `src/components/DeckifyExpandedModal.tsx:1886-1899` | closed |
| T-28-11 | Denial of Service | `cdp_bridge.wait_for_cdp_ready` | medium | mitigate | Monotonic deadline (`12.0`s default, `2.0`s per probe) in `py_modules/cdp_bridge.py:160-180` | closed |
| T-28-12 | Tampering | `cdp_bridge.cdp_start_spotify_jam` | low | mitigate | `_normalize_jam_response` requires non-empty `join_url` before reporting `active: true` in `py_modules/cdp_bridge.py:2165-2290` | closed |
| T-28-13 | Information Disclosure / Spoofing | `JamQrModal.tsx:JamQrCard` | low | mitigate | Explicit error + `Retry Jam` button when `join_url` absent on `spotify_client` in `src/components/common/JamQrModal.tsx:159-187` | closed |
| T-28-14 | Availability / Denial of Service | `EngineSwitchDownloadModal` & `TravelModeBanner` focus lifecycle | low | mitigate | `Focusable` `retainFocus: true`, `onCancelButton`, and focus save/restore in `src/components/DeckifyExpandedModal.tsx:302-326,2584-2614` | closed |
| T-28-SC | Tampering | npm/pip/cargo installs | high | mitigate | Zero package manifest changes in Phase 28 (`package.json`, `package-lock.json`, `pyproject.toml`, `requirements.txt`) | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

No accepted risks.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-26 | 15 | 15 | 0 | gsd-security-auditor |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-26
