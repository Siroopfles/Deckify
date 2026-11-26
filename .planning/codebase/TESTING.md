---
last_mapped_commit: f8defec7206b337ccec032ac6a11b40649e888bd
last_mapped_at: 2026-11-26
---
# Testing Patterns

**Analysis Date:** 2026-11-26

## Test Framework

**Runner:**
- **Frontend:** Vitest `5.1.0` (configured via `package.json` scripts with default Vitest resolution; no separate `vitest.config.*` file).
- **Backend:** Python standard library `unittest` (`unittest.TestCase` and `unittest.IsolatedAsyncioTestCase`).

**Assertion Library:**
- **Frontend:** Vitest `expect` (`toBe`, `toEqual`, `toHaveLength`, `toBeInstanceOf`, `toBeLessThanOrEqual`).
- **Backend:** `unittest` assertions (`assertEqual`, `assertTrue`, `assertFalse`, `assertIs`, `assertIn`, `assertIsNone`) and `unittest.mock` async assertions (`assert_awaited_once`, `assert_awaited_with`).

**Run Commands:**
```bash
pnpm test                # Run all frontend Vitest suites (vitest run)
pnpm run test:python     # Run all backend unittest suites
pnpm run test:coverage   # Run Vitest + Python coverage report
```

## Test File Organization

**Location:**
- **Frontend:** Co-located next to the source file under test inside `src/` (30 `.test.ts` / `.test.tsx` files).
- **Backend:** Centralized in `tests/` at the repository root (40 `test_*.py` files).

**Naming:**
- **Frontend:** `<module>.test.ts` or `<Component>.test.tsx` (`src/utils.test.ts`, `src/components/common/InteractiveRow.test.tsx`).
- **Backend:** `test_<feature>.py` (`tests/test_resilience.py`, `tests/test_plugin_api.py`, `tests/test_e2e_requirements.py`).

**Structure:**
```text
src/
├── chords.test.ts
├── index.test.tsx
├── utils.test.ts
├── components/
│   ├── DeckifyExpandedModal.test.tsx
│   ├── common/
│   │   ├── DeckifyImage.test.ts
│   │   └── InteractiveRow.test.tsx
│   └── tabs/
│       └── *.test.tsx
├── hooks/
│   └── usePlaybackClock.test.ts
└── utils/
    └── *.test.ts

tests/
├── test_token_refresh.py
├── test_plugin_api.py
├── test_resilience.py
├── test_e2e_requirements.py
└── ... (40 test modules total)
```

## Test Structure

**Suite Organization (Frontend — Vitest):**
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("DeckifyImage Pipeline", () => {
  describe("ImageLruCache", () => {
    it("stores and retrieves items correctly", () => {
      const cache = new ImageLruCache(3);
      cache.set("url1", "data:image/1");
      expect(cache.get("url1")).toBe("data:image/1");
      expect(cache.size).toBe(1);
    });
  });
});
```

**Suite Organization (Backend — `unittest`):**
```python
class PluginApiTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.plugin = main.Plugin()
        self.plugin._token_refresh_lock = asyncio.Lock()
        self.plugin._access_token = "valid-token"
        self.plugin._settings = dict(main.DEFAULT_SETTINGS)
        self.execute = self.enterContext(patch.object(main, "_exec", new_callable=AsyncMock))
        self.save = self.enterContext(patch.object(main, "_save_settings"))
        self.emit = self.enterContext(patch.object(main.decky, "emit", new_callable=AsyncMock))
```

**Patterns:**
- **Setup/Teardown:** Frontend uses `beforeEach` / `afterEach` to reset mock call history and local state arrays; Python uses `setUp` / `asyncSetUp` with `self.enterContext(patch.object(...))` so patches automatically unwind after each test.
- **No DOM runtime required for React component tests:** Component tests in `src/components/**/*.test.tsx` and `src/index.test.tsx` mock `react/jsx-runtime`, `react/jsx-dev-runtime`, `react` hooks, and `@decky/ui` components to return plain object trees (`{ type, props }`), then invoke callbacks (`tree.props.onFocus()`) directly.

## Mocking

**Framework:**
- **Frontend:** Vitest `vi.mock(...)` and `vi.fn(...)`.
- **Backend:** Python `unittest.mock` (`AsyncMock`, `MagicMock`, `Mock`, `patch`, `patch.dict`).

**Patterns (Frontend — `@decky/api` and `@decky/ui`):**
```typescript
vi.mock("@decky/api", () => ({
  callable: (name: string) => {
    if (name === "get_status") return (...args: any[]) => mockGetStatus(...args);
    return vi.fn().mockResolvedValue({ ok: true });
  },
  toaster: { toast: (...args: any[]) => mockToasterToast(...args) },
}));

