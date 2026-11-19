---
status: diagnosed
trigger: "Investigate issue: phase-19-uat-ui-layout-navigation"
created: 2026-11-19T16:24:18Z
updated: 2026-11-19T16:33:00Z
---

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

bug_class: Bohrbug
hypothesis: "All 4 UAT Test 2 sub-issues are deterministic layout, SteamOS @decky/ui CSS specificity, Focusable spatial navigation, and app_name persistence/layout defects across SoundtracksTab.tsx, GameEqModal.tsx, SettingsTab.tsx, src/index.tsx, and py_modules/soundtrack.py."
test: "Cross-checked source lines across SoundtracksTab.tsx, GameEqModal.tsx, EqBandFaders.tsx, PlaylistPickerModal.tsx, TrackActionModal.tsx, SettingsTab.tsx, src/index.tsx, main.py, py_modules/soundtrack.py, py_modules/equalizer.py, py_modules/vdf_parser.py, @decky/ui types, and 15-UAT.md."
expecting: "All 4 sub-issues explained with exact file paths, line numbers, and falsifiable mechanisms."
next_action: "Return ## ROOT CAUSE FOUND diagnosis to caller (goal: find_root_cause_only)."

reasoning_checkpoint:
  hypothesis: "4 independent/compounding Bohrbugs: (1) SoundtracksTab omits explicit ToggleField on/off controls for volume_override and ducking_level_override; (2) DialogButton default width: 100% + flexShrink: 0 without width: 'auto' beside flex: 1, minWidth: 0 SliderField causes layout jump and vertical letter-stacking; (3) GameEqModal Close DialogButton (width: 100% + flexShrink: 0) + overflowY: 'auto' scrolls horizontally right on open, wrapped 8-item flow-children='horizontal' preset bar + FIRST entry defaults move D-pad down focus left, and background: '#121212' inside un-fullsized ModalRoot clashes with Steam dialog chrome; (4) handleQuickBind omits app_name, SoundtracksTab preserves existing app_name: '', SoundtrackManager lacks vdf_parser fallback, and SettingsTab's 640px single-row card header leaves ~286px for the override badge."
  confirming_evidence:
    - "SoundtracksTab.tsx:500-599 renders SliderFields directly with null/numeric sentinel and conditional DialogButtons rather than ToggleFields."
    - "SoundtracksTab.tsx:512,530-539,562,581-592 puts SliderField in flex: 1, minWidth: 0 next to DialogButton with flexShrink: 0 and minWidth: 'auto' but no width: 'auto'."
    - "GameEqModal.tsx:119-136,184-222,229-257,435-457 compared against PlaylistPickerModal.tsx:169-218, TrackActionModal.tsx:58-122, DeckifyExpandedModal.tsx:967-982, and SettingsTab.tsx:544-580."
    - "src/index.tsx:424, py_modules/soundtrack.py:193-205,327,577-596, SoundtracksTab.tsx:1065-1066, and SettingsTab.tsx:252,485-543."
  falsification_test: "Adding explicit ToggleFields, adding width: 'auto' (or moving reset below/into toggle), removing GameEqModal Close flexShrink: 0 / overflowX / wrapped horizontal bar / inner #121212 background, and resolving app_name + giving the override badge its own row would eliminate each corresponding symptom."
  fix_rationale: "Addresses every code, CSS specificity, Focusable navigation topology, and backend/frontend app_name persistence defect directly at its origin."
  blind_spots: "Runtime inspection in live SteamOS CEF devtools was not executed here (diagnosis based on repository source, @decky/ui types, and Phase 15/19 UAT hardware logs)."
  candidate_causes:
    - "code: JSX layout/styling, missing ToggleFields, wrapped Focusable, missing app_name propagation and badge placement"
    - "environment: SteamOS GamepadUI CSS (.DialogButton width: 100%, ModalRoot .DialogContent styling) and FocusNavController 1-D horizontal/FIRST entry rules"
    - "data: Persisted settings.json profile 2429414104 containing app_name: ''"
  and_gate: "Yes for sub-issues 2, 3, and 4: sub-issue 2 requires both SoundtracksTab inline flex/minWidth:0 + SteamOS .DialogButton width:100%; sub-issue 3a/c requires GameEqModal styles + SteamOS ModalRoot/DialogButton CSS; sub-issue 4 requires empty app_name on disk/backend + cramped 640px header badge width."

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected: Controller D-pad navigation traverses horizontal rows (flow-children='horizontal') without focus traps; Edit Game EQ modal renders all 10 ISO faders within 82vh; SettingsTab shows truncated Active Game EQ Override badge while keeping edits bound to global baseline; QAM displays GAME VOL / DUCKED pills and live effective_volume; two-step Delete Game Profile confirmation works cleanly.
actual: User reported 4 concrete UI/layout/navigation issues during Test 2 on Steam Deck (1280x800):
1. SoundtracksTab — Missing explicit on/off toggles: User misses explicit on/off toggle buttons to enable/disable the Volume Override slider and the Ducking Attenuation Override slider.
2. SoundtracksTab — Slider layout jump & vertical letter-stacking: Moving a slider makes the inline Reset button appear beside it, causing a sharp layout jump and squeezing the slider label so letters stack vertically (check `@decky/ui` `DialogButton` default `width: 100%` + inline flex row beside `SliderField`).
3. GameEqModal — Close button causes horizontal scroll slightly right on open, pressing D-pad down moves focus left, and modal background color clashes with `<ModalRoot>` / inner content (compare `src/components/tabs/GameEqModal.tsx` and `src/components/common/EqBandFaders.tsx` against `src/components/tabs/PlaylistPickerModal.tsx`, `src/components/common/TrackActionModal.tsx`, and `src/components/tabs/SettingsTab.tsx`).
4. SettingsTab / backend `py_modules/soundtrack.py`: `Active Game EQ Override` badge displays `"App <many digits>..."` and truncates the rest of the badge text/preset. Note from live Steam Deck `/home/deck/homebrew/settings/Deckify/settings.json`: saved non-Steam shortcut profile `"2429414104"` has `"app_name": ""` (empty string) on disk.
errors: None reported
reproduction: Test 2 in Phase 19 UAT (.planning/phases/19-per-game-eq-volume-profiles/19-UAT.md) on Steam Deck Hardware (1280x800)
started: Discovered during UAT after deploying iteration 2 fixes (`03f5a88`)

