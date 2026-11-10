# Features Research: Deckify Experience & Polish

**Domain:** Music Client for Handheld Gaming (Steam Deck)  
**Researched:** 2026-11-10  
**Confidence:** HIGH  

## Feature Scope & Expected Behavior

### 1. Live Now Playing Progress & Scrubbing
- **Real-Time Position Ticker**: 
  - Ticks every second while playing without waiting for 1.5s/4s backend polling.
  - UI binds to local ticking position `currentPositionMs` (interpolated with system clock `performance.now()`) rather than stale backend snapshots.
  - Formats elapsed and total duration cleanly (`mm:ss`).
- **Interactive Seek Bar (Gamepad Scrubbing)**:
  - Users can highlight the progress bar with D-pad navigation.
  - D-pad Left/Right or Left Stick steps backward/forward (e.g. ±10s or smooth seek).
  - Pressing A on progress bar or releasing seek triggers `backendSeekPlayback`.

### 2. Reliable Queue Browsing & Playback
- **Queue Track Click**:
  - Clicking any track in the queue triggers playback of that specific track.
  - Correctly constructs playback parameters (handling queue URIs vs context URIs).
  - Immediately updates "Now Playing" and remaining queue without requiring modal reopen.

### 3. Comprehensive Artwork & Cover Loading
- **Cover Display Coverage**:
  - Album covers, playlist mosaic collages, artist profile circles, podcast show thumbnails, and episode art all load reliably.
  - Graceful placeholders when no art is available or during offline mode.
  - Base64 cache avoids re-fetching covers across tab switches.

### 4. In-Game HUD Overlay
- **HUD Toast / Floating Pill**:
  - Displays currently playing song, artist, album art, and playing/paused badge.
  - Configurable position (`top-right`, `top-left`, `bottom-right`, `bottom-left`).
  - Auto-hide option (show for 5 seconds on track change, or persistent toggle).
  - Toggle switch in Settings tab is easily discoverable and persists to `settings.json`.

### 5. Architectural Maintainability
- Independent tabs load their own data on demand.
- Modals don't crash when switching views rapidly.
- Clean separation between presentation components and RPC service calls.

---
*Features research compiled for Deckify milestone planning.*
