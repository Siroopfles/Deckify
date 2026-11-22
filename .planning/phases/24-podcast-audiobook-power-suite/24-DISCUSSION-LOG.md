# Phase 24: Podcast & Audiobook Power Suite - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-22
**Phase:** 24-podcast-audiobook-power-suite
**Areas discussed:** Afspeelsnelheid UI & stappen, Snelheidsgedrag & muziek-reset, -15s / +15s Smart-Skip & L2/R2 triggers, PodcastsTab voortgang & filters

---

## Afspeelsnelheid (0.75x–2.0x) UI & stappen

| Option | Description | Selected |
|--------|-------------|----------|
| Preset-rij (0.75x–2.0x) in NowPlayingTab + compacte cycle-knop in QAM | Preset controls in NowPlayingTab, single cycle button in QAM | (aangepast) |
| Overal één compacte cycle-knop | Single cycle button in both NowPlayingTab and QAM | |
| Overal een volledige preset-rij met 6 pills | 6 preset pills in both NowPlayingTab and QAM | |

**User's choice:** `Recommended maar dropdown en ook 0,5 optie ernogbij`
**Notes:** In `NowPlayingTab` a `@decky/ui` `Dropdown` selector is used instead of pills, and `0.5x` is included alongside `0.75x`, `1.0x`, `1.25x`, `1.5x`, `1.75x`, and `2.0x`. QAM keeps the compact cycle button.

---

## Snelheidsgedrag & muziek-reset

| Option | Description | Selected |
|--------|-------------|----------|
| Onthoud gekozen podcast-snelheid voor volgende episodes; reset naar 1.0x zodra muziek start (herstel bij volgende podcast) | Persist preferred podcast speed across episodes, reset to 1.0x on music, restore on next podcast | ✓ |
| Reset altijd naar 1.0x bij elke nieuwe episode én bij muziek | Always reset to 1.0x on every episode and music track | |
| Onthoud gekozen snelheid per podcast-show apart | Store playback speed per individual podcast show | |

**User's choice:** Onthoud gekozen podcast-snelheid voor volgende episodes; reset naar `1.0x` zodra muziek start (herstel bij volgende podcast)
**Notes:** —

---

## -15s / +15s Smart-Skip & L2/R2 triggers

| Option | Description | Selected |
|--------|-------------|----------|
| In podcast-modus vervangen -15s / +15s de Vorige/Volgende-knoppen en L2/R2 doet -15s / +15s | Replace Previous/Next buttons in NowPlayingTab and adapt L2/R2 triggers to -15s / +15s | ✓ |
| -15s / +15s als extra knoppen naast Vorige/Volgende, en L2/R2 doet -15s / +15s | Add extra buttons alongside Previous/Next | |
| -15s / +15s alleen in NowPlayingTab; L2/R2 blijft normaal zoeken | Keep L2/R2 at standard ±10s seek | |

**User's choice:** In podcast-modus vervangen `-15s` / `+15s` de Vorige/Volgende-knoppen en `L2`/`R2` doet `-15s` / `+15s`
**Notes:** —

---

## PodcastsTab voortgang & filters

| Option | Description | Selected |
|--------|-------------|----------|
| Progress bar + 'Played' / 'Xm left' badge, en All/Unplayed/In Progress filter op zowel Shows als Saved Episodes | Thin green progress bar + Played/remaining badge, filter pills on both opened Shows and Saved Episodes | ✓ |
| Filter alleen binnen een geopende Show (Saved Episodes zonder filter) | Filter pills only inside an opened Show | |
| Alleen progress bar + 'Played' badge (zonder resterende tijd) | Progress bar + Played badge without remaining time | |

**User's choice:** Progress bar + `'Played'` / `'Xm left'` badge, en `All` / `Unplayed` / `In Progress` filter op zowel Shows als Saved Episodes
**Notes:** —

---

## the agent's Discretion

- Exact backend mechanism for applying playback speed (`spotify_client` CDP vs `librespot` / graceful fallback).
- Exact visual styling of the thin green progress bar, `"Played"` / `"Xm left"` badge, and filter pills within `PodcastsTab.tsx`.
- Exact QAM placement of the compact speed cycle control during podcast/audiobook playback.

## Deferred Ideas

None.
