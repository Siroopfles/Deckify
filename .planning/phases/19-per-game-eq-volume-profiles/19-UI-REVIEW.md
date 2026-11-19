# Phase 19 — UI Review

**Audited:** 2026-11-19
**Baseline:** `19-UI-SPEC.md` (approved 2026-11-18)
**Screenshots:** not captured (no dev server on localhost:3000, 5173, or 8080 — code-only audit)

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | All primary CTAs, D-11 subtitles, and two-step delete copy match `19-UI-SPEC.md`, but empty-library fallback shows search-filter copy and delete failures reuse save error copy. |
| 2. Visuals | 3/4 | Strict `flow-children="horizontal"`, `<DeckifyImage>` CSP compliance, and ellipsis truncation are solid, but `InteractiveRow` drops `aria-label` on all 20 `+`/`-` EQ steppers and `role="slider"` lacks keyboard handling. |
| 3. Color | 3/4 | 60/30/10 surfaces and strict `#1DB954` Phase 19 scoping pass, but `#E53935` fails WCAG AA 4.5:1 at 12px (`4.22:1` / `3.90:1`) and leaks onto preview error text. |
| 4. Typography | 2/4 | `GameEqModal` passes, but `EqBandFaders` (`10px`/`11px`, `1.2` lh) and QAM `"GAME VOL"` pill (`10px`, `800`) break the `Label (12px, 700, 1.3)` contract, alongside `SettingsTab` multi-size/weight drift. |
| 5. Spacing | 3/4 | `1280x800` modal fit (`82vh`), `44px` action targets, and `48px` thumbnails hold, with minor `2px`/`6px`/`10px` off-grid padding/gap drift and a `32px` modal Close button. |
| 6. Experience Design | 3/4 | State coverage, live preview restoration, and two-step delete safety are thorough, but `GameEqModal` preview toasts render behind `showModal()` and configured/running game cards cannot be collapsed. |

**Overall: 17/24**

---

## Top 3 Priority Fixes

1. **Enforce `Label (12px, 700, 1.3)` in `EqBandFaders` and the QAM `"GAME VOL"` / `"DUCKED"` pill** — `10px`/`11px` dB readouts, `31`–`16k` labels, and `10px/800` QAM status badges reduce legibility on Steam Deck's 7-inch `1280x800` screen and diverge from the declared 4-size / 2-weight contract (`src/components/common/EqBandFaders.tsx:170-212`, `src/index.tsx:909-921`) — Update dB readout, frequency labels, `+`/`-` stepper text, and the QAM `"DUCKED"` / `"GAME VOL"` pill to `fontSize: 12, fontWeight: 700, lineHeight: 1.3` (and update `SoundtracksTab.tsx:299` D-11 subtitle to `fontWeight: 700`).
2. **Forward `aria-label` through `InteractiveRow` and make `role="slider"` keyboard-accessible** — All 20 `+`/`-` stepper buttons in `EqBandFaders` pass `aria-label` props that `InteractiveRow` silently drops when rendering `<Focusable>`, leaving screen-reader/DOM queries with bare `"+"`/`"-"` labels (`src/components/common/InteractiveRow.tsx:17-28, 97-154`, `src/components/common/EqBandFaders.tsx:78-102, 181-209`) — Add `"aria-label"?: string` to `InteractiveRowProps` and forward it onto `<Focusable>`, and add `tabIndex={0}` + `ArrowUp`/`ArrowDown` `onKeyDown` handlers on the `role="slider"` track (or bind `role="slider"` to a focusable wrapper).
3. **Separate empty-library vs empty-search copy, fix delete error toast, and route `GameEqModal` errors through `toaster.toast`** — Currently an empty game list displays search-filter instructions when no filter text is entered (`src/components/tabs/SoundtracksTab.tsx:183-194`), failed profile deletion toasts `"Failed to save game audio profile..."` (`src/components/tabs/SoundtracksTab.tsx:798, 809`), and `GameEqModal` preview errors call `DeckifyExpandedModal`'s internal `showToast` positioned behind `showModal()` (`src/components/tabs/SoundtracksTab.tsx:871`, `src/components/DeckifyExpandedModal.tsx:1330-1350`) — Branch `renderStatusBanner` on `gamesCount === 0` vs active search query, define a delete-specific `DELETE_ERROR_MESSAGE`, and pass `toaster.toast` (or keep inline alert primary) for `GameEqModal`.

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)

