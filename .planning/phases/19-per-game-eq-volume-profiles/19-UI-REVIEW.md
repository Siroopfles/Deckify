# Phase 19 — UI Review

**Audited:** 2026-11-19 (Post-`19-05` Gap-Closure Re-Audit)
**Baseline:** `19-UI-SPEC.md` (approved 2026-11-18) & `19-CONTEXT.md`
**Screenshots:** not captured (no dev server on localhost:3000, 5173, or 8080 — code-only audit)

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | CTAs, explicit `ToggleField` copy, D-11 subtitles, and `SettingsTab` override banner match `19-UI-SPEC.md`/`19-CONTEXT.md`, but empty-library fallback shows search-filter copy and delete failures reuse save error copy. |
| 2. Visuals | 3/4 | `19-05` resolved `ToggleField`/slider stacking, `width: "auto"` `DialogButton`s, `MAINTAIN_X` alignment, body focus, `aria-label` forwarding, and full-width `SettingsTab` banner truncation; `role="slider"` still lacks keyboard handling and `Close`/chip-remove targets fall below `44px`. |
| 3. Color | 3/4 | `GameEqModal` now inherits native `<ModalRoot>` chrome and `19-UI-SPEC.md` `#1DB954` scoping holds, but `#E53935` fails WCAG AA `4.5:1` at `12px`/`14px` (`3.58:1`–`4.43:1`) and leaks onto preview error text. |
| 4. Typography | 2/4 | `19-05` left typography unchanged: `EqBandFaders` (`10px`/`11px`, `1.2` lh) and QAM `"DUCKED"` / `"GAME VOL"` pill (`10px`, `800`) violate `Label (12px, 700, 1.3)`, alongside `SoundtracksTab` D-11 subtitle `400` weight and `SettingsTab` legacy size/weight drift. |
| 5. Spacing | 3/4 | `SoundtracksTab` `ToggleField`/`SliderField` rows (`gap: 4`), `1280x800` `overflowX: "hidden"` modal bounds, `44px` buttons, and `48px` thumbnails hold, but `GameEqModal` shifted outer `padding` to `12px` (vs `md = 16px`) alongside off-grid `2px`/`6px`/`10px` values. |
| 6. Experience Design | 3/4 | `19-05` fixed collapsible cards, explicit volume/ducking toggles, D-pad `MAINTAIN_X`/body focus, and `app_name` self-healing, while `GameEqModal` error toasts remain behind `showModal()` and running-game slider drags flush unthrottled disk writes. |

**Overall: 17/24**

---

## Top 3 Priority Fixes

