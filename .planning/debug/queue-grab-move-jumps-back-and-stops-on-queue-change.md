---
status: diagnosed
trigger: "queue-grab-move-jumps-back-and-stops-on-queue-change"
created: 2026-11-25T20:48:49Z
updated: 2026-11-25T20:51:30Z
---

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

bug_class: Bohrbug
hypothesis: "Confirmed: 10s loadQueue() polling in DeckifyExpandedModal overwrites queueTracks with un-reordered backend data and brand-new _rowKey values while Grab/Move Mode is active, and useGrabMoveOrder neither guards against external list replacement nor reconciles/clears orphaned grabbedKey values."
test: "Static code trace across DeckifyExpandedModal.tsx, QueueTab.tsx, useGrabMoveOrder.ts, and py_modules/rpc_playback.py"
expecting: "All three reported symptoms explained by the same mechanism"
next_action: "Return ROOT CAUSE FOUND to caller (goal: find_root_cause_only)"

reasoning_checkpoint:
  hypothesis: "Unconditional 10s loadQueue() polling in DeckifyExpandedModal replaces queueTracks with backend order and newly generated _rowKey strings during Grab/Move Mode, causing the dragged track to jump back and leaving useGrabMoveOrder.grabbedKey pointing to a non-existent _rowKey."
  confirming_evidence:
    - "DeckifyExpandedModal.tsx:419-424 runs setInterval(loadQueue, 10000) whenever mode === 'queue' without checking isGrabbing."
    - "DeckifyExpandedModal.tsx:400-405 calls assignStableRowKeys(res.queue, 'q') on backend tracks that lack _rowKey, generating brand-new _rowKey values on every poll."
    - "useGrabMoveOrder.ts:109-122 moveGrabbed() looks up grabbedKeyRef.current via findIndex(item => item._rowKey === key) and returns early if curIdx < 0, while grabbedKey remains non-null."
    - "QueueTab.tsx:97 computes isGrabbed as Boolean(grabbedKey && t._rowKey === grabbedKey), which becomes false for all rows when _rowKey values are regenerated, while onGrabStateChange(Boolean(grabbedKey)) keeps isGrabbing=true."
  falsification_test: "If loadQueue() were paused while isGrabbing is true (or preserved _rowKey and uncommitted order), the queue would not jump back or lose grabbedKey during a 10s poll."
  fix_rationale: "Pausing/skipping loadQueue() polling while isGrabbing is true (or reconciling/preserving _rowKey and uncommitted order across queue refreshes) prevents background refreshes from overwriting in-progress drags and orphaning grabbedKey."
  blind_spots: "Did not run on physical Steam Deck hardware to verify whether FocusNavController also drops focus on DOM node reorder in GamepadUI; static trace of moveGrabbed shows it only calls scheduleRowScroll(key) and not scheduleRowFocus(key)."
  candidate_causes:
    - "code: DeckifyExpandedModal.tsx 10s loadQueue() interval runs while isGrabbing is true and regenerates _rowKey; useGrabMoveOrder.ts does not reconcile or clear orphaned grabbedKey."
    - "data: Backend get_queue() returns fresh track dicts without _rowKey and without uncommitted client-side drag order (and shifts when a new track starts)."
  and_gate: "Yes — (1) DeckifyExpandedModal polls and overwrites queueTracks with fresh _rowKey values while grabbing, AND (2) useGrabMoveOrder leaves grabbedKey active when the key disappears from items."

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected: Pressing D-Pad Up/Down in Grab/Move Mode moves the track up or down while keeping focus locked and showing the moved position, without jumping back or cancelling when a new track starts playing.
actual: "Yess de move in queue werkt maar verspringt terug als ik sleep. En heb het idee dat hij uiteindelijk geselecteerd is maar dan niet meer zie versleept worden. en als er iets veranderd in de que dus bij nummer begint dan stop hij ook met slepen"
errors: None reported
reproduction: Test 1 in UAT
timeline: Discovered during UAT

## Eliminated
<!-- APPEND only - prevents re-investigating -->

## Evidence
<!-- APPEND only - facts discovered -->

- timestamp: 2026-11-25T20:49:39Z
  checked: src/components/DeckifyExpandedModal.tsx:400-424
  found: "useEffect runs loadQueue() immediately and every 10000ms via setInterval(loadQueue, 10000) whenever mode === 'queue'. loadQueue() does not check isGrabbing and calls setQueueTracks(assignStableRowKeys(res.queue, 'q'))."
  implication: "Every 10s while in QueueTab (including mid-drag), queueTracks is overwritten with backend queue order (pre-commit) and brand-new _rowKey strings."

- timestamp: 2026-11-25T20:49:05Z
  checked: src/hooks/useGrabMoveOrder.ts:11-18, 109-122, 153-159
  found: "assignStableRowKeys() assigns a new sequential _rowKey whenever item._rowKey is missing. When items is replaced with new _rowKey values, grabbedKeyRef.current retains the old _rowKey. handleGamepadDirection still returns true (blocking D-pad navigation) because grabbedKeyRef.current is truthy, but moveGrabbed() finds curIdx === -1 and returns early without moving anything. Also moveGrabbed() only calls scheduleRowScroll(key), not scheduleRowFocus(key)."
  implication: "Explains all 3 symptoms: (1) track jumps back to backend order on poll, (2) green highlight disappears (t._rowKey !== grabbedKey) while row/mode still appears selected/locked with D-pad intercepted, and (3) any queue change/refresh breaks dragging."

- timestamp: 2026-11-25T20:49:05Z
  checked: src/components/tabs/QueueTab.tsx:54-74, 86-108
  found: "QueueTab passes stableTracks and setQueueTracks to useGrabMoveOrder, computes isGrabbed as Boolean(grabbedKey && t._rowKey === grabbedKey), and reports Boolean(grabbedKey) to DeckifyExpandedModal via onGrabStateChange."
  implication: "When grabbedKey is orphaned by loadQueue(), isGrabbed becomes false for all rows (visual drag state vanishes) while isGrabbing stays true in DeckifyExpandedModal (hint bar and L1/R1 suppression stay stuck in grab mode)."

- timestamp: 2026-11-25T20:50:58Z
  checked: py_modules/rpc_playback.py:314-365
  found: "get_queue() returns _optimistic_queue_snapshot only after commit (reorder_queue_track / remove_queue_track / clear_queue) and invalidates it when _poll_track_id changes (when a new song starts). Backend tracks have no _rowKey."
  implication: "Before A-Drop commits, backend get_queue() always returns the pre-drag order; when a new song starts, the queue also shifts."

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause: "Unconditional 10-second loadQueue() polling in DeckifyExpandedModal.tsx (lines 400-424) overwrites queueTracks with backend queue data and newly generated _rowKey values while Grab/Move Mode is active; combined with useGrabMoveOrder.ts not reconciling or clearing an orphaned grabbedKey when items change externally, this causes the dragged track to jump back to its pre-drag order, lose its visual isGrabbed highlight, and silently stop moving on D-Pad Up/Down while isGrabbing remains true."
fix:
verification:
files_changed: []
