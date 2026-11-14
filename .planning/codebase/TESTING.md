---
last_mapped_commit: 10018cbc1c9d1d294640d8866b3902ca56bcd816
last_mapped_at: 2026-11-14
---
<!-- refreshed: 2026-11-14 -->
# Testing Patterns

**Analysis Date:** 2026-11-14

## Test Framework

**Runner:**
- Frontend: Vitest `5.1.0` (`package.json`). No separate `vitest.config.*` file is used; Vitest runs with default discovery for `src/**/*.test.{ts,tsx}`.
- Backend: Python standard library `unittest` (`unittest.TestCase` and `unittest.IsolatedAsyncioTestCase`).

**Assertion Library:**
- Frontend: Vitest `expect` (`toBe`, `toEqual`, `toHaveLength`, `toBeUndefined`, `toHaveBeenCalled`).
- Backend: `unittest` assertions (`assertEqual`, `assertTrue`, `assertFalse`, `assertIn`, `assertRaises`, `assertAwaitedOnceWith`).

**Run Commands:**
```bash
pnpm test                                                       # Run all 15 Vitest files (112 tests)
pnpm run test:python                                            # Run Python unittest suite (Linux/macOS)
py -m unittest discover -s tests -p "test_*.py"                 # Run Python unittest suite (Windows)
pnpm run test:coverage                                          # Run Vitest + Python coverage reports
```

## Test File Organization

**Location:**
- Frontend tests are co-located alongside source files in `src/` (`src/utils.test.ts`, `src/hooks/usePlaybackClock.test.ts`, `src/components/DeckifyOverlay.test.tsx`).
- Backend tests live in a dedicated `tests/` directory (`tests/test_py_modules.py`, `tests/test_plugin_api.py`, `tests/test_token_refresh.py`).

**Naming:**
- Frontend: `<module>.test.ts` or `<Component>.test.tsx`.
- Backend: `test_<area>.py` (discovered via `-p "test_*.py"`).

**Structure:**
```text
src/
├── index.test.tsx
├── utils.test.ts
├── hooks/
│   └── usePlaybackClock.test.ts
├── utils/
│   ├── listNavigation.test.ts
│   └── triggerController.test.ts
└── components/
    ├── DeckifyExpandedModal.test.tsx
    ├── DeckifyOverlay.test.tsx
    ├── common/*.test.{ts,tsx}
    └── tabs/*.test.tsx
tests/
├── test_py_modules.py
├── test_plugin_api.py
├── test_token_refresh.py
└── test_*.py (19 test modules total)
```

## Test Structure

**Suite Organization (Frontend - Vitest):**
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("usePlaybackClock & PlaybackClockController", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("Monotonic Ticking & Interpolation", () => {
    it("advances position monotonically when isPlaying is true", () => {
      const clock = new PlaybackClockController({
        serverPositionMs: 10000,
        isPlaying: true,
        durationMs: 60000,
      });

      expect(clock.positionMs).toBe(10000);
      vi.advanceTimersByTime(1000);
      expect(clock.positionMs).toBe(11000);
      clock.destroy();
    });
  });
});
```
(From `src/hooks/usePlaybackClock.test.ts`.)

**Suite Organization (Backend - `unittest`):**
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
(From `tests/test_plugin_api.py`.)

**Patterns:**
- Frontend tests reset fake timers (`vi.useFakeTimers()` / `vi.useRealTimers()`) and custom hook slot arrays in `beforeEach`/`afterEach`.
- Backend async tests use `unittest.IsolatedAsyncioTestCase` with `self.enterContext(patch.object(...))` in `asyncSetUp` for automatic cleanup.
- Parameterized checks in Python use `with self.subTest(...):` (`tests/test_py_modules.py`).

## Mocking

**Framework:**
- Frontend: Vitest `vi.mock`, `vi.fn`, `vi.hoisted`.
- Backend: `unittest.mock` (`AsyncMock`, `MagicMock`, `Mock`, `patch`).

**Patterns (Frontend - Lightweight React & Decky Mocks):**
Component tests run in Node without jsdom/Testing Library by mocking `react`, `react/jsx-runtime`, `react/jsx-dev-runtime`, `@decky/ui`, and `@decky/api` to return plain element descriptor objects `{ type, props }`:
```typescript
vi.mock("@decky/ui", () => ({
  Focusable: ({ children, ...props }: any) => ({
    type: "Focusable",
    props: { children, ...props },
  }),
}));