1. **Enforce `Label (12px, 700, 1.3)` in `EqBandFaders`, QAM `"DUCKED"` / `"GAME VOL"` pill, and D-11 subtitles** — `10px`/`11px` dB readouts, `31`–`16k` labels, and `10px/800` QAM status badges reduce legibility on Steam Deck's 7-inch `1280x800` screen and violate the declared 4-size (`12/14/16/20`) / 2-weight (`400/700`) contract (`src/components/common/EqBandFaders.tsx:172, 176, 189, 204, 210`, `src/index.tsx:919-920`, `src/components/tabs/SoundtracksTab.tsx:324`) — Update EQ dB readouts, frequency labels, stepper glyphs, and the QAM `"DUCKED"` / `"GAME VOL"` pill to `fontSize: 12, fontWeight: 700, lineHeight: 1.3`, and update `SoundtracksTab.tsx:324` D-11 subtitle to `fontWeight: 700`.
2. **Fix `#E53935` WCAG AA contrast failure (`<4.5:1`), remove `#E53935` from preview alerts, and route `GameEqModal` errors & unmount cleanup cleanly** — `#fff` on `#E53935` (`4.23:1`), `#E53935` on `#1E1E1E` (`3.94:1`), and `#E53935` on `GameEqModal` preview `role="alert"` (`3.58:1`–`4.43:1`) fail WCAG AA normal-text contrast, while `GameEqModal` preview error toasts call `DeckifyExpandedModal`'s `zIndex: 200` toast behind `showModal()` and external unmount skips `onClose?.()` (`src/components/tabs/SoundtracksTab.tsx:644, 684-685, 960`, `src/components/tabs/GameEqModal.tsx:171, 323, 328, 388-396`) — Darken destructive fill to `#C62828` (`5.62:1` with `#fff`), lighten dark-surface outline/alert text to `#FF6B6B` / semantic warning amber, use `toaster.toast` for `GameEqModal`, and invoke `onClose?.()` in unmount cleanup.
3. **Branch empty-library vs empty-search copy, add `DELETE_ERROR_MESSAGE`, coalesce running-game slider saves, and add keyboard support to `role="slider"`** — Empty game libraries display search-filter instructions (`src/components/tabs/SoundtracksTab.tsx:208-219`), failed deletes reuse `SAVE_ERROR_MESSAGE` (`src/components/tabs/SoundtracksTab.tsx:871, 883`), running-game slider drags fire immediate disk writes on every step (`src/components/tabs/SoundtracksTab.tsx:560-562, 612-614, 853-860`), and `role="slider"` tracks lack `tabIndex` / `ArrowUp`/`ArrowDown` handlers (`src/components/common/EqBandFaders.tsx:78-102`) — Split `renderStatusBanner` on `gamesCount === 0`, define `DELETE_ERROR_MESSAGE`, add a `75–100ms` trailing coalesce for running-game slider saves, and bind `tabIndex={0}` + `onKeyDown` on `role="slider"` (or keep focus solely on the accessible `+`/`-` `InteractiveRow` controls).

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)

**Contract matches & `19-05` additions verified:**
- Primary & secondary CTAs match `19-UI-SPEC.md` verbatim: `"Edit Game EQ"` (`src/components/tabs/SoundtracksTab.tsx:486`), `"Save Game EQ"` (`src/components/tabs/GameEqModal.tsx:307`), `"Add Playlist / Album"` (`src/components/tabs/SoundtracksTab.tsx:395`), `"Copy from Preset"` (`src/components/tabs/GameEqModal.tsx:255`), `"Reset to Flat"` (`src/components/tabs/GameEqModal.tsx:222`), and `"Discard Changes"` (`src/components/tabs/GameEqModal.tsx:291`).
- `19-05` replaced inline `"Clear Volume Override"` / `"Use Global Ducking"` buttons with explicit `ToggleField` labels and live descriptions: `"Volume Override"` (`"Capped at ${profile.volume_override}% relative to global volume"` / `"Disabled — using global volume"` at `SoundtracksTab.tsx:541-546`) and `"Custom Ducking Level"` (`"Game ducking disabled above"` / `"Duck by ${profile.ducking_level_override}% during gameplay"` / `"Using global ducking (${fallbackDucking}%)"` at `SoundtracksTab.tsx:580-592`).
- Two-step destructive flow matches verbatim: `"Delete Game Profile"` (`SoundtracksTab.tsx:652`), `"Keep Profile"` (`SoundtracksTab.tsx:673`), `"Confirm Delete"` (`SoundtracksTab.tsx:693`), and toast `"Game audio & soundtrack profile deleted"` (`SoundtracksTab.tsx:881`).
- D-11 subtitle builder (`src/components/tabs/soundtrackUtils.ts:179-208`) reproduces exact tokens (`"{N} linked soundtrack(s)"`, `"Audio profile only"`, `"No soundtrack or audio overrides configured"`, `"EQ: ..."`, `"Vol: ...%"`, `"Duck: Off"`, `"Duck: ...%"`).
- `SettingsTab.tsx:536-556` (`"Active Game EQ Override: {app_name} ({presetLabel})"` + `"Edits below update your global baseline and apply automatically after {app_name || 'the active game'} exits."`) and `src/index.tsx:926` (`"DUCKED"` / `"GAME VOL"`) match verbatim. Zero generic labels (`Submit`, `Click Here`, `OK`, `Cancel`, `Save`) appear in Phase 19 UI copy.

