# Phase 28 — API Coverage (`OfflineAPI` & `SocialConnectAPI` / `JamDevicesAPI`)

> Enumerates Spotify Desktop Client `Platform.Registry` capabilities evaluated for Phase 28 (`CDP-01`, `CDP-02`, `JAM-01`) via `py_modules/cdp_bridge.py`.

## `OfflineAPI` / `PlaylistAPI` (CDP-01)

| Capability / Method | Disposition | Reason |
|---------------------|-------------|--------|
| `OfflineAPI.addDownload` / `sync` / `PlaylistAPI.setOffline(uri, true)` | `INTEGRATE` | Toggles offline download for playlists, albums, and podcast episodes (`toggle_offline_download`). |
| `OfflineAPI.removeDownload` / `PlaylistAPI.setOffline(uri, false)` | `INTEGRATE` | Removes single or bulk offline downloads (`toggle_offline_download`, `remove_all_offline_downloads`). |
| `OfflineAPI.getDownloadStatus` / `getOfflineStatus` / `PlaylistAPI.getMetadata` | `INTEGRATE` | Polls live `0–100%` download progress and completed offline state (`get_offline_status`). |
| `OfflineAPI.getDownloads` / `RootlistAPI.getContents` (offline filter) | `INTEGRATE` | Enumerates downloaded items for `SettingsTab` Offline Downloads Manager and `offline_downloads.json` cache. |
| `OfflineAPI.setOfflineStorageLocation` / Spotify `prefs` | `INTEGRATE` | Applies user-configured `offline_storage_path` alongside `flatpak override --user --filesystem=<path>`. |
| Raw `librespot` audio stream caching / DRM decryption | `OPT-OUT` | Explicitly out of scope in `REQUIREMENTS.md` (violates Spotify ToS). |

## `SocialConnectAPI` / `JamDevicesAPI` (JAM-01)

| Capability / Method | Disposition | Reason |
|---------------------|-------------|--------|
| `SocialConnectAPI.createSession` / `startJam` / `JamDevicesAPI.startSession` | `INTEGRATE` | Starts a live Spotify Jam host session and retrieves `joinUrl` (`start_spotify_jam`). |
| `SocialConnectAPI.getSession` / `getCurrentSession` / `JamDevicesAPI.getSession` | `INTEGRATE` | Reads active Jam status, `joinUrl`, and connected guest count (`get_jam_status`). |
| `SocialConnectAPI.endSession` / `leaveSession` / `JamDevicesAPI.endSession` | `INTEGRATE` | Ends or leaves an active Spotify Jam session (`end_spotify_jam`). |
| `SocialConnectAPI.setQueueSyncMode` / guest permission moderation | `OPT-OUT` | Deferred beyond `JAM-01` scope; Phase 28 focuses on starting, sharing QR, and ending/leaving Jam. |
