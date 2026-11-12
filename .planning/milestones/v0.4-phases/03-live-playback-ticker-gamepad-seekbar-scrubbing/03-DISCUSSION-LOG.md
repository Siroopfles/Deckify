# Phase 3: Live Playback Ticker & Gamepad Seekbar Scrubbing - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-11
**Phase:** 03-live-playback-ticker-gamepad-seekbar-scrubbing
**Areas discussed:** Klok-interpolatie & rubberband/jitter-preventie, Gamepad Seekbar bediening & UI, Seek Debouncing & Optimistische UI, Gedeelde hook tussen Modal & Quick Access Menu

---

## 1. Klok-interpolatie & rubberband/jitter-preventie

| Option | Description | Selected |
|--------|-------------|----------|
| Drift-drempel | Bereken `localPos = serverPos + (now - syncTime)`; resynchroniseer alleen als het verschil > 1200ms is of bij pause/seek/track-switch | ✓ |
| Monotone voorwaartse lock | localPos tikt altijd vooruit met `Math.max(localPos, serverPos)` tijdens playback; alleen harde reset bij seek of track-switch | |
| Harde server-overschrijving | Elke polling-cyclus overschrijft direct de positie | |

**User's choice:** Drift-drempel (Bereken localPos = serverPos + (now - syncTime); resynchroniseer alleen als het verschil > 1200ms is of bij pause/seek/track-switch)
**Notes:** Voorkomt dat trage achtergrond-responses van de Spotify API de secondeteller schokkerig 1 seconde terugzetten.

---

## 2. Gamepad Seekbar bediening & UI

| Option | Description | Selected |
|--------|-------------|----------|
| Gestylede progressbar met directe scrubber beweging | Duidelijke focus op de bar, en direct de scrubber over de bar kunnen bewegen als je erop staat | ✓ |
| Decky UI SliderField | Zoals in het Quick Access Menu voor standaard SteamOS slider | |
| Alleen gestylede progressbar zonder knoppen | Geen -15s/+15s knoppen | |

**User's choice:** "Die gestylde progressbar maar ik wil dat je gewoon de bar kan bewegen als je op de bar staat"
**Notes:** De gebruiker wil de mooie Spotify-achtige progress bar behouden, met duidelijke Gamepad focus, waarbij D-pad links/rechts direct de scrubber over de bar beweegt.

---

## 3. Seek Debouncing & Optimistische UI

| Option | Description | Selected |
|--------|-------------|----------|
| Directe vloeiende scrubber met debounced RPC (300ms) | Bar & tijd bewegen direct mee; na 300ms inactiviteit definitieve backend commit | ✓ |
| Directe seek per stap met cooldown | Max 1 RPC per 500ms tijdens navigatie | |
| Bevestig met knop (A-knop) | Links/rechts toont preview, A-knop bevestigt | |

**User's choice:** Directe vloeiende scrubber-beweging met debounced RPC (300ms)
**Notes:** Zorgt voor vertragingsvrije feedback voor de gebruiker terwijl rate-limiting en network spam worden voorkomen.

---

## 4. Gedeelde hook tussen Modal & Quick Access Menu

| Option | Description | Selected |
|--------|-------------|----------|
| Centrale gedeelde hook | usePlaybackClock / usePlaybackStatus voor zowel Modal als QAM | ✓ |
| Alleen Modal aanpakken | QAM gescheiden houden | |

**User's choice:** Ja, één centrale gedeelde hook voor zowel de Expanded Modal als het Quick Access Menu, inclusief Vitest tests.
**Notes:** Verzekert consistente tijdweergave en dezelfde scrubbing-ervaring ongeacht waar de gebruiker naar Spotify kijkt.

---

## the agent's Discretion

- Dynamische stapgroottecurve (bijv. 10s voor reguliere tracks, 30s voor lange podcasts).
- Exacte visual focus glow styles voor GamepadUI.

## Deferred Ideas
None recorded during this discussion.