**Contract matches verified:**
- Primary & secondary CTAs match `19-UI-SPEC.md` verbatim: `"Edit Game EQ"` (`src/components/tabs/SoundtracksTab.tsx:456`), `"Save Game EQ"` (`src/components/tabs/GameEqModal.tsx:253`), `"Add Playlist / Album"` (`src/components/tabs/SoundtracksTab.tsx:366`), `"Copy from Preset"` (`src/components/tabs/GameEqModal.tsx:180`), `"Reset to Flat"` (`src/components/tabs/GameEqModal.tsx:218`), `"Discard Changes"` (`src/components/tabs/GameEqModal.tsx:240`), `"Clear Volume Override"` (`src/components/tabs/SoundtracksTab.tsx:538`), and `"Use Global Ducking"` (`src/components/tabs/SoundtracksTab.tsx:591`).
- Two-step destructive flow matches verbatim: `"Delete Game Profile"` (`SoundtracksTab.tsx:628`), `"Keep Profile"` (`SoundtracksTab.tsx:642`), `"Confirm Delete"` (`SoundtracksTab.tsx:661`), and success toast `"Game audio & soundtrack profile deleted"` (`SoundtracksTab.tsx:807`).
- D-11 subtitle builder (`src/components/tabs/soundtrackUtils.ts:179-208`) reproduces exact tokens (`"{N} linked soundtrack(s)"`, `"Audio profile only"`, `"No soundtrack or audio overrides configured"`, `"EQ: ..."`, `"Vol: ...%"`, `"Duck: Off"`, `"Duck: ...%"`).
- `SettingsTab.tsx:527, 541` (`"Active Game EQ Override: {app_name} ({presetLabel})"` + global baseline helper) and `src/index.tsx:920` (`"DUCKED"` / `"GAME VOL"`) match verbatim. Zero generic labels (`Submit`, `Click Here`, `OK`, `Cancel`, `Save`) appear in Phase 19 UI copy.

**Findings:**
- **WARNING — Empty game library shows search-filter recovery copy (`src/components/tabs/SoundtracksTab.tsx:175-196`):** `renderStatusBanner(loading, games.length, visibleGames.length)` displays `"No Steam or Non-Steam games matched your search. Clear the filter box above to browse all installed games."` whenever `!loading && visibleCount === 0`, even when `games.length === 0` and `searchQuery` is empty. Fix: when `gamesCount === 0`, render `"No installed Steam or Non-Steam games detected."` while preserving the search guidance when `gamesCount > 0 && visibleCount === 0`.
- **WARNING — Delete failure reuses save error message (`src/components/tabs/SoundtracksTab.tsx:64-65, 797-810`):** `handleDeleteProfile` displays `SAVE_ERROR_MESSAGE` (`"Failed to save game audio profile — verify Decky storage permissions and try again."`) on `!res?.ok` or catch. Fix: introduce `DELETE_ERROR_MESSAGE` (`"Failed to delete game audio profile — verify Decky storage permissions and try again."`).
- **WARNING — `GameEqModal` status caption assumes live preview already ran (`src/components/tabs/GameEqModal.tsx:165-168`):** When opening `GameEqModal` on an already-customized non-flat curve (`initialBands` != `0.0 dB`), `"Live PipeWire audio preview active"` renders immediately even though `backendPreviewEqBands` is not invoked until the first slider/preset interaction. Fix: either fire an initial `preview_eq_bands` sync on mount when non-flat or label initial state `"Custom curve loaded — adjust any fader or preset pill to preview live."`