vi.mock("react/jsx-runtime", () => ({
  Fragment: "Fragment",
  jsx: (type: any, props: any, key: any) => ({
    type,
    props: { ...props, ...(key !== undefined ? { key } : {}) },
  }),
  jsxs: (type: any, props: any, key: any) => ({
    type,
    props: { ...props, ...(key !== undefined ? { key } : {}) },
  }),
}));
```
(From `src/components/common/InteractiveRow.test.tsx`.) Stateful component tests (e.g., `src/components/DeckifyOverlay.test.tsx`) use slot arrays (`stateSlots`, `refSlots`, `effectSlots`) and a `flushEffects()` helper to simulate renders and hook lifecycles.

**Patterns (Backend - `decky` Module Injection):**
Tests inject a stub `decky` module into `sys.modules` before importing `main` or `py_modules`:
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
(From `tests/test_token_refresh.py` and `tests/test_py_modules.py`.)

**What to Mock:**
- `@decky/api` (`callable`, `toaster`, `addEventListener`), `@decky/ui` components, `react-icons/*`, and `react` JSX runtime in frontend tests.
- `decky` runtime namespace, `main._exec`, `main._save_settings`, `urllib.request.urlopen`, and `os.geteuid` in backend tests.

**What NOT to Mock:**
- Pure TypeScript logic (`PlaybackClockController`, `parseLrc`, `formatMs`, `listNavigation`, `triggerController`).
- Settings serialization (`_load_settings` / `_save_settings` tested against `tempfile.TemporaryDirectory()` in `tests/test_py_modules.py`).

## Fixtures and Factories

**Test Data:**
- Inline fixture objects and helper factory functions inside test files (e.g., `renderRow(props)` in `src/components/common/InteractiveRow.test.tsx`, `fail_http(status, body)` in `tests/test_token_refresh.py`).
- No shared global fixture directory; `tests/test_plugin_api.py` reuses the patched `main` module imported by `tests/test_token_refresh.py`.

## Coverage

**Requirements:** No minimum coverage threshold is enforced in CI (`.github/workflows/ci.yml`), though `.coveragerc` and `@vitest/coverage-v8` are configured.

**Config (`.coveragerc`):**
- Measures `py_modules` and `main`; omits `tests/*` and `*/node_modules/*`.

**View Coverage:**
```bash
pnpm run test:coverage
```

## Test Types

**Unit Tests:**
- Frontend: 15 Vitest test files (112 tests) covering hooks, utilities, component rendering trees, focus/gamepad callbacks, and plugin lifecycle (`src/index.test.tsx`).
- Backend: 19 `unittest` modules under `tests/` covering `py_modules.*`, `Plugin` RPC methods, token refresh concurrency, error matrices, and lifecycle/uninstall behavior.

**Integration Tests:**
- `tests/test_e2e_requirements.py` and `tests/test_plugin_full_coverage.py` exercise end-to-end backend flows with mocked transport/system boundaries.

**E2E Tests:**
- Not used (no browser/Playwright/Steam Deck hardware runner in CI).

## Common Patterns

**Async Testing:**
```python
async def test_control_playback_play_auto_transfer_success(self):
    self.plugin._active_device = None
    self.execute.side_effect = HTTPError("url", 404, "Not Found", {}, None)
    with patch.object(self.plugin, "_auto_transfer_and_play", new_callable=AsyncMock) as mock_transfer:
        mock_transfer.return_value = {"ok": True}
        res = await self.plugin.control_playback("play")
        self.assertTrue(res["ok"])
        mock_transfer.assert_awaited_once()
```
(From `tests/test_plugin_api.py`.)

**Error Testing:**
- Backend tests simulate `HTTPError("url", status, ...)` or `RuntimeError(...)` on `self.execute.side_effect` and assert `res["ok"] is False` and expected `res["error"]` substrings.
- Frontend tests assert graceful fallback or `mockToast` calls when `callable` mocks reject or return `{ ok: false }`.

---

*Testing analysis: 2026-11-14*
