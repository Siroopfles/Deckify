---
created: 2026-11-14T20:10:48.000Z
title: Add visible controller focus highlight to QAM Bind current music button
area: ui
severity: cosmetic
files:
  - src/index.tsx
---

## Problem

The QAM `"Bind current music to game"` button works when pressed with the controller, but its custom green background/border hides SteamOS GamepadUI's focus ring so the user cannot visually see when it is focused.

## Solution

Use `@decky/ui`'s `ButtonItem` or add a clear focus style / remove the `borderColor` override on the `DialogButton` so SteamOS focus highlight is clearly visible.