**Findings:**
- **WARNING — Empty game library displays search-filter recovery copy (`src/components/tabs/SoundtracksTab.tsx:200-221`):** `renderStatusBanner(loading, games.length, visibleGames.length)` displays `"No Steam or Non-Steam games matched your search. Clear the filter box above to browse all installed games."` whenever `!loading && visibleCount === 0`, even when `games.length === 0` and `searchQuery` is empty. Fix: when `gamesCount === 0`, render `"No installed Steam or Non-Steam games detected."` while keeping the search guidance when `gamesCount > 0 && visibleCount === 0`.
- **WARNING — Delete failure reuses `SAVE_ERROR_MESSAGE` (`src/components/tabs/SoundtracksTab.tsx:64-65, 869-884`):** `handleDeleteProfile` displays `"Failed to save game audio profile — verify Decky storage permissions and try again."` when `backendDeleteProfile` fails (`!res?.ok` or catch). Fix: introduce `DELETE_ERROR_MESSAGE` (`"Failed to delete game audio profile — verify Decky storage permissions and try again."`).
- **WARNING — `GameEqModal` non-flat initial caption assumes live preview already ran (`src/components/tabs/GameEqModal.tsx:188-191`):** When opening `GameEqModal` on an existing non-flat custom curve (`isAllFlat === false`), `"Live PipeWire audio preview active"` renders on mount even though `backendPreviewEqBands` is not invoked until the first fader or preset interaction. Fix: either trigger an initial `preview_eq_bands` sync on mount when non-flat or label initial state `"Custom curve loaded — adjust any fader or preset pill to preview live."`
- **WARNING — `19-UI-SPEC.md` copy contract not synced with `19-05` toggle replacement (`19-UI-SPEC.md:94, 137, 140`):** `19-UI-SPEC.md` still enumerates `"Clear Volume Override"` and `"Use Global Ducking"` buttons that `19-05` intentionally replaced with `"Volume Override"` and `"Custom Ducking Level"` `ToggleField`s (`SoundtracksTab.tsx:541, 591`).

### Pillar 2: Visuals (3/4)

**Contract matches & `19-05` fixes verified:**
- **Explicit `ToggleField` + dedicated-row `SliderField`s (`SoundtracksTab.tsx:527-619`):** `renderVolumeOverrideRow` and `renderDuckingOverrideRow` render full-width `ToggleField`s above conditional full-width `SliderField`s inside `<Focusable flow-children="column">`, removing inline reset buttons that previously squeezed sliders into vertical letter-stacking.
- **Auto-width compact/inline `DialogButton`s (`SoundtracksTab.tsx:367, 383, 473, 638, 665, 678`; `GameEqModal.tsx:143, 207, 282, 296`):** Every inline/modal `DialogButton` now declares `width: "auto"` to override SteamOS `.DialogButton { width: 100% }` collapse.
- **`GameEqModal` layout, `MAINTAIN_X` alignment, and body initial focus (`GameEqModal.tsx:37-50, 95-158, 257-310, 454-469, 505-530`; `EqBandFaders.tsx:219-222`):** Header wraps in `<Focusable flow-children="horizontal">` with `width: "auto"` / no `flexShrink: 0` on `Close`; `overflowX: "hidden"` and `maxWidth: "min(680px, 88vw)"` eliminate horizontal scroll; 7 seed presets + `Reset to Flat` split into two non-wrapping 4-item `Focusable` rows (`preferredFocus={rowIdx === 0 ? true : undefined}`) sharing `NavEntryPositionPreferences.MAINTAIN_X` with `EqBandFaders` and the footer buttons; `useBodyInitialFocus` moves initial DOM focus into the body via `requestAnimationFrame` instead of top-right `Close`.
- **`SettingsTab` dedicated full-width override banner row (`SettingsTab.tsx:486-552`) + `app_name` propagation (`src/index.tsx:424-430`, `SoundtracksTab.tsx:108-128`, `py_modules/soundtrack.py:194-219, 231-234, 359-362, 626-628`):** `data-testid="active-game-eq-override-badge"` sits on its own `width: "100%"` row beneath the header with `flexShrink: 0` on prefix/preset suffix spans and ellipsis truncation confined to the game name, backed by `Router.MainRunningApp?.display_name` and `vdf_parser.get_installed_games()` fallback.
- **`InteractiveRow` `aria-label` forwarding (`src/components/common/InteractiveRow.tsx:28, 109, 115`):** `InteractiveRow` now declares `"aria-label"?: string` and forwards `aria-label={ariaLabel}` onto `<Focusable>`, fixing the 20 `+`/`-` EQ stepper labels in `EqBandFaders.tsx:183, 198`.
- **Spatial navigation & CSP compliance:** All Phase 19 horizontal strips use `flow-children="horizontal"` (zero `flow-children="row"`), and all Phase 19 covers/icons route through `<DeckifyImage>` (`SoundtracksTab.tsx:226, 358`) with `<FaGamepad>` / `<FaMusic>` fallbacks. (Pre-existing `flow-children="right"` at `src/index.tsx:807` and raw `<img>` at `src/index.tsx:761` were untouched in Phase 19.)

