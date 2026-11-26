# Phase 29: 10-Foot Docked TV Split-View Mode & PipeWire Spectrum Visualizer - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-26
**Phase:** 29-10-foot-docked-tv-split-view-mode-pipewire-spectrum-visualiz
**Areas discussed:** TV Split-View Entry & Dock Auto-Activation, Split-View Layout, Controls & Jam QR, 16-Band PipeWire Spectrum Visualizer, Undock & Eco-Mode Lifecycle

---

## TV Split-View Entry & Dock Auto-Activation

### Question 1: Manual entry & exit
| Option | Description | Selected |
|--------|-------------|----------|
| Header toggle button + QAM toggle | Quick 1-click "TV Mode" pill in header and QAM toggle | |
| Dedicated sidebar tab ("TV View") | Appears as a tab alongside Now Playing, Lyrics, Queue | |
| Both header toggle and NowPlayingTab button | Header pill plus button in NowPlayingTab | |

**User's choice:** `NowPlayingTab` only ("Idk eigenlijk ik denk dat nowplaying tab het logischste is alleen")
**Notes:** Entry button lives in `NowPlayingTab` only.

### Question 2: Auto-activation on dock / Steam Machine
| Option | Description | Selected |
|--------|-------------|----------|
| Auto-enter when modal opens while docked/HDMI-connected | Never interrupts a game | |
| Auto-switch live on dock hotplug | Plus optional "Always start in TV Mode" | |
| Both: live switch + open directly in TV Mode | Combined behavior | |

**User's choice:** Fully customizable ("Fully customizable")
**Notes:** Expose auto-activation options in `SettingsTab` so users can choose their preferred behavior.

### Question 3: Steam Machine detection
| Option | Description | Selected |
|--------|-------------|----------|
| Detect Steam Machine (no battery / no acp5x) + HDMI/USB-DAC sink | Allows Auto TV Mode without dock hotplug event | ✓ |
| Rely strictly on DockAudioSwitcher hotplug events | Steam Machine users toggle manually | |
| You decide | Best hardware signal heuristic | |

**User's choice:** Detect Steam Machine (no battery / no `acp5x`) + HDMI/USB-DAC sink
**Notes:** User specifically asked to account for SteamOS Steam Machines in addition to Steam Deck.

### Question 4: B button behavior
| Option | Description | Selected |
|--------|-------------|----------|
| B returns to NowPlayingTab (normal modal), plus an "Exit TV Mode" button | Easy jump back to library/settings | ✓ |
| B closes entire Deckify modal; use on-screen button to return | Standalone 10-foot mode | |
| You decide | Match existing `vgp_oncancel` conventions | |

**User's choice:** `B` returns to `NowPlayingTab` (normal modal), plus an explicit "Exit TV Mode" button.

---

## Split-View Layout, Controls & Jam QR

### Question 1: Left and Right pane contents
| Option | Description | Selected |
|--------|-------------|----------|
| Left: Large Cover Art + Glow + Title/Artist + Progress & Transport \| Right: 10-ft Karaoke Lyrics + Up Next + Jam QR badge | Clean 50/50 split with full couch controller playback | ✓ |
| Left: Pure Cover Art + Glow + Title/Artist (no buttons) \| Right: Lyrics + Up Next | Ultra-minimalist cinema aesthetic | |
| You decide | Best 10-foot couch readability | |

**User's choice:** Left: Large Cover Art + Dynamic Glow + Title/Artist + Progress & Transport (`Prev`/`Play-Pause`/`Next`/`Like`) | Right: 10-ft Karaoke Lyrics + Up Next + Jam QR badge.

### Question 2: Jam QR badge/card behavior
| Option | Description | Selected |
|--------|-------------|----------|
| Compact "Jam QR" badge/button in top-right that expands inline JamQrCard or opens JamQrModal | Keeps lyrics/queue clean until guests want to scan | ✓ |
| Always-visible mini JamQrCard in bottom-right corner when Jam is active | Always scannable from couch | |
| You decide | Best balance of scannability and 10-foot space | |

**User's choice:** Compact "Jam QR" badge/button in top-right that expands inline `JamQrCard` or opens `JamQrModal`.

### Question 3: No-lyrics fallback
| Option | Description | Selected |
|--------|-------------|----------|
| Expand Up Next queue preview to fill right pane | Keeps TV screen lively without empty space | ✓ |
| Show clean "No lyrics available" state with album/release metadata | Consistent layout structure | |
| You decide | Best fallback | |

**User's choice:** Expand Up Next queue preview to fill the right pane when no lyrics are available.

### Question 4: Up Next interactivity & quick toggles
| Option | Description | Selected |
|--------|-------------|----------|
| Interactive Up Next rows (press A to jump) + quick Romanization & Visualizer toggles in TV top bar | Full couch control without leaving TV Mode | ✓ |
| Read-only Up Next preview (3-4 tracks) + D-pad on Left transport & Top bar | Prevents accidental queue jumps | |
| You decide | Best controller navigation ergonomics | |

