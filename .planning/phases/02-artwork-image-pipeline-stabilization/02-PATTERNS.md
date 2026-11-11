# Phase 02: Artwork & Image Pipeline Stabilization - Pattern Map

**Mapped:** 2026-11-11  
**Files analyzed:** 5  
**Analogs found:** 5 / 5  

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| [`py_modules/images.py`](file:///C:/Users/djdje/Deckify/py_modules/images.py) | service | file-I/O, request-response | [`py_modules/images.py`](file:///C:/Users/djdje/Deckify/py_modules/images.py) | exact (in-place modification) |
| [`src/components/common/DeckifyImage.tsx`](file:///C:/Users/djdje/Deckify/src/components/common/DeckifyImage.tsx) | component | request-response, queue | [`src/components/common/DeckifyImage.tsx`](file:///C:/Users/djdje/Deckify/src/components/common/DeckifyImage.tsx) | exact (in-place modification) |
| [`tests/test_images.py`](file:///C:/Users/djdje/Deckify/tests/test_images.py) | test | request-response | [`tests/test_images.py`](file:///C:/Users/djdje/Deckify/tests/test_images.py) | exact (in-place modification) |
| [`src/components/common/DeckifyImage.test.ts`](file:///C:/Users/djdje/Deckify/src/components/common/DeckifyImage.test.ts) | test | batch, transform | [`src/utils.test.ts`](file:///C:/Users/djdje/Deckify/src/utils.test.ts) | role-match (Vitest unit tests) |
| [`tests/test_plugin_api.py`](file:///C:/Users/djdje/Deckify/tests/test_plugin_api.py) | test | request-response | [`tests/test_plugin_api.py`](file:///C:/Users/djdje/Deckify/tests/test_plugin_api.py) | exact (regression verification) |

---

## Pattern Assignments

### [`py_modules/images.py`](file:///C:/Users/djdje/Deckify/py_modules/images.py) (service, file-I/O & request-response)

**Analog:** [`py_modules/images.py`](file:///C:/Users/djdje/Deckify/py_modules/images.py#L1-L125) (tracked source)

**Imports pattern** (lines 1-8):
```python
import hashlib
import os
import urllib.parse
import urllib.request
from py_modules.common import CACHE_DIR, MAX_IMAGE_BYTES, _API_SSL_CTX

IMAGE_CACHE_DIR = os.path.join(CACHE_DIR, "images")
MAX_IMAGE_CACHE_BYTES = 50 * 1024 * 1024
```

**Validation & Domain Whitelist Pattern** (lines 11-23):
```python
# Existing check to be expanded:
def _validate_image_url(url: str) -> None:
    parsed = urllib.parse.urlsplit(url)
    host = parsed.hostname or ""
    if (
        parsed.scheme != "https"
        or parsed.port not in (None, 443)
        or parsed.username is not None
        or parsed.password is not None
        or not host.endswith((".scdn.co", ".spotifycdn.com"))
    ):
        raise ValueError("Only Spotify HTTPS image URLs are supported")
```
*Target Expansion for D-01 / IMG-01:*
```python
ALLOWED_SPOTIFY_DOMAINS = (
    "scdn.co",
    "spotifycdn.com",
    "spotifycdn.net",
    "spotify.com",
)

def _is_allowed_spotify_host(host: str) -> bool:
    if not host:
        return False
    host = host.lower()
    return any(host == domain or host.endswith("." + domain) for domain in ALLOWED_SPOTIFY_DOMAINS)
```

**Redirect & SSRF Guard Pattern** (lines 24-28):
```python
class _ImageRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        _validate_image_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)
```

**Mosaic & URI Translation Pattern** (lines 105-124):
```python
def _proxy_spotify_image_url(raw_url: str | None) -> str | None:
    if not raw_url or not isinstance(raw_url, str):
        return None
    raw = raw_url.strip()
    if not raw:
        return None
    if raw.startswith("spotify:image:mosaic:"):
        parts = [p for p in raw.split("spotify:image:mosaic:")[1].split(":") if p]
        if parts:
            raw = f"https://mosaic.scdn.co/300/{''.join(parts[:4])}"
    elif raw.startswith("spotify:mosaic:"):
        parts = [p for p in raw.split("spotify:mosaic:")[1].split(":") if p]
        if parts:
            raw = f"https://mosaic.scdn.co/300/{''.join(parts[:4])}"
    elif raw.startswith("spotify:image:"):
        img_id = raw.split("spotify:image:", 1)[1].strip()
        if img_id:
            raw = f"https://i.scdn.co/image/{img_id}"
    try:
        _validate_image_url(raw)
        return raw
    except ValueError:
        return None
```

**Error Handling & Fallback Pattern** (lines 80-102):
- Strict content-type checking (`image/jpeg`, `image/png`, `image/webp`, `image/gif`, `image/avif`) raising `RuntimeError` on invalid payloads or HTML error pages.
- Bounded read (`max_bytes + 1`) preventing memory exhaustion attacks.
- Graceful disk cache error suppression with fallback to live payload.

---

### [`src/components/common/DeckifyImage.tsx`](file:///C:/Users/djdje/Deckify/src/components/common/DeckifyImage.tsx) (component, request-response & queue)

**Analog:** [`src/components/common/DeckifyImage.tsx`](file:///C:/Users/djdje/Deckify/src/components/common/DeckifyImage.tsx#L1-L104) and icon pattern from [`src/components/DeckifyOverlay.tsx`](file:///C:/Users/djdje/Deckify/src/components/DeckifyOverlay.tsx#L70-L84)

**Imports Pattern** (lines 1-4):
```typescript
import { CSSProperties, ReactNode, useEffect, useState } from "react";
import { callable } from "@decky/api";
import { FaMusic } from "react-icons/fa";

const backendGetImage = callable<[string], { ok: boolean; data_url?: string; error?: string }>("get_image");
```

**LRU Cache Pattern** (replacing unbounded `Map` on line 6):
```typescript
export class ImageLruCache {
  private map = new Map<string, string>();
  constructor(private capacity: number = 200) {}

  get(key: string): string | undefined {
    const val = this.map.get(key);
    if (val !== undefined) {
      this.map.delete(key);
      this.map.set(key, val);
    }
    return val;
  }

  set(key: string, value: string): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.capacity) {
      const oldestKey = this.map.keys().next().value;
      if (oldestKey !== undefined) {
        this.map.delete(oldestKey);
      }
    }
    this.map.set(key, value);
  }

  has(key: string): boolean {
    return this.map.has(key);
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}

export const imgMemoryCache = new ImageLruCache(200);
```

**Worker Queue Pattern** (concurrency throttling for D-03):
```typescript
export class ImageRequestQueue {
  private activeCount = 0;
  private queue: Array<() => void> = [];

  constructor(private maxConcurrent: number = 4) {}

  enqueue<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const run = () => {
        this.activeCount++;
        task()
          .then(resolve)
          .catch(reject)
          .finally(() => {
            this.activeCount--;
            this.next();
          });
      };

      if (this.activeCount < this.maxConcurrent) {
        run();
      } else {
        this.queue.push(run);
      }
    });
  }

  private next(): void {
    if (this.queue.length > 0 && this.activeCount < this.maxConcurrent) {
      const nextTask = this.queue.shift();
      if (nextTask) nextTask();
    }
  }

  get pending(): number {
    return this.queue.length;
  }

  get active(): number {
    return this.activeCount;
  }
}

export const imgRequestQueue = new ImageRequestQueue(4);
export const imgPending = new Map<string, Promise<string | null>>();
```

**Loading Shimmer & Fallback Presentation Pattern** (lines 73-93 & overlay analog):
```typescript
// Shimmer CSS keyframes injected once or via inline CSS
// Fallback state matching SteamOS GamepadUI aesthetic:
if (!dataUrl) {
  if (fallback) {
    return (
      <div style={{ width, height, display: "flex", alignItems: "center", justifyContent: "center", ...style }}>
        {fallback}
      </div>
    );
  }
  if (isLoading) {
    return (
      <div
        className="deckify-image-skeleton"
        style={{
          width,
          height,
          backgroundColor: "#1a1a1a",
          animation: "deckifyShimmer 1.5s ease-in-out infinite",
          borderRadius: (style as any)?.borderRadius || 4,
          flexShrink: 0,
          ...style,
        }}
      />
    );
  }
  // Standardized FaMusic fallback
  return (
    <div
      style={{
        width,
        height,
        background: "rgba(255, 255, 255, 0.05)",
        borderRadius: (style as any)?.borderRadius || 4,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        ...style,
      }}
    >
      <FaMusic size={typeof width === "number" ? Math.max(12, Math.floor(width * 0.4)) : 14} color="rgba(255, 255, 255, 0.3)" />
    </div>
  );
}
```

---

### [`tests/test_images.py`](file:///C:/Users/djdje/Deckify/tests/test_images.py) (test, request-response)

**Analog:** [`tests/test_images.py`](file:///C:/Users/djdje/Deckify/tests/test_images.py#L1-L105) (tracked source)

**Imports & Setup Pattern** (lines 1-15):
```python
import unittest
from email.message import Message
from unittest.mock import Mock, patch
from urllib.request import Request

from test_token_refresh import main
from py_modules.images import (
    _validate_image_url,
    _proxy_spotify_image_url,
    _fetch_spotify_image,
    _ImageRedirectHandler,
    _is_allowed_spotify_host,
)

IMAGE = "https://i.scdn.co/image/album-cover"
```

**Unit Test Structure Pattern** (lines 18-48):
```python
def test_spotify_cdn_domains(self):
    valid_urls = [
        "https://i.scdn.co/image/abc",
        "https://mosaic.scdn.co/300/1234",
        "https://image-cdn-ak.spotifycdn.com/image/xyz",
        "https://image-cdn-fa.spotifycdn.com/image/xyz",
        "https://pickasso.spotifycdn.com/image/xyz",
        "https://seeded-session-images.scdn.co/v1/img/track/123",
        "https://image-cdn-ak.spotifycdn.net/image/xyz",
        "https://spotify.com/image/xyz",
    ]
    for url in valid_urls:
        with self.subTest(url=url):
            _validate_image_url(url)

def test_mosaic_and_spotify_uri_variations(self):
    self.assertEqual(
        _proxy_spotify_image_url("spotify:image:mosaic:abc:def:ghi:jkl"),
        "https://mosaic.scdn.co/300/abcdefghijkl",
    )
    self.assertEqual(
        _proxy_spotify_image_url("spotify:mosaic:abc:def"),
        "https://mosaic.scdn.co/300/abcdef",
    )
```

**SSRF & Spoofing Guard Test Pattern** (lines 33-48):
```python
def test_non_spotify_urls_are_rejected_before_fetch(self):
    urls = [
        "http://i.scdn.co/image/a",
        "https://127.0.0.1/a",
        "https://i.scdn.co.example.com/a",
        "https://fake-scdn.co/a",
        "https://scdn.co.attacker.com/a",
        "https://spotifycdn.com.evil.org/a",
        "file:///etc/passwd",
        "https://user:password@i.scdn.co/a",
        "https://i.scdn.co:1337/a",
        "",
    ]
    with patch.object(main.urllib.request, "build_opener") as opener:
        for url in urls:
            with self.subTest(url=url), self.assertRaises(ValueError):
                _fetch_spotify_image(url)
        opener.assert_not_called()
```

---

### [`src/components/common/DeckifyImage.test.ts`](file:///C:/Users/djdje/Deckify/src/components/common/DeckifyImage.test.ts) (test, batch & transform)

**Analog:** [`src/utils.test.ts`](file:///C:/Users/djdje/Deckify/src/utils.test.ts#L1-L91) (tracked source)

**Imports Pattern** (line 1):
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ImageLruCache, ImageRequestQueue } from "./DeckifyImage";
```

**Vitest Test Suite Structure Pattern** (lines 34-91):
```typescript
describe("DeckifyImage Pipeline", () => {
  describe("ImageLruCache", () => {
    it("stores and retrieves items correctly", () => {
      const cache = new ImageLruCache(3);
      cache.set("a", "data:image/a");
      expect(cache.get("a")).toBe("data:image/a");
    });

    it("evicts oldest item when capacity is exceeded", () => {
      const cache = new ImageLruCache(2);
      cache.set("a", "1");
      cache.set("b", "2");
      cache.set("c", "3");
      expect(cache.get("a")).toBeUndefined();
      expect(cache.get("b")).toBe("2");
      expect(cache.get("c")).toBe("3");
    });

    it("refreshes recency on get", () => {
      const cache = new ImageLruCache(2);
      cache.set("a", "1");
      cache.set("b", "2");
      cache.get("a"); // a becomes most recently used
      cache.set("c", "3"); // b is evicted
      expect(cache.get("a")).toBe("1");
      expect(cache.get("b")).toBeUndefined();
      expect(cache.get("c")).toBe("3");
    });
  });

  describe("ImageRequestQueue", () => {
    it("limits concurrent executions to maxConcurrent", async () => {
      const queue = new ImageRequestQueue(2);
      let active = 0;
      let peak = 0;

      const makeTask = () => () =>
        new Promise<void>((resolve) => {
          active++;
          peak = Math.max(peak, active);
          setTimeout(() => {
            active--;
            resolve();
          }, 10);
        });

      await Promise.all([
        queue.enqueue(makeTask()),
        queue.enqueue(makeTask()),
        queue.enqueue(makeTask()),
        queue.enqueue(makeTask()),
      ]);

      expect(peak).toBeLessThanOrEqual(2);
    });
  });
});
```

---

### [`tests/test_plugin_api.py`](file:///C:/Users/djdje/Deckify/tests/test_plugin_api.py) (test, request-response)

**Analog:** [`tests/test_plugin_api.py`](file:///C:/Users/djdje/Deckify/tests/test_plugin_api.py#L1-L50) (tracked source)

**Async RPC Method Testing Pattern**:
```python
async def test_get_image_rpc_success(self):
    with patch("py_modules.rpc_library._exec", new_callable=AsyncMock) as mock_exec:
        mock_exec.return_value = ("image/jpeg", b"fake-bytes")
        res = await self.plugin.get_image("https://i.scdn.co/image/abc")
        self.assertTrue(res["ok"])
        self.assertTrue(res["data_url"].startswith("data:image/jpeg;base64,"))

async def test_get_image_rpc_invalid_url(self):
    res = await self.plugin.get_image("http://localhost/evil.png")
    self.assertFalse(res["ok"])
    self.assertIn("error", res)
```

---

## Shared Patterns

### Error Handling & Graceful Degradation
**Source:** [`py_modules/images.py`](file:///C:/Users/djdje/Deckify/py_modules/images.py#L125-L136) & [`py_modules/rpc_library.py`](file:///C:/Users/djdje/Deckify/py_modules/rpc_library.py#L930-L939)  
**Apply to:** All image pipeline components (backend proxy, RPC handler, and React component)  
- Backend functions never raise uncaught exceptions to caller; invalid URLs safely return `None` or `{ "ok": False, "error": str(e) }`.
- Client component falls back to the low-contrast `FaMusic` neutral icon without throwing React rendering errors or breaking layout geometry.

### Content Security Policy (CSP) Data URI Encoding
**Source:** [`py_modules/rpc_library.py`](file:///C:/Users/djdje/Deckify/py_modules/rpc_library.py#L935-L937) & [`src/components/common/DeckifyImage.tsx`](file:///C:/Users/djdje/Deckify/src/components/common/DeckifyImage.tsx#L28)  
**Apply to:** Backend image encoder and frontend image renderer  
- Images fetched by the backend are base64-encoded and returned as RFC 2397 Data URIs (`data:{content_type};base64,{b64}`).
- Frontend immediately passes strings starting with `data:` or `http://127.0.0.1` directly to `<img src={...}>` without triggering unnecessary backend RPC lookups.

### Deduplication via Promise Map
**Source:** [`src/components/common/DeckifyImage.tsx`](file:///C:/Users/djdje/Deckify/src/components/common/DeckifyImage.tsx#L7)  
**Apply to:** Frontend image component and queue dispatch  
- In-flight operations for identical keys are registered in `imgPending: Map<string, Promise<string | null>>`.
- Concurrent callers for the same image source subscribe to the single running Promise rather than spawning duplicate worker jobs or RPC requests.

---

## No Analog Found

All 5 files have exact or high-quality role-match analogs in the existing codebase:
- `py_modules/images.py` (self-modification)
- `src/components/common/DeckifyImage.tsx` (self-modification)
- `tests/test_images.py` (self-modification)
- `src/components/common/DeckifyImage.test.ts` (analog: `src/utils.test.ts`)
- `tests/test_plugin_api.py` (self-modification / extension)

---

## Metadata

**Analog search scope:** `py_modules/`, `src/`, `tests/`  
**Files scanned:** 15  
**Pattern extraction date:** 2026-11-11  
**Verification check:** All analog source paths verified via `git ls-files`
