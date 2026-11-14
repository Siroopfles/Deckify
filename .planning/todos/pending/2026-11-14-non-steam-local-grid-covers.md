---
created: 2026-11-14T19:58:00.000Z
title: Load local Steam grid artwork for Non-Steam games in SoundtracksTab
area: ui
severity: minor
files:
  - py_modules/vdf_parser.py
  - py_modules/images.py
---

## Problem

Non-Steam games show the fallback gamepad icon instead of their locally configured Steam grid/logo artwork.

## Solution

In `py_modules/vdf_parser.py`, check `~/.local/share/Steam/userdata/<id>/config/grid/` for `<app_id>p.png`, `<app_id>p.jpg`, `<app_id>.png`, or `<app_id>.jpg` (or icon path from `shortcuts.vdf`) and serve it via local file read / base64 data URI.
