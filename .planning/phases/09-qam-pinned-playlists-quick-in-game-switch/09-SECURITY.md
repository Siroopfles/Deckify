---
phase: "09"
slug: "qam-pinned-playlists-quick-in-game-switch"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-11-15"
---

# Phase 09 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Frontend QAM / Modal → Backend `set_setting` / `quick_play_pinned` | User-initiated pin persistence and quick playback RPCs | `PinnedPlaylistItem[]` (`uri`, `name`, `type`, `image_url`), `uri` |
| Spotify CDN (`i.scdn.co`) → Steam CEF UI | Cover art rendering in QAM pills and `CollectionActionModal` | Proxied base64 image data URIs via `<DeckifyImage>` |
| Modal Focus Stack → `CollectionActionModal` | Controller focus capture/restoration and `B`-button dismissal | DOM focus state |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-09-01 | Tampering | `py_modules/common.py`, `main.py` | medium | mitigate | `_sanitize_pinned_playlists` validates `list` of `dict`s with non-empty `uri`/`name`, `type` allowlisted to `("playlist", "album", "liked_songs")`, deduplicates, and caps at `MAX_PINNED_PLAYLISTS = 4` (`common.py:130-172`, `main.py:39`). | closed |
| T-09-02 | Information Disclosure | `src/index.tsx` | medium | mitigate | `PinnedPill` renders all pinned thumbnails exclusively through `<DeckifyImage>` (`src/index.tsx:30, 145`) backed by `py_modules/images.py` base64 proxy; no raw external `<img src>` URLs. | closed |
| T-09-03 | Denial of Service | `py_modules/rpc_playback.py` | low | mitigate | `quick_play_pinned` caps Connect device wake polling to 4 attempts × 300ms (1.2s max) to prevent unbounded API polling or event-loop blocking. | closed |
| T-09-04 | Denial of Service | `src/components/common/CollectionActionModal.tsx`, `src/components/DeckifyExpandedModal.tsx` | low | mitigate | `CollectionActionModal` captures `previousFocusRef` on mount, restores focus on unmount (`CollectionActionModal.tsx:38-50`), and intercepts `vgp_oncancel` (`B`) to close modal cleanly. | closed |
| T-09-05 | Denial of Service | `src/components/tabs/PlaylistsTab.tsx` | low | mitigate | Mix button remains gated to `audioBackend === "spotify_client"` (`PlaylistsTab.tsx:388`), and header title uses `minWidth: 0` + ellipsis with `flexShrink: 0` on action buttons so controls stay reachable. | closed |
| T-09-06 | Spoofing / Tampering | `src/index.tsx` | low | mitigate | `PinnedPill` (`src/index.tsx:104`) preserves `<DeckifyImage>` base64 CSP proxying and routes activation exclusively to `handleQuickPlayPinned(pill)` with backend `pinned_playlists` sanitization. | closed |
| T-09-SC | Tampering | npm/pip/cargo installs | high | mitigate | No new external packages introduced in Phase 09; uses existing in-repo dependencies only. | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

*No accepted risks.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-15 | 7 | 7 | 0 | gsd-secure-phase (L1 short-circuit) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-15
