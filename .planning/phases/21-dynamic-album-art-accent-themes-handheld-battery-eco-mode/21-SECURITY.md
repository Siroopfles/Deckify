---
phase: "21"
slug: "dynamic-album-art-accent-themes-handheld-battery-eco-mode"
status: verified
threats_open: 0
asvs_level: 1
created: "2026-11-22"
---

# Phase 21 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Backend image proxy -> Frontend `<canvas>` | Proxied base64 `data:image/` URIs are sampled in browser `<canvas>` | Image data URIs |
| Frontend RPC -> `main.py:set_setting` | Untrusted setting keys/values from frontend | Settings JSON payloads |
| `py_modules/eco.py` -> Linux `/sys/class/power_supply` | Host sysfs filesystem reads | Power supply type/status strings |
| `:root` / `themeBus` CSS variables -> React inline styles | Theme token values consumed by UI style properties | Hex/RGB/transition CSS custom properties |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-21-01 | Information Disclosure / CSP Violation | `src/utils/accentTheme.ts` (`extractAccentFromDataUri`) | medium | mitigate | `dataUri.startsWith("data:image/")` guard (`src/utils/accentTheme.ts:181`) blocks external HTTP URLs and canvas tainting | closed |
| T-21-02 | Tampering | `main.py:set_setting` | medium | mitigate | Strict validation of `accent_theme` enum and `eco_timeout_minutes` integer range `[5, 30]` (`main.py:817-830`) | closed |
| T-21-03 | Denial of Service / Path Traversal | `py_modules/eco.py:read_power_supply_state` | medium | mitigate | Fixed `/sys/class/power_supply/<entry>/{type,status}` reads via `os.scandir` with `OSError` guards (`py_modules/eco.py:22-34`) | closed |
| T-21-04 | Tampering | Common & first-wave Tab components | low | mitigate | Static CSS `var(--deckify-accent, #1DB954)` fallbacks without `dangerouslySetInnerHTML` | closed |
| T-21-05 | Tampering | Second-wave Tab components | low | mitigate | Static CSS `var(--deckify-accent, #1DB954)` fallbacks without `dangerouslySetInnerHTML` | closed |
| T-21-06 | Tampering | `SettingsTab.tsx` / `src/index.tsx` | low | mitigate | Typed `AccentThemeMode` literals and `5..30` step-5 integers; backend `set_setting` remains authoritative | closed |
| T-21-07 | Tampering | `src/index.tsx` (`Content`) & `src/components/SilentBanner.tsx` | low | mitigate | Inline `getThemeCssVars(accent, animationsSuspended)` CSS custom properties only; no `dangerouslySetInnerHTML` | closed |
| T-21-SC | Tampering | npm/pip installs | low | accept | Zero new npm or Python packages added in Phase 21 | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| R-21-SC | T-21-SC | Zero new npm or Python packages added in Phase 21; no new supply-chain surface | gsd-verify-work | 2026-11-22 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-22 | 8 | 8 | 0 | gsd-verify-work (ASVS L1) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-22
