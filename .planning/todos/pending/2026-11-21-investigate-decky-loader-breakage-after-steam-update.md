---
created: 2026-11-21T16:19:46.332Z
title: Investigate Decky Loader breakage after Steam update
area: general
severity: blocker
files: []
---

## Problem

Na een recente Steam-update werkt Decky Loader in zijn geheel niet meer op de Steam Deck, waardoor Deckify (en het Quick Access Menu / de plugin UI) niet meer bereikbaar is.

Originele melding:
"Er is een probleem met decky loader. Steam heeft gisteren een update gehad waardoor heel decky loader niet meer werkt en ik dus niet meer bij mijn deckify kan."

## Solution

TBD — Controleer Decky Loader status/logs op de Steam Deck (`systemctl --user status plugin_loader` / Decky release notes voor de nieuwste SteamOS/Steam Client update), update Decky Loader (prerelease/stable fix) en verifieer daarna of Deckify weer normaal laadt in GamepadUI.
