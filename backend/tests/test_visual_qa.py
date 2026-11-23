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
        self.assertEqual(result["repair_policy"], "report_only")

    def test_repair_queue_only_selects_high_confidence_actionable_known_shots(self):
        review = {
            "status": "reviewed",
            "findings": [
                {
                    "shot_index": 1, "severity": "critical", "confidence": 0.95,
                    "issue": "Focal character is clipped.", "recommendation": "Move character inside frame.",
                    "evidence_sample_indices": [3],
                },
                {
                    "shot_index": 0, "severity": "high", "confidence": 0.69,
                    "issue": "Low confidence finding.", "recommendation": "Inspect layout.",
                    "evidence_sample_indices": [0],
                },
                {
                    "shot_index": 9, "severity": "critical", "confidence": 0.99,
                    "issue": "Unknown shot.", "recommendation": "Fix it.",
                    "evidence_sample_indices": [99],
                },
                {
                    "shot_index": 0, "severity": "medium", "confidence": 0.99,
                    "issue": "Minor style issue.", "recommendation": "Adjust color.",
                    "evidence_sample_indices": [0],
                },
                {
                    "shot_index": 2, "severity": "high", "confidence": 0.88,
                    "issue": "Prop overlaps subject.", "recommendation": "Separate silhouettes.",
                    "evidence_sample_indices": [6],
                },
            ],
        }
        manifest = [{"index": 0}, {"index": 1}, {"index": 2}]
        queue = VisualQualityReviewer.build_repair_queue(review, manifest, max_shots=1)
        self.assertEqual(len(queue), 1)
        self.assertEqual(queue[0]["shot_index"], 1)
        self.assertEqual(queue[0]["findings"][0]["severity"], "critical")

    def test_function_attribution_is_restricted_to_registered_helpers_used_by_shot(self):
        registry = [
            {"name": "drawBridge", "required_by_shots": [0]},
            {"name": "drawTower", "required_by_shots": [1]},
        ]
        result = VisualQualityReviewer.validate_review(
            {
                "overall_score": 70,
                "findings": [{
                    "severity": "high",
                    "shot_index": 0,
                    "evidence_sample_indices": [1],
                    "issue": "Bridge deck is clipped.",
                    "recommendation": "Reduce deck scale.",
                    "confidence": 0.9,
                    "function_names": ["drawBridge", "drawTower", "drawInvented"],
                }],
            },
            {0, 1},
            {1},
            registry,
        )
        self.assertEqual(result["findings"][0]["function_names"], ["drawBridge"])

    def test_helper_repair_queue_requires_high_confidence_and_known_shot_usage(self):
        review = {
            "status": "reviewed",
            "findings": [{
                "severity": "high",
                "shot_index": 0,
                "evidence_sample_indices": [1],
                "issue": "Bridge deck is clipped.",
                "recommendation": "Reduce deck scale.",
                "confidence": 0.91,
                "function_names": ["drawBridge"],
            }],
        }
        queue = VisualQualityReviewer.build_helper_repair_queue(
            review,
            [{"name": "drawBridge", "required_by_shots": [0]}],
        )
        self.assertEqual(len(queue), 1)
        self.assertEqual(queue[0]["function_name"], "drawBridge")
        self.assertEqual(queue[0]["findings"][0]["shot_index"], 0)

    def test_helper_repair_queue_ignores_unattributed_or_low_confidence_findings(self):
        review = {
            "status": "reviewed",
            "findings": [{
                "severity": "high",
                "shot_index": 0,
                "evidence_sample_indices": [1],
                "issue": "Uncertain issue.",
                "recommendation": "Inspect.",
                "confidence": 0.6,
                "function_names": ["drawBridge"],
            }],
        }
        self.assertEqual(
            VisualQualityReviewer.build_helper_repair_queue(
                review, [{"name": "drawBridge", "required_by_shots": [0]}],
            ),
            [],
        )

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
