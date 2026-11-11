# Phase 5: In-Game HUD Overlay Restoration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-11
**Phase:** 05-in-game-hud-overlay-restoration
**Areas discussed:** HUD Weergavemodus, In-Game Controls & QAM, Visuele Stijl & Voortgang, Pauze-gedrag & Lifecycle

---

## HUD Weergavemodus: Permanent vs Auto-Hide

| Option | Description | Selected |
|--------|-------------|----------|
| Configureerbaar | Keuze tussen 'Permanent' en 'Auto-hide na 6s' (gebruiker bepaalt zelf) | ✓ |
| Altijd Auto-hide | Verschijnt 6 seconden bij nummerwissel/hervatten en fadet weg | |
| Altijd Permanent | Blijft continu subtiel in de hoek staan zolang er muziek speelt | |

**User's choice:** Configureerbaar tussen Permanent en Auto-hide na 6s (`overlay_autohide: boolean`).
**Notes:** Gebruikers die hun scherm vrij willen houden tijdens gameplay kunnen auto-hide aanzetten.

---

## HUD Bediening in Quick Access Menu (QAM)

| Option | Description | Selected |
|--------|-------------|----------|
| Snelle Toggle + Positie in QAM | Compacte toggle en positieselectie direct in het QAM | ✓ |
| Alleen Toggle in QAM | Enkel een aan/uit schakelaar in het QAM | |
| Alleen in SettingsTab | Geen overlay bediening in QAM, enkel in de grote modal | |

**User's choice:** Snelle Toggle + Positie in QAM.
**Notes:** Direct bereikbaar via de `...` knop tijdens het gamen zonder game te verlaten.

---

## Visuele Stijl & Formaat

| Option | Description | Selected |
|--------|-------------|----------|
| Configureerbaar | Gebruiker kan kiezen tussen Compact en Met voortgangslijn | ✓ |
| Compact | Alleen 36px cover, titel, artiest, play/pause statusicoon | |
| Met voortgangslijn | Compact + subtiele 2px groene voortgangsbalk onderaan | |

**User's choice:** Configureerbaar (Ja en evt meer).
**Notes:** Stijlkeuze wordt opgeslagen in instellingen (`overlay_show_progress: boolean`).

---

## Pauze-gedrag & Lege Status

| Option | Description | Selected |
|--------|-------------|----------|
| 3-4 seconden tonen en wegfaden | Toont kort het pauze-icoon en fadet daarna weg | ✓ |
| Direct verbergen | Verdwijnt onmiddellijk bij pauzeren | |
| Permanent zichtbaar | Blijft in beeld met pauze-icoon totdat overlay uitgeschakeld wordt | |

**User's choice:** 3-4 seconden pauzestatus tonen en daarna wegfaden.
**Notes:** Geeft duidelijke feedback dat muziek gepauzeerd is, maar houdt het gamescherm daarna schoon.

---

## the agent's Discretion

- Exacte CSS transition timing en easing voor de fade animaties.
- Fallback placeholder styling (`FaMusic`) als er geen cover aanwezig is.

## Deferred Ideas

- Floating interactieve lyrics in overlay (behoort tot v2 `LYRIC-01`).