**Findings:**
- **WARNING — Non-focusable `role="slider"` track (`src/components/common/EqBandFaders.tsx:78-102`):** The `24px × 96px` slider track declares `role="slider"`, `aria-label`, `aria-valuemin={-12}`, `aria-valuemax={12}`, and `aria-valuenow={gain}`, but lacks `tabIndex` and `onKeyDown` (`ArrowUp`/`ArrowDown`), restricting direct slider interaction to pointer drag (while GamepadUI users step via the adjacent `+`/`-` `InteractiveRow` controls).
- **WARNING — Sub-44px secondary button targets (`src/components/tabs/GameEqModal.tsx:145`, `src/components/tabs/SoundtracksTab.tsx:368-373`):** `GameEqModal` header `Close` button specifies `minHeight: 32` and playlist chip remove `DialogButton` specifies `minWidth: 24, padding: "2px 6px"` without `minHeight` (below `44px` target guidance in `19-UI-SPEC.md:46`).
- **WARNING — Unbounded playlist chip label width (`src/components/tabs/SoundtracksTab.tsx:345-377`):** Playlist chip text (`line 362`) omits `minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"`, so long playlist/album names can expand chips disproportionately relative to sibling chips and the remove button.
- **WARNING — `GameEqModal` surface & `minWidth` divergence from `19-UI-SPEC.md` (`19-UI-SPEC.md:147` vs `GameEqModal.tsx:508-520`):** `19-05` intentionally removed `minWidth: 520` and `background: "#121212"` in favor of `width: "100%", maxWidth: "min(680px, 88vw)"` and native `<ModalRoot>` surface inheritance (and requires physical Steam Deck `1280x800` `FocusNavController` re-verification).

### Pillar 3: Color (3/4)

**Color distribution & accent usage:**
- `GameEqModal.tsx:505-520` now inherits native `<ModalRoot>` dark dialog chrome (eliminating the `#121212` surface mismatch reported in UAT `G-19-2`), while `DeckifyExpandedModal.tsx:976` maintains `#121212` and secondary surfaces use `rgba(255,255,255,0.04)`–`rgba(255,255,255,0.1)` and `rgba(0,0,0,0.22)` (`EqBandFaders.tsx:227`).
- `#1DB954` scoping across Phase 19 components remains tight: `EqBandFaders.tsx` (`3x` `#1db954`, `1x` `rgba(29,185,84,0.45)`), `GameEqModal.tsx` (`3x` `#1DB954`), `SoundtracksTab.tsx` (`3x` `#1DB954`/`#1db954` + `2x` running card tint/border `rgba(29,185,84,0.08/0.35)` + `1x` Running badge `rgba(29,185,84,0.2)`), `SettingsTab.tsx:529-530` override banner (`rgba(29, 185, 84, 0.16)`, `#1DB954` yielding `4.98:1` over `#1E1E1E`), and `src/index.tsx:917-918` `"DUCKED"`/`"GAME VOL"` pill (`#1db954` bg, `#000` text, `8.12:1`). (Pre-existing `SettingsTab.tsx` contains `40` `#1db954` and `15` `#888` occurrences across older sections.)

