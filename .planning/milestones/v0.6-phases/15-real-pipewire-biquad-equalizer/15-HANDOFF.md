# Phase 15 — Session Handoff (2026-11-16)

## Overzicht van wat is gedaan

### 1. Phase 15 Planning, UI-Phase & Executie (`Real PipeWire Biquad Equalizer`)
- **Research & Validatie:** [15-RESEARCH.md](15-RESEARCH.md), [15-VALIDATION.md](15-VALIDATION.md), [15-PATTERNS.md](15-PATTERNS.md)
- **UI Design Contract:** [15-UI-SPEC.md](15-UI-SPEC.md) (`status: approved`)
- **Wave 1 Backend (`15-01`, commits `0d3bffd`, `d2d2332`, `d335e8f`):**
  - `py_modules/equalizer.py`: `EqualizerManager` met geïsoleerde `pipewire -c` 10-band biquad `filter-chain` (`31Hz`–`16kHz`), 7 presets (`flat`, `bass`, `vocal`, `gaming`, `deck_speakers`, `late_night`, `custom`), automatische negatieve preamp (`-max(0, max_band_gain)`), `~75ms` `pw-cli` coalescing en `500ms` settings debounce.
  - `py_modules/engine.py`, `py_modules/volume.py`, `py_modules/common.py`, `main.py`: Stream-isolatie (`librespot` / `effect_output.deckify_eq` los van `steamwebhelper` / `Chromium` / game audio), 7-preset validatie en `set_eq_bands` RPC.
  - `tests/test_equalizer.py`: Backend unit tests.
- **Wave 2 Frontend (`15-02`, commits `7c5f8c6`, `9d6ae08`):**
  - `src/types.ts`, `src/components/tabs/SettingsTab.tsx`, `src/components/tabs/SettingsTab.test.tsx`: 7 preset pills in 2 `<Focusable flow-children="horizontal">` rijen (4 + 3), `Bypass (0.0 dB)` / `Preamp` header-indicator, QAM schoon gehouden (`D-08`).

### 2. UAT-Fixes & Discovery Rate-Limit Fix
- **Commit `5743b12` — Flat bypass, slider snap-back & verticale EQ UI:**
  - `py_modules/equalizer.py`: In `apply_preset("flat")` wordt `librespot` nu **eerst** terugverplaatst naar de echte default hardware sink (`pactl get-default-sink`) voordat `pipewire -c` stopt, zodat actieve muziek niet meer afbreekt bij `Flat`.
  - `src/components/tabs/SettingsTab.tsx`: Achtergrond-statuspolls overschrijven actieve lokale EQ-bewerkingen niet meer (`eqDirtyUntilRef`), en de 10 ISO-banden zijn omgezet naar een compacte **verticale 10-band graphic EQ** met live dB-waarde, `+`/`-` knoppen (`0.5 dB` stap) en sleepbare fader-rails.
- **Commit `70b42ab` — `eq_custom_bands` persistentie in `get_status()`:**
  - `main.py`: `"eq_custom_bands"` toegevoegd aan `public_keys` in `Plugin.get_status()` (en getest in `tests/test_equalizer.py`), zodat bij heropenen van Settings de opgeslagen `Custom`-curve behouden blijft i.p.v. naar `0` te resetten.
- **Commit `69b6dbc` — DiscoveryTab oneindige refresh-loop opgelost:**
  - `src/components/tabs/DiscoveryTab.tsx`: `onFocusTrack` en `onFocusCollection` via refs bijgehouden i.p.v. in de `useEffect`-dependency array, zodat inline callbacks vanuit `DeckifyExpandedModal.tsx` niet meer bij elke render/clock-tick `get_discovery_feed` herhalen.

### 3. Deployment
- Alles is gebouwd (`rollup -c`) en gedeployed naar `deck@<STEAM_MACHINE_IP>:/home/deck/homebrew/plugins/Deckify` via `./deploy.sh`.

---

## Huidige Status & Openstaande Verificatie

- **Geautomatiseerde tests:** Alle backend (`501/501` Python unittest) en frontend (`159/159` Vitest, `tsc --noEmit`, `eslint`) checks zijn geslaagd.
- **UAT ([15-UAT.md](15-UAT.md)):**
  - Test 4 (D-pad navigatie & compact QAM): **Pass**
  - Test 5 (Persistence na restart/reboot): **Pass**
  - Test 3 (Output sink switch in Settings): **Skipped** (nog geen output sink selector zichtbaar in Settings — onderdeel van Phase 16)
  - Test 1 (`Flat` zonder muziekonderbreking) & Test 2 (Live geluid van verticale 10-band EQ + `Custom` behoud): **Wachten op laatste live audio-check** zodra Spotify's tijdelijke account-/Connect-throttling weer vrij is.

## Vervolgstap
Zodra Spotify weer afspeelt op je Steam Deck:
1. Run `/gsd-verify-work 15` om Test 1 en Test 2 live af te ronden.
2. Daarna kan Phase 15 worden afgesloten en door naar Phase 16 (`/gsd-plan-phase 16`).