### Pillar 2: Visuals (3/4)

**Contract matches verified:**
- Spatial navigation across all Phase 19 horizontal groups strictly uses `flow-children="horizontal"` with zero `flow-children="row"` instances (`EqBandFaders.tsx:220`, `GameEqModal.tsx:183, 228`, `SoundtracksTab.tsx:153, 316, 322, 380, 427, 472, 506, 556, 609, 635`, `SettingsTab.tsx:547`). (Pre-existing `flow-children="right"` at `src/index.tsx:801` was untouched in Phase 19.)
- Steam CEF CSP compliance is preserved in all Phase 19 surfaces: game covers (`48x48`, `SoundtracksTab.tsx:201`) and playlist chips (`22x22`, `SoundtracksTab.tsx:333`) route through `<DeckifyImage>` with `<FaGamepad>` / `<FaMusic>` fallbacks. (Pre-existing `<img ...>` tags in `src/index.tsx:755, 1239` were outside Phase 19 scope; line 1239 resolves via `fetchWithQueueAndCache`.)
- Focal hierarchy and truncation are cleanly implemented: running games pin to top with `#1DB954` tint/border + `"Running"` badge (`SoundtracksTab.tsx:705-706, 234-244`), long game titles (`SoundtracksTab.tsx:284-296`), modal titles (`GameEqModal.tsx:85-105`), and the `"Active Game EQ Override"` badge (`SettingsTab.tsx:511-528`) enforce `minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"` with `flexShrink: 0` siblings.

**Findings:**
- **WARNING — `InteractiveRow` drops `aria-label` on all 20 `+`/`-` EQ stepper buttons (`src/components/common/EqBandFaders.tsx:181-209`, `src/components/common/InteractiveRow.tsx:17-28, 97-154`):** `EqBandFaders.tsx` passes `aria-label={`Increase ${label}`}` and `aria-label={`Decrease ${label}`}`, which shallow JSX unit tests match on `<InteractiveRow>`, but `InteractiveRow` never reads or forwards `aria-label` onto its rendered `<Focusable>`. Fix: add `"aria-label"?: string` to `InteractiveRowProps` and pass it to `<Focusable>`.
- **WARNING — Non-focusable `role="slider"` track (`src/components/common/EqBandFaders.tsx:78-102`):** The `24px × 96px` slider track declares `role="slider"`, `aria-label`, `aria-valuemin={-12}`, `aria-valuemax={12}`, and `aria-valuenow={gain}`, but lacks `tabIndex` and `onKeyDown` (`ArrowUp`/`ArrowDown`), restricting input to pointer drag (while GamepadUI users rely on the adjacent `+`/`-` `InteractiveRow` steppers).
- **WARNING — Sub-44px secondary button targets (`src/components/tabs/GameEqModal.tsx:117-134`, `src/components/tabs/SoundtracksTab.tsx:338-349`):** `GameEqModal` header `Close` button specifies `minWidth: 32, minHeight: 32` and playlist chip remove `DialogButton` specifies `minWidth: 24, padding: "2px 6px"` without `minHeight` (versus `44px` guidance in `19-UI-SPEC.md`).
- **WARNING — Single wrapped `flow-children="horizontal"` bar for 8 seed pills (`src/components/tabs/GameEqModal.tsx:182-220`):** Placing 7 `InteractiveRow` pills plus `Reset to Flat` `DialogButton` inside one `flexWrap: "wrap"` `<Focusable flow-children="horizontal">` container is permitted by `19-UI-SPEC.md` line 151, but splitting into two explicit `flow-children="horizontal"` rows (matching `SettingsTab.tsx:22-34, 544-578`) avoids D-pad horizontal-vs-vertical focus jumps when wrapping inside the `520px+` modal.

### Pillar 3: Color (3/4)

