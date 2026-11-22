---
status: diagnosed
trigger: "Investigate issue: qam-accent-theme-not-applied - Selecting an Accent Theme (Classic Spotify Green, Dynamic Album Glow, SteamOS Deck Blue) updates focus halos, active pills, progress bars, and highlights in the Expanded Modal and HUD, but NOT in the Quick Access Menu (QAM)."
created: 2026-11-22T11:38:29Z
updated: 2026-11-22T12:40:00Z
---

## Current Focus

bug_class: Bohrbug
hypothesis: QAM (Content in src/index.tsx) relies on themeBus.ts setting CSS custom properties on document.documentElement, which in Decky Loader targets SharedJSContext's document rather than the SteamOS GamepadUI QAM window's document, and Content does not call useAccentTheme() / spread getThemeCssVars() onto its root container as DeckifyExpandedModal and DeckifyOverlay do.
test: Verified by comparing themeBus.ts, DeckifyExpandedModal.tsx, DeckifyOverlay.tsx, and src/index.tsx
expecting: Confirmed root cause
next_action: Return structured ROOT CAUSE FOUND diagnosis to caller (goal: find_root_cause_only)

candidate_causes:
  - code: Content (QAM root component in src/index.tsx) does not subscribe to useAccentTheme() or apply getThemeCssVars(accent, animationsSuspended) to a root wrapper element.
  - environment: Decky Loader executes plugin code in SharedJSContext (with its own document), while SteamOS GamepadUI renders the QAM panel in a separate CEF window/document, so document.documentElement.style.setProperty in themeBus.ts does not reach QAM DOM nodes.
and_gate: "yes — both conditions combine: (1) environment: SharedJSContext's document.documentElement is isolated from the QAM CEF window's document, AND (2) code: Content in src/index.tsx omits the useAccentTheme() + getThemeCssVars() inline style wrapper that DeckifyExpandedModal and DeckifyOverlay use to cross the window boundary."

## Symptoms

expected: Selecting an Accent Theme (including Dynamic Album Glow) immediately updates focus halos, active pills, progress bars, and highlights across Expanded Modal, QAM, and HUD.
actual: User reported: "Yess ze werken bijna overal maar niet in de QAM dat is de enige plek waar ze nog niet werken" (Test 1) and "Werkt top en goed maar ook in QAM" (Test 2).
errors: None reported
reproduction: Open Deckify -> Settings -> Accent Theme -> select SteamOS Deck Blue or Dynamic Album Glow -> check QAM panel.
timeline: Discovered during Phase 21 UAT.

## Eliminated

## Evidence

- timestamp: 2026-11-22T12:38:36Z
  checked: .planning/phases/21-dynamic-album-art-accent-themes-handheld-battery-eco-mode/21-UAT.md & .planning/debug/knowledge-base.md
  found: UAT gaps G-21-1 and G-21-2 confirm Accent Theme (SteamOS Deck Blue and Dynamic Album Glow) works in Expanded Modal and HUD, but fails exclusively in QAM. No knowledge-base.md exists yet.
  implication: Problem is specific to how QAM receives/applies accent theme state compared to Expanded Modal and HUD.

- timestamp: 2026-11-22T12:38:57Z
  checked: src/utils/themeBus.ts (lines 25-55, 115-156)
  found: applyCssVariables() sets --deckify-accent, --deckify-accent-rgb, and --deckify-accent-transition on document.documentElement.style. getThemeCssVars() returns those same 3 CSS variables as a React CSSProperties object, and useAccentTheme() subscribes a React component to themeBus updates.
  implication: If a component lives in a different CEF document than SharedJSContext (where themeBus runs), document.documentElement.style.setProperty does not affect it unless the component uses useAccentTheme() + getThemeCssVars() on its own DOM element.

- timestamp: 2026-11-22T12:39:12Z
  checked: src/components/DeckifyExpandedModal.tsx (lines 42, 956, 973) & src/components/DeckifyOverlay.tsx (lines 5, 51, 213)
  found: Both DeckifyExpandedModal and DeckifyOverlay import { getThemeCssVars, useAccentTheme } from "../utils/themeBus", call useAccentTheme(), and spread ...getThemeCssVars(accent, animationsSuspended) onto their root <div>'s inline style prop.
  implication: This is why Expanded Modal and HUD work across Steam's multi-window CEF architecture.

- timestamp: 2026-11-22T12:39:23Z
  checked: src/index.tsx (lines 47, 792-815, 841-900, 1405-1724, 1927-1956) & src/components/SilentBanner.tsx (line 47)
  found: src/index.tsx only imports { syncThemeFromState } from "./utils/themeBus". The QAM root component Content (lines 841-1724) returns <> <PanelSection title="Deckify">...</PanelSection> </> without calling useAccentTheme() or applying getThemeCssVars() to any wrapper element. All QAM var(--deckify-accent, #1DB954) and var(--deckify-accent-rgb, 29, 185, 84) usages (PinnedPill, transport buttons, liked heart, playing label, GAME VOL/DUCKED badge) therefore fall back to #1DB954. (Note: SilentBanner in DeckifyOverlayWrapper is also a sibling of DeckifyOverlay without getThemeCssVars().)
  implication: Adding useAccentTheme() and a wrapper (e.g., <div style={{ display: "contents", ...getThemeCssVars(accent, animationsSuspended) }}>) around Content's <PanelSection> will inject the live CSS variables directly into the QAM DOM tree.

## Resolution

root_cause: "QAM's Content component in src/index.tsx does not subscribe to useAccentTheme() or spread getThemeCssVars(accent, animationsSuspended) onto a root wrapper element; combined with Decky Loader's multi-window CEF architecture where themeBus.ts sets CSS variables on SharedJSContext's document.documentElement rather than the QAM window's document, all var(--deckify-accent, #1DB954) and var(--deckify-accent-rgb, 29, 185, 84) references in QAM fall back to Classic Spotify Green."
fix:
verification:
files_changed: []
