---
status: testing
phase: 28-cdp-offline-downloads-wi-fi-travel-mode-living-room-spotify
source: [28-VERIFICATION.md]
started: 2026-11-26T12:15:00+01:00
updated: 2026-11-26T12:15:00+01:00
---

## Current Test

number: 1
name: Live Official Spotify Client Offline Downloads & Disk Guardrail (SteamOS)
expected: |
  When librespot is active, tapping "Download for Offline" opens EngineSwitchDownloadModal with "Switch to Spotify Client & Download" and "Stay on librespot". Switching to Official Spotify Client queues the download via OfflineAPI, shows live "↓ X%" progress and green "✓" offline badge, respects os.statvfs 3.0 GB free-space guardrail, and supports configurable storage path (with flatpak override) and selective/bulk removal in SettingsTab.
awaiting: user response

## Tests

### 1. Live Official Spotify Client Offline Downloads & Disk Guardrail (SteamOS)
expected: When librespot is active, tapping "Download for Offline" opens EngineSwitchDownloadModal with "Switch to Spotify Client & Download" and "Stay on librespot". Switching to Official Spotify Client queues the download via OfflineAPI, shows live "↓ X%" progress and green "✓" offline badge, respects os.statvfs 3.0 GB free-space guardrail, and supports configurable storage path (with flatpak override) and selective/bulk removal in SettingsTab.
result: [pending]

### 2. Wi-Fi Disconnect & Wake-from-Suspend Travel Mode Transition (SteamOS)
expected: Waking from suspend does not falsely trigger Travel Mode within the 10-second grace window. Sustained Wi-Fi disconnect activates auto Travel Mode, filtering library tabs to downloaded items with the "Offline Travel Mode" banner and serving cached .lrc lyrics and discovery_mixes.json; reconnecting auto-exits unless manual Travel Mode was toggled ON in QAM, modal header, or SettingsTab.
result: [pending]

### 3. Living-Room Spotify Jam QR Scanning & Controller Focus Restoration (SteamOS)
expected: Tapping "Start / Share Spotify Jam" in NowPlayingTab or DevicesTab opens JamQrModal with a high-contrast #FFFFFF quiet-zone QRCodeSVG scannable by a phone camera, shows "Jam Active" pill while active, falls back to a shareable track/playlist deep-link QR with "Switch to Spotify Client & Start Jam" on librespot, and closes cleanly on B button (vgp_oncancel) without closing DeckifyExpandedModal.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
