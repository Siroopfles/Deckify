---
status: complete
phase: 28-cdp-offline-downloads-wi-fi-travel-mode-living-room-spotify
source: [28-VERIFICATION.md]
started: 2026-11-26T12:15:00+01:00
updated: 2026-11-26T15:59:38.837Z
---

## Current Test

[testing complete]

## Tests

### 1. Live Official Spotify Client Offline Downloads & Disk Guardrail (SteamOS)
expected: When librespot is active, tapping "Download for Offline" opens EngineSwitchDownloadModal with "Switch to Spotify Client & Download" and "Stay on librespot". Switching to Official Spotify Client queues the download via OfflineAPI, shows live "↓ X%" progress and green "✓" offline badge, respects os.statvfs 3.0 GB free-space guardrail, and supports configurable storage path (with flatpak override) and selective/bulk removal in SettingsTab.
result: issue
reported: "Ja modal opent maar de knoppen zijn nog beetje apart en vallen buiten de modal en de controller input blijf nog op de achtergrond en downloaden doet nog niks echt zegmaar"
severity: major

### 2. Wi-Fi Disconnect & Wake-from-Suspend Travel Mode Transition (SteamOS)
expected: Waking from suspend does not falsely trigger Travel Mode within the 10-second grace window. Sustained Wi-Fi disconnect activates auto Travel Mode, filtering library tabs to downloaded items with the "Offline Travel Mode" banner and serving cached .lrc lyrics and discovery_mixes.json; reconnecting auto-exits unless manual Travel Mode was toggled ON in QAM, modal header, or SettingsTab.
result: issue
reported: "De offline travel mode button is niet selecteerbaar atans wel maar niet zichtbaar dat hij selected is. En als ik die aanzet heb ik het idee dat als ik hem uitzet dat heel de app dan bugged. en zie ook niks in QAM en vind de knop ook niet zo noice dat die altijd zichtbaar is ook als er wifi is misschien een option om die aan of uit te kunnen zetten in de app"
severity: major

### 3. Living-Room Spotify Jam QR Scanning & Controller Focus Restoration (SteamOS)
expected: Tapping "Start / Share Spotify Jam" in NowPlayingTab or DevicesTab opens JamQrModal with a high-contrast #FFFFFF quiet-zone QRCodeSVG scannable by a phone camera, shows "Jam Active" pill while active, falls back to a shareable track/playlist deep-link QR with "Switch to Spotify Client & Start Jam" on librespot, and closes cleanly on B button (vgp_oncancel) without closing DeckifyExpandedModal.
result: issue
reported: "Jam starten lukt alleen als ik de qr code scan met de telefoon van mn vriendin gaat hij alleen maar afspelen en joint hij geen jam er staat ook de link van het nummer bij en niet een link om de jam te joinen"
severity: major

## Summary

total: 3
passed: 0
issues: 3
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-28-1
  truth: "EngineSwitchDownloadModal renders buttons cleanly inside the modal with trapped controller focus, and switching to Official Spotify Client queues and progresses offline downloads via OfflineAPI."
  status: failed
  reason: "User reported: Ja modal opent maar de knoppen zijn nog beetje apart en vallen buiten de modal en de controller input blijf nog op de achtergrond en downloaden doet nog niks echt zegmaar"
  severity: major
  test: 1
  artifacts: []
  missing: []

- gap_id: G-28-2
  truth: "Travel Mode button shows clear controller focus state, toggling Travel Mode ON/OFF works cleanly without app glitches, QAM toggle is present, and header Travel Mode button visibility can be configured (e.g. hide when Wi-Fi is online)."
  status: failed
  reason: "User reported: De offline travel mode button is niet selecteerbaar atans wel maar niet zichtbaar dat hij selected is. En als ik die aanzet heb ik het idee dat als ik hem uitzet dat heel de app dan bugged. en zie ook niks in QAM en vind de knop ook niet zo noice dat die altijd zichtbaar is ook als er wifi is misschien een option om die aan of uit te kunnen zetten in de app"
  severity: major
  test: 2
  artifacts: []
  missing: []

- gap_id: G-28-3
  truth: "Scanning the JamQrModal QR code on a phone joins the active Spotify Jam session using a real Jam join URL rather than playing a track deep-link."
  status: failed
  reason: "User reported: Jam starten lukt alleen als ik de qr code scan met de telefoon van mn vriendin gaat hij alleen maar afspelen en joint hij geen jam er staat ook de link van het nummer bij en niet een link om de jam te joinen"
  severity: major
  test: 3
  artifacts: []
  missing: []
