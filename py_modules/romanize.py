"""Zero-dependency pure-Python CJK romanizer and NetEase romalrc aligner.

Supports:
- Korean Hangul Revised Romanization with intervocalic liaison
- Japanese Hiragana, Katakana (digraphs, sokuon, prolonged mark, syllabic n), and common Kanji
- Chinese Hanzi Pinyin with song-level script disambiguation
- NetEase `romalrc` timestamp alignment with pure-Python fallback
"""

from __future__ import annotations

import re

from py_modules.cjk_tables import (
    HANGUL_FINALS,
    HANGUL_INITIALS,
    HANGUL_MEDIALS,
    HANZI_PINYIN,
    HIRAGANA_DIGRAPHS,
    HIRAGANA_MAP,
    KANJI_READINGS,
    KATAKANA_DIGRAPHS,
    KATAKANA_MAP,
)

# Non-backtracking single-character range checks
_RE_HIRAGANA = re.compile(r"[\u3040-\u309F]")
_RE_KATAKANA = re.compile(r"[\u30A0-\u30FF]")
_RE_HANGUL = re.compile(r"[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]")
_RE_HAN = re.compile(r"[\u4E00-\u9FFF\u3400-\u4DBF]")
_RE_CJK = re.compile(
    r"[\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F\u4E00-\u9FFF\u3400-\u4DBF]"
)
_RE_LRC_TAG = re.compile(r"\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]")
_RE_MULTI_SPACE = re.compile(r" {2,}")

# Hangul final jamo (index 1..27) -> (remaining_coda, liaised_onset) when next initial == 11 (ㅇ)
_HANGUL_LIAISON: dict[int, tuple[str, str]] = {
    1: ("", "g"),
    2: ("", "kk"),
    3: ("k", "s"),
    4: ("", "n"),
    5: ("n", "j"),
    6: ("n", ""),
    7: ("", "d"),
    8: ("", "r"),
    9: ("l", "g"),
    10: ("l", "m"),
    11: ("l", "b"),
    12: ("l", "s"),
    13: ("l", "t"),
    14: ("l", "p"),
    15: ("l", ""),
    16: ("", "m"),
    17: ("", "b"),
    18: ("p", "s"),
    19: ("", "s"),
    20: ("", "ss"),
    21: ("ng", ""),  # ㅇ does not liaise
    22: ("", "j"),
    23: ("", "ch"),
    24: ("", "k"),
    25: ("", "t"),
    26: ("", "p"),
    27: ("", ""),
}

_KANA_DIGRAPHS: dict[str, str] = {**HIRAGANA_DIGRAPHS, **KATAKANA_DIGRAPHS}
_KANA_MAP: dict[str, str] = {**HIRAGANA_MAP, **KATAKANA_MAP}


def has_cjk(text: str | None) -> bool:
    """Return True if text contains any Hiragana, Katakana, Hangul, or CJK Ideograph."""
    if not text:
        return False
    return bool(_RE_CJK.search(text))


def detect_song_script(lines: list[str]) -> str | None:
    """Detect primary CJK script across all lines of a song.

    If any line contains Hiragana or Katakana, returns "ja" so Kanji-only lines
    in Japanese songs are romanized as Japanese rather than Chinese.
    """
    has_kana = False
    has_hangul = False
    has_han = False
    for line in lines:
        if not line:
            continue
        if _RE_HIRAGANA.search(line) or _RE_KATAKANA.search(line):
            has_kana = True
            break
        if _RE_HANGUL.search(line):
            has_hangul = True
        elif _RE_HAN.search(line):
            has_han = True

    if has_kana:
        return "ja"
    if has_hangul:
        return "ko"
    if has_han:
        return "zh"
    return None


def romanize_korean(text: str) -> str:
    """Transliterate Korean Hangul syllables into Revised Romanization with liaison."""
    if not text:
        return ""
    out: list[str] = []
    carry_onset = ""
    n = len(text)
    for i, ch in enumerate(text):
        code = ord(ch)
        if 0xAC00 <= code <= 0xD7A3:
            s = code - 0xAC00
            initial = s // 588
            medial = (s % 588) // 28
            final = s % 28

            onset = carry_onset if (initial == 11 and carry_onset) else HANGUL_INITIALS[initial]
            carry_onset = ""
            vowel = HANGUL_MEDIALS[medial]

            coda = HANGUL_FINALS[final]
            if final != 0 and i + 1 < n:
                next_code = ord(text[i + 1])
                if 0xAC00 <= next_code <= 0xD7A3:
                    next_initial = (next_code - 0xAC00) // 588
                    if next_initial == 11:
                        coda, carry_onset = _HANGUL_LIAISON.get(final, (coda, ""))

            out.append(onset + vowel + coda)
        else:
            carry_onset = ""
            out.append(ch)
    return "".join(out)