**Color distribution & accent usage:**
- Dominant `#121212` surface background (`DeckifyExpandedModal.tsx:976`, `GameEqModal.tsx:407`) and secondary dark surfaces (`rgba(255,255,255,0.04)`–`rgba(255,255,255,0.08)`, `rgba(0,0,0,0.22)` recessed EQ well in `EqBandFaders.tsx:226`) maintain the 60/30 dark surface hierarchy.
- Phase 19 components scope `#1DB954` tightly to declared roles: `EqBandFaders.tsx` (`3x` `#1db954` + `1x` `rgba(29,185,84,0.45)`), `GameEqModal.tsx` (`3x` `#1DB954`), `SoundtracksTab.tsx` (`3x` `#1DB954`/`#1db954` + `2x` running card tint/border `rgba(29,185,84,0.08/0.35)` + `1x` Running badge `rgba(29,185,84,0.2)`), `SettingsTab.tsx` override badge (`rgba(29,185,84,0.16)`, `#1DB954`), and `src/index.tsx` `"DUCKED"`/`"GAME VOL"` pill (`#1db954` bg, `#000` text, `8.1:1` contrast). (Pre-existing `SettingsTab.tsx` contains `41` `#1db954` and `15` `#888` occurrences across older sections.)

**Findings:**
- **WARNING — Destructive `#E53935` buttons fail WCAG AA `4.5:1` contrast at `12px` (`src/components/tabs/SoundtracksTab.tsx:614-662`):** `#fff` text on `#E53935` (`Confirm Delete`, `12px` bold) yields `4.22:1`, and `#E53935` text on `#1E1E1E` / `rgba(255,255,255,0.04)` (`Delete Game Profile`, `12px` bold) yields `~3.90:1` — both below the `4.5:1` WCAG AA minimum for small text. Fix: darken destructive fill to `#C62828` (`5.62:1` with `#fff`) and lighten outline destructive text on dark cards to `#FF6B6B` (`~5.8:1` on `#1E1E1E`).
- **WARNING — Destructive `#E53935` used outside delete confirmation & unconditional thumb glow (`src/components/tabs/GameEqModal.tsx:148`, `src/components/common/EqBandFaders.tsx:140`):** `19-UI-SPEC.md` line 78 restricts `#E53935` to `Delete Game Profile` / `Confirm Delete` only, yet `GameEqModal.tsx:148` applies `#E53935` to the PipeWire preview alert text, and `EqBandFaders.tsx:140` applies `boxShadow: "0 0 6px rgba(29,185,84,0.45)"` to all thumbs even when `gain === 0` (`Flat`). Also `GameEqModal.tsx:101` uses `#1DB954` on the modal header `FaSlidersH` icon (consistent with `SettingsTab`, though omitted from spec lines 80-85) and hex casing alternates between `#1DB954` and `#1db954`.

### Pillar 4: Typography (2/4)

**Size & weight inventory across audited files:**
- `GameEqModal.tsx`: sizes `12 (7x), 14 (2x), 16 (1x)`; weights `400 (2x), 700 (8x)`; line-heights `1.2 (1x), 1.3 (4x), 1.5 (2x)` — **100% compliant** with `19-UI-SPEC.md`.
- `SoundtracksTab.tsx`: sizes `12 (12x), 14 (3x), 16 (2x), 20 (1x)`; weights `400 (3x), 700 (13x)`; line-heights `1.2 (3x), 1.3 (3x), 1.5 (3x)`.
- `EqBandFaders.tsx`: sizes `10 (2x), 11 (2x)`; weights `700 (4x)`; line-heights `1.2 (2x)`.
- `SettingsTab.tsx`: sizes `11 (15x), 12 (44x), 13 (14x), 14 (16x), 20 (1x)`; weights `400 (1x), 600 (17x), 700 (54x), 800 (1x)`.
- `src/index.tsx`: sizes `9 (1x), 10 (1x), 11 (3x), 12 (5x), 13 (1x)`; weights `600 (1x), 700 (4x), 800 (1x)`.

