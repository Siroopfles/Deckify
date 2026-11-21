# Phase 20: Silent HUD Toasts & Extended In-Game Quick-Chords - Research

**Researched:** 2026-11-19
**Domain:** Decky plugin React overlay + Steam gamepad input + Python settings persistence
**Confidence:** MEDIUM (in-repo facts HIGH; Steam input button IDs MEDIUM)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: Banner renders inside `DeckifyOverlay` independent of `overlay_enabled` / autohide / HUD visibility. Gated by `toast_enabled` and a new single setting `silent_banner_enabled` (default on). No separate banner position/duration settings.
- D-02: Banner position follows existing `overlay_position` / `toast_position` setting.
- D-03: Latest-wins: new banner replaces current immediately and resets the 3.5s timer. No queue/stack.
- D-04: When `toast_sound_enabled` is `true`, track-change toast stays unchanged (`toaster.toast` with chime). Silent banner used when `toast_sound_enabled` is `false`.
- D-05: Banner is `pointerEvents: "none"`. Shown even while modal closed/HUD hidden.
- D-06: Chords fully user-defined: 1–4 simultaneous buttons, STEAM/QAM NOT required. Press-to-record capture in Settings, plus per-action and global Reset to Defaults.
- D-07: Validation rejects only Valve reserved chords (`STEAM + X / R1 / L1`) and combos identical to another Deckify chord. Single bare buttons allowed; rejected capture shows a message.
- D-08: 3 new actions (Like/Unlike, Cycle Pinned Playlists, Toggle Lyrics HUD) ship unbound. Existing actions (skip prev/next, play/pause, volume ±) keep STEAM/QAM-based legacy defaults but are rebindable.
- D-09: `guideHeld` (btn 13/14) auto-expires 4s after press. User combos fire once when the last button of the set goes down (all held) and re-arm only after any button of the set is released.
- D-10: Chords ignored while Expanded Modal is open; still active when QAM open.
- D-11: ALL chord confirmations use silent overlay banner when `silent_banner_enabled`; otherwise `toaster.toast`.
- D-12: Pinned cycle in pinned order, wrap after last (max 4), start at first if nothing active, start playback. Banner `▶ Pinned 2/4: <name>`; none pinned: `No pinned playlists`.
- D-13: Banner `♥ Liked: <track>` / `♡ Removed from Liked`; optimistic update with rollback + error banner on failure.
- D-14: Banner `Lyrics HUD On/Off`; flips and persists `overlay_lyrics_enabled`.

### the agent's Discretion
- Settings schema for chord bindings (e.g. `gamepad_chord_bindings`), button-ID normalization, record-capture UI layout.
- Banner styling/animation and delivery mechanism to `DeckifyOverlay` (event bus/props/state).

### Deferred Ideas (OUT OF SCOPE)
None.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TOAST-01 | Silent 3.5s banner in `DeckifyOverlay` (`pointerEvents:"none"`) when `toast_sound_enabled` false, even when HUD hidden | Wrapper currently `return null` when `!overlay_enabled`; must be restructured (Pitfall 1). Toast code at index.tsx L1219-1256 |
| CHORD-01 | Configurable chords w/ 4s guideHeld expiry, no Valve collisions; like / pinned cycle / lyrics toggle w/ silent confirmation | Listener at index.tsx L1165-1217; settings plumbing in main.py/common.py (below) |
</phase_requirements>

## Summary

All work is in-repo; no new packages needed. The frontend is `src/index.tsx` (plugin entry, chord listener, track toast, `DeckifyOverlayWrapper`), `src/components/DeckifyOverlay.tsx` (HUD, props-driven), `src/types.ts` (`EngineSettings`), and `SettingsTab.tsx`. The backend persists settings via `main.py` `save_setting` (explicit key whitelist ~L607 plus per-key validation chain L750-830) and a sanitizer in `py_modules/common.py` (~L254-271) with defaults at ~L103-111.

Key architectural findings: (1) the overlay wrapper returns `null` when `overlay_enabled` is false [VERIFIED: src/index.tsx:1114 `if (!settings?.overlay_enabled) return null;`], so the banner needs its own always-mounted host; (2) the chord listener lives in `definePlugin` (module scope, not React), and the overlay wrapper is a React component mounted via `routerHook.addGlobalComponent` — so the banner needs a module-level event bus (tiny pub/sub) that the wrapper subscribes to; (3) the existing listener already uses `guideHeld` with no expiry and only tracks `RegisterForGamepadButtonDown/Up`.

