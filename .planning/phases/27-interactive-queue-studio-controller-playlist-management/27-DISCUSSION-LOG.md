# Phase 27: Interactive Queue Studio & Controller Playlist Management - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-25
**Phase:** 27-interactive-queue-studio-controller-playlist-management
**Areas discussed:** Controller Grab/Move Mode UX, Queue Mutation & Librespot Fallback, Playlist CRUD & Confirmation Modals, Playlist Track Curation & Ownership, Playlist & Picker Filtering

---

## Controller Grab/Move Mode UX

### Entry Point
| Option | Description | Selected |
|--------|-------------|----------|
| Both `TrackActionModal` AND inline `⇅` handle | Pressing `A` plays immediately; `X` -> "Move" or inline `⇅` enters Grab/Move Mode | ✓ |
| `TrackActionModal` only | Trigger Grab/Move Mode only from `X` options modal | |
| Header "Reorder / Edit Mode" toggle | Global edit mode where `A` grabs/drops tracks | |

### Movement, Commit & Cancel
| Option | Description | Selected |
|--------|-------------|----------|
| Live swap + `A` to commit / `B` to revert | `D-Pad Up/Down` swaps live with auto-scroll, `A` commits batched RPC, `B` cancels & restores original order | ✓ |
| Live swap + auto-commit on `B` | Both `A` and `B` commit | |
| Target slot cursor | Insertion line moves while track stays in place | |

### Individual Remove & Clear Queue UI
| Option | Description | Selected |
|--------|-------------|----------|
| Header "Clear Queue" + both `TrackActionModal` and inline `✕` | 1-click inline removal plus `X`-menu access | ✓ |
| Header "Clear Queue" + `TrackActionModal` only | No inline `✕` button | |
| You decide | Agent discretion on layout | |

### Clear Queue Confirmation
| Option | Description | Selected |
|--------|-------------|----------|
| 2-tap inline confirmation (`Clear Queue` -> `Confirm Clear?` / `Cancel`) | Prevents accidental wipes without a blocking modal | ✓ |
| Confirmation modal dialog | Centered modal card | |
| Immediate 1-click clear | No confirmation | |

---

## Queue Mutation & Librespot Fallback

### Librespot URI-Slice Timing
| Option | Description | Selected |
|--------|-------------|----------|
| Immediate server-side URI-slice sync + optimistic backend snapshot | `PUT /me/player/play` with `[current_uri, ...mutated_uris]` at `current_position_ms` | ✓ |
| Zero-hiccup deferred sync while playing | Hold mutated queue in memory until track transition | |
| You decide | Agent discretion | |

### Clear Queue vs Currently Playing Track
| Option | Description | Selected |
|--------|-------------|----------|
| Keep current track playing, clear only upcoming tracks | Active song continues uninterrupted | ✓ |
| Stop playback and clear everything | Pauses/stops active track | |

### Context Tracks vs Explicit Queue Items on `spotify_client`
| Option | Description | Selected |
|--------|-------------|----------|
| Native CDP `PlayerAPI` first, automatic URI-slice fallback for context items | Any visible upcoming track can be reordered, removed, or cleared | ✓ |
| Restrict edits strictly to explicitly queued items | Context items immutable | |

### Stale Poll Protection
| Option | Description | Selected |
|--------|-------------|----------|
| Frontend optimistic state + backend snapshot (4–5s TTL) | Prevents `get_queue` polls from reverting recent edits | ✓ |
| Frontend optimistic state only | Let next `get_queue` overwrite | |

---

## Playlist CRUD & Confirmation Modals

### Edit & Delete/Unfollow Entry Points
| Option | Description | Selected |
|--------|-------------|----------|
| Both Playlist Detail Header AND `CollectionActionModal` (`X`) | Accessible from both list and detail views | ✓ |
| Playlist Detail Header only | Only inside open playlist | |
| `CollectionActionModal` only | Only from `X` menu | |

### Create & Edit Fields
| Option | Description | Selected |
|--------|-------------|----------|
| `Name` (required) + `Description` (optional) in both Create and Edit | Consistent form + render non-empty description in detail header | ✓ |
| Name-only for Create, Name + Description for Edit | Split forms | |

### Delete / Unfollow Confirmation & Cleanup
| Option | Description | Selected |
|--------|-------------|----------|
| Context-aware modal (`Delete`/`Unfollow`), initial focus on `Cancel`, auto-clean QAM pins & custom folders | Prevents accidental A-mash deletes and stale pins/folders | ✓ |
| Initial focus on Confirm + cleanup | Faster 2-press delete | |
| Simple confirmation without cleanup | No pin/folder cleanup | |

### Post-Create Behavior
| Option | Description | Selected |
|--------|-------------|----------|
| Prepend to list, stay on `Folders & Playlists` with focus restored + toast | User stays in overview | ✓ |
| Auto-open newly created empty playlist | Navigate into empty detail view | |

---

## Playlist Track Curation & Ownership

### Ownership Gating
| Option | Description | Selected |
|--------|-------------|----------|
| Enrich with `is_editable` / `owner_id` (own / collaborative / CDP `canEdit`) | Hide Edit/Move/Remove on read-only playlists; show `Unfollow` | ✓ |
| Show controls everywhere and rely on backend error toasts | No UI gating | |

### Duplicate Track Removal
| Option | Description | Selected |
|--------|-------------|----------|
| Remove only the specific selected row instance (`position` / CDP `uid`) | Preserves duplicate copies of the same track | ✓ |
| Remove all occurrences by URI | Bare URI delete | |

### Backend Strategy
| Option | Description | Selected |
|--------|-------------|----------|
| Web API first + automatic CDP `PlaylistAPI` / `RootlistAPI` fallback on 400/403/404 | Resilient against Web API Dev Mode restrictions | ✓ |
| Web API only | No CDP fallback | |

### Add to Playlist Picker
| Option | Description | Selected |
|--------|-------------|----------|
| Filter to editable playlists + `"+ New Playlist with Track"` at top + search/filter input | Prevents 403s, enables inline creation, and adds fast filtering | ✓ |
| Filter to editable playlists only | No inline creation | |
| Keep unchanged | Show all playlists | |

---

## Additional User Requests (Playlist & Picker Filtering)
- **User's request:** *"Ik dacht misschien is het ook wel fijn om te kunnen zoeken tussen eigen playlists als je een nummer aan een playlist wil toevoegen. En ik dacht dat het ook wel fijn zou kunnen zijn om te kunnen filteren in playlists."*
- **Follow-up choice:** Selected **(C) Allebei** — search/filter input in `TrackActionModal`'s `"Add to Playlist..."` picker, plus local filter inputs in `PlaylistsTab` for both the `Folders & Playlists` overview and the open Playlist Detail tracklist (disabling Grab/Move reordering while a track filter is active).

---

## the agent's Discretion
- Exact CDP `PlayerAPI`, `PlaylistAPI`, and `RootlistAPI` method probes in `py_modules/cdp_bridge.py`.
- Exact inline icon/button styling (`width: "auto"`, `flexShrink: 0`) and `_rowKey` generation for duplicate URIs.

## Deferred Ideas
- None — discussion stayed within Phase 27 scope.
