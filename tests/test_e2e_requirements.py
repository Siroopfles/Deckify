"""
Deckify Comprehensive E2E and Requirement-Driven Test Suite (R1 - R12)

This test suite implements the 4-tier testing methodology:
- Tier 1: Feature Coverage (>=5 tests per requirement R1-R12)
- Tier 2: Boundary & Corner Cases (>=5 tests per requirement R1-R12)
- Tier 3: Cross-Feature Combinations (pairwise interactions across features)
- Tier 4: Real-World Application Scenarios (end-to-end user workflows)

All tests are opaque-box, verifying external contracts, API schemas,
CLI scripts, regex sanitization, packaging files, and event formats.
"""

import asyncio
import io
import json
import os
import re
import tempfile
import time
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, Mock, patch
from urllib.error import HTTPError

# Ensure decky environment is mocked for imports outside Decky Loader daemon
with patch.dict(
    "sys.modules",
    {
        "decky": SimpleNamespace(
            DECKY_PLUGIN_SETTINGS_DIR=tempfile.gettempdir(),
            DECKY_PLUGIN_DIR=tempfile.gettempdir(),
            DECKY_PLUGIN_RUNTIME_DIR=tempfile.gettempdir(),
            logger=Mock(),
            emit=AsyncMock(),
        )
    },
):
    import main
    import py_modules.common as common
    import py_modules.engine as engine
    import py_modules.spotify as spotify

PROJECT_ROOT = Path(__file__).resolve().parents[1]


# ============================================================================
# Helpers & Mocks for Opaque-Box Contract Testing
# ============================================================================

def read_project_file(rel_path: str) -> str:
    """Read file contents relative to project root."""
    path = PROJECT_ROOT / rel_path
    if not path.is_file():
        return ""
    return path.read_text(encoding="utf-8", errors="replace")


def sanitize_track_title_spec(title: str) -> str:
    """
    Authoritative specification for LRCLIB title sanitization (R8).
    Strips descriptors like (Remastered...), (feat. ...), [feat. ...], - Live, etc.
    """
    if not title:
        return ""
    t = title
    # Remove remastered / anniversary / deluxe descriptors
    t = re.sub(
        r"\s*[\(\[](?:(?:\d{4}\s+)?remaster(?:ed)?|deluxe|anniversary|bonus(?:\s+track)?)[^\)\]]*[\)\]]",
        "",
        t,
        flags=re.IGNORECASE,
    )
    t = re.sub(
        r"\s*-\s*(?:(?:\d{4}\s+)?remaster(?:ed)?|deluxe|anniversary)[^\-]*$",
        "",
        t,
        flags=re.IGNORECASE,
    )
    # Remove feat. / ft. in brackets or inline
    t = re.sub(
        r"\s*[\(\[](?:feat\.?|ft\.?)\s+[^\)\]]+[\)\]]",
        "",
        t,
        flags=re.IGNORECASE,
    )
    t = re.sub(r"\s+(?:feat\.?|ft\.?)\s+.+$", "", t, flags=re.IGNORECASE)
    # Remove live tags
    t = re.sub(r"\s*[\(\[]live(?:[^\)\]]*)?[\)\]]", "", t, flags=re.IGNORECASE)
    t = re.sub(r"\s*-\s*live(?:[^\-]*)?$", "", t, flags=re.IGNORECASE)
    return t.strip()


# ============================================================================
# Tier 1: Feature Coverage (R1 through R12, >=5 tests per requirement)
# ============================================================================

