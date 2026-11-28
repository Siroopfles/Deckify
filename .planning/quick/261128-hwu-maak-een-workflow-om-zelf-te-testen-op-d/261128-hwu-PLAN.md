---
phase: quick
plan: 261128-hwu
type: execute
wave: 1
depends_on: []
files_modified:
  - scripts/steam-machine-test.sh
  - scripts/steam-machine-test.ps1
  - .agents/skills/steam-machine-test/SKILL.md
  - GEMINI.md
autonomous: true
requirements:
  - QUICK-STEAM-MACHINE-TEST

must_haves:
  truths:
    - "A non-interactive script deploys Deckify to deck@<STEAM_MACHINE_IP> (using .vscode/settings.json defaults and deploy.sh logic), waits for plugin_loader to become active, and verifies live health."
    - "Running the script with --verify-only / -VerifyOnly checks live Steam Machine status, deployed file integrity, plugin_loader logs, and optional runtime services without redeploying."
    - "GSD agents automatically discover the steam-machine-test workflow via .agents/skills/steam-machine-test/SKILL.md and GEMINI.md."
  artifacts:
    - path: "scripts/steam-machine-test.sh"
      provides: "Bash deploy + live Steam Machine verification runner based on deploy.sh"
    - path: "scripts/steam-machine-test.ps1"
      provides: "Native Windows PowerShell deploy + live Steam Machine verification runner"
    - path: ".agents/skills/steam-machine-test/SKILL.md"
      provides: "GSD project skill documenting automated deploy and self-test workflow with safety rules"
    - path: "GEMINI.md"
      provides: "Updated Project Skills index and Live Steam Machine Verification workflow section"
  key_links:
    - from: "scripts/steam-machine-test.sh"
      to: "deploy.sh"
      via: "Invokes deploy.sh after BatchMode=yes SSH preflight, then runs remote health checks"
    - from: "scripts/steam-machine-test.ps1"
      to: ".vscode/settings.json"
      via: "Reads deckip, deckport, deckuser, deckdir, pluginname defaults via ConvertFrom-Json"
    - from: "GEMINI.md"
      to: ".agents/skills/steam-machine-test/SKILL.md"
      via: "Lists steam-machine-test in Project Skills and references it in Live Steam Machine Verification"
---

<objective>
Create an automated, non-interactive deploy and live self-test workflow for the living-room Steam Machine (`deck@<STEAM_MACHINE_IP>`) based on `deploy.sh`, and integrate it into GSD via a project skill and `GEMINI.md`.

Purpose: Enable GSD agents and the developer to deploy changes and immediately verify live plugin health, logs, file sync, and runtime services on the Steam Machine without interactive prompts or touching unrelated source files.
Output: `scripts/steam-machine-test.sh`, `scripts/steam-machine-test.ps1`, `.agents/skills/steam-machine-test/SKILL.md`, and updated `GEMINI.md`.
</objective>

<execution_context>
@~/.gemini/antigravity/gsd-core/workflows/execute-plan.md
@~/.gemini/antigravity/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@GEMINI.md
@deploy.sh
@.vscode/settings.json
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create non-interactive deploy and live verification scripts</name>
  <files>scripts/steam-machine-test.sh, scripts/steam-machine-test.ps1</files>
  <action>
Create `scripts/steam-machine-test.sh` (Bash, based on `deploy.sh`) and `scripts/steam-machine-test.ps1` (native Windows PowerShell using OpenSSH `ssh.exe`/`scp.exe`, since bare `bash` on Windows resolves to WSL).

Both scripts must:
1. Parse `.vscode/settings.json` for defaults (`deckip`: `<STEAM_MACHINE_IP>`, `deckport`: `22`, `deckuser`: `deck`, `deckdir`: `/home/deck`, `pluginname`: `Deckify`) and support target override (`user@host` or `host`) plus `--build` / `-Build` and `--verify-only` / `-VerifyOnly` flags.
2. Enforce non-interactive SSH/SCP with `-o BatchMode=yes -o StrictHostKeyChecking=no -o ConnectTimeout=5` (never use `-t` or interactive password prompts). Run an SSH preflight check first and fail fast with a clear message if key auth fails.
3. In deploy mode (when `--verify-only` / `-VerifyOnly` is not set):
   - In `scripts/steam-machine-test.sh`: invoke `./deploy.sh` (passing `--build` if requested, and target if overridden).
   - In `scripts/steam-machine-test.ps1`: if `-Build` is set or `dist/index.js` is missing, run `pnpm run build`; ensure remote `bin`, `dist`, `py_modules` directories exist and are writable; sync `main.py`, `package.json`, `py_modules/`, `plugin.json` (warn if root-owned), `dist/index.js`, and `bin/librespot` (if present locally and size differs, then `chmod +x`); restart `plugin_loader` via `sudo systemctl restart plugin_loader`.
