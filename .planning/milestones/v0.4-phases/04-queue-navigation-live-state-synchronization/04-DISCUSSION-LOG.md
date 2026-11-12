# Phase 4: Queue Navigation & Live State Synchronization - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-11
**Phase:** 04-queue-navigation-live-state-synchronization
**Areas discussed:** Queue Playback Strategie, Queue UI Layout & Now Playing Weergave, State Synchronisatie & Optimistic Updates, Gamepad Focus & Controller Navigatie, Polling & Prestaties

---

## Queue Playback Strategie & Spotify Context

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit URIs sequence | Speel de aangeklikte track direct af met alle resterende queue-tracks als opvolgers (start altijd exact het juiste nummer) | ✓ |
| Single URI | Alleen het aangeklikte nummer starten: Spotify vult daarna zelf aan op basis van eerdere context of radio | |
| Context-gevoelig | Gebruik context_uri offset indien beschikbaar, val anders terug op de resterende URIs-lijst | |

**User's choice:** Explicit URIs sequence (`uris: [t.uri, ...remaining]`).
**Notes:** Backend RPC binding wordt hersteld (`"play_tracks"` in plaats van `"play_track"`).

---

## Queue UI Layout & Weergave van Huidige Track

| Option | Description | Selected |
|--------|-------------|----------|
| Aparte Now Playing kaart + Wachtrij | Aparte uitgelichte 'Now Playing' kaart bovenaan + 'Volgende in de wachtrij' lijst eronder | ✓ |
| Gecombineerde lijst | Eén gecombineerde lijst waarin het huidige nummer bovenaan staat met groen label | |
| Alleen komende nummers | Alleen de komende nummers tonen (huidige nummer staat al op het Now Playing scherm) | |

**User's choice:** Aparte uitgelichte 'Now Playing' kaart bovenaan + 'Volgende in de wachtrij' lijst eronder.
**Notes:** Duidelijk overzicht tussen het nummer dat nu speelt en wat er nog aankomt.

---

## State Synchronisatie & Optimistic Updates

| Option | Description | Selected |
|--------|-------------|----------|
| Optimistic UI Update | Werk de weergave direct lokaal bij (nieuwe 'Now Playing' + resterende wachtrij) en ververs de API-status na 600ms | ✓ |
| Laadindicator | Toon een kleine spinner op het aangeklikte nummer totdat de Spotify API de wissel bevestigt | |
| Server-gestuurd | Wacht tot het backend RPC-antwoord binnenkomt alvorens de lijst aan te passen | |

**User's choice:** Optimistic UI Update.
**Notes:** Zorgt voor directe reactiesnelheid zonder merkbare latentie op de Steam Deck.

---

## Gamepad Focus & Controller Navigatie

| Option | Description | Selected |
|--------|-------------|----------|
| Focus op wachtrij | Focus blijft op het volgende nummer in de lijst (of de Now Playing kaart als de wachtrij leeg is) | ✓ |
| Focus naar Now Playing | Na selectie springt de focus naar de Now Playing kaart bovenaan de QueueTab | |
| Tab wisselen | Na selectie automatisch terugkeren naar het hoofdscherm van de modal | |

**User's choice:** Focus behouden op de wachtrij.
**Notes:** Voorkomt focus loss of onbedoeld springen naar de zijbalk van de modal.

---

## Aanvullende Standaarden: Polling & Prestaties

- **Polling:** Event-driven bij tab-switch en na acties + 10s conservatief interval zolang QueueTab actief is (voorkomt 429 errors).
- **Acties:** Like toggle behouden via het hartje; optioneel actiemenu.
- **Lijstlengte:** Cap op 30-50 tracks voor gegarandeerde 60fps controller navigatie.
- **QAM Preview:** Buiten de scope van Fase 4 gehouden.

---

## the agent's Discretion

- Exacte CSS styling en focus-indicatie van de Now Playing header kaart in de QueueTab.
- Exacte timing (600-800ms) voor de achtergrond `get_queue` API refresh.

## Deferred Ideas

- Drag-and-drop queue reordering (Spotify Web API ondersteunt geen willekeurige reorder-endpoints).
- Queue weergave in de in-game HUD overlay (behoort tot Fase 5).
