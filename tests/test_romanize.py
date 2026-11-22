import copy
import unittest

from py_modules.romanize import (
    align_romalrc_to_lines,
    detect_song_script,
    enrich_lyrics_lines,
    has_cjk,
    parse_romalrc,
    romanize_chinese,
    romanize_japanese,
    romanize_korean,
    romanize_line,
)


class RomanizeTests(unittest.TestCase):
    def test_has_cjk_filters_latin_and_punctuation(self) -> None:
        self.assertFalse(has_cjk(""))
        self.assertFalse(has_cjk(None))
        self.assertFalse(has_cjk("Hello, world! 123 ♪"))
        self.assertFalse(has_cjk("Café résumé naïve"))
        self.assertTrue(has_cjk("さくら"))
        self.assertTrue(has_cjk("コーヒー"))
        self.assertTrue(has_cjk("한국어"))
        self.assertTrue(has_cjk("我爱你"))
        self.assertIsNone(romanize_line("Never gonna give you up!"))

    def test_korean_revised_romanization_and_liaison(self) -> None:
        self.assertEqual(romanize_korean("한국어"), "hangugeo")
        self.assertEqual(romanize_korean("사랑해"), "saranghae")
        self.assertEqual(romanize_line("사랑해"), "saranghae")

    def test_japanese_kana_digraphs_sokuon_prolonged_and_kanji(self) -> None:
        self.assertEqual(romanize_japanese("さくら"), "sakura")
        self.assertEqual(romanize_japanese("きょう"), "kyou")
        self.assertEqual(romanize_japanese("きって"), "kitte")
        self.assertEqual(romanize_japanese("コーヒー"), "koohii")
        self.assertEqual(romanize_japanese("しんあい"), "shin'ai")
        kanji_res = romanize_japanese("愛と夢")
        self.assertIn("ai", kanji_res)
        self.assertIn("to", kanji_res)
        self.assertIn("yume", kanji_res)

    def test_chinese_pinyin_transliteration(self) -> None:
        self.assertEqual(romanize_chinese("我爱你"), "wo ai ni")
        self.assertEqual(romanize_line("我爱你", song_script="zh"), "wo ai ni")

    def test_song_script_context_treats_kanji_in_japanese_song_as_japanese(self) -> None:
        lines = ["さくら咲く", "愛と夢"]
        script = detect_song_script(lines)
        self.assertEqual(script, "ja")
        # "愛と夢" is Kanji-only except "と", check pure Kanji line too:
        kanji_only_lines = ["さくら", "愛夢"]
        self.assertEqual(detect_song_script(kanji_only_lines), "ja")
        self.assertEqual(romanize_line("愛夢", song_script="ja"), "ai yume")
        self.assertEqual(romanize_line("愛夢", song_script="zh"), "ai meng")

    def test_netease_romalrc_alignment_and_fallback(self) -> None:
        synced_lines = [
            {"timeMs": 1000, "text": "Hello world"},
            {"timeMs": 5000, "text": "さくら"},
            {"timeMs": 9000, "text": "愛と夢"},
        ]
        # NetEase romalrc provides timestamp within ±250ms for line 2 (5120ms),
        # no match for line 3 (falls back to pure-Python Japanese romanizer)
        romalrc = "[00:05.12]sa ku ra\n[malformed:tag]ignored\n"
        parsed = parse_romalrc(romalrc)
        self.assertEqual(parsed, [(5120, "sa ku ra")])

        aligned = align_romalrc_to_lines(synced_lines, romalrc_text=romalrc)
        self.assertEqual(len(aligned), 3)
        self.assertIsNone(aligned[0]["romanized"])
        self.assertEqual(aligned[1]["romanized"], "sa ku ra")
        self.assertIn("ai", aligned[2]["romanized"])
        self.assertIn("yume", aligned[2]["romanized"])

        # enrich_lyrics_lines end-to-end
        synced_lrc = "[00:01.00]Hello\n[00:05.00]さくら\n[00:09.00]愛夢\n"
        plain_lrc = "Hello\nさくら\n愛夢"
        enriched = enrich_lyrics_lines(synced_lrc, plain_lrc, romalrc_text=romalrc)
        self.assertEqual(len(enriched["romanized_lines"]), 3)
        self.assertIsNone(enriched["romanized_lines"][0]["romanized"])
        self.assertEqual(enriched["romanized_lines"][1]["romanized"], "sa ku ra")
        self.assertEqual(enriched["romanized_lines"][2]["romanized"], "ai yume")
        self.assertEqual(enriched["romanized_plain"], [None, "sakura", "ai yume"])

    def test_idempotent_romanization(self) -> None:
        original = [
            {"timeMs": 1000, "text": "さくら"},
            {"timeMs": 2000, "text": "한국어"},
        ]
        snapshot = copy.deepcopy(original)
        first = align_romalrc_to_lines(original, romalrc_text="")
        second = align_romalrc_to_lines(original, romalrc_text="")
        self.assertEqual(original, snapshot)
        self.assertEqual(first, second)


if __name__ == "__main__":
    unittest.main()