4. Poll `systemctl is-active plugin_loader` (up to 15s, 1s interval) until `active` (fail if not active).
5. Run automated read-only remote health checks (in both deploy and `--verify-only` / `-VerifyOnly` modes):
   - **Service check:** Confirm `systemctl is-active plugin_loader` is `active`.
   - **Deployed file check:** Verify `dist/index.js` and `main.py` exist on remote, print their sizes/timestamps and compare `sha256sum` against local files (fail on mismatch when in deploy mode or warn/fail clearly).
   - **Log check:** Inspect `journalctl -u plugin_loader -n 120 --no-pager` (and latest file in `${DECK_DIR}/homebrew/logs/${PLUGIN_NAME}/` if present) for Deckify load confirmation and absence of Python `Traceback` or unhandled Deckify `ERROR` lines after the latest restart.
   - **Optional runtime services (non-fatal WARN if idle/not playing):** Check PipeWire/PulseAudio (`pactl info` or `pgrep -x pipewire`), `librespot` (`pgrep -af librespot`), and Steam CEF CDP port 9229 (`ss -tln | grep 9229`).
6. Print a structured `PASS` / `WARN` / `FAIL` summary and exit `0` if all required checks pass, non-zero otherwise.

Do NOT modify `deploy.sh`, `src/`, `py_modules/`, or `main.py`.
  </action>
  <verify>
    <automated>powershell -NoProfile -Command "$err=$null; [void][System.Management.Automation.Language.Parser]::ParseFile('scripts/steam-machine-test.ps1',[ref]$null,[ref]$err); if($err.Count -gt 0){$err; exit 1}; & 'C:\Program Files\Git\bin\bash.exe' -n scripts/steam-machine-test.sh; powershell -ExecutionPolicy Bypass -File scripts/steam-machine-test.ps1 -VerifyOnly"</automated>
  </verify>
  <done>Both `scripts/steam-machine-test.sh` and `scripts/steam-machine-test.ps1` pass syntax checks, and `scripts/steam-machine-test.ps1 -VerifyOnly` connects non-interactively to `deck@<STEAM_MACHINE_IP>` and reports structured live health checks.</done>
</task>

<task type="auto">
  <name>Task 2: Create steam-machine-test GSD project skill</name>
  <files>.agents/skills/steam-machine-test/SKILL.md</files>
  <action>
Create `.agents/skills/steam-machine-test/SKILL.md` with YAML frontmatter (`name: steam-machine-test`, `description: Deploy Deckify to the living-room Steam Machine and run automated non-interactive live health checks`) and concise, actionable instructions for GSD agents:
1. **When to use:** After building frontend/backend changes, during `/gsd-execute-phase`, `/gsd-verify-work`, or `/gsd-quick` when live hardware verification on the living-room Steam Machine (`<STEAM_MACHINE_IP>`) is needed.
2. **Commands (from repo root):**
   - Full build, deploy, and live verification (Windows PowerShell): `powershell -ExecutionPolicy Bypass -File scripts/steam-machine-test.ps1 -Build`
   - Live health check only (no deploy): `powershell -ExecutionPolicy Bypass -File scripts/steam-machine-test.ps1 -VerifyOnly`
   - Git Bash / Linux / macOS equivalents: `scripts/steam-machine-test.sh --build` and `scripts/steam-machine-test.sh --verify-only`