vi.mock("@decky/ui", () => ({
  Focusable: ({ children, ...props }: any) => ({ type: "Focusable", props: { children, ...props } }),
}));
```

**Patterns (Backend — `decky` module stubbing):**
```python
with patch.dict("sys.modules", {"decky": SimpleNamespace(
    DECKY_PLUGIN_SETTINGS_DIR=tempfile.gettempdir(),
    DECKY_PLUGIN_DIR=tempfile.gettempdir(),
    DECKY_PLUGIN_RUNTIME_DIR=tempfile.gettempdir(),
    logger=Mock(),
    emit=AsyncMock(),
)}):
    import main
```

**What to Mock:**
- Decky runtime globals (`@decky/api`, `@decky/ui`, `decky` Python module).
- External network/HTTP calls (`main._exec`, `urllib.request`, Spotify Web API responses).
- Filesystem persistence (`main._save_settings`) or redirect paths to `tempfile.TemporaryDirectory()`.
- Monotonic clocks (`time.monotonic`) when testing debouncing, token expiry, or grace windows.

**What NOT to Mock:**
- Pure data transformations and state controllers (`ImageLruCache`, `ImageRequestQueue`, `parseLrc`, `PlaybackClockController`, `resilience.normalize_spotify_id`, `common._load_settings_impl`).

## Fixtures and Factories

**Test Data:**
- **Frontend:** Helper factory functions per test file (e.g., `renderRow(props)` in `src/components/common/InteractiveRow.test.tsx`, `makeTask()` in `src/components/common/DeckifyImage.test.ts`).
- **Backend:** `SimpleNamespace` stubs for `Plugin` or `decky`, `io.BytesIO` payloads for `HTTPError`, and `tempfile.TemporaryDirectory()` for settings/script file tests (`tests/test_resilience.py`, `tests/test_token_refresh.py`).

**Location:**
- Inline within each test module; no shared global fixture directory. `tests/test_plugin_api.py` imports the already-patched `main` module from `test_token_refresh`.

## Coverage

**Requirements:** None enforced as a hard threshold in CI, though `package.json` provides a unified coverage script and `.coveragerc` tracks `py_modules` and `main` (omitting `tests/*` and `*/node_modules/*`).

**View Coverage:**
```bash
pnpm run test:coverage
```
Runs `vitest run --coverage` (via `@vitest/coverage-v8`) followed by `python3 -m coverage run --source=py_modules,main -m unittest discover -s tests -p "test_*.py" && python3 -m coverage report -m`.

## Test Types

**Unit Tests:**
- Pure TypeScript logic (`src/utils.test.ts`, `src/chords.test.ts`, `src/hooks/usePlaybackClock.test.ts`, `src/utils/*.test.ts`).
- Isolated React component tree rendering and focus/interaction callbacks (`src/components/**/*.test.tsx`, `src/index.test.tsx`).
- Isolated Python module functions and `Plugin` RPC methods (`tests/test_resilience.py`, `tests/test_plugin_api.py`, `tests/test_token_refresh.py`).

**Integration & Requirement-Driven Tests:**
- `tests/test_e2e_requirements.py` implements an opaque-box 4-tier test suite (feature coverage, boundary/corner cases, cross-feature combinations, and end-to-end workflows) verifying external contracts, API schemas, CLI scripts, and packaging files.
- CI (`.github/workflows/ci.yml`) runs `lint`, `typecheck`, `test-frontend`, `test-backend`, and `build` on pushes and PRs to `main`.

## Common Patterns

**Async Testing:**
```python
async def test_revoked_authorization_is_cleared_once_for_concurrent_callers(self):
    results = await asyncio.gather(*(self.plugin._ensure_token() for _ in range(5)))
    self.assertEqual(results, [None] * 5)
    self.execute.assert_awaited_once()
```

**Error Testing:**
```python
async def test_control_playback_error_handling(self):
    self.execute.side_effect = RuntimeError("Network down")
    res = await self.plugin.control_playback("play")
    self.assertFalse(res["ok"])
    self.assertIn("Network down", res["error"])
```

---

*Testing analysis: 2026-11-26*
