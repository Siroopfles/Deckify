---
status: diagnosed
trigger: "nowplaying-podcast-controls-and-options-wording: NowPlayingTab shows duplicate -15s/+15s controls (both under playback bar and in transport row below), playback bar scrubbing / music skip behavior needs alignment with user's controller UX, and podcast options modal says 'track' instead of podcast/episode wording."
created: 2026-11-22T20:27:52Z
updated: 2026-11-22T20:30:00Z
---

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

bug_class: Bohrbug (deterministic UI layout, input handling, and wording defects)
hypothesis: NowPlayingTab renders -15s/+15s buttons in both ProgressScrubBar and renderTransportRow, ProgressScrubBar only implements click-to-seek and ArrowLeft/ArrowRight keydown without pointer-drag scrubbing or GamepadUI D-pad direction handling, and TrackActionModal hardcodes "Play Track" / "Start Track Radio" / "Go to Artist" / "Go to Album" without checking isSpokenContent(actionTrack).
test: Completed static inspection of NowPlayingTab.tsx, TrackActionModal.tsx, DeckifyExpandedModal.tsx, and playback.ts.
expecting: Root cause confirmed for all three reported symptoms.
next_action: Return ROOT CAUSE FOUND diagnosis to parent agent.

```yaml
reasoning_checkpoint:
  hypothesis: "Three UI defects cause the reported symptoms: (1) ProgressScrubBar in NowPlayingTab.tsx unconditionally renders -15s/+15s buttons below the progress bar even though renderTransportRow already renders -15s/+15s for spoken content; (2) ProgressScrubBar only handles onClick and onKeyDown (ArrowLeft/ArrowRight) without pointer drag handlers (onPointerDown/onPointerMove/onPointerUp) or onGamepadDirection; (3) TrackActionModal.tsx hardcodes track/music labels ('Play Track', 'Start Track Radio', 'Go to Artist', 'Go to Album') without checking isSpokenContent(actionTrack)."
  confirming_evidence:
    - "src/components/tabs/NowPlayingTab.tsx:189-196 renders -15s/+15s InteractiveRow buttons inside ProgressScrubBar for all media types, while lines 243-271 render -15s/+15s RoundBtns in renderTransportRow when isSpoken is true."
    - "src/components/tabs/NowPlayingTab.tsx:128-188 ProgressScrubBar only binds onClick={handleClick} and onKeyDown={handleKeyDown} (ArrowLeft/ArrowRight) — no onPointerDown/onPointerMove/onPointerUp drag scrubbing (unlike EqBandFaders.tsx:84-92) and no onGamepadDirection handler."
    - "src/components/common/TrackActionModal.tsx:140-193 hardcodes 'Play Track', 'Start Track Radio', 'Go to Artist (...)', and 'Go to Album' with zero references to isSpokenContent."
  falsification_test: "If ProgressScrubBar had conditional rendering on !isSpoken or omitted the -15s/+15s row, or if ProgressScrubBar had pointer-drag handlers, or if TrackActionModal branched on isSpokenContent(actionTrack), those defects would not exist in the source."
  fix_rationale: "Removing the -15s/+15s row from ProgressScrubBar eliminates duplication for podcasts and clutter for music while keeping -15s/+15s in renderTransportRow for podcasts and Previous/Next + L2/R2 + scrub bar seek for music; adding pointer-drag + D-pad direction handling to ProgressScrubBar makes it draggable and controller-scrubbable; branching TrackActionModal labels on isSpokenContent(actionTrack) fixes podcast/episode wording."
  blind_spots: "Did not run live SteamOS GamepadUI to verify whether @decky/ui Focusable dispatches ArrowLeft/ArrowRight keydown or only onGamepadDirection on D-pad Left/Right; supporting both onKeyDown and onGamepadDirection (or SliderField) covers both."
  candidate_causes:
    - "code: Unconditional -15s/+15s row in ProgressScrubBar, missing pointer-drag/gamepad-direction handlers in ProgressScrubBar, hardcoded track strings in TrackActionModal"
    - "data: Missing media_type on TrackItem/TrackMeta causing spoken-content detection to fail"
  and_gate: "no — each of the three symptoms is independently caused by its respective frontend component code; isSpokenContent(track) already handles media_type and :episode:/:chapter: URI fallbacks properly."
```

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected: Clean, non-duplicated NowPlayingTab layout and podcast-appropriate options modal wording.
actual: "Yes allemaal klopt alleen de -15/+15s onder de playbackbar op de now playing tab is een beetje veel want ze staan nu ook in de rij eronder. ik denk dat het beter is als die onder de playbackbar weg gaan ook bij muziek en dat de playbackbar sleepbaar wordt maar wel dat je nog kan vooruit en achteruit kan skippen met de controller bij muziek dan. en bij podcast ze wel in de onderste bar houden. Ohja als je bij podcasts options open zegt hij track dus dat moet misschien nog anders?"
errors: None reported
reproduction: Test 2 in UAT (Phase 24) - open NowPlayingTab during podcast playback and music playback, and open the options modal/menu on a podcast episode.
started: Discovered during Phase 24 UAT