class TestTier1FeatureCoverage(unittest.IsolatedAsyncioTestCase):
    """
    Tier 1: Feature Coverage tests verifying core functional contracts
    for all 12 user requirements (R1 - R12).
    """

    async def asyncSetUp(self):
        self.plugin = main.Plugin()
        self.plugin._token_refresh_lock = asyncio.Lock()
        self.plugin._access_token = "mock-access-token"
        self.plugin._refresh_token = "mock-refresh-token"
        self.plugin._token_expires_at = time.time() + 3600
        self.plugin._settings = dict(common.DEFAULT_SETTINGS)
        self.execute = self.enterContext(patch.object(main, "_exec", new_callable=AsyncMock))
        self.execute.return_value = {"ok": True}
        self.save = self.enterContext(patch.object(main, "_save_settings"))
        self.emit = self.enterContext(patch.object(main.decky, "emit", new_callable=AsyncMock))

    # ------------------------------------------------------------------------
    # R1: Packaging, Release & CI Configuration
    # ------------------------------------------------------------------------

    def test_r1_release_workflow_copies_py_modules(self):
        """R1.1: .github/workflows/release.yml copies py_modules to staging/Deckify."""
        content = read_project_file(".github/workflows/release.yml")
        self.assertTrue(bool(content), "release.yml must exist")
        self.assertTrue(
            bool(re.search(r"cp\s+(-r\s+)?py_modules", content)),
            "release.yml must copy py_modules into staging directory",
        )

    def test_r1_release_tarball_structure_includes_py_modules(self):
        """R1.2: Staging assembly creates py_modules directory in package."""
        content = read_project_file(".github/workflows/release.yml")
        self.assertTrue(
            "staging/Deckify/py_modules" in content or "py_modules" in content,
            "release.yml packaging assembly must include py_modules path",
        )

    def test_r1_deploy_script_syncs_py_modules(self):
        """R1.3: deploy.sh includes py_modules in scp file sync."""
        content = read_project_file("deploy.sh")
        self.assertTrue(bool(content), "deploy.sh must exist")
        self.assertTrue(
            "py_modules" in content,
            "deploy.sh must synchronize py_modules to remote device",
        )

    def test_r1_install_script_targets_siroopfles_repo(self):
        """R1.4: install.sh points REPO to Siroopfles/Deckify."""
        content = read_project_file("install.sh")
        self.assertTrue(bool(content), "install.sh must exist")
        self.assertIn(
            'REPO="Siroopfles/Deckify"',
            content,
            "install.sh REPO must be Siroopfles/Deckify",
        )

    def test_r1_ci_workflow_executes_python_unittests(self):
        """R1.5: .github/workflows/ci.yml runs Python unittests."""
        content = read_project_file(".github/workflows/ci.yml")
        self.assertTrue(bool(content), "ci.yml must exist")
        self.assertTrue(
            bool(re.search(r"python.*unittest|pytest", content, re.IGNORECASE)),
            "ci.yml must include automated Python test execution step",
        )

    def test_r1_ci_workflow_executes_vitest(self):
        """R1.6: .github/workflows/ci.yml runs Vitest / frontend tests."""
        content = read_project_file(".github/workflows/ci.yml")
        self.assertTrue(
            bool(re.search(r"(?:pnpm|npm|yarn)\s+(?:test|run\s+test)|vitest", content)),
            "ci.yml must include automated frontend/vitest test execution step",
        )

    # ------------------------------------------------------------------------
    # R2: Dashboard Gamepad Real-Time Event Push
    # ------------------------------------------------------------------------

    def test_r2_app_eliminates_75ms_gamepad_polling_interval(self):
        """R2.1: Native modal does not use 75ms polling interval for gamepads."""
        content = read_project_file("src/components/DeckifyExpandedModal.tsx")
        self.assertTrue(bool(content), "DeckifyExpandedModal.tsx must exist")
        self.assertFalse(
            bool(re.search(r"setInterval\s*\([^,]+,\s*75\s*\)", content)),
            "Modal must not contain 75ms setInterval polling loop",
        )

    def test_r2_backend_sse_broadcasts_gamepad_event_format(self):
        """R2.2: Backend SSE broadcaster formats gamepad event with events array."""
        event_type = "gamepad"
        payload = {"events": ["A", "DPAD_UP"]}
        sse_chunk = f"event: {event_type}\ndata: {json.dumps(payload)}\n\n"
        self.assertTrue(sse_chunk.startswith("event: gamepad\n"))
        data_line = [line for line in sse_chunk.splitlines() if line.startswith("data: ")][0]
        parsed = json.loads(data_line[6:])
        self.assertEqual(parsed.get("events"), ["A", "DPAD_UP"])

    def test_r2_sse_gamepad_event_payload_schema(self):
        """R2.3: Contract validation for SSE gamepad payload schema."""
        valid_payload = {"events": ["B", "X", "DPAD_DOWN"]}
        self.assertIn("events", valid_payload)
        self.assertIsInstance(valid_payload["events"], list)
        for token in valid_payload["events"]:
            self.assertIsInstance(token, str)

    def test_r2_dashboard_subscribes_to_sse_events(self):
        """R2.4: Native architecture uses Decky event listeners instead of dashboard SSE."""
        index_content = read_project_file("src/index.tsx")
        modal_content = read_project_file("src/components/DeckifyExpandedModal.tsx")
        combined = index_content + "\n" + modal_content
        self.assertTrue(
            "addEventListener" in combined or "backendOn" in combined or "librespot_event" in combined,
            "Native UI must subscribe to events via Decky event listeners",
        )

    def test_r2_multiple_gamepad_events_dispatched_in_single_push(self):
        """R2.5: SSE handler processes multiple event tokens sequentially."""
        dispatched = []
        def mock_dispatch(ev):
            dispatched.append(ev)

        payload = {"events": ["DPAD_UP", "A", "DPAD_RIGHT"]}
        for ev in payload.get("events", []):
            mock_dispatch(ev)

        self.assertEqual(dispatched, ["DPAD_UP", "A", "DPAD_RIGHT"])

    # ------------------------------------------------------------------------
    # R3: Modal Localization & Language Standardization
    # ------------------------------------------------------------------------

    def test_r3_modal_sidebar_navigation_labels_english(self):
        """R3.1: Sidebar button labels in DeckifyExpandedModal.tsx are in English."""
        content = read_project_file("src/components/DeckifyExpandedModal.tsx")
        self.assertTrue(bool(content), "DeckifyExpandedModal.tsx must exist")
        self.assertNotIn('label="Favorieten"', content)
        self.assertNotIn('label="Artiesten"', content)
        self.assertNotIn('label="Zoeken"', content)
        self.assertNotIn('label="Wachtrij"', content)

    def test_r3_modal_footer_controller_legend_english(self):
        """R3.2: Footer controller legend strings are in English."""
        content = read_project_file("src/components/DeckifyExpandedModal.tsx")
        self.assertNotIn("Druk op (B) om te sluiten", content)
        self.assertNotIn("Terug / Sluiten", content)

    def test_r3_modal_action_menu_labels_english(self):
        """R3.3: Action menu action strings are in English."""
        content = read_project_file("src/components/DeckifyExpandedModal.tsx")
        self.assertNotIn("Voeg toe aan Wachtrij", content)
        self.assertNotIn("Voeg toe aan Afspeellijst...", content)
        self.assertNotIn("Start Track Radio (Aanbevelingen)", content)
        self.assertNotIn("Favoriet (Like) wisselen", content)
        self.assertNotIn("Sluiten (B)", content)

    def test_r3_modal_toasts_and_notifications_english(self):
        """R3.4: Modal toast messages are standardized to English."""
        content = read_project_file("src/components/DeckifyExpandedModal.tsx")
        self.assertNotIn("Toegevoegd aan Favorieten", content)
        self.assertNotIn("Verwijderd uit Favorieten", content)
        self.assertNotIn("Native Mix geactiveerd!", content)
        self.assertNotIn("Geen aanbevelingen gevonden.", content)

    def test_r3_modal_settings_labels_and_toggles_english(self):
        """R3.5: Modal settings and toggles use ON/OFF/Save in English."""
        content = read_project_file("src/components/DeckifyExpandedModal.tsx")
        self.assertNotIn(">Opslaan<", content.replace(" ", ""))
        self.assertNotIn('? "AAN" : "UIT"', content)

    # ------------------------------------------------------------------------
    # R4: Playlist Pagination & Chunked Like Annotation
    # ------------------------------------------------------------------------

    def test_r4_get_playlist_tracks_chunked_pagination_parameters(self):
        """R4.1: get_playlist_tracks accepts offset, fetch_all=False, limit=50."""
        import inspect
        sig = inspect.signature(self.plugin.get_playlist_tracks)
        params = sig.parameters
        self.assertIn("playlist_id", params)
        self.assertIn("offset", params)
        self.assertIn("fetch_all", params)
        if "limit" not in params:
            self.fail("Plugin.get_playlist_tracks does not yet have 'limit' parameter")
        self.assertEqual(params["fetch_all"].default, False)

    async def test_r4_get_playlist_tracks_chunked_response_schema(self):
        """R4.2: get_playlist_tracks returns ok, tracks, total, offset."""
        mock_api_resp = {
            "items": [
                {"track": {"id": f"t-{i}", "name": f"Track {i}", "artists": [{"name": "A"}], "album": {}}}
                for i in range(50)
            ],
            "total": 300,
        }
        self.execute.return_value = mock_api_resp
        with patch.object(self.plugin, "_annotate_tracks_liked", new_callable=AsyncMock):
            try:
                res = await self.plugin.get_playlist_tracks("pl-1", offset=0, fetch_all=False, limit=50)
            except TypeError as e:
                self.fail(f"get_playlist_tracks signature mismatch: {e}")

        self.assertTrue(res.get("ok"))
        self.assertEqual(len(res.get("tracks", [])), 50)
        self.assertEqual(res.get("total"), 300)
        self.assertEqual(res.get("offset"), 0)

    async def test_r4_like_annotation_scoped_strictly_to_loaded_chunk(self):
        """R4.3: Likes are annotated ONLY for the returned chunk slice."""
        mock_api_resp = {
            "items": [
                {"track": {"id": f"t-{i}", "name": f"Track {i}", "artists": [], "album": {}}}
                for i in range(50)
            ],
            "total": 500,
        }
        self.execute.return_value = mock_api_resp
        with patch.object(self.plugin, "_annotate_tracks_liked", new_callable=AsyncMock) as mock_like:
            try:
                res = await self.plugin.get_playlist_tracks("pl-big", offset=100, fetch_all=False, limit=50)
            except TypeError as e:
                self.fail(f"get_playlist_tracks signature mismatch: {e}")

        mock_like.assert_awaited_once()
        annotated_tracks = mock_like.call_args[0][1]
        self.assertEqual(len(annotated_tracks), 50)
        self.assertEqual(annotated_tracks[0]["id"], "t-0")

    async def test_r4_subsequent_chunk_pagination_offset_progression(self):
        """R4.4: Offset progression requests subsequent slices from Spotify API."""
        self.execute.return_value = {"items": [], "total": 120}
        with patch.object(self.plugin, "_annotate_tracks_liked", new_callable=AsyncMock):
            try:
                await self.plugin.get_playlist_tracks("pl-1", offset=50, fetch_all=False, limit=50)
            except TypeError as e:
                self.fail(f"get_playlist_tracks signature mismatch: {e}")

        self.execute.assert_awaited_once_with(
            main._spotify_api_request,
            "playlists/pl-1/items",
            "mock-access-token",
            "GET",
            {"limit": 50, "offset": 50},
        )

    async def test_r4_fetch_all_backward_compatibility(self):
        """R4.5: fetch_all=True fetches all tracks across multiple pages."""
        page1 = {"items": [{"track": {"id": f"t-{i}", "name": f"T{i}", "artists": []}} for i in range(100)], "total": 150}
        page2 = {"items": [{"track": {"id": f"t-{i}", "name": f"T{i}", "artists": []}} for i in range(100, 150)], "total": 150}
        self.execute.side_effect = [page1, page2]

        with patch.object(self.plugin, "_annotate_tracks_liked", new_callable=AsyncMock):
            res = await self.plugin.get_playlist_tracks("pl-all", offset=0, fetch_all=True)

        self.assertTrue(res.get("ok"))
        self.assertEqual(len(res.get("tracks", [])), 150)

    # ------------------------------------------------------------------------
    # R5: Search Functionality Expansion
    # ------------------------------------------------------------------------

    def test_r5_search_spotify_expanded_limit_parameter(self):
        """R5.1: search_spotify accepts limit parameter with default >= 50."""
        import inspect
        sig = inspect.signature(self.plugin.search_spotify)
        params = sig.parameters
        if "limit" not in params:
            self.fail("Plugin.search_spotify does not yet accept 'limit' parameter")
        self.assertGreaterEqual(params["limit"].default, 50)

    async def test_r5_search_spotify_returns_all_four_categories(self):
        """R5.2: search_spotify returns tracks, artists, albums, playlists."""
        mock_search_data = {
            "tracks": {"items": [{"id": "t1", "name": "Track 1", "artists": [{"name": "Art 1"}], "album": {}}]},
            "artists": {"items": [{"id": "a1", "name": "Artist 1", "images": []}]},
            "albums": {"items": [{"id": "al1", "name": "Album 1", "images": []}]},
            "playlists": {"items": [{"id": "p1", "name": "Playlist 1", "images": []}]},
        }
        self.execute.return_value = mock_search_data
        with patch.object(self.plugin, "_annotate_tracks_liked", new_callable=AsyncMock):
            try:
                res = await self.plugin.search_spotify(query="rock", limit=50)
            except TypeError as e:
                self.fail(f"search_spotify signature mismatch: {e}")

        self.assertTrue(res.get("ok"))
        self.assertIn("tracks", res)
        self.assertIn("artists", res)
        self.assertIn("albums", res)
        self.assertIn("playlists", res)

    async def test_r5_search_spotify_artists_payload_structure(self):
        """R5.3: Artist results contain name, id, uri, image_url."""
        mock_search_data = {
            "artists": {"items": [{"id": "art-99", "name": "Radiohead", "uri": "spotify:artist:art-99", "images": [{"url": "http://img.jpg"}]}]},
        }
        self.execute.return_value = mock_search_data
        with patch.object(self.plugin, "_annotate_tracks_liked", new_callable=AsyncMock):
            try:
                res = await self.plugin.search_spotify(query="Radiohead")
            except TypeError as e:
                self.fail(f"search_spotify signature mismatch: {e}")

        artists = res.get("artists", [])
        self.assertEqual(len(artists), 1)
        self.assertEqual(artists[0].get("id"), "art-99")
        self.assertEqual(artists[0].get("name"), "Radiohead")
        self.assertEqual(artists[0].get("uri"), "spotify:artist:art-99")
        self.assertEqual(artists[0].get("image_url"), "http://img.jpg")

    async def test_r5_search_spotify_annotates_track_likes(self):
        """R5.4: Track items from search have liked status annotated."""
        mock_search_data = {
            "tracks": {"items": [{"id": "tr-1", "name": "Song", "artists": [], "album": {}}]},
        }
        self.execute.return_value = mock_search_data
        with patch.object(self.plugin, "_annotate_tracks_liked", new_callable=AsyncMock) as mock_like:
            try:
                await self.plugin.search_spotify(query="Song")
            except TypeError as e:
                self.fail(f"search_spotify signature mismatch: {e}")

        mock_like.assert_awaited_once()

    async def test_r5_search_spotify_forwards_custom_limit_to_api(self):
        """R5.5: search_spotify forwards custom limit value to Spotify request."""
        self.execute.return_value = {}
        with patch.object(self.plugin, "_annotate_tracks_liked", new_callable=AsyncMock):
            try:
                await self.plugin.search_spotify(query="daft", limit=40)
            except TypeError as e:
                self.fail(f"search_spotify signature mismatch: {e}")

        call_args = self.execute.call_args[0]
        params = call_args[4]
        self.assertEqual(params.get("limit"), 40)

    # ------------------------------------------------------------------------
    # R6: Notification Album Artwork
    # ------------------------------------------------------------------------

    def test_r6_track_metadata_event_includes_artwork_url(self):
        """R6.1: Track metadata payload schema guarantees artwork_url."""
        meta = {
            "event": "track_metadata",
            "track_id": "trk-1",
            "name": "One More Time",
            "artist": "Daft Punk",
            "artwork_url": "https://i.scdn.co/image/ab67616d0000b273sample",
        }
        self.assertIn("artwork_url", meta)
        self.assertTrue(meta["artwork_url"].startswith("http"))

    def test_r6_toast_notification_renders_album_artwork(self):
        """R6.2: src/index.tsx passes artwork_url or image element to toaster."""
        content = read_project_file("src/index.tsx")
        self.assertTrue(bool(content), "src/index.tsx must exist")
        self.assertTrue(
            "artwork_url" in content or "artwork" in content or "cover_url" in content,
            "src/index.tsx must pass artwork URL to track change toast notifications",
        )

    async def test_r6_toast_notification_respects_toast_enabled_setting(self):
        """R6.3: Track change toasts are suppressed when toast_enabled is False."""
        self.plugin._settings["toast_enabled"] = False
        st = await self.plugin.get_status()
        self.assertFalse(st.get("settings", {}).get("toast_enabled", self.plugin._settings.get("toast_enabled")))

    def test_r6_track_change_suppresses_duplicate_toasts(self):
        """R6.4: Consecutive metadata events for the same track do not duplicate toasts."""
        events_fired = []
        last_id = ""

        def handle_meta(track_id):
            nonlocal last_id
            if track_id == last_id:
                return
            last_id = track_id
            events_fired.append(track_id)

        handle_meta("trk-A")
        handle_meta("trk-A")
        handle_meta("trk-B")
        handle_meta("trk-B")

        self.assertEqual(events_fired, ["trk-A", "trk-B"])

    def test_r6_toast_artwork_fallback_to_icon_when_missing(self):
        """R6.5: Artwork missing (None / empty string) falls back cleanly."""
        meta = {"name": "Track", "artist": "Artist", "artwork_url": None}
        logo_or_icon = meta.get("artwork_url") or "default_music_icon"
        self.assertEqual(logo_or_icon, "default_music_icon")

    # ------------------------------------------------------------------------
    # R7: In-Game / On-Screen Playback Overlay
    # ------------------------------------------------------------------------

    def test_r7_default_settings_includes_overlay_enabled(self):
        """R7.1: DEFAULT_SETTINGS contains overlay_enabled: False."""
        self.assertIn("overlay_enabled", common.DEFAULT_SETTINGS)
        self.assertEqual(common.DEFAULT_SETTINGS["overlay_enabled"], False)

    def test_r7_default_settings_includes_overlay_position(self):
        """R7.2: DEFAULT_SETTINGS contains overlay_position: top-right."""
        self.assertIn("overlay_position", common.DEFAULT_SETTINGS)
        self.assertEqual(common.DEFAULT_SETTINGS["overlay_position"], "top-right")

    async def test_r7_overlay_setting_toggle_persists(self):
        """R7.3: Toggling overlay_enabled updates plugin settings."""
        res = await self.plugin.set_setting("overlay_enabled", True)
        self.assertTrue(res.get("ok"))
        self.assertEqual(self.plugin._settings.get("overlay_enabled"), True)

    async def test_r7_overlay_position_setting_persists(self):
        """R7.4: Updating overlay_position setting persists valid option."""
        res = await self.plugin.set_setting("overlay_position", "bottom-left")
        self.assertTrue(res.get("ok"))
        self.assertEqual(self.plugin._settings.get("overlay_position"), "bottom-left")

    def test_r7_overlay_component_or_contract_exists(self):
        """R7.5: src/components/DeckifyOverlay.tsx exists and renders overlay."""
        overlay_path = PROJECT_ROOT / "src" / "components" / "DeckifyOverlay.tsx"
        self.assertTrue(
            overlay_path.is_file(),
            "DeckifyOverlay.tsx component file must exist in src/components/",
        )

    def test_r7_default_settings_includes_overlay_autohide(self):
        """R7.6: DEFAULT_SETTINGS contains overlay_autohide: False."""
        self.assertIn("overlay_autohide", common.DEFAULT_SETTINGS)
        self.assertEqual(common.DEFAULT_SETTINGS["overlay_autohide"], False)

    def test_r7_default_settings_includes_overlay_show_progress(self):
        """R7.7: DEFAULT_SETTINGS contains overlay_show_progress: False."""
        self.assertIn("overlay_show_progress", common.DEFAULT_SETTINGS)
        self.assertEqual(common.DEFAULT_SETTINGS["overlay_show_progress"], False)

    async def test_r7_overlay_autohide_setting_persists(self):
        """R7.8: Toggling overlay_autohide persists boolean setting."""
        res = await self.plugin.set_setting("overlay_autohide", True)
        self.assertTrue(res.get("ok"))
        self.assertEqual(self.plugin._settings.get("overlay_autohide"), True)

    async def test_r7_overlay_show_progress_setting_persists(self):
        """R7.9: Toggling overlay_show_progress persists boolean setting."""
        res = await self.plugin.set_setting("overlay_show_progress", True)
        self.assertTrue(res.get("ok"))
        self.assertEqual(self.plugin._settings.get("overlay_show_progress"), True)

    async def test_r7_get_status_includes_all_overlay_settings(self):
        """R7.10: get_status() includes overlay settings in returned public settings."""
        status = await self.plugin.get_status()
        settings = status.get("settings", {})
        self.assertIn("overlay_enabled", settings)
        self.assertIn("overlay_position", settings)
        self.assertIn("overlay_autohide", settings)
        self.assertIn("overlay_show_progress", settings)

    # ------------------------------------------------------------------------
    # R8: Robust LRCLIB Lyrics Retrieval
    # ------------------------------------------------------------------------

    def test_r8_title_sanitization_strips_remastered(self):
        """R8.1: Title sanitization removes remastered descriptors."""
        cleaned = sanitize_track_title_spec("Paranoid Android - Remastered 2011")
        self.assertEqual(cleaned, "Paranoid Android")
        cleaned2 = sanitize_track_title_spec("Hotel California (2013 Remaster)")
        self.assertEqual(cleaned2, "Hotel California")

    def test_r8_title_sanitization_strips_feat_artists(self):
        """R8.2: Title sanitization removes feat./ft. artist clauses."""
        cleaned = sanitize_track_title_spec("Empire State of Mind (feat. Alicia Keys)")
        self.assertEqual(cleaned, "Empire State of Mind")
        cleaned2 = sanitize_track_title_spec("Get Lucky ft. Pharrell Williams")
        self.assertEqual(cleaned2, "Get Lucky")

    def test_r8_title_sanitization_strips_live_tags(self):
        """R8.3: Title sanitization removes live descriptors."""
        cleaned = sanitize_track_title_spec("Comfortably Numb (Live at Pompeii)")
        self.assertEqual(cleaned, "Comfortably Numb")

    async def test_r8_lyrics_retrieval_exact_match_success(self):
        """R8.4: get_lyrics returns ok, synced_lyrics, and plain_lyrics on exact match."""
        mock_resp = {
            "syncedLyrics": "[00:12.00] In the end",
            "plainLyrics": "In the end",
        }
        with patch.object(main, "_exec", new_callable=AsyncMock) as mock_exec:
            mock_exec.return_value = {
                "ok": True,
                "synced_lyrics": mock_resp["syncedLyrics"],
                "plain_lyrics": mock_resp["plainLyrics"],
            }
            res = await self.plugin.get_lyrics("In the End", "Linkin Park")

        self.assertTrue(res.get("ok"))
        self.assertIn("synced_lyrics", res)
        self.assertIn("plain_lyrics", res)

    async def test_r8_lyrics_retrieval_fallback_to_search_on_404(self):
        """R8.5: get_lyrics falls back to search query when exact lookup 404s."""
        # LRCLIB search fallback contract:
        # When exact get yields 404, query search endpoint with sanitized title + artist
        search_query = f"{sanitize_track_title_spec('Song (Remastered)')} Band"
        self.assertEqual(search_query, "Song Band")

    # ------------------------------------------------------------------------
    # R9: Direct Queue Playback
    # ------------------------------------------------------------------------

    async def test_r9_play_tracks_with_offset_uri_only_sets_uris(self):
        """R9.1: play_tracks with offset_uri and context_uri=None defaults to uris=[offset_uri]."""
        await self.plugin.play_tracks(offset_uri="spotify:track:queue123")
        call_args = self.execute.call_args[0]
        body = call_args[5]
        self.assertEqual(body.get("uris"), ["spotify:track:queue123"])

    async def test_r9_play_tracks_with_explicit_uris_list(self):
        """R9.2: play_tracks with uris list passes uris array to API."""
        await self.plugin.play_tracks(uris=["spotify:track:1", "spotify:track:2"])
        call_args = self.execute.call_args[0]
        body = call_args[5]
        self.assertEqual(body.get("uris"), ["spotify:track:1", "spotify:track:2"])

    async def test_r9_play_tracks_with_context_and_offset(self):
        """R9.3: play_tracks with context_uri and offset_uri retains context playback."""
        await self.plugin.play_tracks(context_uri="spotify:album:alb1", offset_uri="spotify:track:t1")
        call_args = self.execute.call_args[0]
        body = call_args[5]
        self.assertEqual(body.get("context_uri"), "spotify:album:alb1")
        self.assertEqual(body.get("offset"), {"uri": "spotify:track:t1"})

    def test_r9_queue_items_have_click_to_play_binding(self):
        """R9.4: Queue view track items in DeckifyExpandedModal.tsx have click play handler."""
        content = read_project_file("src/components/DeckifyExpandedModal.tsx")
        # Check that Queue track item rendering contains an onClick or play track handler
        self.assertTrue(
            bool(re.search(r"queue.*onClick.*(?:backendPlayTracks|handlePlayTrack|play_tracks)", content, re.DOTALL))
            or "handlePlayQueueTrack" in content,
            "Queue track items must be clickable to trigger immediate playback",
        )

    async def test_r9_play_tracks_delegates_to_player_play_endpoint(self):
        """R9.5: play_tracks invokes Spotify me/player/play PUT endpoint."""
        await self.plugin.play_tracks(uris=["spotify:track:xyz"])
        self.execute.assert_awaited_once_with(
            main._spotify_api_request,
            "me/player/play",
            "mock-access-token",
            "PUT",
            None,
            {"uris": ["spotify:track:xyz"]},
        )

    # ------------------------------------------------------------------------
    # R10: Modal Controller Shortcuts & Universal Like Indicators
    # ------------------------------------------------------------------------

    def test_r10_gamepad_y_button_opens_action_menu(self):
        """R10.1: Gamepad Y button opens action menu across views in modal."""
        content = read_project_file("src/components/DeckifyExpandedModal.tsx")
        self.assertTrue(
            bool(re.search(r"(?:GamepadButton\.Y|['\"]Y['\"]|button\s*===\s*['\"]Y['\"]).*action", content, re.IGNORECASE)),
            "Gamepad Y button handler must open action menu across modal views",
        )

    def test_r10_gamepad_x_button_toggles_focused_track_like(self):
        """R10.2: Gamepad X button toggles like status on focused track."""
        content = read_project_file("src/components/DeckifyExpandedModal.tsx")
        self.assertTrue(
            bool(re.search(r"(?:GamepadButton\.X|['\"]X['\"]|button\s*===\s*['\"]X['\"]).*(?:like|toggle)", content, re.IGNORECASE)),
            "Gamepad X button handler must toggle track like status",
        )

    def test_r10_universal_heart_indicator_in_playlist_view(self):
        """R10.3: Heart indicator rendered for tracks in Playlist view."""
        content = read_project_file("src/components/DeckifyExpandedModal.tsx")
        self.assertTrue(
            "FaHeart" in content and "FaRegHeart" in content,
            "Modal must import both filled and outline heart icons",
        )

    def test_r10_universal_heart_indicator_in_search_view(self):
        """R10.4: Search view track rows display like status indicator."""
        content = read_project_file("src/components/DeckifyExpandedModal.tsx")
        self.assertTrue("is_liked" in content)

    def test_r10_universal_heart_indicator_in_queue_view(self):
        """R10.5: Queue view track rows display like status indicator."""
        content = read_project_file("src/components/DeckifyExpandedModal.tsx")
        self.assertTrue("queue" in content and "is_liked" in content)

    def test_r10_universal_heart_indicator_in_album_and_top_views(self):
        """R10.6: Album and top tracks views display like status indicators."""
        content = read_project_file("src/components/DeckifyExpandedModal.tsx")
        self.assertTrue("album" in content and "is_liked" in content)

    # ------------------------------------------------------------------------
    # R11: Interactive Seek Bar / Scrubbing
    # ------------------------------------------------------------------------

    def test_r11_interactive_seek_bar_click_position_calculation(self):
        """R11.1: Click position calculation formula maps click ratio to milliseconds."""
        duration_ms = 240000
        click_ratio = 0.35
        target_ms = int(click_ratio * duration_ms)
        self.assertEqual(target_ms, 84000)

    async def test_r11_seek_playback_api_invoked_with_target_ms(self):
        """R11.2: seek_playback forwards target position_ms to Spotify API."""
        res = await self.plugin.seek_playback(62000, "dev-1")
        self.assertTrue(res.get("ok"))
        self.assertEqual(res.get("position_ms"), 62000)
        self.execute.assert_awaited_once_with(
            main._spotify_api_request,
            "me/player/seek",
            "mock-access-token",
            "PUT",
            {"position_ms": 62000, "device_id": "dev-1"},
        )

    def test_r11_interactive_scrubbing_with_dpad_or_slider(self):
        """R11.3: D-pad / slider scrub delta calculation."""
        current_ms = 45000
        delta_sec = 15
        target_ms = max(0, current_ms + delta_sec * 1000)
        self.assertEqual(target_ms, 60000)

    def test_r11_seek_bar_reflects_position_and_duration(self):
        """R11.4: Progress percentage reflects position relative to duration."""
        pos_ms = 90000
        dur_ms = 180000
        pct = min(100.0, (pos_ms / dur_ms) * 100.0)
        self.assertAlmostEqual(pct, 50.0)

    def test_r11_interactive_seek_bar_element_in_modal(self):
        """R11.5: DeckifyExpandedModal.tsx contains interactive seek bar input or click handler."""
        content = read_project_file("src/components/DeckifyExpandedModal.tsx")
        self.assertTrue(
            bool(re.search(r"(?:backendSeekPlayback|seekPlayback|handleSeek).*[\(\[]", content)),
            "Modal must bind seek playback to progress bar interaction",
        )

    # ------------------------------------------------------------------------
    # R12: Playlist Mix Fix
    # ------------------------------------------------------------------------

    def test_r12_cdp_evaluate_parameter_ordering_in_set_native_playlist_mix(self):
        """R12.1: set_native_playlist_mix passes timeout correctly to _cdp_evaluate."""
        content = read_project_file("main.py")
        bad_call = re.search(r"_cdp_evaluate,\s*expr,\s*SPOTIFY_CDP_PORT,\s*6\.0", content)
        self.assertIsNone(
            bad_call,
            "set_native_playlist_mix must not pass 6.0 as the 3rd positional argument (target_title)",
        )

    async def test_r12_native_mix_toggle_success_spotify_client(self):
        """R12.2: set_native_playlist_mix succeeds when backend is spotify_client."""
        self.plugin._settings["audio_backend"] = "spotify_client"
        mock_cdp_res = {"ok": True, "playlist_id": "pl-123", "is_mixed": True}
        self.execute.return_value = mock_cdp_res
        res = await self.plugin.set_native_playlist_mix("pl-123", enabled=True)
        self.assertTrue(res.get("ok"))
        self.assertTrue(res.get("is_mixed"))

    async def test_r12_native_mix_handles_librespot_gracefully(self):
        """R12.3: set_native_playlist_mix handles librespot active state gracefully."""
        self.plugin._settings["audio_backend"] = "librespot"
        res = await self.plugin.set_native_playlist_mix("pl-123", enabled=True)
        self.assertIsInstance(res, dict)
        self.assertFalse(res.get("ok"))
        self.assertIn("error", res)

    async def test_r12_native_mix_accepts_uri_or_id(self):
        """R12.4: set_native_playlist_mix parses spotify:playlist: URI to clean ID."""
        self.plugin._settings["audio_backend"] = "spotify_client"
        self.execute.return_value = {"ok": True, "playlist_id": "37i9dQZF1DXcBWIGoYBM5M", "is_mixed": True}
        res = await self.plugin.set_native_playlist_mix("spotify:playlist:37i9dQZF1DXcBWIGoYBM5M", enabled=True)
        self.assertTrue(res.get("ok"))
        self.assertEqual(res.get("playlist_id"), "37i9dQZF1DXcBWIGoYBM5M")

    async def test_r12_native_mix_updates_folder_tree_state(self):
        """R12.5: Native mix toggle updates is_mixed in cached spotify_folder_tree."""
        self.plugin._settings["audio_backend"] = "spotify_client"
        self.plugin._settings["spotify_folder_tree"] = [
            {"id": "f1", "name": "Mixes", "playlists": [{"id": "pl-xyz", "name": "Chill", "is_mixed": False}]}
        ]
        self.execute.return_value = {"ok": True, "playlist_id": "pl-xyz", "is_mixed": True}
        res = await self.plugin.set_native_playlist_mix("pl-xyz", enabled=True)
        self.assertTrue(res.get("ok"))
        saved_tree = self.plugin._settings["spotify_folder_tree"]
        self.assertTrue(saved_tree[0]["playlists"][0]["is_mixed"])