def _peek_kana_romaji(text: str, idx: int) -> str:
    """Peek at the Hepburn romaji of the Kana/Kanji starting at idx without advancing."""
    if idx >= len(text):
        return ""
    if idx + 1 < len(text) and text[idx : idx + 2] in _KANA_DIGRAPHS:
        return _KANA_DIGRAPHS[text[idx : idx + 2]]
    ch = text[idx]
    if ch in _KANA_MAP:
        return _KANA_MAP[ch]
    if ch in KANJI_READINGS:
        return KANJI_READINGS[ch]
    return ""


def romanize_japanese(text: str) -> str:
    """Transliterate Japanese Kana and common Kanji to Hepburn Romaji."""
    if not text:
        return ""
    out: list[str] = []
    i = 0
    n = len(text)
    double_next = False
    prev_was_kanji = False

    while i < n:
        ch = text[i]

        # Sokuon (っ / ッ) doubles the initial consonant of the next syllable
        if ch in ("っ", "ッ"):
            double_next = True
            prev_was_kanji = False
            i += 1
            continue

        # Prolonged sound mark (ー) extends the previous vowel
        if ch == "ー":
            if out:
                last = out[-1]
                if last and last[-1] in ("a", "i", "u", "e", "o"):
                    out.append(last[-1])
            prev_was_kanji = False
            i += 1
            continue

        # Syllabic ん / ン -> n' before vowel or y, else n
        if ch in ("ん", "ン"):
            nxt = _peek_kana_romaji(text, i + 1)
            if nxt and nxt[0] in ("a", "i", "u", "e", "o", "y"):
                out.append("n'")
            else:
                out.append("n")
            double_next = False
            prev_was_kanji = False
            i += 1
            continue

        # 2-char Kana digraphs
        if i + 1 < n and text[i : i + 2] in _KANA_DIGRAPHS:
            syl = _KANA_DIGRAPHS[text[i : i + 2]]
            if double_next and syl:
                c = "t" if syl.startswith("ch") else syl[0]
                if c not in ("a", "i", "u", "e", "o"):
                    out.append(c)
                double_next = False
            out.append(syl)
            prev_was_kanji = False
            i += 2
            continue

        # Single Kana
        if ch in _KANA_MAP:
            syl = _KANA_MAP[ch]
            if double_next and syl:
                c = "t" if syl.startswith("ch") else syl[0]
                if c not in ("a", "i", "u", "e", "o"):
                    out.append(c)
                double_next = False
            out.append(syl)
            prev_was_kanji = False
            i += 1
            continue

        # Multi-char Kanji compounds (3-char then 2-char)
        matched_compound = False
        for length in (3, 2):
            if i + length <= n and text[i : i + length] in KANJI_READINGS:
                syl = KANJI_READINGS[text[i : i + length]]
                if out and not out[-1].endswith(" "):
                    out.append(" ")
                out.append(syl)
                double_next = False
                prev_was_kanji = True
                i += length
                matched_compound = True
                break
        if matched_compound:
            continue

        # Single Kanji
        if ch in KANJI_READINGS:
            syl = KANJI_READINGS[ch]
            if out and not out[-1].endswith(" ") and prev_was_kanji:
                out.append(" ")
            elif out and not out[-1].endswith(" ") and len(syl) >= 2:
                out.append(" ")
            if double_next and syl:
                c = "t" if syl.startswith("ch") else syl[0]
                if c not in ("a", "i", "u", "e", "o"):
                    out.append(c)
                double_next = False
            out.append(syl)
            prev_was_kanji = True
            i += 1
            continue

        # Non-Kana/Kanji passthrough
        double_next = False
        if prev_was_kanji and ch not in (" ", "\t", "、", "。", "！", "？", ",", ".", "!", "?"):
            out.append(" ")
        prev_was_kanji = False
        out.append(ch)
        i += 1

    return _RE_MULTI_SPACE.sub(" ", "".join(out)).strip()