## Eliminated
<!-- APPEND only - prevents re-investigating -->

## Evidence
<!-- APPEND only - facts discovered -->

- timestamp: 2026-11-22T20:28:00Z
  checked: .planning/debug/knowledge-base.md
  found: File does not exist yet.
  implication: No prior KB matches; proceed with direct code inspection.

- timestamp: 2026-11-22T20:28:15Z
  checked: src/components/tabs/NowPlayingTab.tsx (lines 128-198, 216-297)
  found: ProgressScrubBar unconditionally renders a Focusable row with -15s and +15s InteractiveRow buttons (lines 189-196) beneath the progress bar for both music and podcasts. Meanwhile, renderTransportRow (lines 243-271) renders -15s (Rewind 15s) and +15s (Forward 15s) RoundBtns when isSpoken is true, and Previous/Next RoundBtns when isSpoken is false.
  implication: Podcasts show -15s/+15s twice (under ProgressScrubBar and in the transport row), and music shows -15s/+15s under ProgressScrubBar unnecessarily.

- timestamp: 2026-11-22T20:28:30Z
  checked: src/components/tabs/NowPlayingTab.tsx (lines 128-188) and src/components/common/EqBandFaders.tsx (lines 84-92)
  found: ProgressScrubBar only attaches onClick={handleClick} and onKeyDown={handleKeyDown} (ArrowLeft/ArrowRight using getScrubStepMs(durationMs)) to its Focusable bar. It lacks pointer-drag handlers (onPointerDown, setPointerCapture, onPointerMove, onPointerUp) needed for touch/mouse dragging ("sleepbaar"), and lacks onGamepadDirection for SteamOS GamepadUI D-pad Left/Right scrubbing when focused. Note that L2/R2 trigger seeking (5-30s for music, 15s for spoken) is already handled in DeckifyExpandedModal.tsx:920-961 via useTriggerNavigation.
  implication: Users cannot drag the ProgressScrubBar, and D-pad Left/Right scrubbing on the bar may not fire if GamepadUI only dispatches onGamepadDirection rather than ArrowLeft/ArrowRight keydown.

- timestamp: 2026-11-22T20:28:45Z
  checked: src/components/common/TrackActionModal.tsx (lines 140-193) and src/utils/playback.ts (lines 47-64)
  found: TrackActionModal never imports or calls isSpokenContent(actionTrack). It hardcodes "Play Track" (line 142), "Start Track Radio" (line 157), "Go to Artist (...)" (line 171), and "Go to Album" (line 191) regardless of whether actionTrack is a podcast episode or audiobook chapter.
  implication: Opening the options modal (Y button or + RoundBtn) on a podcast episode displays music-specific "track" wording.

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause: "Three frontend UI defects in NowPlayingTab and TrackActionModal: (1) ProgressScrubBar in src/components/tabs/NowPlayingTab.tsx (lines 189-196) unconditionally renders -15s/+15s buttons under the playback bar for all media types, duplicating the -15s/+15s RoundBtns in renderTransportRow (lines 243-271) for podcasts and cluttering music playback; (2) ProgressScrubBar (lines 128-188) only implements onClick and onKeyDown (ArrowLeft/ArrowRight), lacking pointer-drag handlers (onPointerDown/onPointerMove/onPointerUp) for dragging/scrubbing and onGamepadDirection for GamepadUI D-pad scrubbing while focused; (3) src/components/common/TrackActionModal.tsx (lines 140-193) hardcodes 'Play Track', 'Start Track Radio', 'Go to Artist', and 'Go to Album' without checking isSpokenContent(actionTrack)."
fix: ""
verification: ""
files_changed: []