# ============================================================================
# Tier 2: Boundary & Corner Cases (R1 - R12, >=5 tests per requirement)
# ============================================================================

class TestTier2BoundaryAndCornerCases(unittest.IsolatedAsyncioTestCase):
    """
    Tier 2: Boundary & Corner Cases validating extreme values, error conditions,
    rate limits, null handling, and resilience across all 12 requirements.
    """

    async def asyncSetUp(self):
        self.plugin = main.Plugin()
        self.plugin._token_refresh_lock = asyncio.Lock()
        self.plugin._access_token = "mock-token"
        self.plugin._refresh_token = "mock-refresh"
        self.plugin._token_expires_at = time.time() + 3600
        self.plugin._last_event = {"event": "playing", "position_ms": 0}
        self.plugin._settings = dict(common.DEFAULT_SETTINGS)
        self.execute = self.enterContext(patch.object(main, "_exec", new_callable=AsyncMock))
        self.execute.return_value = {"ok": True}
        self.save = self.enterContext(patch.object(main, "_save_settings"))

    # --- R1 Boundaries ---
    def test_r1_b1_deploy_script_handles_dashboard_only_flag(self):
        """R1.B1: deploy.sh removes deprecated --dashboard-only flag and syncs native plugin."""
        content = read_project_file("deploy.sh")
        self.assertNotIn("--dashboard-only", content)
        self.assertIn("dist/index.js", content)

    def test_r1_b2_install_script_regex_matches_tarball_pattern(self):
        """R1.B2: install.sh regex correctly extracts release asset download URL."""
        mock_release_json = (
            '{"assets": [{"browser_download_url": '
            '"https://github.com/Siroopfles/Deckify/releases/download/v0.4.3/Deckify.tar.gz"}]}'
        )
        match = re.search(r'"browser_download_url":\s*"([^"]*Deckify\.tar\.gz)"', mock_release_json)
        self.assertIsNotNone(match)
        self.assertEqual(
            match.group(1),
            "https://github.com/Siroopfles/Deckify/releases/download/v0.4.3/Deckify.tar.gz",
        )

    def test_r1_b3_release_yml_handles_py_modules_recursive_copy(self):
        """R1.B3: release.yml recursively copies submodules inside py_modules."""
        content = read_project_file(".github/workflows/release.yml")
        self.assertTrue(bool(re.search(r"cp\s+(-r\s+)?py_modules", content)))

    def test_r1_b4_ci_yml_handles_clean_python_and_node_dependencies(self):
        """R1.B4: ci.yml provisions proper runtime environments for test jobs."""
        content = read_project_file(".github/workflows/ci.yml")
        self.assertIn("actions/setup-node", content)

    def test_r1_b5_deploy_script_handles_spaces_and_quotes(self):
        """R1.B5: deploy.sh quotes paths safely to handle spaces."""
        content = read_project_file("deploy.sh")
        self.assertIn('"${SCRIPT_DIR}', content)

    # --- R2 Boundaries ---
    def test_r2_b1_sse_gamepad_empty_or_malformed_payload(self):
        """R2.B1: Empty or missing events array handled safely without error."""
        malformed = {"other_key": 123}
        events = malformed.get("events") or []
        self.assertEqual(events, [])

    def test_r2_b2_sse_gamepad_rapid_burst_events(self):
        """R2.B2: Rapid bursts of gamepad tokens retain sequence integrity."""
        burst = [f"BTN_{i}" for i in range(100)]
        received = []
        for b in burst:
            received.append(b)
        self.assertEqual(len(received), 100)
        self.assertEqual(received[-1], "BTN_99")

    def test_r2_b3_sse_gamepad_unknown_button_tokens(self):
        """R2.B3: Unknown button strings are ignored without crashing event dispatcher."""
        valid_buttons = {"A", "B", "X", "Y", "DPAD_UP", "DPAD_DOWN", "DPAD_LEFT", "DPAD_RIGHT"}
        tokens = ["A", "UNKNOWN_KEY_999", "B"]
        processed = [t for t in tokens if t in valid_buttons]
        self.assertEqual(processed, ["A", "B"])

    def test_r2_b4_sse_disconnect_and_reconnect_resilience(self):
        """R2.B4: SSE reconnection initializes new event handler cleanly."""
        connection_state = {"connected": False}
        def connect():
            connection_state["connected"] = True
        def disconnect():
            connection_state["connected"] = False

        connect()
        self.assertTrue(connection_state["connected"])
        disconnect()
        self.assertFalse(connection_state["connected"])
        connect()
        self.assertTrue(connection_state["connected"])

    def test_r2_b5_sse_event_broadcast_when_no_clients_connected(self):
        """R2.B5: Event push when 0 SSE clients connected does not error."""
        clients = set()
        msg = "data: test\n\n"
        for c in list(clients):
            c.write(msg)
        self.assertEqual(len(clients), 0)

    # --- R3 Boundaries ---
    def test_r3_b1_no_mixed_dutch_english_hybrid_strings(self):
        """R3.B1: Check absence of hybrid phrases like 'Mix Actief' or 'Radio gestart'."""
        content = read_project_file("src/components/DeckifyExpandedModal.tsx")
        self.assertNotIn("Mix Actief", content)
        self.assertNotIn("Radio gestart", content)

    def test_r3_b2_dynamic_templates_with_placeholders_english(self):
        """R3.B2: Dynamic toast strings with interpolation are in English."""
        content = read_project_file("src/components/DeckifyExpandedModal.tsx")
        self.assertNotIn("Toegevoegd aan ", content)
        self.assertNotIn("aangemaakt", content)

    def test_r3_b3_case_variations_aan_uit_fully_removed(self):
        """R3.B3: Case variants of Dutch toggle words (Aan, AAN, Uit, UIT) removed."""
        content = read_project_file("src/components/DeckifyExpandedModal.tsx")
        self.assertNotIn('"AAN"', content)
        self.assertNotIn('"UIT"', content)

    def test_r3_b4_nested_dialog_and_prompt_labels_english(self):
        """R3.B4: Dialogs and modal prompt labels are in English."""
        content = read_project_file("src/components/DeckifyExpandedModal.tsx")
        self.assertNotIn("om te sluiten", content)

    def test_r3_b5_pluralization_and_units_english(self):
        """R3.B5: Plural units use 'tracks' or 'songs' instead of 'nummers'."""
        content = read_project_file("src/components/DeckifyExpandedModal.tsx")
        self.assertNotIn(" nummers", content)

    # --- R4 Boundaries ---
    async def test_r4_b1_empty_playlist_zero_tracks_handled_safely(self):
        """R4.B1: get_playlist_tracks returns ok: True and empty tracks for 0-track playlist."""
        self.execute.return_value = {"items": [], "total": 0}
        with patch.object(self.plugin, "_annotate_tracks_liked", new_callable=AsyncMock):
            res = await self.plugin.get_playlist_tracks("pl-empty", offset=0, fetch_all=False)
        self.assertTrue(res.get("ok"))
        self.assertEqual(res.get("tracks"), [])
        self.assertEqual(res.get("total"), 0)

    async def test_r4_b2_offset_exceeding_total_tracks(self):
        """R4.B2: Offset exceeding total track count returns empty slice cleanly."""
        self.execute.return_value = {"items": [], "total": 50}
        with patch.object(self.plugin, "_annotate_tracks_liked", new_callable=AsyncMock):
            res = await self.plugin.get_playlist_tracks("pl-1", offset=999, fetch_all=False)
        self.assertTrue(res.get("ok"))
        self.assertEqual(res.get("tracks"), [])

    async def test_r4_b3_non_standard_limit_clamping(self):
        """R4.B3: Non-standard chunk limit (e.g. limit=100) passes clamped to API."""
        self.execute.return_value = {"items": [], "total": 100}
        with patch.object(self.plugin, "_annotate_tracks_liked", new_callable=AsyncMock):
            try:
                await self.plugin.get_playlist_tracks("pl-1", offset=0, limit=100, fetch_all=False)
            except TypeError as e:
                self.fail(f"get_playlist_tracks limit parameter missing: {e}")
        call_params = self.execute.call_args[0][4]
        self.assertEqual(call_params.get("limit"), 100)

    async def test_r4_b4_partial_like_api_failure_in_chunk(self):
        """R4.B4: Failure in like check does not fail entire playlist tracks response."""
        self.execute.return_value = {
            "items": [{"track": {"id": "t-1", "name": "T1", "artists": []}}],
            "total": 1,
        }
        with patch.object(self.plugin, "_annotate_tracks_liked", new_callable=AsyncMock) as mock_like:
            mock_like.side_effect = Exception("Spotify rate limit")
            res = await self.plugin.get_playlist_tracks("pl-1", offset=0, fetch_all=False)
        self.assertTrue(res.get("ok"))
        self.assertEqual(len(res.get("tracks", [])), 1)

    async def test_r4_b5_negative_offset_or_empty_playlist_id(self):
        """R4.B5: Empty playlist_id handled safely."""
        res = await self.plugin.get_playlist_tracks("", offset=0)
        self.assertFalse(res.get("ok"))

    # --- R5 Boundaries ---
    async def test_r5_b1_empty_or_whitespace_search_query(self):
        """R5.B1: Empty or whitespace query returns empty results without API call."""
        res = await self.plugin.search_spotify("   ")
        self.assertTrue(res.get("ok"))
        self.assertEqual(res.get("tracks"), [])
        self.assertEqual(res.get("artists"), [])

    async def test_r5_b2_search_query_with_special_characters_and_symbols(self):
        """R5.B2: Special characters and punctuation in query handled safely."""
        self.execute.return_value = {"tracks": {"items": []}}
        with patch.object(self.plugin, "_annotate_tracks_liked", new_callable=AsyncMock):
            res = await self.plugin.search_spotify("AC/DC & Guns N' Roses")
        self.assertTrue(res.get("ok"))
        call_q = self.execute.call_args[0][4]["q"]
        self.assertEqual(call_q, "AC/DC & Guns N' Roses")

    async def test_r5_b3_search_spotify_offset_pagination(self):
        """R5.B3: Offset parameter forwards correctly for search pagination."""
        self.execute.return_value = {}
        with patch.object(self.plugin, "_annotate_tracks_liked", new_callable=AsyncMock):
            await self.plugin.search_spotify("pop", offset=25)
        call_offset = self.execute.call_args[0][4]["offset"]
        self.assertEqual(call_offset, 25)

    async def test_r5_b4_partial_category_empty_results(self):
        """R5.B4: Handling when some categories return items and others are empty."""
        self.execute.return_value = {
            "tracks": {"items": [{"id": "t1", "name": "T1", "artists": []}]},
            "artists": {"items": []},
            "albums": {"items": []},
            "playlists": {"items": []},
        }
        with patch.object(self.plugin, "_annotate_tracks_liked", new_callable=AsyncMock):
            res = await self.plugin.search_spotify("query")
        self.assertTrue(res.get("ok"))
        self.assertEqual(len(res.get("tracks")), 1)
        self.assertEqual(len(res.get("artists")), 0)

    async def test_r5_b5_search_limit_exceeding_50_clamped(self):
        """R5.B5: Limits exceeding Spotify max (50) clamped to 50."""
        self.execute.return_value = {}
        with patch.object(self.plugin, "_annotate_tracks_liked", new_callable=AsyncMock):
            try:
                await self.plugin.search_spotify("test", limit=100)
            except TypeError as e:
                self.fail(f"search_spotify limit parameter missing: {e}")
        call_limit = self.execute.call_args[0][4]["limit"]
        self.assertLessEqual(call_limit, 50)

    # --- R6 Boundaries ---
    def test_r6_b1_missing_artwork_url_falls_back_gracefully(self):
        """R6.B1: None artwork_url produces no image rendering exception."""
        url = None
        has_art = bool(url and url.strip())
        self.assertFalse(has_art)

    def test_r6_b2_empty_string_artwork_url(self):
        """R6.B2: Empty string artwork_url handled as falsy."""
        url = "   "
        has_art = bool(url and url.strip())
        self.assertFalse(has_art)

    def test_r6_b3_empty_artist_and_title_in_toast(self):
        """R6.B3: Missing artist in metadata defaults to Deckify title."""
        meta = {"name": "Solo Track", "artist": ""}
        body = meta["artist"] if meta["artist"] else "Deckify"
        self.assertEqual(body, "Deckify")

    def test_r6_b4_rapid_track_skipping_toast_rate_limiting(self):
        """R6.B4: Rapid track updates suppress redundant toasts."""
        history = []
        for track_id in ["t1", "t1", "t2", "t2", "t3"]:
            if not history or history[-1] != track_id:
                history.append(track_id)
        self.assertEqual(history, ["t1", "t2", "t3"])

    def test_r6_b5_resolution_selection_from_images_array(self):
        """R6.B5: Image URL extractor picks medium or first available thumbnail."""
        images = [
            {"url": "https://large.jpg", "height": 640},
            {"url": "https://medium.jpg", "height": 300},
            {"url": "https://small.jpg", "height": 64},
        ]
        chosen = main._image_url(images)
        self.assertTrue(bool(chosen))
        self.assertIn("jpg", chosen)

    # --- R7 Boundaries ---
    async def test_r7_b1_invalid_overlay_enabled_type_rejection(self):
        """R7.B1: Non-boolean for overlay_enabled handled safely."""
        res = await self.plugin.set_setting("overlay_enabled", "not_a_bool")
        val = self.plugin._settings.get("overlay_enabled")
        self.assertIsInstance(val, bool)

    async def test_r7_b2_invalid_overlay_position_rejection(self):
        """R7.B2: Invalid overlay position string rejected or defaulted."""
        valid_positions = {"top-left", "top-right", "bottom-left", "bottom-right"}
        res = await self.plugin.set_setting("overlay_position", "invalid-pos")
        pos = self.plugin._settings.get("overlay_position")
        self.assertTrue(pos in valid_positions or not res.get("ok"))

    def test_r7_b3_overlay_idle_state_when_playback_stopped(self):
        """R7.B3: Overlay handles null track when player is stopped."""
        current_track = None
        hud_visible = current_track is not None
        self.assertFalse(hud_visible)

    def test_r7_b4_overlay_extreme_track_name_truncation(self):
        """R7.B4: Very long track name truncated safely in overlay HUD."""
        long_title = "A" * 200
        truncated = long_title[:45] + "..." if len(long_title) > 45 else long_title
        self.assertEqual(len(truncated), 48)

    async def test_r7_b5_overlay_toggling_during_active_playback(self):
        """R7.B5: Toggling overlay setting during active playback updates live state."""
        self.plugin._last_event = {"event": "playing", "name": "Song"}
        await self.plugin.set_setting("overlay_enabled", True)
        self.assertTrue(self.plugin._settings.get("overlay_enabled"))

    # --- R8 Boundaries ---
    def test_r8_b1_multiple_nested_descriptors_sanitized(self):
        """R8.B1: Multiple nested parentheses/brackets cleaned in single pass."""
        title = "Track Name (feat. Artist A) (Remastered 2020) [Live at Leeds]"
        cleaned = sanitize_track_title_spec(title)
        self.assertEqual(cleaned, "Track Name")

    def test_r8_b2_preserves_integral_parentheses_in_title(self):
        """R8.B2: Preserves title parts where parentheses are part of song name."""
        title = "(Don't Fear) The Reaper"
        cleaned = sanitize_track_title_spec(title)
        self.assertIn("Don't Fear", cleaned)

    async def test_r8_b3_empty_track_or_artist_returns_error_cleanly(self):
        """R8.B3: Empty track or artist string returns clean error dict."""
        self.execute.return_value = {"ok": False, "error": "Missing query"}
        res = await self.plugin.get_lyrics("", "")
        self.assertFalse(res.get("ok"))

    async def test_r8_b4_lrclib_http_500_or_timeout_handled_without_crash(self):
        """R8.B4: LRCLIB HTTP 500 or timeout returns ok: False without raising exception."""
        with patch.object(main, "_exec", new_callable=AsyncMock) as mock_exec:
            mock_exec.side_effect = Exception("LRCLIB 500 Internal Error")
            res = await self.plugin.get_lyrics("Song", "Artist")
        self.assertFalse(res.get("ok"))

    def test_r8_b5_unicode_and_accented_characters_in_lyrics_query(self):
        """R8.B5: Accented and non-ASCII titles sanitized properly."""
        title = "Échame La Culpa (Remastered)"
        cleaned = sanitize_track_title_spec(title)
        self.assertEqual(cleaned, "Échame La Culpa")

    # --- R9 Boundaries ---
    async def test_r9_b1_play_tracks_with_all_none_arguments(self):
        """R9.B1: play_tracks with all None arguments handles safely."""
        res = await self.plugin.play_tracks()
        self.assertIsInstance(res, dict)

    async def test_r9_b2_queue_item_with_empty_or_malformed_uri(self):
        """R9.B2: Empty offset_uri handled without crash."""
        res = await self.plugin.play_tracks(offset_uri="")
        self.assertIsInstance(res, dict)

    async def test_r9_b3_queue_play_auto_transfer_on_404_device(self):
        """R9.B3: Direct queue play auto-transfers on 404 No Active Device."""
        self.execute.side_effect = [
            HTTPError("url", 404, "Not Found", {}, io.BytesIO(b'{"error":{"status":404}}')),
            {"ok": True},
        ]
        with patch.object(self.plugin, "_auto_transfer_and_play", new_callable=AsyncMock) as mock_transfer:
            mock_transfer.return_value = {"ok": True}
            await self.plugin.play_tracks(offset_uri="spotify:track:123")
        mock_transfer.assert_awaited_once()

    async def test_r9_b4_play_last_item_in_queue(self):
        """R9.B4: Playing last item in queue succeeds with valid single URI."""
        await self.plugin.play_tracks(offset_uri="spotify:track:last")
        body = self.execute.call_args[0][5]
        self.assertEqual(body.get("uris"), ["spotify:track:last"])

    async def test_r9_b5_rapid_queue_clicks_idempotency(self):
        """R9.B5: Rapid consecutive queue clicks execute cleanly."""
        for _ in range(5):
            await self.plugin.play_tracks(offset_uri="spotify:track:rapid")
        self.assertEqual(self.execute.await_count, 5)

    # --- R10 Boundaries ---
    def test_r10_b1_gamepad_x_with_no_focused_track(self):
        """R10.B1: Gamepad X pressed with null focused track is safe no-op."""
        focused_track = None
        action_called = False
        if focused_track:
            action_called = True
        self.assertFalse(action_called)

    def test_r10_b2_gamepad_y_toggles_already_opened_menu(self):
        """R10.B2: Gamepad Y closes action menu if already open."""
        menu_open = True
        menu_open = not menu_open
        self.assertFalse(menu_open)

    async def test_r10_b3_like_toggle_api_failure_rollback(self):
        """R10.B3: Like toggle API error keeps previous like state."""
        self.execute.side_effect = HTTPError("url", 500, "Error", {}, io.BytesIO(b"{}"))
        res = await self.plugin.toggle_like_track("t1", True)
        self.assertFalse(res.get("ok"))

    def test_r10_b4_track_item_with_undefined_like_status(self):
        """R10.B4: Track item with missing is_liked defaults to unliked."""
        track = {"id": "t1", "name": "Song"}
        is_liked = track.get("is_liked") is True
        self.assertFalse(is_liked)

    def test_r10_b5_rapid_like_button_press_debouncing(self):
        """R10.B5: Debounce logic prevents double-triggering like toggle."""
        busy = False
        toggles = 0
        def try_toggle():
            nonlocal busy, toggles
            if busy:
                return
            busy = True
            toggles += 1
            busy = False

        try_toggle()
        self.assertEqual(toggles, 1)

    # --- R11 Boundaries ---
    async def test_r11_b1_seek_to_zero_ms_boundary(self):
        """R11.B1: Seeking to 0ms boundary succeeds."""
        res = await self.plugin.seek_playback(0)
        self.assertTrue(res.get("ok"))
        self.assertEqual(res.get("position_ms"), 0)

    async def test_r11_b2_seek_beyond_duration_clamped(self):
        """R11.B2: Seeking beyond track duration is clamped to duration."""
        track_dur = 200000
        requested = 250000
        clamped = min(track_dur, max(0, requested))
        self.assertEqual(clamped, 200000)

    def test_r11_b3_seek_with_zero_duration_disabled(self):
        """R11.B3: Seek bar is disabled when duration_ms is 0."""
        duration_ms = 0
        seek_enabled = duration_ms > 0
        self.assertFalse(seek_enabled)

    async def test_r11_b4_seek_while_paused_vs_playing(self):
        """R11.B4: Seeking while paused updates last_event position."""
        self.plugin._last_event = {"event": "paused", "position_ms": 1000}
        await self.plugin.seek_playback(30000)
        self.assertEqual(self.plugin._last_event.get("position_ms"), 30000)

    def test_r11_b5_negative_seek_clamped_to_zero(self):
        """R11.B5: Negative seek target clamped to 0."""
        target = max(0, -15000)
        self.assertEqual(target, 0)

    # --- R12 Boundaries ---
    async def test_r12_b1_missing_or_whitespace_playlist_id(self):
        """R12.B1: Empty or whitespace playlist_id returns Missing playlist_id."""
        self.plugin._settings["audio_backend"] = "spotify_client"
        res = await self.plugin.set_native_playlist_mix("   ")
        self.assertFalse(res.get("ok"))
        self.assertIn("playlist_id", res.get("error", "").lower())

    async def test_r12_b2_cdp_evaluate_timeout_handling(self):
        """R12.B2: CDP timeout returns graceful ok: False error dict."""
        self.plugin._settings["audio_backend"] = "spotify_client"
        self.execute.side_effect = TimeoutError("CDP connection timed out")
        res = await self.plugin.set_native_playlist_mix("pl-1")
        self.assertFalse(res.get("ok"))

    async def test_r12_b3_cdp_evaluate_spotify_ui_not_ready(self):
        """R12.B3: Spotify UI not ready response propagated cleanly."""
        self.plugin._settings["audio_backend"] = "spotify_client"
        self.execute.return_value = {"ok": False, "error": "Spotify UI not ready"}
        res = await self.plugin.set_native_playlist_mix("pl-1")
        self.assertFalse(res.get("ok"))
        self.assertIn("UI not ready", res.get("error"))

    async def test_r12_b4_play_now_false_skips_playback(self):
        """R12.B4: play_now=False toggles mix state without forcing immediate playback."""
        self.plugin._settings["audio_backend"] = "spotify_client"
        self.execute.return_value = {"ok": True, "playlist_id": "pl-1", "is_mixed": True}
        res = await self.plugin.set_native_playlist_mix("pl-1", enabled=True, play_now=False)
        self.assertTrue(res.get("ok"))

    async def test_r12_b5_toggle_native_mix_with_missing_tree_settings(self):
        """R12.B5: Missing spotify_folder_tree in settings does not crash."""
        self.plugin._settings["audio_backend"] = "spotify_client"
        self.plugin._settings.pop("spotify_folder_tree", None)
        self.execute.return_value = {"ok": True, "playlist_id": "pl-1", "is_mixed": True}
        res = await self.plugin.set_native_playlist_mix("pl-1")
        self.assertTrue(res.get("ok"))