**Findings:**
- **WARNING — Destructive `#E53935` fails WCAG AA `4.5:1` contrast at `12px`/`14px` (`src/components/tabs/SoundtracksTab.tsx:644, 684-686`, `src/components/tabs/GameEqModal.tsx:171`):** `#fff` on `#E53935` (`Confirm Delete`, `12px` bold) yields **`4.23:1`**, `#E53935` text on `#1E1E1E` (`Delete Game Profile`, `12px` bold) yields **`3.94:1`**, and `#E53935` on `#121212` / SteamOS ModalRoot `#23262e` (`GameEqModal.tsx:171` `role="alert"`, `14px` regular) yields **`4.43:1` / `3.58:1`** — all below the `4.5:1` WCAG AA normal-text threshold. Fix: darken destructive fill to `#C62828` (`5.62:1` with `#fff`) and lighten dark-surface destructive/alert text to `#FF6B6B`.
- **WARNING — Destructive `#E53935` used outside delete confirmation & unconditional thumb glow (`src/components/tabs/GameEqModal.tsx:171`, `src/components/common/EqBandFaders.tsx:140`):** `19-UI-SPEC.md:78` restricts `#E53935` strictly to `Delete Game Profile` / `Confirm Delete`, yet `GameEqModal.tsx:171` still applies `#E53935` to the PipeWire preview alert text, and `EqBandFaders.tsx:140` applies `boxShadow: "0 0 6px rgba(29,185,84,0.45)"` to all thumbs even when `gain === 0` (`Flat`). Also `GameEqModal.tsx:122` (`FaSlidersH color="#1DB954"`) and `SoundtracksTab.tsx:360` (`FaMusic color="#1db954"`) apply accent green to icons omitted from `19-UI-SPEC.md:80-85`, and hex casing alternates between `#1DB954` and `#1db954`.

### Pillar 4: Typography (2/4)

**Size & weight inventory across audited files (`19-05` made zero typography changes):**
- `GameEqModal.tsx`: sizes `12 (7x), 14 (2x), 16 (1x)`; weights `400 (2x), 700 (8x)`; line-heights `1.2 (1x), 1.3 (4x), 1.5 (2x)`.
- `SoundtracksTab.tsx`: sizes `12 (10x), 14 (3x), 16 (2x), 20 (1x)`; weights `400 (3x), 700 (11x)`; line-heights `1.2 (3x), 1.3 (3x), 1.5 (3x)`.
- `EqBandFaders.tsx`: sizes `10 (2x), 11 (2x)`; weights `700 (4x)`; line-heights `1.2 (2x)`.
- `SettingsTab.tsx`: sizes `11 (15x), 12 (44x), 13 (14x), 14 (16x), 20 (1x)`; weights `400 (1x), 600 (17x), 700 (54x), 800 (1x)`; Phase 19 override banner (`531-533`) uses `12 / 700 / 1.3` and global caption (`554`) uses `14 / 400 / 1.5` (compliant).
- `src/index.tsx`: sizes `9 (1x), 10 (1x), 11 (3x), 12 (5x), 13 (1x)`; weights `600 (1x), 700 (4x), 800 (1x)`.

