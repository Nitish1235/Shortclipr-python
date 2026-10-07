"""Offline tests of the actual ASS builder; no credentials or network clients.

Only configuration and transcript acquisition are replaced at the import
boundary. The caption builder and title-box implementation are real.
Run: python backend/tests/test_caption_highlights.py
"""
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
config = types.ModuleType('app.core.config')
config.get_settings = lambda: None
transcript = types.ModuleType('app.pipeline.transcript')
transcript.TranscriptEntry = dict
with patch.dict(sys.modules, {'app.core.config': config, 'app.pipeline.transcript': transcript}):
    from app.pipeline.captions import Caption, build_ass_content, VALID_STYLES, VALID_COLORS


class CaptionHighlightTests(unittest.TestCase):
    def render(self, **kwargs):
        return build_ass_content([Caption(1, 4, 'Make every moment count.')], **kwargs)

    def test_presets_are_accepted_by_existing_validators(self):
        for style in ['last_word_box', 'last_word_editorial', 'last_word_ink']:
            self.assertIn(style, VALID_STYLES)
        for color in ['rose_ink', 'mint_ink', 'lavender_ink', 'butter_ink']:
            self.assertIn(color, VALID_COLORS)

    def test_box_only_starts_at_last_word_and_preserves_timing(self):
        ass = self.render(style='last_word_box', color='rose_ink', words_per_line=4)
        line = next(x for x in ass.splitlines() if x.startswith('Dialogue:'))
        self.assertIn('0:00:01.00,0:00:04.00', line)
        self.assertIn('Make every moment {', line)
        self.assertIn(r'\3c&H00B7AEF2', line)
        self.assertIn(r'\bord6}count.', line)
        self.assertEqual(ass.count('Dialogue:'), 1)

    def test_editorial_preserves_selected_font(self):
        ass = self.render(style='last_word_editorial', color='mint_ink', font='caveat')
        self.assertIn('Style: Default,Caveat,', ass)
        self.assertIn(r'\i1', ass)
        self.assertIn(r'\3c&H00CEDCA5', ass)

    def test_color_only_has_no_background(self):
        ass = self.render(style='last_word_ink', color='lavender_ink')
        self.assertIn(r'\1c&H00F0C4BA', ass)
        self.assertNotIn(r'\bord6', ass)

    def test_single_word_empty_and_unicode(self):
        for text in ['Hello', 'नमस्ते दुनिया', 'A {special} word']:
            ass = build_ass_content([Caption(0, 2, text)], style='last_word_box', words_per_line=1)
            self.assertEqual(ass.count('Dialogue:'), len(text.split()))
        self.assertNotIn('Dialogue:', build_ass_content([Caption(0, 2, '')], style='last_word_box'))

    def test_existing_styles_and_invalid_fallback_still_work(self):
        for style in VALID_STYLES:
            for color in ['white_black', 'butter_ink']:
                ass = self.render(style=style, color=color)
                self.assertIn('[Events]', ass)
        self.assertEqual(self.render(style='unknown'), self.render(style='minimal'))


if __name__ == '__main__':
    unittest.main()
