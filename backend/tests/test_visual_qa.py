import unittest

from app.services.visual_qa import VisualQualityReviewer


class VisualQualityReviewValidationTests(unittest.TestCase):
    def test_valid_review_is_bounded_and_keeps_grounded_evidence(self):
        result = VisualQualityReviewer.validate_review(
            {
                "overall_score": 76.5,
                "overall_assessment": "Readable composition with inconsistent prop scale.",
                "shot_reviews": [
                    {"shot_index": 0, "score": 80, "summary": "Clear focal subject."},
                    {"shot_index": 99, "score": 10, "summary": "Unknown shot."},
                ],
                "findings": [
                    {
                        "category": "prop_continuity",
                        "severity": "high",
                        "shot_index": 0,
                        "evidence_sample_indices": [0, 999, True],
                        "issue": "The deck changes apparent thickness.",
                        "recommendation": "Keep the deck silhouette and thickness consistent.",
                        "confidence": 0.91,
                    },
                    {
                        "category": ["not", "a", "category"],
                        "severity": "urgent",
                        "shot_index": ["bad"],
                        "evidence_sample_indices": "not-a-list",
                        "issue": "Malformed values are normalized.",
                    },
                ],
                "recommended_next_action": "Review the bridge deck drawings.",
            },
            {0, 1},
            {0, 1, 2},
        )
        self.assertEqual(result["status"], "reviewed")
        self.assertEqual(result["overall_score"], 76.5)
        self.assertEqual(len(result["shot_reviews"]), 1)
        self.assertEqual(result["findings"][0]["evidence_sample_indices"], [0])
        self.assertEqual(result["findings"][1]["category"], "other")
        self.assertEqual(result["findings"][1]["severity"], "low")
        self.assertIsNone(result["findings"][1]["shot_index"])
        self.assertFalse(result["automatic_repair"])

    def test_invalid_overall_score_is_rejected(self):
        for score in (True, -1, 101, "80"):
            with self.subTest(score=score):
                with self.assertRaisesRegex(ValueError, "overall_score"):
                    VisualQualityReviewer.validate_review(
                        {"overall_score": score}, {0}, {0},
                    )

    def test_visual_qa_can_be_disabled_without_calling_provider(self):
        from types import SimpleNamespace
        from pathlib import Path
        import asyncio

        reviewer = VisualQualityReviewer(SimpleNamespace(
            DEEPSEEK_VISUAL_QA_MODEL="deepseek-flash",
            DEEPSEEK_ENABLE_VISUAL_QA=False,
            DEEPSEEK_API_KEY="",
        ))
        result = asyncio.run(reviewer.review(Path("missing-contact-sheet.png"), {}, []))
        self.assertEqual(result["status"], "skipped")
        self.assertEqual(result["reason"], "visual_qa_disabled")

    def test_unconfigured_vision_key_skips_without_failing_render(self):
        from types import SimpleNamespace
        from pathlib import Path
        import asyncio

        reviewer = VisualQualityReviewer(SimpleNamespace(
            DEEPSEEK_VISUAL_QA_MODEL="deepseek-flash",
            DEEPSEEK_ENABLE_VISUAL_QA=True,
            DEEPSEEK_API_KEY="",
        ))
        result = asyncio.run(reviewer.review(Path("missing-contact-sheet.png"), {}, []))
        self.assertEqual(result["status"], "skipped")
        self.assertEqual(result["reason"], "deepseek_api_key_not_configured")


if __name__ == "__main__":
    unittest.main()