**Findings:**
- **WARNING — `EqBandFaders.tsx` violates declared `Label` size and line-height (`src/components/common/EqBandFaders.tsx:172, 176, 189, 204, 210`):** Renders dB readouts (`tabular-nums`) and `31`–`16k` frequency labels at **`fontSize: 10, lineHeight: 1.2`**, and `+`/`-` stepper glyphs at **`fontSize: 11`**, breaching `19-UI-SPEC.md:67` (`Label: 12px, 700, lineHeight: 1.3`).
- **WARNING — QAM `"DUCKED"` / `"GAME VOL"` pill uses undeclared `10px / 800` (`src/index.tsx:919-920`):** Retains `fontSize: 10, fontWeight: 800` without `lineHeight: 1.3`, violating both the `12px` `Label` size floor and the 2-weight (`400`/`700`) rule in `19-UI-SPEC.md:61, 67`.
- **WARNING — `SoundtracksTab.tsx` D-11 subtitle uses `400` instead of `700` (`src/components/tabs/SoundtracksTab.tsx:324`):** `formatGameProfileSubtitle(profile)` renders at `fontSize: 12, fontWeight: 400, lineHeight: 1.3`, whereas `19-UI-SPEC.md:67` maps D-11 subtitle summaries to `Label` (`12px, 700, 1.3`).
- **WARNING — `SettingsTab.tsx` retains 5 sizes (`11..20`) and 4 weights (`400..800`) (`src/components/tabs/SettingsTab.tsx:253, 497`):** Page `h2` uses `fontWeight: 800` without `lineHeight: 1.2` (vs `Display 20px, 700, 1.2`) and card `h3` (`Equalizer & Audio Presets`) uses `fontSize: 14` (vs `Heading 16px`).

### Pillar 5: Spacing (3/4)

**Scale compliance & `1280x800` geometry:**
- `SoundtracksTab.tsx` `ToggleField`/`SliderField` vertical stacks (`538, 588`) use `gap: 4` (`xs`), `44px` minimum target height holds across primary/secondary actions (`SoundtracksTab.tsx:388, 475, 640, 667, 680`; `GameEqModal.tsx:210, 234, 285, 299`), `20px` exception applies to `+`/`-` steppers (`EqBandFaders.tsx:188, 203`), `48px × 48px` applies to game thumbnails (`SoundtracksTab.tsx:228-229, 238-239`), and `GameEqModal` bounds (`maxWidth: "min(680px, 88vw)"`, `maxHeight: "82vh"`, `overflowX: "hidden"`, `overflowY: "auto"`) fit `1280x800` without horizontal overflow.

**Findings:**
- **WARNING — `GameEqModal.tsx` shifted modal container padding & section gap to `12px` (`GameEqModal.tsx:515, 519, 523`):** `19-UI-SPEC.md:39` assigns `md = 16px` to `GameEqModal` container padding and modal section spacing (scoping the `12px` exception in line 48 solely to `SoundtracksTab.tsx` game cards), yet `19-05` set `padding: 12` and `gap: 12` on the modal container and body.
- **WARNING — Off-grid `2px` / `6px` / `10px` padding, gap, and margin values remain across Phase 19 files:**
  - `GameEqModal.tsx`: `padding: "4px 10px"` (`146`), `padding: "6px 8px"` (`211, 235`), `gap: 6` (`218, 253`).
  - `EqBandFaders.tsx`: `padding: "10px 6px"` (`225`), `padding: "2px 0"` (`187, 202`).
  - `SoundtracksTab.tsx`: `padding: "4px 10px"` (`185`), `padding: "2px 6px"` (`264, 281, 370`), `padding: "4px 6px"` (`304`), `padding: "6px 12px"` (`389, 641, 668, 681`), `gap: 10` (`304, 1102`), `gap: 6` (`351, 387, 481, 648, 689`), `marginTop: 2` (`324`).
  - `SettingsTab.tsx`: `marginBottom: 6 / 10` (`492, 526, 554`), `padding: "4px 10px"` (`527`), plus pre-existing `padding: 14, marginBottom: 20` on cards.
- **WARNING — Sub-44px `Close` (`minHeight: 32`, `GameEqModal.tsx:145`) and chip remove (`minWidth: 24`, `SoundtracksTab.tsx:368`) targets** fall below `44px` touch guidance; also pre-existing `DeckifyExpandedModal.tsx:1041` uses `padding: "20px 28px"`.

### Pillar 6: Experience Design (3/4)

