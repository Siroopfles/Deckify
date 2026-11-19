# Phase 20: 100% Silent HUD Toasts & Extended In-Game Quick-Chords - Context

**Gathered:** 2026-11-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Track-change notifications and in-game chord confirmations render as a 100% silent 3.5s banner inside `DeckifyOverlay` (`pointerEvents: "none"`), bypassing Steam's `toaster.toast` chime. Users can bind fully user-defined multi-button controller chords to Like/Unlike, Cycle Pinned Playlists, and Toggle Lyrics HUD (plus existing skip/play-pause/volume actions), with Valve reserved chords blocked and a 4-second `guideHeld` expiry guard.

</domain>

<decisions>
## Implementation Decisions

### Silent Banner
- **D-01:** Banner renders inside `DeckifyOverlay` independent of `overlay_enabled` / autohide / HUD visibility. It is gated by `toast_enabled` and a **new single setting `silent_banner_enabled`** (default on). No separate banner position/duration settings.
- **D-02:** Banner position follows existing `overlay_position` / `toast_position` setting.
- **D-03:** Latest-wins: a new banner replaces the current one immediately and resets the 3.5s timer. No queue/stack.
- **D-04:** When `toast_sound_enabled` is `true`, track-change toast behavior stays unchanged (`toaster.toast` with chime). Silent banner is used when `toast_sound_enabled` is `false`.
- **D-05:** Banner is `pointerEvents: "none"` (no click/focus handling; the old click-opens-modal toast behavior does not apply to the silent banner). Banner is shown even while the modal is closed/HUD hidden.

### Chord Binding (User-Defined)
- **D-06:** Chords are fully user-defined: any combination of 1–4 simultaneous buttons, STEAM/QAM NOT required. Set via **press-to-record** capture in Settings, plus a per-action and global **Reset to Defaults**.
- **D-07:** Validation rejects only: Valve reserved chords (`STEAM + X / R1 / L1`) and combos identical to another Deckify chord. Single bare buttons are allowed (user's risk); a rejected capture shows a message.
- **D-08:** The 3 new actions (Like/Unlike, Cycle Pinned Playlists, Toggle Lyrics HUD) ship **unbound** by default. Existing actions (skip prev/next, play/pause, volume ±) keep their current STEAM/QAM-based legacy defaults but are also rebindable.

### Chord Detection & Safety
- **D-09:** `guideHeld` (STEAM/QAM btn 13/14) state auto-expires 4s after press to prevent stuck state. User-defined combos fire once at the moment the last button of the set goes down (all must be held) and re-arm only after any button of the set is released.
- **D-10:** Chords are ignored while the Expanded Modal is open; still active when the QAM is open.

### HUD Confirmation Feedback
- **D-11:** ALL chord confirmations (skip, play/pause, volume, like, pinned, lyrics) use the silent overlay banner when `silent_banner_enabled`; otherwise fall back to `toaster.toast`.
- **D-12 (Pinned Cycle):** Cycle in pinned order, wrap after the last (max 4), start at first if nothing active, and start playback. Banner: `▶ Pinned 2/4: <name>`; if none pinned: `No pinned playlists`.
- **D-13 (Like):** Banner `♥ Liked: <track>` / `♡ Removed from Liked`; optimistic update with rollback + error banner on failure.
- **D-14 (Lyrics HUD):** Banner `Lyrics HUD On/Off`; flips and persists `overlay_lyrics_enabled`.

### the agent's Discretion
- Settings storage schema for chord bindings (e.g., `gamepad_chord_bindings`), button-ID normalization, and record-capture UI layout.
- Banner visual styling/animation, and how banner events are delivered to `DeckifyOverlay` (event bus/props/state).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

- `.planning/REQUIREMENTS.md` — `TOAST-01`, `CHORD-01`
- `.planning/ROADMAP.md` — Phase 20 goal and success criteria (lines 98–107)
- `src/index.tsx` — chord listener (~L1165–1217, `guideHeld` btn 13/14), track-change toast (~L1219–1256), overlay mount (~L1114–1130), `handleQuickPlayPinned`
- `src/components/DeckifyOverlay.tsx` — HUD overlay to host banner
- `src/types.ts` — `EngineSettings` (`gamepad_chords_enabled`, `toast_*`, `overlay_*`, `pinned_playlists`)
- `src/components/tabs/SettingsTab.tsx` — settings UI for chord bindings
- `main.py` / `py_modules/common.py` — settings persistence (`save_setting`, sanitizer), `quick_play_pinned`, like toggle RPC
- `.planning/phases/19-per-game-eq-volume-profiles/19-CONTEXT.md` — prior-phase conventions

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Chord listener via `FocusNavController.m_rgGamepadInputSources[0].RegisterForGamepadButtonDown/Up` in `src/index.tsx`.
- `track_metadata` event listener with artwork proxy (`fetchWithQueueAndCache`) for toast cover.
- `backendQuickPlayPinned`, `backendControlPlayback`, `backendSetVolume`, toggle-like RPC.

### Established Patterns
- Steam CEF CSP: artwork must be base64 via backend proxy.
- Settings persisted through `backendSetSetting`; all RPCs wrapped in try/catch with graceful fallback.
- Pinned pills strip with `pinned_playlists` (max 4) and optimistic highlight/rollback.

### Integration Points
- Toast code (`toaster.toast`) in `index.tsx` → replace with a banner dispatcher that targets `DeckifyOverlay` or falls back to toaster.
- Overlay must stay mounted for banner even when `overlay_enabled` is false (currently returns null at index.tsx ~L1114).

</code_context>

<specifics>
## Specific Ideas

- User explicitly wants no lock-in to the Steam button: chords are free-form multi-button combos set by the user.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within Phase 20 scope.

</deferred>

---

*Phase: 20-100-silent-hud-toasts-extended-in-game-quick-chords*
*Context gathered: 2026-11-19*
