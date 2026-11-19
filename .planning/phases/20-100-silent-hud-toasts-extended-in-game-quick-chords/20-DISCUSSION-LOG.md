# Phase 20: Silent HUD Toasts & Quick-Chords - Discussion Log

> **Audit trail only.** Decisions are captured in 20-CONTEXT.md.

**Date:** 2026-11-19
**Areas discussed:** Silent banner behavior, Chord mapping, Chord safety, HUD confirmation feedback

| Question | Selected |
|---|---|
| Banner when HUD disabled | Yes, plus a separate setting (→ single `silent_banner_enabled` toggle) |
| Banner position | Follow overlay/toast position |
| Rapid banners | Latest wins, no queue |
| Sound enabled behavior | Unchanged toaster chime |
| Default mapping / configurability | User-defined, multi-button, no Steam button required; press-to-record + reset; new actions unbound |
| Validation | Reject only Valve reserved + duplicates; single buttons allowed |
| Detection semantics | 4s guideHeld expiry; fire on last button down; re-arm on release |
| Modal/QAM | Ignore while modal open; active with QAM |
| Confirmation scope | All chords via banner, toaster fallback |
| Pinned cycle / Like / Lyrics | Recommended options |

## Deferred Ideas
None.