**Primary recommendation:** Add a `src/bannerBus.ts` (`emitBanner(text)` / `subscribeBanner(cb)`) plus a `src/chords.ts` pure module (binding schema, normalization, validation, matcher state machine) so both are unit-testable under Vitest; render banner in a new `SilentBanner` rendered by `DeckifyOverlayWrapper` even when `overlay_enabled` is false; persist bindings as one `gamepad_chord_bindings` dict setting validated server-side.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Banner render/timer | Browser/Client (overlay React) | — | Pure UI; must bypass Steam toaster |
| Banner dispatch (silent vs toaster) | Browser/Client (index.tsx module) | — | Decided from settings flags |
| Chord detection | Browser/Client | — | Only the CEF side sees gamepad buttons |
| Chord action execution | API/Backend via RPC | Client | Existing RPCs: control_playback, toggle_like, quick_play_pinned, set_setting |
| Binding persistence/validation | Backend (common.py / main.py) | Client pre-validation | Settings file is source of truth; sanitizer must reject malformed JSON |

## Standard Stack

No new dependencies. Use existing: React 19, `@decky/ui` 4.11.1, `@decky/api` 1.1.3, Vitest 5.1.0, Python `unittest` [VERIFIED: GEMINI.md stack section]. **Package Legitimacy Audit:** none — no external packages installed.

## Architecture Patterns

### System Architecture Diagram
```
Gamepad button down/up (FocusNavController source[0])
  -> chord matcher (held-set, guideHeld w/ 4s expiry, modalOpen gate)
     -> resolved action id
        -> RPC (control_playback | toggle_like | quick_play_pinned | set_setting overlay_lyrics_enabled | set_volume)
        -> notify(text)  --silent_banner_enabled?--> bannerBus.emit --> DeckifyOverlayWrapper --> SilentBanner (3.5s, latest-wins)
                                         \--no--> toaster.toast (legacy)
track_metadata event -> settings check (toast_enabled, toast_sound_enabled)
   sound on  -> toaster.toast (unchanged)
   sound off -> notify(track name/artist [+artwork]) -> same banner path
Settings UI (SettingsTab) -> press-to-record -> chords.validate -> save_setting(gamepad_chord_bindings) -> backend sanitizer
```

### Recommended structure
```
src/chords.ts        # pure: ACTIONS, DEFAULT_BINDINGS, normalize, validate, createMatcher
src/bannerBus.ts     # pure pub/sub
src/components/SilentBanner.tsx  # pointerEvents none, 3.5s timer, position
src/index.tsx        # wire matcher + notify(); wrapper always mounts banner
```

### Pattern: matcher state machine (D-09)
Hold a `Set<number>` of currently-down buttons. On Down: add btn; if btn is 13/14 record `guideSince=Date.now()`; expire guide if `now - guideSince > 4000` (check lazily on each event AND via a `setTimeout` that clears it so stale state does not persist). For each binding (sorted by size desc) where `binding ⊆ held`, `binding includes btn` (last button just went down) and not `armed[binding]===false`: fire, mark disarmed. On Up: remove btn; re-arm any binding that contains btn. Legacy defaults are expressed as bindings `[13, X]` and `[14, X]` (both guide ids) — store as a binding with alias, or two entries; normalize 13/14 → "GUIDE" token for matching so STEAM and QAM are equivalent. Subset-match must prefer the largest matching binding so `[STEAM, X]` doesn't also fire a bare-`X` binding (suppress shorter bindings when a longer match fires).

### Anti-Patterns
- Rendering banner inside the `overlay_enabled` gate (breaks TOAST-01 "even when HUD hidden").
- Putting `toaster.toast` fallback calls inline in each chord branch — use one `notify()`.
- Registering listeners without unregistering. Current `cleanupChords` only resets `guideHeld`; it never unregisters. Check if `RegisterForGamepadButtonDown` returns an unregister handle at runtime [ASSUMED]; at minimum guard with a `disposed` flag.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Banner position | New position setting | Reuse `overlay_position` normalized with same top-left/... values | D-02. Note `toast_position` uses underscores (`top_right`) while overlay uses hyphens: normalize `replace("_","-")` [VERIFIED: main.py:810-818, common.py:106-108] |
| Like toggle | New RPC | `backendToggleLike`/`toggle_like_track(track_id, liked)` [VERIFIED: main.py:1044] | Already exists |
| Pinned play | New RPC | `quick_play_pinned(uri, item_type)` [VERIFIED: main.py:1268] | Already exists |
| Settings write | Direct file | `backendSetSetting` → `save_setting` | Whitelist + sanitizer |

