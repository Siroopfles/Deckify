# Phase 8: Controller L2/R2 Ergonomics & Trigger Navigation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-14
**Phase:** 8-Controller L2/R2 Ergonomics & Trigger Navigation
**Areas discussed:** L2/R2 Seeking UX & Feedback, Library Fast-Page Behavior, Trigger Input & Modal Controller Fixes, Sub-views & Edge Cases

---

## Todo Cross-Reference

**User's choice:** Folded `Fix controller actions (Y options, X like, triggers) in modal` and `Fix Back to Steam focus navigation in modal sidebar` into Phase 8; kept 17 other general UI/API todos in backlog.

---

## L2/R2 Seeking UX & Feedback

1. **Rapid consecutive L2/R2 pulls**
   - Options: Accumulate & debounce (~250ms) [✓], Immediate seek per pull, You decide
   - **User's choice:** `(Recommended) Accumulate & debounce (~250ms)`
2. **Visual feedback for blind seeking**
   - Options: Floating seek-delta pill + live seekbar preview [✓], Decky toaster only, Silent seekbar preview, You decide
   - **User's choice:** `(Recommended) Floating seek-delta pill + directe seekbar-preview in de modal`
3. **Track boundary behavior**
   - Options: Clamp at track boundaries (0s and duration - 1s) [✓], Skip to next/previous track, You decide
   - **User's choice:** `(Recommended) Clampen op track-grenzen (0s en einde - 1s)`
4. **Seek step size**
   - Options: Fixed ±10s, Configurable in SettingsTab, You decide
   - **User's choice:** `Instelbaar met slider — onthoud ALLES in settings tab met seconden moet slider worden`

---

## Library Fast-Page Behavior

1. **Jump strategy**
   - Options: Fixed ±15 items, Alphabetical letter anchors, Smart combo (±15 default, letter anchors when A-Z sorted) [✓], You decide
   - **User's choice:** `Slimme combi: ±15 items standaard, of letter-anker in A-Z gesorteerde lijsten`
2. **Controller focus after jump**
   - Options: Scroll + transfer D-pad focus to target item [✓], Scroll only, You decide
   - **User's choice:** `(Recommended) Scroll én verplaats D-pad focus naar het doel-item`
3. **Supported tabs**
   - Options: All list tabs (Liked, Playlists, Albums, Artists, Queue, Recent, Podcasts, Soundtracks) [✓], Only 4 main library tabs, You decide
   - **User's choice:** `(Recommended) Alle lijst-tabs`
4. **List boundary behavior**
   - Options: Clamp + trigger Load More on R2 at end [✓], Wrap-around, Strict clamp, You decide
   - **User's choice:** `(Recommended) Clamp op eerste/laatste item + Load More triggeren als R2 op het einde zit`
5. **Visual indicator pill in lists**
   - Options: Subtle floating pill (`16 / 120` or `M`) [✓], No pill, You decide
   - **User's choice:** `(Recommended) Ja, subtiele floating pill`
6. **Focus in left Sidebar**
   - Options: Only page list when focus is in content pane [✓], Always page active list, You decide
   - **User's choice:** `(Recommended) Alleen lijst pagen als focus in de content-lijst zit`
7. **Jump step size**
   - Options: Fixed 15 items, Configurable via slider in SettingsTab (5-50) [✓], You decide
   - **User's choice:** `Instelbaar via slider in SettingsTab (bijv. 5–50 items)`
8. **Short lists (< jump step)**
   - Options: Jump to first (L2) or last (R2) item [✓], No-op, You decide
   - **User's choice:** `(Recommended) Spring naar eerste (L2) of laatste (R2) item`

---

## Trigger Input & Modal Controller Fixes

1. **Single pull vs hold-to-repeat**
   - Options: Strictly one action per pull-and-release, Auto-repeat while held (>500ms -> repeat every 300ms) [✓], You decide
   - **User's choice:** `Auto-repeat bij vasthouden (>500ms ingedrukt = herhalen elke 300ms)`
2. **Folded Todo: Y (options) & X (like) scope**
   - Options: Focused track in lists + current track in Now Playing/Lyrics [✓], Lists only, You decide
   - **User's choice:** `(Recommended) Y (opties) en X (like) werken op het gefocuste track-item in lijsten, én in Now Playing / Lyrics op het huidige nummer`
3. **Folded Todo: Back to Steam sidebar navigation**
   - Options: Pin 'Back to Steam' as fixed footer below scrollable tabs [✓], Keep inside scrollable list, You decide
   - **User's choice:** `(Recommended) Pin 'Back to Steam' als vaste footer onder de scrollbare sidebar-tabs`
4. **Controller hint bar**
   - Options: Context-aware hint bar [✓], No hint bar, You decide
   - **User's choice:** `Die recommended context afhankelijke hint bar ja maar ook instelling om die uit te zetten`

---

## Sub-views & Edge Cases

1. **Playlist / Album / Artist detail views**
   - Options: L2/R2 page through the detail tracklist [✓], Seek current track, Disabled, You decide
   - **User's choice:** `(Recommended) L2/R2 bladeren door de tracklist van die playlist/album/artiest`
2. **Sub-modals & text inputs**
   - Options: Suppress L2/R2 when ActionMenu, PlaylistPickerModal, or text input is active [✓], Text input only, You decide
   - **User's choice:** `(Recommended) L2/R2 pauzeren/blokkeren als ActionMenu, PlaylistPickerModal of een tekst-input focus heeft`
3. **SearchTab results**
   - Options: Page search results when focus is in results list [✓], Disabled in SearchTab, You decide
   - **User's choice:** `(Recommended) L2/R2 pagen ook door zoekresultaten zodra de focus in de resultatenlijst staat`
4. **Master enable/disable toggle**
   - Options: Master toggle 'L2/R2 Trigger Navigation' (default ON) in SettingsTab [✓], Always active, You decide
   - **User's choice:** `(Recommended) Ja, master toggle 'L2/R2 Trigger Navigation' (standaard aan) + sliders in SettingsTab`

---

## the agent's Discretion

- Floating pill positioning, styling, and auto-dismiss timing (~800ms–1200ms).
- Exact SteamOS GamepadUI analog trigger event subscription mechanism verified against `src/index.tsx` patterns.
- Ref registry / callback context design for scrollable list tabs.

## Deferred Ideas

- 17 unrelated UI/API pending todos reviewed during cross-reference and kept in `.planning/todos/pending/`.