**User's choice:** Interactive Up Next rows (press `A` to jump) + quick Romanization & Visualizer toggles in TV top bar.

---

## 16-Band PipeWire Spectrum Visualizer

### Question 1: Default state
| Option | Description | Selected |
|--------|-------------|----------|
| On by default when TvSplitView opens (if playing & Eco-Mode allows), with toggle in TV top bar & SettingsTab | Immediate living-room wow factor | ✓ |
| Off by default (opt-in) | Strictly minimal unless enabled | |
| On by default when docked/AC-powered, off on battery | Power-aware default | |

**User's choice:** On by default with option to toggle on/off ("Recommended maar wel option om aan of uit te zetten").

### Question 2: Visualizer placement & styles
| Option | Description | Selected |
|--------|-------------|----------|
| Compact 16-band bar strip below Left pane cover art / above transport | Balances left column | |
| Full-width subtle bar strip anchored along bottom of TvSplitView | Classic hi-fi receiver look | |
| You decide | Best visual balance | |

**User's choice:** Multiple configurable styles ("Verschillende instelbare stijlen") — support selectable visualizer styles/placements in settings/TV bar.

### Question 3: Coloring
| Option | Description | Selected |
|--------|-------------|----------|
| Automatically match active Deckify accent theme (Dynamic Album Glow / Spotify Green / Deck Blue) | Seamless visual cohesion | ✓ |
| Classic Spotify Green gradient with peak-hold caps | Signature audio-gear look | |
| You decide | Follow theme accent | |

**User's choice:** Automatically match the active Deckify accent theme.

### Question 4: Remote Connect device fallback
| Option | Description | Selected |
|--------|-------------|----------|
| Hide spectrum bars cleanly and show subtle "Remote device — local spectrum off" pill | Zero fake animation, clean UI | ✓ |
| Show flat resting baseline bars with "Remote" badge | Preserves layout height | |
| You decide | Cleanest transition | |

**User's choice:** Hide spectrum bars cleanly and show a subtle *"Remote device — local spectrum off"* pill.

---

## Undock & Eco-Mode Lifecycle

### Question 1: Undock behavior
| Option | Description | Selected |
|--------|-------------|----------|
| Auto-exit only if TV Mode was auto-activated by docking; stay if opened manually | Respects explicit user choice | ✓ |
| Always auto-exit back to NowPlayingTab on undock | Strict docked-only behavior | |
| Never auto-exit on undock | Avoids jarring jumps | |

**User's choice:** Auto-exit only if TV Mode was auto-activated by docking; stay in TV Mode if opened manually.

### Question 2: Eco-Mode interaction
| Option | Description | Selected |
|--------|-------------|----------|
| Suspend visualizer when Eco-Mode is actively throttling (on battery during gameplay), showing subtle "Eco-Mode active" pill; run freely on AC / Dock / Steam Machine | Matches ECO-01 & TV-02 cleanly | ✓ |
| Suspend visualizer whenever on battery if Eco-Mode is enabled | Maximum battery savings | |
| You decide | Align with Eco-Mode helper | |

**User's choice:** Suspend visualizer when Eco-Mode is actively throttling on battery during gameplay; run freely on AC / Dock / Steam Machine.

### Question 3: Paused visualizer state
| Option | Description | Selected |
|--------|-------------|----------|
| Smoothly drop bars to flat idle baseline while paused (and terminate parec within <100ms), resume on Play | Prevents layout shift while saving 100% DSP CPU | ✓ |
| Collapse/hide visualizer strip completely while paused | Minimalist paused state | |
| You decide | Cleanest UX with zero layout shift | |

**User's choice:** Smoothly drop bars to a flat idle baseline while paused (and terminate `parec` within `<100ms`), then resume automatically on Play.

### Question 4: OLED Burn-in / Idle protection
| Option | Description | Selected |
|--------|-------------|----------|
| Rely on SteamOS display sleep without extra screensaver | Simple | |
| Optional "Ambient / Burn-in Guard" toggle in TV Settings that slightly dims static UI chrome after 5 minutes of no controller input | Protects OLED TVs & Deck OLED | ✓ |
| You decide | Match existing modal | |

**User's choice:** Optional **"Ambient / Burn-in Guard"** toggle in TV Settings that slightly dims static UI chrome after 5 minutes of no controller input.

---

## the agent's Discretion
- Exact 50/50 split layout proportions, 10-foot font scaling, and `flow-children` focus order.
- Pure-Python 16-band logarithmic FFT/DFT binning over 15 Hz `parec` PCM frames (no C-extension `LD_LIBRARY_PATH` issues).
- Steam Machine hardware detection heuristic (`BAT*` absence + `acp5x` sink absence).

## Deferred Ideas
- None — discussion stayed within phase scope.
- Reviewed Todo (not folded): `2026-11-21-investigate-decky-loader-breakage-after-steam-update.md` (unrelated).