## Common Pitfalls

1. **Wrapper `return null`** (index.tsx:1114): banner never shows when overlay disabled. Fix: always render wrapper; compute `visible` for HUD separately; render banner outside HUD gating. Also check `DeckifyOverlay` internal `return null` at L187 (HUD hidden) — banner must be a sibling, not inside that branch.
2. **Backend whitelist/validation**: new keys (`silent_banner_enabled` bool, `gamepad_chord_bindings` dict) must be added to the key whitelist (main.py ~L607), the bool tuple (L759), default dict + sanitizer in common.py, and `EngineSettings` in types.ts (L225-233). Missing any → `save_setting` rejects or sanitizer drops it.
3. **Banner via module vs React state**: chord code isn't in a component; use bus. Keep the latest text in a module variable so a banner emitted before wrapper mount isn't lost (optional).
4. **Silent toast leak**: `toaster.toast` with `playSound:false` still existed in tests; when silent mode is on, ensure *no* toaster call for track-change or chord paths (assert `mockToasterToast` not called).
5. **Stale settings in listener**: chord listener is module-scope; fetch settings via cached value updated on `settings` events or `backendGetStatus()` per press (existing track-change code calls `backendGetStatus` per event). Bindings must be re-read after the user edits them — use a module-level `currentBindings` updated by Settings save callback.
6. **Modal-open gate (D-10)**: modal state lives in React; expose via module-level flag (`setModalOpen`) set by wrapper/modal.
7. **Press-to-record capture**: Settings tab must itself not trigger actions while recording — suppress matcher (`recording` flag) and swallow input. Also while in the Settings UI navigation buttons (A/B/D-pad) are used for focus; recording should require explicit "Record" focus + timeout (e.g. 5s) and Cancel.
8. **Valve reserved check**: normalize STEAM(13)+X/R1/L1 comparisons on the GUIDE token so QAM(14)+X also rejected. Exact button indices for X/R1/L1 must be verified on device [ASSUMED]; existing code maps btn 0=play/pause, 9/10=volume, 11/12=prev/next [VERIFIED: src/index.tsx:1176-1200] — those are already-used indices; reuse same mapping table in `chords.ts` and add names only for those confirmed, others [ASSUMED].
9. **Like optimistic rollback**: need current track id/liked state at chord time; fetch via `backendGetStatus` or track_metadata cache; on failure emit error banner (D-13).
10. **Pinned cycle state**: "active" pinned = current context URI matching a pinned item; store `lastPinnedIndex` module-level and fall back to matching current playback context.

## Code Examples

```ts
// bannerBus.ts
type Cb = (b: { text: string; id: number }) => void;
const subs = new Set<Cb>(); let seq = 0;
export const emitBanner = (text: string) => subs.forEach((c) => c({ text, id: ++seq }));
export const subscribeBanner = (c: Cb) => { subs.add(c); return () => subs.delete(c); };
```
```tsx
// SilentBanner: latest-wins -> reset timer keyed on id
useEffect(() => { return subscribeBanner((b) => { setBanner(b); clearTimeout(t.current); t.current = setTimeout(() => setBanner(null), 3500); }); }, []);
// style: position:"fixed", pointerEvents:"none", zIndex high; corner from position prop
```

## State of the Art
Steam `toaster.toast` always routes through Steam's toast pipeline (chime) — replaced by own DOM banner; this relies on the overlay global component staying mounted via `routerHook.addGlobalComponent` [VERIFIED: index.tsx:1142].

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `RegisterForGamepadButtonDown/Up` return an unregister handle | Anti-patterns | Leaked listeners on hot reload; use disposed flag |
| A2 | Button indices for X/R1/L1 in Steam's gamepad source numbering (only 0, 9–14 seen in code) | Pitfall 8 | Reserved-chord check wrong; verify on device |
| A3 | Overlay global component renders above games & is unaffected by pointer events when `pointerEvents:none` | Examples | Banner invisible/obstructive; verify on device |
| A4 | No Steam chime from plain DOM banner | Summary | Low; DOM has no audio |

