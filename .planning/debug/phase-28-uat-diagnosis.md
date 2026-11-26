---
status: diagnosed
trigger: "Investigate Phase 28 UAT gaps (G-28-1, G-28-2, G-28-3)"
created: 2026-11-26T16:05:59Z
updated: 2026-11-26T16:12:00Z
---

## Current Focus

hypothesis: "Root causes confirmed for G-28-1, G-28-2, and G-28-3"
test: "Static code trace across DeckifyExpandedModal.tsx, JamQrModal.tsx, OfflineStatusUI.tsx, index.tsx, main.py, cdp_bridge.py, resilience.py, and tabs"
expecting: "Complete root cause diagnosis with exact file paths and line numbers"
next_action: "Return structured ROOT CAUSE FOUND to orchestrator"

reasoning_checkpoint:
  hypothesis: "Each of G-28-1, G-28-2, and G-28-3 is caused by concrete UI/focus, CDP startup/API-extraction, and state-lifecycle defects."
  confirming_evidence:
    - "G-28-1: DeckifyExpandedModal.tsx:2517-2564 renders DialogButtons with flexShrink:0 in a non-wrapping horizontal flex row inside maxWidth:460 without focus transfer/trap; main.py:560-630 returns before CDP port 9222 is ready and DeckifyExpandedModal.tsx:792-802 calls toggle_offline_download immediately."
    - "G-28-2: DeckifyExpandedModal.tsx:2039-2064 overrides DialogButton background/border inline without focus styling; src/index.tsx:887,1799 hides Travel Mode inside collapsed controlsExpanded accordion; OfflineStatusUI.tsx:174 + tabs unmount focused elements on exit without focus/data restoration; no header visibility setting exists."
    - "G-28-3: py_modules/cdp_bridge.py:1730-1755 sets active=true even when joinUrl is null and only checks flat sess?.joinUrl/shareUrl/url/join_url; JamQrModal.tsx:157-160 silently falls back to buildSpotifyDeepLink(shareUri) whenever join_url is null."
  falsification_test: "If CDP OfflineAPI.addDownload / SocialConnectAPI.createSession returned joinUrl synchronously on port 9222 and modals trapped focus, none of the three UAT failures would occur."
  fix_rationale: "Addressing modal layout/focus-trap, CDP readiness + API fallbacks, QAM visibility + Travel Mode exit reconciliation, and Jam URL extraction/guarding fixes the root mechanisms."
  blind_spots: "Live Spotify Desktop Flatpak CDP object shapes for OfflineAPI and SocialConnectAPI on SteamOS cannot be inspected without a running SteamOS Spotify instance, so CDP method/property discovery fallbacks must handle multiple Spotify client versions."
  candidate_causes:
    - "code: UI layout/focus-trap/fallback logic in DeckifyExpandedModal.tsx, JamQrModal.tsx, index.tsx, cdp_bridge.py"
    - "environment: Official Spotify Client Flatpak startup latency on virtual Xwayland display before CDP port 9222 / Platform.Registry is ready"
  and_gate: "yes — G-28-1 and G-28-3 combine UI/CDP-extraction code defects with Spotify Flatpak startup latency; G-28-2 combines inline CSS focus suppression, collapsed QAM accordion, and missing focus/data reconciliation on state transition"

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected: "G-28-1: EngineSwitchDownloadModal fits buttons cleanly, traps focus/B-button, and triggers offline download. G-28-2: Travel Mode header button has visible focus indicator, toggling ON/OFF cleanly restores state, QAM shows Travel Mode control, and setting exists to hide/show button when Wi-Fi is online. G-28-3: Jam QR modal displays and encodes the real Spotify Jam join URL so scanning joins the Jam."
actual: "G-28-1: Buttons overflow/fall outside EngineSwitchDownloadModal, background controller input remains active, downloading doesn't do anything. G-28-2: Travel Mode button has no visible focus/selected indicator, toggling ON then OFF makes app feel bugged, nothing for Travel Mode in QAM, no setting to hide/show when online. G-28-3: Scanning QR code plays current track instead of joining Jam; modal shows track link."
errors: "None reported in UI; functional/UI/UX failures"
reproduction: "Phase 28 UAT Tests 1, 2, 3"
started: "Phase 28 implementation"