**Findings:**
- **WARNING — `EqBandFaders.tsx` violates declared `Label` size and line-height (`src/components/common/EqBandFaders.tsx:172, 176, 189, 204, 210`):** Renders dB readouts (`tabular-nums`) and `31`–`16k` frequency labels at **`fontSize: 10, lineHeight: 1.2`**, and `+`/`-` stepper glyphs at **`fontSize: 11`**, violating `19-UI-SPEC.md` line 67 which specifies `Label` (**`12px, 700, lineHeight: 1.3`**) for EQ band dB values and frequency labels (`31`–`16k`).
- **WARNING — QAM `"DUCKED"` / `"GAME VOL"` pill uses undeclared `10px / 800` (`src/index.tsx:913-914`):** Instead of `Label` (`12px, 700`), the volume override pill retains legacy `fontSize: 10, fontWeight: 800`, violating both the 4-size floor (`12px`) and the 2-weight (`400`/`700`) rule.
- **WARNING — `SoundtracksTab.tsx` D-11 subtitle uses `400` instead of `700` (`src/components/tabs/SoundtracksTab.tsx:299`):** `formatGameProfileSubtitle(profile)` renders at `fontSize: 12, fontWeight: 400, lineHeight: 1.3`, whereas `19-UI-SPEC.md` line 67 maps D-11 subtitle summaries to `Label` (`12px, 700`).
- **WARNING — `SettingsTab.tsx` retains 5 sizes (`11..20`) and 4 weights (`400..800`) (`src/components/tabs/SettingsTab.tsx:253, 497`):** Page `h2` (`Settings & Engine Features`) uses `fontWeight: 800` without `lineHeight: 1.2` (vs `Display 20px, 700, 1.2`), and card `h3` (`Equalizer & Audio Presets`) uses `fontSize: 14` (vs `Heading 16px`).

### Pillar 5: Spacing (3/4)

**Scale compliance & `1280x800` geometry:**
- `44px` minimum focus/touch target height is applied consistently across all Phase 19 primary/secondary action buttons (`GameEqModal.tsx:192, 207, 234, 245`; `SoundtracksTab.tsx:359, 445, 531, 584, 616, 640, 648`), `20px` exception is applied to `EqBandFaders` `+`/`-` steppers (`EqBandFaders.tsx:188, 203`), `48px × 48px` is applied to game thumbnails (`SoundtracksTab.tsx:203-204, 213-214`), `16px`/`24px` are used on tab/modal outer wrappers (`GameEqModal.tsx:402`, `SoundtracksTab.tsx:178, 185, 983`), and `GameEqModal` fits within `82vh` (`~503–524px < 656px` on `800px` height) with `flex: 1, minWidth: 0, gap: 4` distributing all 10 bands horizontally.

**Findings:**
- **WARNING — Off-grid `2px` / `6px` / `10px` padding and gap tokens in Phase 19 components:**
  - `EqBandFaders.tsx:224`: `padding: "10px 6px"` (expected `8px` or `12px 8px`) and lines `187, 202`: `padding: "2px 0"`.
  - `GameEqModal.tsx:411`: `gap: 12` on modal body (`12px` exception was scoped to `SoundtracksTab` game cards, while modal section spacing specifies `md = 16px`), plus `gap: 6` (line 214) and `padding: "6px 12px"` (lines 193, 208).
  - `SoundtracksTab.tsx`: `padding: "4px 10px"` (line 160), `gap: 10` (lines 279, 987), `gap: 6` (lines 326, 358, 451, 624, 657), `padding: "6px 10px"` (lines 532, 585), and `marginTop: 2` (line 300).
  - `SettingsTab.tsx:521`: `"Active Game EQ Override"` badge uses `padding: "2px 8px"` vs declared `xs = 4px` badge padding, and header uses `marginBottom: 6` / `10` (line 492).
- **WARNING — Modal `Close` (`32px`) and chip remove (`24px` width) fall below `44px` touch guidance (`GameEqModal.tsx:121-122`, `SoundtracksTab.tsx:342-343`)**; also pre-existing `DeckifyExpandedModal.tsx:1041` uses `padding: "20px 28px"`.

