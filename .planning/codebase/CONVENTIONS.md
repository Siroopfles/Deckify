---
last_mapped_commit: a61bbf8da7ad74d4ba42198f0c3841b6ef17f7f8
last_mapped_at: 2026-11-10
---
# Coding Conventions

**Analysis Date:** 2026-11-10

## Naming Patterns

**Files:**
- React components: PascalCase (e.g., `DeckifyExpandedModal.tsx`, `DeckifyOverlay.tsx`)
- TypeScript helpers and types: camelCase (e.g., `types.ts`, `utils.test.ts`)
- Python backend modules: snake_case (e.g., `main.py`, `spotify.py`, `images.py`)
- Test files: Prefix `test_` for Python (`tests/test_features.py`); suffix `.test.ts` for Vitest (`src/utils.test.ts`)

**Functions:**
- TypeScript: camelCase (e.g., `formatDuration`, `fetchImageAsBase64`, `handleGamepadAction`)
- Python: snake_case (e.g., `get_player_state`, `toggle_like_track`, `_fetch_lyrics_sync`)
- Private/Internal Python functions: Prefixed with an underscore `_` (e.g., `_load_settings`, `_make_spotify_request`)

**Variables:**
- TypeScript: camelCase (e.g., `currentPositionMs`, `isLiked`, `focusedTrackRef`)
- Python: snake_case (e.g., `access_token`, `cache_dir`, `process_env`)
- Global constants: UPPER_SNAKE_CASE (e.g., `SETTINGS_FILE`, `DEFAULT_CLIENT_ID`)

**Types:**
- TypeScript interfaces & types: PascalCase (e.g., `Track`, `Playlist`, `Album`, `PlaybackState`)

## Code Style

**Formatting:**
- Indentation: 2 spaces for TypeScript/TSX, 4 spaces for Python
- Semicolons: Always used in TypeScript
- Quotes: Double quotes or consistent single quotes in TypeScript; double quotes preferred in Python

**Linting:**
- Tool: ESLint 10 with flat configuration (`eslint.config.js`)
- Plugins: `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`
- Pre-commit hook: Executed automatically via Husky and `lint-staged`

## Import Organization

**TypeScript Order:**
1. React core imports (`import React, { useState, useEffect, useRef } from "react"`)
2. Decky ecosystem packages (`@decky/ui`, `@decky/api`)
3. Third-party UI / icon libraries (`react-icons/fa`, `qrcode.react`)
4. Local components and types (`./DeckifyOverlay`, `../types`)

**Python Order:**
1. Standard library modules (`asyncio`, `os`, `json`, `subprocess`, `urllib`)
2. Decky framework imports (`import decky`)
3. Internal module imports (`from py_modules import common, spotify, engine, images`)

## Error Handling

**Python Backend:**
- RPC methods must never crash the main event loop. All external network operations and system calls are wrapped in `try/except` blocks.
- Expected errors return a structured response dictionary:
  ```python
  try:
      # Perform operation
      return {"success": True, "data": result}
  except Exception as e:
      decky.logger.error(f"Deckify error: {e}")
      return {"success": False, "error": str(e)}
  ```
- Resilient signatures: Functions interfacing with variable caller parameters accept `*args, **kwargs` to avoid `TypeError` on upstream signature changes.

**TypeScript Frontend:**
- Async RPC calls wrapped in `try/catch`.
- Failures trigger user notifications using the Decky toaster API (`toaster.toast({ title: "Deckify", body: "Failed to perform action", duration: 3000 })`).
- Fallback states: Empty lists `[]` or default state objects returned on network failure to avoid React rendering crashes.

## Logging

**Framework:**
- Backend: `decky.logger.info()` and `decky.logger.error()`
- Frontend: `console.log()` and `console.error()`

**Patterns:**
- Log error messages with context (e.g., `decky.logger.error(f"Failed to fetch lyrics for {track_id}: {e}")`).
- Avoid logging sensitive user authentication tokens or authorization headers.

## Comments

**When to Comment:**
- Workarounds for SteamOS or GamepadUI specific quirks (e.g., CSP image restrictions, `flow-children` horizontal navigation, `LD_LIBRARY_PATH` stripping).
- Complex algorithmic logic or token refresh calculations.

**JSDoc/TSDoc:**
- Used for shared interface definitions in `src/types.ts`.

## Function Design

**Size:**
- Modular functions adhering to single-responsibility principles. Large React components broken into sub-components or render functions for each tab.

**Parameters:**
- Named parameter objects in TypeScript for functions with multiple options.
- Keyword arguments with sensible defaults in Python.

## Module Design

**Exports:**
- Default export for the primary plugin entry point in `src/index.tsx`.
- Named exports for reusable types and utilities in `src/types.ts`.
- Package exports managed cleanly in `py_modules/__init__.py`.

---

*Convention analysis: 2026-11-10*