## Eliminated
<!-- APPEND only - prevents re-investigating -->

- hypothesis: "py_modules/vdf_parser.py saves shortcuts with empty app_name when scanning shortcuts.vdf."
  evidence: "py_modules/vdf_parser.py:239-248 skips any shortcut entry where lower.get('appname') is falsy ('if not name: continue') and populates 'name' on every InstalledGame returned by get_installed_games()."
  timestamp: 2026-11-19T16:31:00Z

- hypothesis: "EqBandFaders.tsx 10-column Focusable tree alone breaks D-pad Down navigation regardless of container."
  evidence: "Phase 15 UAT (.planning/milestones/v0.6-phases/15-real-pipewire-biquad-equalizer/15-UAT.md Test 4) passed on Steam Deck hardware with the identical 10-band Focusable flow-children='horizontal' -> 10x flow-children='column' strip inside SettingsTab.tsx (extracted verbatim in commit e598770), where preset pills were split into two non-wrapping flow-children='horizontal' rows and there was no overflowing top-right Close DialogButton."
  timestamp: 2026-11-19T16:31:30Z

## Evidence
<!-- APPEND only - facts discovered -->

- timestamp: 2026-11-19T16:26:00Z
  checked: "src/components/tabs/SoundtracksTab.tsx:466-599 and SettingsTab.tsx:847-868,1086-1108,1120-1257"
  found: "SoundtracksTab renderAutoAndDuckTogglesRow only renders 'Always auto-start soundtrack' and 'Ducking Override (Skip game ducking when off)' (profile.ducking_override). renderVolumeOverrideRow (500-546) and renderDuckingOverrideRow (548-599) render SliderFields directly without explicit ToggleField enable/disable controls; Volume Override is enabled only by dragging the SliderField (which looks enabled at value=80 even while labeled 'Volume Override (Disabled)') and disabled only by clicking conditional DialogButtons ('Clear Volume Override' / 'Use Global Ducking')."
  implication: "Confirms Sub-issue 1: no explicit on/off toggle exists for volume_override or ducking_level_override."

- timestamp: 2026-11-19T16:27:00Z
  checked: "src/components/tabs/SoundtracksTab.tsx:508-544,558-597 and other SliderField usages across src/"
  found: "In renderVolumeOverrideRow and renderDuckingOverrideRow, <Focusable flow-children='horizontal' style={{ display: 'flex', gap: 8, alignItems: 'center' }}> wraps <div style={{ flex: 1, minWidth: 0 }}><SliderField ... /></div> and a conditional <DialogButton style={{ minWidth: 'auto', minHeight: 44, padding: '6px 10px', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>. Neither DialogButton overrides width: 'auto' against SteamOS .DialogButton { width: 100% }. Every other SliderField in SettingsTab.tsx and src/index.tsx occupies full row width without an inline DialogButton."
  implication: "Confirms Sub-issue 2: moving a slider mounts the DialogButton inline; SteamOS width: 100% + flexShrink: 0 claims the full row and crushes the flex: 1, minWidth: 0 SliderField container to near-zero width, causing a layout jump and vertical letter-stacking."