## Open Questions (RESOLVED)
1. Exact full button-index map for Steam `GamepadInputSource` (A/B/X/Y, bumpers, triggers, L4/R4 etc.) — **RESOLVED:** Verified directly from `@decky/ui` `node_modules/@decky/ui/src/components/FooterLegend.ts:3-33` in `20-PATTERNS.md` (`INVALID=0`, `OK=1`, `CANCEL=2`, `SECONDARY=3`, `OPTIONS=4`, `BUMPER_LEFT=5`, `BUMPER_RIGHT=6`, `TRIGGER_LEFT=7`, `TRIGGER_RIGHT=8`, `DIR_UP=9`..`DIR_RIGHT=12`, `SELECT=13`, `START=14`, `LSTICK_CLICK=15`, `RSTICK_CLICK=16`, `REAR_LEFT_UPPER=23`..`REAR_RIGHT_LOWER=26`, `STEAM_GUIDE=27`, `STEAM_QUICK_MENU=28`). `src/chords.ts` uses these verified `FooterLegend.ts` indices, preserves legacy guide `13/14` compatibility in `GUIDE_BUTTON_IDS = {27, 28, 13, 14}`, and corrects default `play_pause` to `OK=1`.
2. Should track-change banner show artwork? — **RESOLVED:** Per `20-UI-SPEC.md` (`40px` cached-only artwork contract), track-change banners show an optional `40px` proxied thumbnail ONLY when already synchronously available (`data:`, `http://127.0.0.1`, or `imgMemoryCache.get()`) and collapse to text-only otherwise (never blocking on network fetches); chord confirmation banners are single-line text-only without cover artwork.

## Environment Availability
Node/pnpm/Python available on dev machine per project stack; on-device chord testing requires a Steam Deck (manual). No other external deps.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.1.0 (frontend: `src/index.test.tsx`, `src/utils.test.ts`), Python `unittest` (`tests/test_*.py`) |
| Config file | existing vitest config / none required |
| Quick run command | `pnpm vitest run src/chords.test.ts` ; `python -m unittest tests.test_features` |
| Full suite command | `pnpm test` ; `python -m unittest discover tests` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TOAST-01 | sound off → banner emitted, `toaster.toast` NOT called; sound on → toast unchanged | unit (index.test.tsx, existing mock `mockToasterToast`) | `pnpm vitest run src/index.test.tsx` | ✅ extend |
| TOAST-01 | Banner renders w/ `overlay_enabled:false`, pointerEvents none, 3.5s, latest-wins (fake timers) | unit | `pnpm vitest run src/components/SilentBanner.test.tsx` | ❌ Wave 0 |
| CHORD-01 | matcher: fires once on last-button-down, re-arms on release, longest-match wins | unit | `pnpm vitest run src/chords.test.ts` | ❌ Wave 0 |
| CHORD-01 | guideHeld expires after 4s (fake timers) | unit | same | ❌ Wave 0 |
| CHORD-01 | validation: reject STEAM/QAM+X/R1/L1, duplicates, >4 buttons, empty | unit | same | ❌ Wave 0 |
| CHORD-01 | like/pinned/lyrics action banners + rollback on failure | unit (index.test.tsx) | `pnpm vitest run src/index.test.tsx` | ✅ extend |
| CHORD-01 | backend sanitizer/save_setting for `silent_banner_enabled`, `gamepad_chord_bindings` (invalid → defaults) | unittest | `python -m unittest tests.test_settings` (confirm file name) | ❌ confirm |
| Both | On-device: no chime, no Valve chord collision | manual | — | manual-only (needs Steam Deck) |

### Sampling Rate
- Per task commit: quick commands above. Per wave: full suite. Phase gate: full suite + lint green.

### Wave 0 Gaps
- [ ] `src/chords.test.ts`, `src/components/SilentBanner.test.tsx`, backend settings test additions.

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | yes | Server-side validation of `gamepad_chord_bindings` (dict of known action ids → list of 1–4 ints in allowed range, dedupe); reject unknown keys; bool coercion for `silent_banner_enabled` |
| V2/V3/V4/V6 | no | — |

Threats: malformed/oversized settings JSON (Tampering) → bound sizes in sanitizer; banner text built from track names → render as React text (no `dangerouslySetInnerHTML`) to avoid XSS.

## Sources
- Primary (in-repo, read this session): `src/index.tsx` L1095-1290; `src/components/DeckifyOverlay.tsx` L1-110; `main.py` L750-830; `py_modules/common.py` L240-275; CONTEXT.md; REQUIREMENTS.md (grep TOAST-01/CHORD-01).
- Grep-only (not fully read): `src/types.ts` L225-233, common.py L103-111, main.py L607-610, L1044, L1268.
- No external web research performed; Steam button-index facts [ASSUMED].

## Metadata
**Confidence:** stack HIGH (no new deps); architecture MEDIUM-HIGH; pitfalls MEDIUM (device behavior unverified).
**Research date:** 2026-11-19 — **Valid until:** 30 days
