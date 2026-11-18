# Phase 14: Gentle Sleep Timer Fade-Out - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-16
**Phase:** 14-gentle-sleep-timer-fade-out
**Areas discussed:** Fade-out timing & End-of-Track, Fade-out settings UI, Priority lock & ducking interaction, Drain delay & fading status UI

---

## Fade-out timing & End-of-Track

### Question 1: When should the fade-out begin relative to the sleep timer countdown?
| Option | Description | Selected |
|--------|-------------|----------|
| Start fade when timer expires (Recommended) | Countdown runs to 0, then fades to 0% over the fade window and pauses. Matches "remaining_seconds" literally. | |
| Start fade early (T - fade_duration) | Begins fading before 0 so playback pauses right when the timer hits 0. | ✓ |
| You decide | Pick the cleanest fit for sleep_timer_worker. | |

**User's choice:** Start fade early (T - fade_duration)
**Notes:** Playback pauses right when the timer hits 0.

### Question 2: How should "End of Track" mode behave with fade-out enabled?
| Option | Description | Selected |
|--------|-------------|----------|
| Pause immediately at track end (Recommended) | Plays the current track at full volume until it finishes, then pauses cleanly without cutting off the outro. | ✓ |
| Fade out near track end | Uses duration_ms - position_ms to fade during the last N seconds of the track. | |
| You decide | Pick the most natural behavior for End of Track. | |

**User's choice:** Pause immediately at track end (Recommended)
**Notes:** Preserves the full track outro.

---

## Fade-out settings UI

### Question 1: How should the user configure the sleep timer fade-out in SettingsTab's Backend Sleep Timer card?
| Option | Description | Selected |
|--------|-------------|----------|
| Preset pill row: Off / 15s / 30s / 60s (Recommended) | Matches SettingsTab's existing pill buttons (15m/30m/45m/60m and ducking duration pills), fast with D-pad, and "Off" disables fade-out. | |
| Toggle + SliderField | Separate on/off toggle plus a fine-grained seconds slider (e.g. 5s–120s). | ✓ |
| You decide | Match SettingsTab's existing controller ergonomics. | |

**User's choice:** Toggle + SliderField
**Notes:** Separate on/off toggle plus fine-grained seconds slider.

### Question 2: What slider range and placement should the fade-out control use?
| Option | Description | Selected |
|--------|-------------|----------|
| 5s–120s (step 5s, default 30s), SettingsTab only (Recommended) | Persists in settings.json; keeps QAM compact per Phase 10 convention. | ✓ |
| 5s–60s (step 5s, default 30s), SettingsTab only | Tighter range matching typical 15m–60m timers. | |
| You decide | Pick sensible slider bounds and persistence. | |

**User's choice:** 5s–120s (step 5s, default 30s), SettingsTab only (Recommended)
**Notes:** Persists in `settings.json`; QAM remains compact.

---

## Priority lock & ducking interaction

### Question 1: While the "sleep" priority lock is active, how should VolumeFader handle incoming game or voice ducking events?
| Option | Description | Selected |
|--------|-------------|----------|
| Track _duck_reasons silently, defer fade (Recommended) | Record game/voice add/remove in _duck_reasons while "sleep" lock is active, but do not interrupt the sleep fade-out. | |
| Ignore game/voice events completely | Drop any ducking calls while "sleep" lock is held. | |
| You decide | Pick the safest VolumeFader state-machine behavior. | ✓ |

**User's choice:** You decide
**Notes:** Delegated to agent discretion (tracking `_duck_reasons` silently while deferring fade is the safest state-machine behavior).

### Question 2: When the user cancels or resets the sleep timer mid-fade, how should volume be restored?
| Option | Description | Selected |
|--------|-------------|----------|
| Short 0.5s fade back to normal/ducked target (Recommended) | Smoothly recovers without a sudden volume jump, respecting active game/voice ducking if present. | ✓ |
| Instant snap to baseline | Immediately sets sink volume back to baseline in one pactl call. | |
| You decide | Pick the cleanest UX on mid-fade cancel. | |

**User's choice:** Short 0.5s fade back to normal/ducked target (Recommended)
**Notes:** Smooth 0.5s recovery respecting active ducking state.

---

## Drain delay & fading status UI

### Question 1: Should SleepTimerStatus expose a `fading` state so SettingsTab displays "Fading out..." during the fade window?
| Option | Description | Selected |
|--------|-------------|----------|
| Yes — expose fading: boolean (Recommended) | Shows "Fading out..." in SettingsTab's Backend Sleep Timer status instead of "Remaining: 1 min" during the fade window. | |
| No — keep existing countdown display | No UI status change needed during fade-out. | |
| You decide | Pick what gives the clearest user feedback. | ✓ |

**User's choice:** You decide
**Notes:** Delegated to agent discretion.

---

## the agent's Discretion

- `VolumeFader` state-machine handling of `_duck_reasons` while `"sleep"` priority lock is held (recommended: track silently and defer fade).
- Exact audio drain delay between `control_playback("pause")` and baseline restore, and exposing `fading: boolean` on `SleepTimerStatus` for `"Fading out..."` feedback.

## Deferred Ideas

None — discussion stayed within phase scope.