**State & interaction coverage verified (including `19-05` fixes):**
- **Collapsible configured/running game cards (`SoundtracksTab.tsx:1042-1067, 1109-1110, 1160`):** `collapsedAppIds` (`useState` slot 6) + `toggleGameCardExpand` allow collapsing configured or running game cards while preserving `useState` slots `0..5`.
- **Explicit volume & ducking override toggles (`SoundtracksTab.tsx:527-619`):** `"Volume Override"` and `"Custom Ducking Level"` `ToggleField`s gate conditional `SliderField`s cleanly, disabling `"Custom Ducking Level"` when `ducking_override === false`.
- **Empty `app_name` backfill & self-healing (`src/index.tsx:424-430`, `SoundtracksTab.tsx:108-128, 937, 963, 1105-1107`, `py_modules/soundtrack.py:194-219, 231-234, 359-362, 626-628`):** QAM forwards `Router.MainRunningApp?.display_name`, `SoundtracksTab` backfills from `game.name`, and `SoundtrackManager._resolve_app_name` repairs empty `app_name` records via `vdf_parser.get_installed_games()`.
- Loading, neutral/empty, immediate running-game save flush, `isRunningGame`-aware `clear_eq_preview`, trigger suppression, and two-step delete confirmation remain covered.

**Findings:**
- **WARNING — `GameEqModal` error toasts render behind `showModal()` (`src/components/tabs/SoundtracksTab.tsx:960`, `src/components/tabs/GameEqModal.tsx:323, 328`, `src/components/DeckifyExpandedModal.tsx:1330-1350`):** `SoundtracksTab` passes `DeckifyExpandedModal`'s internal `showToast` (`position: "absolute"`, `zIndex: 200` inside `DeckifyExpandedModal`) into `GameEqModal`, which mounts in Decky's higher `showModal()` layer. Inline `role="alert"` (`GameEqModal.tsx:164-176`) remains visible inside the modal, while the toast renders behind the backdrop. Fix: pass `@decky/api` `toaster.toast` for modal-level notifications.
- **WARNING — Unthrottled `settings.json` writes when dragging running-game sliders (`src/components/tabs/SoundtracksTab.tsx:560-562, 612-614, 853-860`):** `onPersist(..., isRunning)` calls `saveImmediate` on every slider `onChange` tick while a game is running, writing `settings.json` on each `5%` step. Fix: apply a short `75–100ms` trailing coalesce for running-game slider changes while keeping toggles, dropdowns, and modal saves immediate.
- **WARNING — External unmount of `GameEqModal` leaves trigger suppression active (`src/components/tabs/GameEqModal.tsx:388-396`, `src/components/tabs/SoundtracksTab.tsx:961`):** Unmount cleanup clears PipeWire preview (`backendClearEqPreview()`) without calling `onClose?.()`, leaving `DeckifyExpandedModal`'s `playlistPickerOpen` true if SteamOS dismisses the modal outside `handleDiscard`/`handleSave`.
- **WARNING — Silent fallback on `get_installed_games` RPC failure (`src/components/tabs/SoundtracksTab.tsx:1012`):** `.catch(() => [])` conflates RPC failure with an empty game library instead of showing an error/retry banner.
- **WARNING — Single-frame DOM focus handoff in `GameEqModal` (`src/components/tabs/GameEqModal.tsx:454-469`):** `useBodyInitialFocus` relies on a single `requestAnimationFrame` query for `[tabindex="0"]` alongside `preferredFocus={rowIdx === 0 ? true : undefined}` (`line 261`); requires live Steam Deck `1280x800` verification (`19-05-SUMMARY.md` coverage `D4`) to confirm `FocusNavController` does not briefly focus `Close` before the frame executes.

---

## Files Audited

- `src/components/tabs/SoundtracksTab.tsx`
- `src/components/tabs/GameEqModal.tsx`
- `src/components/common/EqBandFaders.tsx`
- `src/components/common/InteractiveRow.tsx`
- `src/components/tabs/SettingsTab.tsx`
- `src/components/tabs/soundtrackUtils.ts`
- `src/components/DeckifyExpandedModal.tsx`
- `src/index.tsx`
- `src/types.ts`
- `py_modules/soundtrack.py` (`_resolve_app_name` cross-check)