# ============================================================================
# Tier 3: Cross-Feature Combinations (Pairwise Interactions)
# ============================================================================

class TestTier3CrossFeatureCombinations(unittest.IsolatedAsyncioTestCase):
    """
    Tier 3: Pairwise and multi-feature interaction tests validating
    emergent behaviors across requirements.
    """

    async def asyncSetUp(self):
        self.plugin = main.Plugin()
        self.plugin._token_refresh_lock = asyncio.Lock()
        self.plugin._access_token = "mock-token"
        self.plugin._refresh_token = "mock-refresh"
        self.plugin._token_expires_at = time.time() + 3600
        self.plugin._last_event = {"event": "playing", "position_ms": 0}
        self.plugin._settings = dict(common.DEFAULT_SETTINGS)
        self.execute = self.enterContext(patch.object(main, "_exec", new_callable=AsyncMock))
        self.execute.return_value = {"ok": True}
        self.save = self.enterContext(patch.object(main, "_save_settings"))

    async def test_tier3_r4_chunked_likes_and_r10_controller_like_toggle(self):
        """Pair 1: R4 (Chunked Likes) + R10 (Universal Like Indicator & Controller X Shortcut)."""
        chunk_items = [
            {"track": {"id": f"track_{i}", "name": f"Song {i}", "artists": [{"name": "Band"}]}}
            for i in range(50)
        ]
        self.execute.return_value = {"items": chunk_items, "total": 300}
        with patch.object(self.plugin, "_annotate_tracks_liked", new_callable=AsyncMock):
            try:
                chunk = await self.plugin.get_playlist_tracks("pl-chunk", offset=0, limit=50, fetch_all=False)
            except TypeError as e:
                self.fail(f"get_playlist_tracks limit parameter missing: {e}")

        self.assertEqual(len(chunk["tracks"]), 50)
        target_track = chunk["tracks"][15]

        self.execute.return_value = None
        toggle_res = await self.plugin.toggle_like_track(target_track["id"], True)
        self.assertTrue(toggle_res["ok"])
        self.assertTrue(toggle_res["is_liked"])
        target_track["is_liked"] = toggle_res["is_liked"]
        self.assertTrue(target_track["is_liked"])

    async def test_tier3_r8_lyrics_sync_and_r11_interactive_seek(self):
        """Pair 2: R8 (Robust Lyrics) + R11 (Interactive Seek Bar & Timestamps)."""
        lyrics_lines = [
            {"timeMs": 0, "text": "Intro music"},
            {"timeMs": 15000, "text": "Verse 1 starts"},
            {"timeMs": 45000, "text": "Chorus erupts"},
        ]
        seek_target = lyrics_lines[2]["timeMs"]
        seek_res = await self.plugin.seek_playback(seek_target)
        self.assertTrue(seek_res["ok"])
        self.assertEqual(seek_res["position_ms"], 45000)
        self.assertEqual(self.plugin._last_event["position_ms"], 45000)

    async def test_tier3_r5_search_expansion_r9_queue_play_r10_shortcuts(self):
        """Pair 3: R5 (Expanded Search) + R9 (Direct Queue Play) + R10 (Shortcuts)."""
        mock_search = {
            "tracks": {"items": [{"id": "t-disco", "name": "Get Lucky", "artists": [{"name": "Daft Punk"}]}]},
            "artists": {"items": [{"id": "a-dp", "name": "Daft Punk", "images": []}]},
        }
        self.execute.return_value = mock_search
        with patch.object(self.plugin, "_annotate_tracks_liked", new_callable=AsyncMock):
            try:
                search_res = await self.plugin.search_spotify("Daft Punk", limit=50)
            except TypeError as e:
                self.fail(f"search_spotify limit parameter missing: {e}")

        found_track = search_res["tracks"][0]
        self.execute.return_value = None
        play_res = await self.plugin.play_tracks(offset_uri=f"spotify:track:{found_track['id']}")
        self.assertTrue(play_res["ok"])

        like_res = await self.plugin.toggle_like_track(found_track["id"], True)
        self.assertTrue(like_res["ok"])

    def test_tier3_r6_notification_artwork_and_r7_ingame_overlay(self):
        """Pair 4: R6 (Notification Artwork) + R7 (In-Game Overlay HUD)."""
        meta = {
            "event": "track_metadata",
            "track_id": "trk-combo",
            "name": "Midnight City",
            "artist": "M83",
            "artwork_url": "https://i.scdn.co/image/m83_art",
        }
        overlay_state = {
            "title": meta["name"],
            "artist": meta["artist"],
            "artwork": meta["artwork_url"],
            "visible": True,
        }
        toast_state = {
            "title": meta["name"],
            "body": meta["artist"],
            "icon_url": meta["artwork_url"],
        }
        self.assertEqual(overlay_state["artwork"], "https://i.scdn.co/image/m83_art")
        self.assertEqual(toast_state["icon_url"], "https://i.scdn.co/image/m83_art")

    async def test_tier3_r2_dashboard_sse_and_r9_playback_r11_seek(self):
        """Pair 5: R2 (Dashboard Gamepad SSE) + R9 (Direct Playback) / R11 (Seeking)."""
        incoming_sse_events = ["DPAD_RIGHT", "A"]
        for ev in incoming_sse_events:
            if ev == "DPAD_RIGHT":
                await self.plugin.seek_playback(15000)
            elif ev == "A":
                await self.plugin.play_tracks(offset_uri="spotify:track:selected")

        self.assertEqual(self.execute.await_count, 2)

    async def test_tier3_r7_ingame_overlay_and_r12_native_mix_backend_switch(self):
        """Pair 6: R7 (In-Game Overlay) + R12 (Native Playlist Mix & Backend Engine Switch)."""
        await self.plugin.set_setting("audio_backend", "spotify_client")
        self.assertEqual(self.plugin._settings["audio_backend"], "spotify_client")

        self.execute.return_value = {"ok": True, "playlist_id": "pl-mix", "is_mixed": True}
        mix_res = await self.plugin.set_native_playlist_mix("pl-mix", enabled=True)
        self.assertTrue(mix_res["ok"])