def romanize_chinese(text: str) -> str:
    """Transliterate Chinese Hanzi characters into space-separated Pinyin."""
    if not text:
        return ""
    out: list[str] = []
    prev_hanzi = False
    for ch in text:
        if ch in HANZI_PINYIN:
            if out and not out[-1].endswith(" "):
                out.append(" ")
            out.append(HANZI_PINYIN[ch])
            prev_hanzi = True
        else:
            if prev_hanzi and ch not in (" ", "\t", "，", "。", "！", "？", ",", ".", "!", "?"):
                out.append(" ")
            prev_hanzi = False
            out.append(ch)
    return _RE_MULTI_SPACE.sub(" ", "".join(out)).strip()


def romanize_line(text: str | None, song_script: str | None = None) -> str | None:
    """Romanize a single lyric line if it contains CJK characters; else return None."""
    if not text or not has_cjk(text):
        return None

    # Line-level Kana or Hangul takes precedence over generic script hint
    if _RE_HIRAGANA.search(text) or _RE_KATAKANA.search(text):
        script = "ja"
    elif _RE_HANGUL.search(text):
        script = "ko"
    elif song_script in ("ja", "ko", "zh"):
        script = song_script
    else:
        script = detect_song_script([text])

    if script == "ko":
        result = romanize_korean(text)
    elif script == "ja":
        result = romanize_japanese(text)
    elif script == "zh":
        result = romanize_chinese(text)
    else:
        return None

    cleaned = _RE_MULTI_SPACE.sub(" ", result).strip()
    return cleaned or None


def parse_romalrc(romalrc_text: str | None) -> list[tuple[int, str]]:
    """Parse LRC or NetEase romalrc timestamped lines into sorted (time_ms, text) tuples."""
    if not romalrc_text:
        return []
    entries: list[tuple[int, str]] = []
    for raw_line in romalrc_text.splitlines():
        tags = list(_RE_LRC_TAG.finditer(raw_line))
        if not tags:
            continue
        text = _RE_LRC_TAG.sub("", raw_line).strip()
        for match in tags:
            minutes = int(match.group(1))
            seconds = int(match.group(2))
            frac = match.group(3) or "0"
            if len(frac) == 1:
                ms = int(frac) * 100
            elif len(frac) == 2:
                ms = int(frac) * 10
            else:
                ms = int(frac[:3])
            time_ms = (minutes * 60 + seconds) * 1000 + ms
            entries.append((time_ms, text))
    entries.sort(key=lambda item: item[0])
    return entries


def align_romalrc_to_lines(
    synced_lines: list[dict],
    romalrc_text: str = "",
    song_script: str | None = None,
) -> list[dict]:
    """Align NetEase romalrc timestamps (±250ms) to synced lines, falling back to romanize_line."""
    if not synced_lines:
        return []

    if song_script is None:
        song_script = detect_song_script([str(line.get("text", "")) for line in synced_lines])

    roma_entries = parse_romalrc(romalrc_text)
    enriched: list[dict] = []

    for line in synced_lines:
        time_ms = int(line.get("timeMs", 0))
        text = str(line.get("text", ""))

        if not has_cjk(text):
            enriched.append({"timeMs": time_ms, "text": text, "romanized": None})
            continue

        matched_roma: str | None = None
        if roma_entries:
            best_diff = 251
            for r_ms, r_text in roma_entries:
                diff = abs(r_ms - time_ms)
                if diff <= 250 and diff < best_diff and r_text:
                    best_diff = diff
                    matched_roma = r_text

        if matched_roma is None:
            matched_roma = romanize_line(text, song_script=song_script)

        enriched.append({"timeMs": time_ms, "text": text, "romanized": matched_roma})

    return enriched


def enrich_lyrics_lines(
    synced_text: str | None,
    plain_text: str | None,
    romalrc_text: str = "",
) -> dict:
    """Produce romanized_lines and romanized_plain from synced/plain LRC payloads."""
    synced_pairs = parse_romalrc(synced_text)
    synced_lines = [{"timeMs": ms, "text": txt} for ms, txt in synced_pairs if txt]

    plain_lines = plain_text.splitlines() if plain_text else []
    all_texts = [line["text"] for line in synced_lines] + plain_lines
    song_script = detect_song_script(all_texts)

    romanized_lines = align_romalrc_to_lines(
        synced_lines,
        romalrc_text=romalrc_text,
        song_script=song_script,
    )
    romanized_plain = [romanize_line(line, song_script=song_script) for line in plain_lines]

    return {
        "romanized_lines": romanized_lines,
        "romanized_plain": romanized_plain,
    }
