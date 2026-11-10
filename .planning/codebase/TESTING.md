---
last_mapped_commit: a61bbf8da7ad74d4ba42198f0c3841b6ef17f7f8
last_mapped_at: 2026-11-10
---
# Testing Patterns

**Analysis Date:** 2026-11-10

## Test Framework

**Runner:**
- Python: `unittest` standard library (`tests/test_*.py`)
- Frontend: Vitest 5.1.0 (`package.json`, `src/utils.test.ts`)
- Config: Vitest inline configuration via `package.json`

**Assertion Library:**
- Python: Standard `unittest.TestCase` assertions (`assertEqual`, `assertTrue`, `assertIn`, `assertRaises`)
- TypeScript: Vitest `expect` assertions

**Run Commands:**
```bash
# Run all Python unit tests (316 tests)
python3 -m unittest discover -s tests -p "test_*.py"

# Run frontend Vitest tests
pnpm test

# Run frontend tests in watch mode
pnpm exec vitest

# Run complete test coverage (Python + TypeScript)
pnpm run test:coverage
```

## Test File Organization

**Location:**
- Python: Centralized in root `tests/` directory.
- TypeScript: Co-located with source in `src/utils.test.ts`.

**Naming:**
- Python: Prefixed with `test_` (e.g., `tests/test_features.py`, `tests/test_images.py`).
- TypeScript: Suffix `.test.ts` (e.g., `src/utils.test.ts`).

**Structure:**
```
Deckify/
├── src/
│   └── utils.test.ts          # Frontend unit tests
└── tests/                     # Backend test suite
    ├── test_century_coverage.py
    ├── test_device_and_engine.py
    ├── test_device_name.py
    ├── test_e2e_requirements.py
    ├── test_features.py
    ├── test_final_coverage.py
    ├── test_images.py
    ├── test_plugin_advanced.py
    ├── test_plugin_api.py
    ├── test_plugin_corner_cases.py
    ├── test_plugin_error_matrix.py
    ├── test_plugin_full_coverage.py
    ├── test_plugin_lifecycle.py
    ├── test_py_modules.py
    ├── test_token_refresh.py
    └── test_uninstall.py
```

## Test Structure

**Python Suite Organization:**
```python
import unittest
from unittest.mock import patch, MagicMock, AsyncMock
from main import Plugin

class TestFeatures(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.plugin = Plugin()
        # Initialize mock settings and context
        
    def tearDown(self):
        # Cleanup mock resources
        pass

    async def test_toggle_like_track(self):
        with patch("py_modules.spotify.make_request") as mock_req:
            mock_req.return_value = {"status": 200}
            result = await self.plugin.toggle_like_track("track-123", True)
            self.assertTrue(result["success"])
```

**TypeScript Suite Organization:**
```typescript
import { describe, it, expect } from "vitest";
import { formatTime, sanitizeTitle } from "./types";

describe("Utility functions", () => {
  it("formats track duration correctly in mm:ss", () => {
    expect(formatTime(215000)).toBe("3:35");
    expect(formatTime(0)).toBe("0:00");
  });
});
```

## Mocking

**Framework:**
- Python: `unittest.mock` (`patch`, `MagicMock`, `AsyncMock`)
- TypeScript: Vitest `vi.fn()`, `vi.spyOn()`

**Backend Mocking Patterns:**
```python
# Mocking HTTP network requests
@patch("urllib.request.urlopen")
def test_spotify_api_call(self, mock_urlopen):
    mock_response = MagicMock()
    mock_response.read.return_value = b'{"is_playing": true}'
    mock_response.status = 200
    mock_urlopen.return_value.__enter__.return_value = mock_response
    
    state = self.plugin.get_player_state()
    self.assertTrue(state["is_playing"])
```

**What to Mock:**
- External Spotify Web API network requests (`urllib.request.urlopen`)
- LRCLIB lyrics network calls
- Subprocess executions (`subprocess.Popen`, `pactl`)
- Steam Deck filesystem paths and Decky Loader environment globals

**What NOT to Mock:**
- Pure data transformations and string sanitization logic
- Internal state transitions within the `Plugin` class
- Settings serialization / deserialization algorithms

## Fixtures and Factories

**Test Data:**
- Realistic Spotify API payload fixtures embedded as dictionary constants in test files representing:
  - Current playback states (`is_playing`, `item`, `device`, `progress_ms`)
  - Library track lists (`items`, `album`, `artists`, `duration_ms`)
  - LRCLIB JSON responses (`syncedLyrics`, `plainLyrics`)

## Coverage

**Requirements:**
- High test coverage maintained across all RPC endpoints and helper modules (>90% target).

**View Coverage:**
```bash
# Generate and display Python test coverage report
python3 -m coverage run --source=py_modules,main -m unittest discover -s tests -p "test_*.py"
python3 -m coverage report -m
```

## Test Types

**Unit Tests:**
- Validate individual functions: lyrics sanitization, image conversion, duration formatting, settings management.

**Integration Tests:**
- Validate full RPC command lifecycles: authentication exchange, token refresh, playback state caching, like state caching, engine start/stop.

**E2E / Regression Tests:**
- Verified live on target SteamOS hardware (`deck@steammachine`) via SSH deployment and manual GamepadUI verification.

---

*Testing analysis: 2026-11-10*