## Eliminated

## Evidence

- timestamp: 2026-11-26T16:07:00Z
  checked: "src/components/DeckifyExpandedModal.tsx:2503-2565"
  found: "EngineSwitchDownloadModal is inline JSX. Outer card has maxWidth: 460, padding: 24. Button row uses Focusable flow-children='horizontal' with display: flex, gap: 8, justifyContent: flex-end and NO flexWrap: 'wrap'. Both DialogButtons set width: 'auto', minWidth: 'auto', flexShrink: 0. No useEffect moves focus into the modal on open, no retainFocus prop, no onCancelButton on the Focusable."
  implication: "Buttons overflow horizontally outside the 460px modal card and controller focus remains on the background element behind the modal."

- timestamp: 2026-11-26T16:07:30Z
  checked: "src/components/DeckifyExpandedModal.tsx:787-817, main.py:560-630, py_modules/cdp_bridge.py:1448-1550"
  found: "handleConfirmEngineSwitchDownload calls backendSwitchAudioBackend('spotify_client') and immediately calls backendToggleOfflineDownload(pending.uri, true). main.py:_start_spotify_client spawns kwin_wayland + flatpak spotify via subprocess.Popen and returns immediately without waiting for CDP port 9222 or Platform.Registry. cdp_set_offline_download only checks OfflineAPI.addDownload/sync, PlaylistAPI.setOffline, ShowAPI.setOffline (no AlbumAPI fallback, no retry/readiness wait)."
  implication: "Download call hits unready CDP port immediately after engine switch and fails silently/toasts error; even when running, albums or differing OfflineAPI method names fail."

- timestamp: 2026-11-26T16:08:30Z
  checked: "src/components/DeckifyExpandedModal.tsx:2039-2065, src/index.tsx:887,1799-1818, src/components/common/OfflineStatusUI.tsx:139-190, src/components/tabs/DiscoveryTab.tsx:361-386"
  found: "Header Travel Mode pill (DialogButton) sets inline background and border, suppressing Steam .gpfocus highlight and has no onFocus/onBlur state. In src/index.tsx, Travel Mode ToggleField is inside {controlsExpanded && ...} where controlsExpanded defaults to false. Exiting Travel Mode unmounts TravelModeBanner/empty states without restoring focus, emits travel_mode_changed twice (resilience.py:570 + main.py:1773), and DiscoveryTab does not reload when travelModeEnabled transitions true -> false. No setting exists to hide the header pill when Wi-Fi is online."
  implication: "Explains all four sub-issues of G-28-2."

- timestamp: 2026-11-26T16:09:30Z
  checked: "src/components/common/JamQrModal.tsx:156-180, src/components/DeckifyExpandedModal.tsx:819-885, py_modules/cdp_bridge.py:1724-1796"
  found: "cdp_start_spotify_jam only inspects top-level sess?.joinUrl || sess?.shareUrl || sess?.url || sess?.join_url and hardcodes active: Boolean(sess?.active ?? joinUrl ?? true). When join_url is null, JamQrCard (JamQrModal.tsx:157-160) silently falls back to buildSpotifyDeepLink(shareUri) which produces https://open.spotify.com/track/{id}. handleSwitchToSpotifyClientAndStartJam also calls backendStartSpotifyJam immediately after backendSwitchAudioBackend without waiting for CDP readiness."
  implication: "Modal shows 'Jam Active' with a track deep-link QR code instead of a real Spotify Jam invite URL."

## Resolution

root_cause: "See structured ROOT CAUSE FOUND for G-28-1, G-28-2, and G-28-3."
fix: ""
verification: ""
files_changed: []
