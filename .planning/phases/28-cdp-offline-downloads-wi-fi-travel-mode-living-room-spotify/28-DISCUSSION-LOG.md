# Phase 28: CDP Offline Downloads, Wi-Fi Travel Mode & Living Room Spotify Jam - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-26
**Phase:** 28-CDP Offline Downloads, Wi-Fi Travel Mode & Living Room Spotify Jam
**Areas discussed:** Offline Downloads UX & Engine Prompt, Offline / Travel Mode Triggers & Filtering, 3.0 GB Disk Guardrail & Storage Management, Living Room Spotify Jam & QR Modal

---

## Offline Downloads UX & Engine Prompt

| Option | Description | Selected |
|--------|-------------|----------|
| Detail headers + CollectionActionModal + Episode rows | Matches PlaylistsTab/AlbumsTab header + X modal pattern, plus PodcastsTab episodes | ✓ |
| Detail headers only | Only inside opened Playlist, Album, and Show detail views | |
| Action modals only | Only inside CollectionActionModal (X) and TrackActionModal (X) | |

| Option | Description | Selected |
|--------|-------------|----------|
| Confirmation modal with 1-click "Switch & Download" | Explains Official Spotify Client is required and switches + queues download on confirm | ✓ |
| Toast notification only | Prompts user to switch engines manually in DevicesTab/SettingsTab | |
| Auto-switch silently | Immediately stops librespot, launches Spotify Client, and starts download | |

| Option | Description | Selected |
|--------|-------------|----------|
| Green offline badge (✓) + live percentage pill (↓ 45%) on rows, plus progress bar in detail header | Clear at-a-glance status and detail progress | ✓ |
| Text-only status pill ("Offline" / "45%") without progress bar | Minimal text badge | |
| Icon-only indicator (green checkmark or spinner) with no percentage text | Icon-only state | |

| Option | Description | Selected |
|--------|-------------|----------|
| Immediate toggle with toast | Tapping "Remove Download" clears the offline cache right away | |
| Confirmation modal | Always ask "Remove offline download?" before deleting cached tracks | |

**User's choice:** Confirmation modal for bulk actions / removing all tracks (`2 als het gaat om verwijderen van alle tracks en misschien ook bulk actions`), immediate toggle for single items.

---

## Offline / Travel Mode Triggers & Filtering

| Option | Description | Selected |
|--------|-------------|----------|
| Modal header/sidebar pill + QAM toggle + SettingsTab | Quick access in modal & QAM, full auto-trigger config in SettingsTab | ✓ |
| SettingsTab & QAM toggle only | Keep modal header/sidebar minimal | |
| SettingsTab only | Configure and toggle Travel Mode strictly in SettingsTab | |

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-exit when Wi-Fi stabilizes (unless manually enabled) | Seamless return online, while manual Travel Mode stays sticky | ✓ |
| Stay in Travel Mode until manually dismissed | Show a toast/banner "Wi-Fi restored — Exit Travel Mode?" | |
| Always auto-exit immediately on Wi-Fi reconnect | Even if Travel Mode was toggled manually | |

| Option | Description | Selected |
|--------|-------------|----------|
| Hide non-downloaded items | Show only offline-available playlists, albums, and episodes with an "Offline Travel Mode" banner | ✓ |
| Dim / gray out non-downloaded items | Keep full library list visible but mark uncached items unavailable | |

| Option | Description | Selected |
|--------|-------------|----------|
| Graceful offline fallback | LyricsTab uses .lrc cache, DiscoveryTab shows offline-available cached mixes, SearchTab shows offline notice (or local filter) | ✓ |
| Lock/hide DiscoveryTab and SearchTab in the sidebar while Travel Mode is active | Disable tabs | |

---

## 3.0 GB Disk Guardrail & Storage Management

| Option | Description | Selected |
|--------|-------------|----------|
| Block new downloads AND pause/cancel active downloads if free space drops below threshold | Prevents SteamOS disk exhaustion mid-playlist | ✓ |
| Block new downloads only | Let already-started downloads finish | |

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed 3.0 GB safety floor | Simple, predictable protection | |
| Configurable floor in SettingsTab + configurable storage path | User-configurable limit & storage location | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| Free disk space readout + "Remove All Offline Downloads" button (with confirmation modal) in SettingsTab | Full cleanup controls | ✓ |
| Free disk space readout only | Manage downloads individually on each playlist/album/episode | |

**User's choice:** Configurable threshold in Settings + configurable storage path (SSD vs SD card) + selectable overview list of all downloaded items to remove individual items or bulk-remove all with confirmation.

---

## Living Room Spotify Jam & QR Modal

| Option | Description | Selected |
|--------|-------------|----------|
| High-contrast QRCodeSVG (white quiet zone) + join link + active Jam status/participants + End/Leave Jam & Close controls | Full living-room Jam modal | ✓ |
| Minimal QRCodeSVG + Close button only | No session status or End/Leave controls in the modal | |

| Option | Description | Selected |
|--------|-------------|----------|
| Show shareable track/playlist deep-link QRCodeSVG immediately + 1-click "Switch to Spotify Client & Start Jam" button | Immediate QR fallback + engine switch | ✓ |
| Show only a "Switch to Spotify Client" prompt without a fallback deep-link QR code | Prompt only | |

| Option | Description | Selected |
|--------|-------------|----------|
| NowPlayingTab + DevicesTab + reusable JamQrModal/Card component ready for Phase 29 TvSplitView | Reusable across current and next phase | ✓ |
| NowPlayingTab only (plus TvSplitView in Phase 29) | Single entry point | |

| Option | Description | Selected |
|--------|-------------|----------|
| Show a compact "Jam Active" pill/badge in NowPlayingTab & DevicesTab to reopen QR or end the session in 1 click | Persistent status indicator | ✓ |
| No persistent badge | Only show Jam status inside the QR modal when opened | |

---

## the agent's Discretion
- Exact CDP `OfflineAPI` and `JamAPI` / `SocialConnect` method probes inside `py_modules/cdp_bridge.py`.
- Exact mechanism for applying the configurable offline storage path to the Spotify Client Flatpak and validating permissions.
- Exact UI layout of the Offline Downloads Manager overview and `vgp_oncancel` focus restoration.

## Deferred Ideas
- None — discussion stayed within phase scope.
