# Phase 21: Dynamic Album-Art Accent Themes & Handheld Battery Eco-Mode - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-22
**Phase:** 21-dynamic-album-art-accent-themes-handheld-battery-eco-mode
**Areas discussed:** Accent Theme Scope & Fallback, Dynamic Color Extraction & Transitions, Battery, Dock & Inactivity Timeout, Eco-Mode Sleep & Wake UX

---

## Accent Theme Scope & Fallback

| Option | Description | Selected |
|--------|-------------|----------|
| Alle accent-elementen + subtiele modal/HUD gloed | Focus halos, knoppen, progressbars, actieve pills, SilentBanner en een lichte radiale achtergrondgloed in de modal | ✓ |
| Alleen functionele accent-elementen | Focus halos, progressbars, actieve knoppen/pills en SilentBanner (zonder extra achtergrondgloed) | |
| Classic Spotify Green (#1DB954) fallback | Valt terug op vertrouwd groen als er niets speelt of de cover grijswaarden is | ✓ |
| SteamOS Deck Blue (#1A9FFF) fallback | Valt terug op SteamOS blauw als neutrale systeemkleur | |
| SteamOS Deck Blue (#1A9FFF) tint | De bekende Steam Deck OS accentkleur (luminantie ~55%, hoog contrast op donkere UI) | ✓ |
| Dieper Steam Blue (#3B82F6 / #4B9EFF) | Iets zachter blauw voor langere sessies | |

**User's choice:** All accent elements + subtle modal/HUD glow; `#1DB954` fallback; `#1A9FFF` SteamOS Deck Blue.

---

## Dynamic Color Extraction & Transitions

| Option | Description | Selected |
|--------|-------------|----------|
| Frontend Canvas op base64 cover art | Gebruikt Steam CEF's ingebouwde Canvas (0 extra Python-dependencies, <2ms op 32x32 downscale + HSL luminantie-clamp L >= 55%) | ✓ |
| Backend Python extractie | Pure-Python kleurextractie in images.py en meesturen via track_metadata | |
| Subtiele overgang (300–400ms ease), instant tijdens Eco-Mode | Vloeiend bij normaal gebruik, 0 animatiekosten op batterij in-game | ✓ |
| Altijd directe kleurwissel | Geen CSS-transities, direct schakelen bij trackwissel | |
| SettingsTab + snelle pill/selector in QAM | Makkelijk wisselen zonder de volledige modal te openen | |
| Alleen in SettingsTab | Houdt de Quick Access Menu compact | ✓ |

**User's choice:** Frontend Canvas extraction, 300–400ms ease transition (instant in Eco-Mode), selector in SettingsTab only.

---

## Battery, Dock & Inactivity Timeout

| Option | Description | Selected |
|--------|-------------|----------|
| Sysfs (/sys/class/power_supply/*) + Dock-status | Leest BAT*/AC* status (Discharging / online=0) én controleert of een dock/external DAC actief is; valt veilig terug op AC als sysfs ontbreekt | ✓ |
| Alleen Sysfs power_supply | Puur kijken naar batterij/AC-voeding via Linux sysfs | |
| Eco-Mode standaard AAN met 15 min timeout (5–30 min in stappen van 5 min) | Standaard ingeschakeld met 15 min inactiviteitstimeout | ✓ |
| Eco-Mode standaard UIT met 15 min timeout | Opt-in in SettingsTab | |
| Eco-Mode geldt alleen bij gepauzeerde playback | Als een Sleep Timer loopt en playback stopt/pauzeert, mag Eco-Mode daarna normaal slapen | ✓ |
| Eco-Mode volledig pauzeren zolang Sleep Timer actief is | | |

**User's choice:** Sysfs + dock status (explicitly accounting for Steam Machine with no battery); Eco-Mode ON by default with 15 min timeout (5–30 min); Eco-Mode applies only to paused playback (compatible with Sleep Timer).

---

## Eco-Mode Sleep & Wake UX

| Option | Description | Selected |
|--------|-------------|----------|
| Alleen Deckify-engines (librespot/spotifyd) | Officiële Spotify Client niet afsluiten | |
| Zowel librespot/spotifyd als spotify_client | Beide stoppen bij inactiviteit op batterij | |
| Instelbaar (free text) | Gebruiker kan kiezen of idle sleep alleen librespot/spotifyd of ook spotify_client stopt | ✓ |
| Statusbadge in SettingsTab + subtiele Eco-Sleep melding in QAM | On Battery / AC-Desktop / Sleeping badge + Play-to-wake in QAM | ✓ |
| Alleen statusbadge in SettingsTab | Geen extra indicator in QAM | |
| Gamen op batterij pauzeert animaties/visualizers + sleep na timeout | SilentBanner en controller-navigatie blijven altijd direct werken | ✓ |
| Alleen animaties pauzeren als Eco-Mode slaapt | Niet al tijdens normaal afspelen op batterij | |

**User's choice:** Configurable engine sleep target (defaulting to Deckify-managed engines `librespot`/`spotifyd`), status badge in SettingsTab + subtle QAM Eco-Sleep indicator with Play-to-wake, suspend non-essential animations while gaming on battery while keeping `SilentBanner` and controller navigation instant.

---

## Agent's Discretion

- CSS custom property / React context architecture for theme propagation
- `py_modules/eco.py` polling interval and sysfs parsing implementation details
- Exact settings key names in `py_modules/common.py` and `src/types.ts`

## Deferred Ideas

None — discussion stayed within phase scope.