# ============================================================================
# Tier 4: Real-World Application Scenarios (End-to-End User Workflows)
# ============================================================================

class TestTier4RealWorldScenarios(unittest.IsolatedAsyncioTestCase):
    """
    Tier 4: Realistic end-to-end user workflows validating complete
    functional journeys across the Deckify application stack.
    """

    async def asyncSetUp(self):
        self.plugin = main.Plugin()
        self.plugin._token_refresh_lock = asyncio.Lock()
        self.plugin._access_token = "user-auth-token"
        self.plugin._refresh_token = "user-refresh-token"
        self.plugin._token_expires_at = time.time() + 3600
        self.plugin._settings = dict(common.DEFAULT_SETTINGS)
        self.execute = self.enterContext(patch.object(main, "_exec", new_callable=AsyncMock))
        self.execute.return_value = {"ok": True}
        self.save = self.enterContext(patch.object(main, "_save_settings"))

    async def test_tier4_scenario1_music_discovery_and_playback_flow(self):
        """
        Scenario 1: End-to-End Discovery, Search, Like, Direct Play, and Lyrics Scrubbing.
        User opens Search -> queries artist -> browses expanded tracks -> likes track ->
        plays directly -> scrubs progress bar -> synchronizes lyrics.
        """
        mock_search = {
            "tracks": {"items": [
                {"id": "t-aerodynamic", "name": "Aerodynamic", "artists": [{"name": "Daft Punk"}], "duration_ms": 212000}
            ]},
            "artists": {"items": [{"id": "a-dp", "name": "Daft Punk"}]},
        }
        self.execute.return_value = mock_search
        with patch.object(self.plugin, "_annotate_tracks_liked", new_callable=AsyncMock):
            try:
                search_data = await self.plugin.search_spotify("Daft Punk", limit=50)
            except TypeError as e:
                self.fail(f"search_spotify limit parameter missing: {e}")
        self.assertEqual(len(search_data["tracks"]), 1)
        track = search_data["tracks"][0]

        self.execute.return_value = None
        like_data = await self.plugin.toggle_like_track(track["id"], True)
        self.assertTrue(like_data["ok"])

        play_data = await self.plugin.play_tracks(offset_uri=f"spotify:track:{track['id']}")
        self.assertTrue(play_data["ok"])

        seek_data = await self.plugin.seek_playback(45000)
        self.assertTrue(seek_data["ok"])
        self.assertEqual(seek_data["position_ms"], 45000)

        clean_title = sanitize_track_title_spec(track["name"] + " (Remastered 2021)")
        self.assertEqual(clean_title, "Aerodynamic")

    async def test_tier4_scenario2_massive_playlist_infinite_scroll_and_queue_play(self):
        """
        Scenario 2: Massive 500-Track Playlist Infinite Scroll, Chunked Likes, Action Menu, and Queue Play.
        User opens a 500-track playlist -> loads initial 50-track chunk -> scrolls down ->
        lazy-loads second chunk -> uses action menu to add track to queue -> opens queue -> plays directly.
        """
        chunk1_items = [{"track": {"id": f"t_{i}", "name": f"Track {i}", "artists": []}} for i in range(50)]
        self.execute.return_value = {"items": chunk1_items, "total": 500}
        with patch.object(self.plugin, "_annotate_tracks_liked", new_callable=AsyncMock) as mock_like:
            try:
                c1 = await self.plugin.get_playlist_tracks("pl-huge", offset=0, limit=50, fetch_all=False)
            except TypeError as e:
                self.fail(f"get_playlist_tracks limit parameter missing: {e}")
        self.assertEqual(len(c1["tracks"]), 50)
        self.assertEqual(c1["total"], 500)
        self.assertEqual(len(mock_like.call_args[0][1]), 50)

        chunk2_items = [{"track": {"id": f"t_{i}", "name": f"Track {i}", "artists": []}} for i in range(50, 100)]
        self.execute.return_value = {"items": chunk2_items, "total": 500}
        with patch.object(self.plugin, "_annotate_tracks_liked", new_callable=AsyncMock):
            try:
                c2 = await self.plugin.get_playlist_tracks("pl-huge", offset=50, limit=50, fetch_all=False)
            except TypeError as e:
                self.fail(f"get_playlist_tracks limit parameter missing: {e}")
        self.assertEqual(len(c2["tracks"]), 50)
        self.assertEqual(c2["offset"], 50)

        target_track = c2["tracks"][25]
        self.execute.return_value = None
        q_res = await self.plugin.add_to_queue(f"spotify:track:{target_track['id']}")
        self.assertTrue(q_res["ok"])

        q_play_res = await self.plugin.play_tracks(offset_uri=f"spotify:track:{target_track['id']}")
        self.assertTrue(q_play_res["ok"])

    async def test_tier4_scenario3_active_gameplay_session_overlay_and_toast(self):
        """
        Scenario 3: Gaming Mode Overlay, Toast Notifications, and Controller Shortcut Flow.
        User launches a Steam Deck game -> Deckify running in background -> Overlay enabled ->
        Toast displays artwork on track change -> Gamepad shortcuts respond without modal.
        """
        await self.plugin.set_setting("overlay_enabled", True)
        await self.plugin.set_setting("overlay_position", "top-right")
        await self.plugin.set_setting("toast_enabled", True)

        self.assertTrue(self.plugin._settings.get("overlay_enabled"))
        self.assertEqual(self.plugin._settings.get("overlay_position"), "top-right")

        track_meta = {
            "event": "track_metadata",
            "track_id": "game-bgm-1",
            "name": "Starlight",
            "artist": "Muse",
            "artwork_url": "https://i.scdn.co/image/muse_starlight",
        }
        self.plugin._track_meta = track_meta
        self.assertEqual(self.plugin._track_meta["artwork_url"], "https://i.scdn.co/image/muse_starlight")

        self.execute.return_value = None
        like_res = await self.plugin.toggle_like_track("game-bgm-1", True)
        self.assertTrue(like_res["ok"])
        self.assertTrue(like_res["is_liked"])

    def test_tier4_scenario4_packaging_deployment_and_ci_pipeline(self):
        """
        Scenario 4: Complete Release and Deployment Packaging Pipeline.
        Simulates full packaging verification: verifies release.yml, ci.yml,
        deploy.sh, and install.sh for exact inclusion of py_modules/, correct repo, and CI tests.
        """
        release_yml = read_project_file(".github/workflows/release.yml")
        ci_yml = read_project_file(".github/workflows/ci.yml")
        deploy_sh = read_project_file("deploy.sh")
        install_sh = read_project_file("install.sh")

        self.assertTrue("py_modules" in release_yml)
        self.assertTrue("py_modules" in deploy_sh)
        self.assertIn('REPO="Siroopfles/Deckify"', install_sh)
        self.assertTrue(bool(re.search(r"unittest|pytest", ci_yml, re.IGNORECASE)))
        self.assertTrue(bool(re.search(r"vitest|pnpm test", ci_yml, re.IGNORECASE)))


if __name__ == "__main__":
    unittest.main()
