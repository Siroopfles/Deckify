---
phase: quick
plan: 261128-hwu
subsystem: infra
tags: [steam-machine, ssh, deploy, verification, gsd-skill]
requires: []
provides:
  - "Non-interactive Steam Machine deploy and live verification scripts (PowerShell + Bash)"
  - "GSD project skill .agents/skills/steam-machine-test/SKILL.md"
  - "GEMINI.md Project Skills registration and Live Steam Machine Verification workflow"
affects: [GEMINI.md, scripts/steam-machine-test.ps1, scripts/steam-machine-test.sh]
tech-stack:
  added: []
  patterns:
    - "BatchMode=yes OpenSSH preflight and read-only remote health checks"
    - "Optional -RemoteCmd / --remote-cmd targeted feature verification hook"
key-files:
  created:
    - scripts/steam-machine-test.sh
    - scripts/steam-machine-test.ps1
    - .agents/skills/steam-machine-test/SKILL.md
  modified:
    - GEMINI.md
decisions:
  - "Kept .agents/skills/steam-machine-test/SKILL.md untracked in git because .agents/ is listed in .gitignore; file remains on disk for GSD agent discovery."
  - "Added -RemoteCmd / --remote-cmd to both scripts and mandated feature-specific live verification in SKILL.md and GEMINI.md."
  - "Used pgrep -af '[l]ibrespot' to prevent the remote bash -c wrapper from matching its own command line."
metrics:
  duration: "3m"
  completed_date: "2026-11-28"
status: complete
---

# Quick Task 261128-hwu: Steam Machine Live Test Workflow Summary

**Non-interactive deploy and live health/feature verification workflow for `deck@<STEAM_MACHINE_IP>` in PowerShell, Bash, GSD skill, and `GEMINI.md`.**

## Tasks Completed

1. **Task 1 — Non-interactive deploy & live verification scripts (`scripts/steam-machine-test.sh`, `scripts/steam-machine-test.ps1`)**
   - Parses `.vscode/settings.json` defaults (`deck@<STEAM_MACHINE_IP>`, port `22`, `/home/deck`, `Deckify`) with target override, `--build`/`-Build`, `--verify-only`/`-VerifyOnly`, and `--remote-cmd`/`-RemoteCmd`.
   - Enforces `-o BatchMode=yes -o StrictHostKeyChecking=no -o ConnectTimeout=5` with an SSH preflight check.
   - Polls `systemctl is-active plugin_loader` (up to 15s), verifies `main.py` and `dist/index.js` checksums/sizes/timestamps, scans `journalctl -u plugin_loader` and `/home/deck/homebrew/logs/Deckify/*.log`, checks optional runtime services (PipeWire, `librespot`, Steam CEF CDP port 9229), and executes optional targeted `-RemoteCmd` checks.
   - Commits: `652efd4`, `67d245a`

2. **Task 2 — GSD project skill (`.agents/skills/steam-machine-test/SKILL.md`)**
   - Created skill with `name: steam-machine-test`, repo-root PowerShell and Bash commands, mandatory feature-specific verification guidance, and SteamOS safety rules.
   - Note: `.agents/` is in `.gitignore`, so the skill file is present on disk for GSD discovery without force-staging into git.

3. **Task 3 — `GEMINI.md` registration**
   - Registered `steam-machine-test` under `## Project Skills` and added `## Live Steam Machine Verification` documenting commands, `-RemoteCmd`, and mandatory feature-specific verification.
   - Commit: `cc48460`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Prevented `pgrep -af librespot` self-match on remote shell**
- **Found during:** Task 1 live `-VerifyOnly` run
- **Issue:** `pgrep -af librespot` matched its own `bash -c pgrep -af librespot ...` process.
- **Fix:** Updated to `pgrep -af '[l]ibrespot'` in both `scripts/steam-machine-test.sh` and `scripts/steam-machine-test.ps1`.

**2. [Rule 2 - User Requirement] Added `-RemoteCmd` / `--remote-cmd` & mandatory feature-specific verification**
- **Added:** `-RemoteCmd` (PowerShell) and `--remote-cmd` (Bash) support plus explicit instructions in `SKILL.md` and `GEMINI.md` requiring agents to verify the specific feature they built on the live Steam Machine.

## Verification Results

- `scripts/steam-machine-test.ps1` passed `[System.Management.Automation.Language.Parser]::ParseFile` with 0 errors.
- `scripts/steam-machine-test.sh` passed `bash -n` syntax validation via Git Bash.
- `powershell -ExecutionPolicy Bypass -File scripts/steam-machine-test.ps1 -VerifyOnly -RemoteCmd "python3 -c 'import sys; print(sys.version.split()[0])'"` exited `0` against `deck@<STEAM_MACHINE_IP>` (`PASS=6 WARN=4 FAIL=0`, Python `3.14.6`, `plugin_loader` active, latest log clean, PipeWire active, Steam CDP port 9229 listening).
- `.agents/skills/steam-machine-test/SKILL.md` and `GEMINI.md` verified present and properly formatted.

## Self-Check: PASSED