### Pillar 6: Experience Design (3/4)

**State & interaction coverage verified:**
- Loading (`"Scanning installed Steam & Non-Steam games..."` in `SoundtracksTab.tsx:178-180`; optimistic local state in `GameEqModal` during 75ms `pw-cli` coalescing), empty/neutral (`Flat Curve (0.0 dB)` caption, `No Game Profiles Configured`), partial (`Audio profile only`, disabled `Ducking Attenuation Override` when `ducking_override === false`, hidden clear buttons when `null`), populated, long-text truncation, immediate running-game save flush (`SoundtracksTab.tsx:436, 489, 522, 573`), `isRunningGame`-aware `clear_eq_preview` on Discard/Cancel/unmount/Save (`GameEqModal.tsx:300-351`), trigger navigation suppression (`DeckifyExpandedModal.tsx:751, 1236`), and two-step destructive profile confirmation (`SoundtracksTab.tsx:598-665`) are all implemented and covered by unit tests.

**Findings:**
- **WARNING — `GameEqModal` error toasts render behind `showModal()` (`src/components/tabs/SoundtracksTab.tsx:871`, `src/components/tabs/GameEqModal.tsx:269, 274`, `src/components/DeckifyExpandedModal.tsx:1330-1350`):** `SoundtracksTab` passes `DeckifyExpandedModal`'s internal `showToast` (`position: "absolute"`, `zIndex: 200` inside `DeckifyExpandedModal`) into `GameEqModal`, which mounts in Decky's higher `showModal()` layer. Inline `role="alert"` (`GameEqModal.tsx:140-154`) ensures the error remains visible inside the modal, while the toast is obscured behind the modal backdrop. Fix: pass `@decky/api` `toaster.toast` for modal-level toasts.
- **WARNING — Configured/running game cards cannot be collapsed (`src/components/tabs/SoundtracksTab.tsx:992`):** `const isExpanded = expandedAppId === game.app_id || Boolean(existingProfile) || isRunning;` overrides `onToggleExpand` whenever a game has a saved profile or is running. With Phase 19 adding EQ, Edit Game EQ, Ducking Attenuation, and Delete rows, users with multiple configured games cannot collapse cards to browse or reduce scrolling.
- **WARNING — Unthrottled `settings.json` writes when dragging running-game sliders (`src/components/tabs/SoundtracksTab.tsx:521-523, 572-574`):** Because `persistProfile(..., isRunning)` bypasses `SAVE_DEBOUNCE_MS`, every `onChange` step while dragging `Volume Override` or `Ducking Attenuation Override` immediately invokes `save_game_soundtrack_profile` (writing `settings.json` on disk). Fix: add a short `75–100ms` trailing coalesce on slider saves for running games while keeping discrete dropdown/toggle/modal commits immediate.
- **WARNING — External unmount of `GameEqModal` leaves `onClose` trigger suppression active (`src/components/tabs/GameEqModal.tsx:299-307`):** Unmount cleanup clears PipeWire preview via `backendClearEqPreview()`, but does not call `onClose?.()`, so if Steam closes the modal without `handleDiscard`/`handleSave`, `DeckifyExpandedModal`'s `playlistPickerOpen` remains `true` until tab switch or `SoundtracksTab` unmount.
- **WARNING — Silent fallback on `get_installed_games` RPC failure (`src/components/tabs/SoundtracksTab.tsx:911-922`):** `.catch(() => [])` merges RPC failure with empty library state instead of surfacing a retry/error banner.

---

## Files Audited

- `src/components/common/EqBandFaders.tsx`
- `src/components/common/InteractiveRow.tsx` (cross-checked `aria-label` forwarding)
- `src/components/tabs/GameEqModal.tsx`
- `src/components/tabs/SettingsTab.tsx`
- `src/components/tabs/SoundtracksTab.tsx`
- `src/components/tabs/soundtrackUtils.ts`
- `src/components/DeckifyExpandedModal.tsx`
- `src/index.tsx`
- `src/types.ts`
