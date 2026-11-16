# Phase 15: Real PipeWire Biquad Equalizer - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-16
**Phase:** 15-real-pipewire-biquad-equalizer
**Areas discussed:** Custom 10-band UI & preset editing, Flat bypass & sink routing, Preamp & clipping protection, Slider update feel & QAM visibility

---

## Custom 10-band UI & preset editing

| Option | Description | Selected |
|--------|-------------|----------|
| 5th "Custom" pill reveals sliders | Keeps SettingsTab compact on presets | |
| Always show sliders below pills | Sliders remain visible; adjusting auto-switches to Custom | ✓ (with 10-band ISO) |
| 7-band vs 10-band ISO | 7-band (60Hz–15kHz) vs 10-band ISO (31Hz–16kHz) | ✓ 10-band ISO |
| Sliders reflect active preset curve | Clicking preset moves sliders; tweaking forks into Custom | ✓ |
| Separate Custom curve | Sliders only show Custom values | |

**User's choice:** 10-band ISO (`31Hz–16kHz`), always-visible sliders, sliders reflect active preset and fork to Custom on edit. Also requested expanding from 3 sound presets (`Bass Boost`, `Vocal Clarity`, `Gaming Balance`) to 5 sound presets (plus `Flat` and `Custom`), with research designing the 2 additional presets.

---

## Flat bypass & sink routing

| Option | Description | Selected |
|--------|-------------|----------|
| True bypass on Flat | Tear down `pipewire -c` when Flat is selected and route `librespot` directly to hardware sink | ✓ |
| Always-on filter-chain | Keep `pipewire -c` running at 0 dB | |
| Move EQ output stream to new sink | Keep `librespot` routed into `deckify_eq_sink` and move `effect_output.deckify_eq` on sink change | ✓ |
| Bypass EQ on sink switch | Revert to Flat on sink switch | |

**User's choice:** True bypass on `Flat`, and move `effect_output.deckify_eq` to the new sink when switching output sinks in `SettingsTab`.

---

## Preamp & clipping protection

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-preamp headroom | Automatically apply `-max(0, highest_boost)` to prevent clipping | ✓ |
| 0 dB unity preamp | No automatic attenuation | |
| Manual Preamp slider | Extra slider above bands | |
| ±12 dB in 1.0 dB steps | Standard range, fast D-pad sweep | |
| ±12 dB in 0.5 dB steps | Finer precision per D-pad press | ✓ |
| ±6 dB in 0.5 dB steps | Subtle range | |

**User's choice:** Auto-preamp headroom (`-max(0, highest_boost)`) and `±12 dB` in `0.5 dB` steps.

---

## Slider update feel & QAM visibility

| Option | Description | Selected |
|--------|-------------|----------|
| Throttled live updates (~75ms) + debounced save | Real-time sweep without `pw-cli` spam, debounced disk save | ✓ |
| Apply only after settling (~300ms debounce) | Audio changes only after stopping | |
| Keep QAM compact — no EQ controls | Consistent with Phase 10 & 14; all EQ in `SettingsTab` | ✓ |
| Show compact EQ preset indicator/pill in QAM | Display badge/toggle in QAM | |

**User's choice:** Throttled live `pw-cli` updates (`~75ms`) with debounced `settings.json` save, and keep QAM compact without EQ controls.

---

## the agent's Discretion

- PipeWire `filter-chain` config generation (`bq_lowshelf`, `bq_peaking`, `bq_highshelf` Q-factors and `pw-dump` node/port discovery) in `py_modules/equalizer.py`.
- Layout of the 7 preset pills (`Flat` + 5 presets + `Custom`) in `SettingsTab.tsx`.
- Graceful fallback to direct hardware sink routing if `pipewire -c` fails to start.

## Deferred Ideas

None — discussion stayed within phase scope.