3. **What it verifies:** `plugin_loader` systemd active state, deployed file checksums/timestamps (`main.py`, `dist/index.js`), `journalctl -u plugin_loader` and plugin log error scan, plus optional runtime checks (PipeWire, `librespot`, Steam CEF CDP port 9229).
4. **Safety rules:**
   - Always use non-interactive `BatchMode=yes` SSH (never hang on password prompts).
   - Never run destructive commands on SteamOS (no `rm -rf`, no package/system modifications outside `${DECK_DIR}/homebrew/plugins/Deckify`, never kill `steam` or `gamescope` unless explicitly asked).
   - Keep remote verification read-only; never place `py_modules` under `bin/` (architecture constraint).
  </action>
  <verify>
    <automated>powershell -NoProfile -Command "if(-not (Test-Path '.agents/skills/steam-machine-test/SKILL.md')){exit 1}; $c = Get-Content '.agents/skills/steam-machine-test/SKILL.md' -Raw; if($c -notmatch 'name:\s*steam-machine-test' -or $c -notmatch 'BatchMode=yes'){exit 1}"</automated>
  </verify>
  <done>`.agents/skills/steam-machine-test/SKILL.md` exists with valid frontmatter, exact repo-root commands, and SteamOS safety rules.</done>
</task>

<task type="auto">
  <name>Task 3: Register skill and live verification workflow in GEMINI.md</name>
  <files>GEMINI.md</files>
  <action>
Edit `GEMINI.md` (using scoped edits, preserving all other sections untouched):
1. Update the `<!-- GSD:skills-start source:skills/ -->` ... `<!-- GSD:skills-end -->` block under `## Project Skills` to list `steam-machine-test` (`.agents/skills/steam-machine-test/SKILL.md`) with a brief description.
2. Add a `## Live Steam Machine Verification` section right after `<!-- GSD:workflow-end -->` (before `<!-- GSD:profile-start -->`) documenting:
   - Target defaults from `.vscode/settings.json` (`deck@<STEAM_MACHINE_IP>`, port `22`, plugin `Deckify`).
   - Exact commands for full deploy+verify (`powershell -ExecutionPolicy Bypass -File scripts/steam-machine-test.ps1 -Build`) and read-only status check (`-VerifyOnly`), plus Git Bash equivalents (`scripts/steam-machine-test.sh`).
   - Reference to `.agents/skills/steam-machine-test/SKILL.md` for safety rules and check details.
  </action>
  <verify>
    <automated>powershell -NoProfile -Command "$c = Get-Content 'GEMINI.md' -Raw; if($c -notmatch 'steam-machine-test' -or $c -notmatch 'Live Steam Machine Verification'){exit 1}"</automated>
  </verify>
  <done>`GEMINI.md` lists `steam-machine-test` in `## Project Skills` and documents `## Live Steam Machine Verification` with repo-root commands.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Local dev host → Steam Machine SSH | Non-interactive SSH/SCP over LAN (`<STEAM_MACHINE_IP>:22`) using ed25519 key auth |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-quick-01 | Tampering | `scripts/steam-machine-test.*` | medium | mitigate | Restrict deploy writes strictly to `${DECK_DIR}/homebrew/plugins/${PLUGIN_NAME}` and keep verification commands read-only (`systemctl is-active`, `journalctl`, `sha256sum`, `pgrep`, `ss`) |
| T-quick-02 | Denial of Service | SSH invocation | low | mitigate | Enforce `-o BatchMode=yes -o ConnectTimeout=5` so unattended GSD agents never hang on interactive prompts |
</threat_model>

<verification>
1. `scripts/steam-machine-test.ps1` passes PowerShell parser validation.
2. `scripts/steam-machine-test.sh` passes `bash -n` syntax validation via Git Bash.
3. `powershell -ExecutionPolicy Bypass -File scripts/steam-machine-test.ps1 -VerifyOnly` runs against `deck@<STEAM_MACHINE_IP>` and exits cleanly with live health check output.
4. `.agents/skills/steam-machine-test/SKILL.md` and `GEMINI.md` contain the documented workflow and skill registration.
</verification>

<success_criteria>
- Non-interactive deploy + live verification scripts exist for both PowerShell and Bash, grounded in `deploy.sh` and `.vscode/settings.json`.
- `.agents/skills/steam-machine-test/SKILL.md` is discoverable by GSD agents and enforces SteamOS safety rules.
- `GEMINI.md` references `steam-machine-test` in `Project Skills` and `Live Steam Machine Verification`.
- No files in `src/`, `py_modules/`, or `main.py` were modified.
</success_criteria>

<output>
Create `.planning/quick/261128-hwu-maak-een-workflow-om-zelf-te-testen-op-d/261128-hwu-SUMMARY.md` when done.
</output>