- timestamp: 2026-11-19T16:29:00Z
  checked: "GameEqModal.tsx:86-138,184-258,435-457 and EqBandFaders.tsx:157-231 vs PlaylistPickerModal.tsx:169-245, TrackActionModal.tsx:58-122, DeckifyExpandedModal.tsx:967-982, SettingsTab.tsx:544-580"
  found: "(a) GameEqModal Close DialogButton (119-136) sets minWidth: 32 and flexShrink: 0 without width: 'auto' alongside flex: 1 h3 and flexShrink: 0 Preamp span; outer Focusable (436-450) sets overflowY: 'auto' without overflowX: 'hidden' (making overflowX compute to 'auto'); Close is the first focusable DOM node and receives initial focus on open. (b) Pressing D-pad Down from top-right Close enters renderPresetSeedBar (184-222, no navEntryPreferPosition) at FIRST child 'Global' on the far left; inside renderPresetSeedBar, 7 InteractiveRow pills + DialogButton 'Reset to Flat' (which also lacks width: 'auto') wrap inside one flow-children='horizontal' container instead of two non-wrapping rows like SettingsTab.tsx:544-578, so D-pad Down skips wrapped rows and enters EqBandFaders (EqBandFaders.tsx:219) at FIRST ('31 Hz' on the far left); likewise EqBandFaders -> renderModalFooter (229-257) enters FIRST ('Discard Changes' on the far left). (c) GameEqModal uses <ModalRootCompat> without bAllowFullSize (unlike DeckifyExpandedModal) while setting background: '#121212' on the inner Focusable (444), whereas PlaylistPickerModal omits background so ModalRoot renders uniformly and TrackActionModal avoids ModalRoot entirely."
  implication: "Confirms all 3 parts of Sub-issue 3."

- timestamp: 2026-11-19T16:31:00Z
  checked: "src/index.tsx:421-433,1257-1289; main.py:951-956; py_modules/soundtrack.py:193-205,323-395,577-596; SoundtracksTab.tsx:1065-1066; SettingsTab.tsx:252,485-543; node_modules/@decky/ui/src/modules/Router.ts:23-28,71-72"
  found: "(1) src/index.tsx:424 calls backendBindCurrentMusicToGame(activeGameAppId) without app_name; py_modules/soundtrack.py:577-596 saves resolved_name = app_name or str(existing.get('app_name') or '') -> ''; save_profile (193-205) and apply_active_audio_profile (327) never fall back to vdf_parser.get_installed_games(); SoundtracksTab.tsx:1066 uses existingProfile || defaultProfile(game), preserving existing app_name: '' across subsequent edits. (2) SettingsTab.tsx:252 constrains the page to maxWidth: 640 (612px inside padding: 14 at line 485); the Equalizer header flex row (486-538) reserves ~205px for flexShrink: 0 <h3> and ~105px for flexShrink: 0 Bypass/Preamp + 16px gaps, leaving ~286px (~270px inner) for active-game-eq-override-badge (511-528) with whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'. The 'Active Game EQ Override: ' prefix takes ~175px, leaving ~95px (~13 chars), truncating 'App 2429414104 (Gaming Balance)' mid-ID and hiding the preset."
  implication: "Confirms both backend/data and frontend layout root causes for Sub-issue 4."

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause: "All 4 UAT Test 2 failures stem from verified code, SteamOS GamepadUI CSS/focus, and app_name persistence defects: (1) SoundtracksTab.tsx:500-599 omits explicit on/off ToggleField controls for Volume Override and Ducking Attenuation Override, relying on implicit slider-drag activation and conditional Reset buttons; (2) SoundtracksTab.tsx:508-544 and 558-597 place a flex: 1, minWidth: 0 SliderField wrapper inline beside a conditional DialogButton with flexShrink: 0 and no width: 'auto', so SteamOS .DialogButton { width: 100% } collapses the SliderField container on mount and stacks label letters vertically; (3) GameEqModal.tsx Close DialogButton (119-136) has flexShrink: 0 without width: 'auto' inside an overflowY: 'auto' (implicitly overflowX: 'auto') container (436-450) and receives initial focus on open, scrolling slightly right; D-pad Down jumps from top-right Close to FIRST ('Global') in renderPresetSeedBar (184-222), while wrapping 7 pills + width:100% DialogButton 'Reset to Flat' inside one flow-children='horizontal' container causes D-pad Down to skip wrapped rows and enter FIRST ('31 Hz' left) in EqBandFaders (and FIRST 'Discard Changes' left in renderModalFooter 229-257); and setting background: '#121212' on the inner Focusable inside non-full-size ModalRootCompat (435-444) clashes with SteamOS ModalRoot dialog chrome; (4) non-Steam shortcut profile '2429414104' has app_name: '' because src/index.tsx:424 omits app_name on QAM bind, py_modules/soundtrack.py (193-205, 327, 577-596) never falls back to vdf_parser.get_installed_games(), and SoundtracksTab.tsx:1066 preserves existing app_name: '' instead of backfilling game.name, while SettingsTab.tsx:486-538 squeezes the Active Game EQ Override badge into ~286px on a maxWidth: 640 single-row header between two flexShrink: 0 siblings, truncating right after 'App <digits>...' and hiding the preset."
fix: ""
verification: ""
files_changed: []
