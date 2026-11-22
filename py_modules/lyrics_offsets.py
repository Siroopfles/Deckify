import json
import os
import threading

from py_modules.common import DECK_HOME

LYRICS_OFFSETS_FILE = os.path.join(DECK_HOME, ".config", "deckify", "lyrics_offsets.json")

_OFFSETS_LOCK = threading.Lock()
_MIN_OFFSET_MS = -10000
_MAX_OFFSET_MS = 10000


def _clamp_offset_ms(offset_ms: int) -> int:
    if isinstance(offset_ms, bool):
        raise ValueError("offset_ms must be an integer")
    try:
        val = int(offset_ms)
    except (TypeError, ValueError) as exc:
        raise ValueError("offset_ms must be an integer") from exc
    return max(_MIN_OFFSET_MS, min(_MAX_OFFSET_MS, val))


def _load_unlocked(path: str) -> dict[str, int]:
    if not path or not os.path.isfile(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            raw = json.load(f)
    except Exception:
        return {}
    if not isinstance(raw, dict):
        return {}
    cleaned: dict[str, int] = {}
    for k, v in raw.items():
        if not isinstance(k, str):
            continue
        tid = k.strip()
        if not tid or isinstance(v, bool):
            continue
        try:
            clamped = max(_MIN_OFFSET_MS, min(_MAX_OFFSET_MS, int(v)))
        except (TypeError, ValueError):
            continue
        if clamped != 0:
            cleaned[tid] = clamped
    return cleaned


def load_track_offsets(path: str = LYRICS_OFFSETS_FILE) -> dict[str, int]:
    """Load all persisted non-zero per-track lyric sync offsets (in ms)."""
    with _OFFSETS_LOCK:
        return _load_unlocked(path)


def get_track_offset(track_id: str, path: str = LYRICS_OFFSETS_FILE) -> int:
    """Return the persisted lyric sync offset (in ms) for track_id, or 0 if unset."""
    if not isinstance(track_id, str):
        return 0
    tid = track_id.strip()
    if not tid:
        return 0
    with _OFFSETS_LOCK:
        return _load_unlocked(path).get(tid, 0)


def set_track_offset(track_id: str, offset_ms: int, path: str = LYRICS_OFFSETS_FILE) -> int:
    """Clamp offset_ms to [-10000, 10000], prune 0ms entries, and persist atomically."""
    if not isinstance(track_id, str) or not track_id.strip():
        raise ValueError("track_id must be a non-empty string")
    tid = track_id.strip()
    clamped = _clamp_offset_ms(offset_ms)

    with _OFFSETS_LOCK:
        offsets = _load_unlocked(path)
        if clamped == 0:
            offsets.pop(tid, None)
        else:
            offsets[tid] = clamped

        parent = os.path.dirname(path)
        if parent:
            os.makedirs(parent, exist_ok=True)
        tmp_path = f"{path}.{os.getpid()}.tmp"
        try:
            with open(tmp_path, "w", encoding="utf-8") as f:
                json.dump(offsets, f, indent=2, sort_keys=True)
            os.replace(tmp_path, path)
        except Exception:
            if os.path.exists(tmp_path):
                try:
                    os.remove(tmp_path)
                except OSError:
                    pass
            raise
    return clamped
