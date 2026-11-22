---
phase: 21-dynamic-album-art-accent-themes-handheld-battery-eco-mode
plan: 01
subsystem: ui-theming
tags: [accent-theme, canvas, css-variables, eco-mode, vitest]
requires: []
provides:
  - "32x32 <canvas> dominant cover-art accent extractor with WCAG L >= 55% clamp (src/utils/accentTheme.ts)"
  - "Cross-root :root CSS variable synchronization & React subscription hook (src/utils/themeBus.ts)"
  - "Phase 21 TypeScript types: AccentThemeMode, EcoStatusState, EcoStatusInfo (src/types.ts)"
  - "--deckify-accent* token & animations_suspended integration across InteractiveRow, DeckifyImage, SilentBanner, DeckifyOverlay, and DeckifyExpandedModal"
affects:
  - src/components/common/InteractiveRow.tsx
  - src/components/common/DeckifyImage.tsx
  - src/components/SilentBanner.tsx
  - src/components/DeckifyOverlay.tsx
  - src/components/DeckifyExpandedModal.tsx
tech-stack:
  added: []
  patterns:
    - "Cross-root CSS custom properties (--deckify-accent, --deckify-accent-rgb, --deckify-accent-transition) on document.documentElement.style"
    - "32x32 <canvas> downsampling strictly on proxied data:image/... URIs (Steam CEF CSP compliant)"
key-files:
  created:
    - src/utils/accentTheme.ts
    - src/utils/themeBus.ts
    - src/utils/accentTheme.test.ts
  modified:
    - src/types.ts
    - src/components/common/InteractiveRow.tsx
    - src/components/common/DeckifyImage.tsx
    - src/components/SilentBanner.tsx
    - src/components/DeckifyOverlay.tsx
    - src/components/DeckifyOverlay.test.tsx
    - src/components/SilentBanner.test.tsx
    - src/components/DeckifyExpandedModal.tsx
key-decisions:
  - "Guard useAccentTheme() state updates with structural equality so shallow React test mocks do not infinite-loop on mount."
  - "Keep #1DB954 / 29, 185, 84 CSS var() fallbacks in all modified components and update 3 unit test assertions to expect the tokenized CSS var() values."
requirements-completed:
  - THEME-01
duration: 5min
completed: 2026-11-22
status: complete
commits: 2
plan_head_before: 3e2e1d016dacd6741c1b1309cf242b2593e12be7
plan_head_after: e5b2480be17c6cf14619bb504fb2b022e5fb2911
actuals:
  tokens: 18500
  tasks: 2
  commits: 2
---

# Phase 21 Plan 01: Dynamic Album-Art Accent Theme Engine & Core Token Integration Summary

**Implemented the `THEME-01` 32x32 `<canvas>` cover-art accent extractor with WCAG `L >= 55%` clamping, cross-root `:root` CSS variable bus, and core Modal/HUD/Banner/InteractiveRow/DeckifyImage token and `animations_suspended` integration.**

## Performance

- **Duration:** ~5 min
- **Tasks:** 2 (1 tracer TDD, 1 auto)
- **Files modified:** 11 (3 created, 8 modified)

## Accomplishments

- **Types & Accent Theme Extractor (`src/types.ts`, `src/utils/accentTheme.ts`):** Added `AccentThemeMode`, `EcoStatusState`, `EcoStatusInfo`, and Phase 21 `EngineSettings`/`StatusResponse` fields; implemented `resolvePresetAccent`, `clampAccentHsl` (`L in [0.55, 0.75]`, `S >= 0.45`), `extractAccentFromImageData` (24 hue bins, vibrancy-weighted, `#1DB954` grayscale/idle fallback), and `extractAccentFromDataUri` (strict `data:image/` guard, `32x32` `<canvas>`, 64-entry LRU cache).
- **Cross-Root Theme Bus (`src/utils/themeBus.ts`, `src/utils/accentTheme.test.ts`):** Synchronizes `--deckify-accent`, `--deckify-accent-rgb`, and `--deckify-accent-transition` onto `document.documentElement.style` with stale-request cancellation on rapid track skips and `useAccentTheme()` React hook.
- **Core UI Token & Eco-Suspension Integration:** Updated `InteractiveRow`, `RoundBtn`, `focusHalo`, `SilentBanner`, `DeckifyImage`, `DeckifyOverlay`, and `DeckifyExpandedModal` to consume `--deckify-accent*` tokens with `#1DB954` / `29, 185, 84` fallbacks, added radial accent glow layers to `DeckifyOverlay` and `DeckifyExpandedModal`, and gated `DeckifyImage` shimmer and `DeckifyOverlay` entrance/lyric animations on `animationsSuspended`.

## Task Commits

1. **Task 1 (tracer, TDD):** `5287e5c` — `feat(21-01): add accent theme extractor, themeBus, and Phase 21 types`
2. **Task 2 (auto):** `e5b2480` — `feat(21-01): apply --deckify-accent tokens and animations_suspended gating`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated 3 unit test assertions & added `@decky/api` mock in `DeckifyOverlay.test.tsx`**
- **Found during:** Task 2 verification
- **Issue:** `DeckifyOverlay.test.tsx` and `SilentBanner.test.tsx` asserted literal `#1db954` / `#1DB954` strings on elements now styled with `var(--deckify-accent, #1DB954)`, and `DeckifyOverlay.test.tsx` lacked a `@decky/api` mock needed after importing `useAccentTheme` -> `imagePipeline`.
- **Fix:** Added `@decky/api` mock in `DeckifyOverlay.test.tsx` and updated the 3 assertions to expect `var(--deckify-accent, #1DB954)`.
- **Files modified:** `src/components/DeckifyOverlay.test.tsx`, `src/components/SilentBanner.test.tsx`
- **Commit:** `e5b2480`

## Verification Results

- `pnpm exec vitest run src/utils/accentTheme.test.ts` — 6/6 passed
- `pnpm exec vitest run src/components/SilentBanner.test.tsx src/components/DeckifyOverlay.test.tsx src/components/DeckifyExpandedModal.test.tsx` — 58/58 passed
- Full suite (`vitest run` via pre-commit hook) — 22 test files, 270/270 tests passed
- `pnpm run typecheck` (`tsc --noEmit`) — passed
- `pnpm run build` (`rollup -c` via pre-commit hook) — passed
- `eslint --max-warnings=0` on new Task 1 files — 0 warnings, 0 errors; `eslint` on Task 2 files — 0 errors (47 pre-existing complexity/`any` warnings in `DeckifyExpandedModal.tsx`, `DeckifyOverlay.tsx`, `DeckifyImage.tsx`, and `InteractiveRow.tsx`).

## Self-Check: PASSED

- Created files exist: `src/utils/accentTheme.ts`, `src/utils/themeBus.ts`, `src/utils/accentTheme.test.ts`
- Commits exist in HEAD: `5287e5c`, `e5b2480`
