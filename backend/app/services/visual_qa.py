"""Vision-based review of rendered Drawn-by-Code contact sheets.

This reviewer produces findings only. The render worker may optionally use its
validated findings to drive a separate, bounded shot-repair workflow.
"""
from __future__ import annotations

import base64
import json
import logging
from pathlib import Path
from typing import Any

from openai import AsyncOpenAI

from ..core.config import Settings

logger = logging.getLogger("shortclipr.visual_qa")

CATEGORIES = {
    "visual_consistency", "character_continuity", "prop_continuity",
    "composition", "depth", "readability", "motion", "mechanism_visualization",
    "style_adherence", "storytelling", "technical_artifacts", "other",
}
SEVERITIES = {"critical", "high", "medium", "low"}


class VisualQualityReviewer:
    """Compare sampled rendered frames with the supplied visual bible and storyboard."""

    def __init__(self, settings: Settings):
        self.model = settings.DEEPSEEK_VISUAL_QA_MODEL
        self.enabled = getattr(settings, "DEEPSEEK_ENABLE_VISUAL_QA", True)
        self.client = (
            AsyncOpenAI(
                api_key=settings.DEEPSEEK_API_KEY,
                base_url="https://api.deepseek.com",
                timeout=75.0,
                max_retries=0,
            )
            if settings.DEEPSEEK_API_KEY else None
        )

    @staticmethod
    def _bounded_text(value: Any, limit: int, fallback: str = "") -> str:
        return value[:limit] if isinstance(value, str) else fallback

    @classmethod
    def validate_review(cls, value: Any, valid_shot_ids: set[int], valid_sample_ids: set[int]) -> dict[str, Any]:
        """Keep model output bounded and tied to known shots and captured samples."""
        if not isinstance(value, dict):
            raise ValueError("Visual QA response must be a JSON object")
        score = value.get("overall_score")
        if isinstance(score, bool) or not isinstance(score, (int, float)) or not 0 <= score <= 100:
            raise ValueError("Visual QA overall_score must be between 0 and 100")

        findings = []
        raw_findings = value.get("findings", [])
        if isinstance(raw_findings, list):
            for item in raw_findings[:30]:
                if not isinstance(item, dict):
                    continue
                shot_index = item.get("shot_index")
                if (isinstance(shot_index, bool) or not isinstance(shot_index, int)
                        or shot_index not in valid_shot_ids):
                    shot_index = None
                sample_ids = item.get("evidence_sample_indices", [])
                if not isinstance(sample_ids, list):
                    sample_ids = []
                sample_ids = [
                    sample_id for sample_id in sample_ids[:3]
                    if isinstance(sample_id, int) and not isinstance(sample_id, bool)
                    and sample_id in valid_sample_ids
                ]
                category = item.get("category")
                severity = item.get("severity")
                findings.append({
                    "category": category if isinstance(category, str) and category in CATEGORIES else "other",
                    "severity": severity if isinstance(severity, str) and severity in SEVERITIES else "low",
                    "shot_index": shot_index,
                    "evidence_sample_indices": sample_ids,
                    "issue": cls._bounded_text(item.get("issue"), 500),
                    "recommendation": cls._bounded_text(item.get("recommendation"), 500),
                    "confidence": (
                        round(float(item["confidence"]), 2)
                        if isinstance(item.get("confidence"), (int, float))
                        and not isinstance(item.get("confidence"), bool)
                        and 0 <= item["confidence"] <= 1 else None
                    ),
                })

        shot_reviews = []
        raw_shots = value.get("shot_reviews", [])
        if isinstance(raw_shots, list):
            seen = set()
            for item in raw_shots[:12]:
                if not isinstance(item, dict):
                    continue
                shot_index = item.get("shot_index")
                if (isinstance(shot_index, bool) or not isinstance(shot_index, int)
                        or shot_index not in valid_shot_ids or shot_index in seen):
                    continue
                seen.add(shot_index)
                shot_score = item.get("score")
                shot_reviews.append({
                    "shot_index": shot_index,
                    "score": (
                        round(float(shot_score), 1)
                        if isinstance(shot_score, (int, float))
                        and not isinstance(shot_score, bool) and 0 <= shot_score <= 100 else None
                    ),
                    "summary": cls._bounded_text(item.get("summary"), 500),
                })

        return {
            "status": "reviewed",
            "model": "",
            "overall_score": round(float(score), 1),
            "overall_assessment": cls._bounded_text(value.get("overall_assessment"), 1000),
            "shot_reviews": shot_reviews,
            "findings": findings,
            "recommended_next_action": cls._bounded_text(value.get("recommended_next_action"), 500),
            "repair_policy": "report_only",
        }

    @staticmethod
    def build_repair_queue(
        review: dict[str, Any],
        shot_manifest: list[dict[str, Any]],
        max_shots: int = 2,
        min_confidence: float = 0.7,
    ) -> list[dict[str, Any]]:
        """Select only high-confidence, actionable findings for a bounded shot repair."""
        if review.get("status") != "reviewed" or not isinstance(shot_manifest, list):
            return []
        if isinstance(max_shots, bool) or not isinstance(max_shots, int) or max_shots < 1:
            return []
        known_shots = {
            item.get("index") for item in shot_manifest
            if isinstance(item, dict)
            and isinstance(item.get("index"), int)
            and not isinstance(item.get("index"), bool)
        }
        grouped: dict[int, list[dict[str, Any]]] = {}
        for finding in review.get("findings", []) if isinstance(review.get("findings"), list) else []:
            if not isinstance(finding, dict):
                continue
            shot_index = finding.get("shot_index")
            if (isinstance(shot_index, bool) or not isinstance(shot_index, int)
                    or shot_index not in known_shots):
                continue
            if finding.get("severity") not in {"critical", "high"}:
                continue
            confidence = finding.get("confidence")
            if (isinstance(confidence, bool) or not isinstance(confidence, (int, float))
                    or confidence < min_confidence):
                continue
            issue = finding.get("issue")
            recommendation = finding.get("recommendation")
            evidence = finding.get("evidence_sample_indices")
            if (not isinstance(issue, str) or not issue.strip()
                    or not isinstance(recommendation, str) or not recommendation.strip()
                    or not isinstance(evidence, list)):
                continue
            valid_evidence = [
                value for value in evidence[:3]
                if isinstance(value, int) and not isinstance(value, bool)
            ]
            if not valid_evidence:
                continue
            grouped.setdefault(shot_index, []).append({
                "category": finding.get("category", "other"),
                "severity": finding["severity"],
                "shot_index": shot_index,
                "evidence_sample_indices": valid_evidence,
                "issue": issue[:500],
                "recommendation": recommendation[:500],
                "confidence": round(float(confidence), 2),
            })
        priority = {"critical": 0, "high": 1}
        ranked = sorted(
            grouped.items(),
            key=lambda pair: (
                min(priority[item["severity"]] for item in pair[1]),
                -max(item["confidence"] for item in pair[1]),
                pair[0],
            ),
        )
        return [
            {
                "shot_index": shot_index,
                "findings": sorted(
                    findings,
                    key=lambda item: (priority[item["severity"]], -item["confidence"]),
                )[:4],
            }
            for shot_index, findings in ranked[:max_shots]
        ]

    async def review(
        self,
        contact_sheet_path: Path,
        visual_context: dict[str, Any],
        samples: list[dict[str, Any]],
    ) -> dict[str, Any]:
        if not self.enabled:
            return {"status": "skipped", "reason": "visual_qa_disabled", "automatic_repair": False}
        if self.client is None:
            return {"status": "skipped", "reason": "deepseek_api_key_not_configured", "automatic_repair": False}
        if not contact_sheet_path.is_file():
            return {"status": "skipped", "reason": "contact_sheet_missing", "automatic_repair": False}
        size = contact_sheet_path.stat().st_size
        if size <= 0 or size > 32 * 1024 * 1024:
            return {"status": "skipped", "reason": "contact_sheet_size_out_of_range", "automatic_repair": False}

        shot_ids = {
            item.get("index") for item in visual_context.get("storyboard", [])
            if isinstance(item, dict) and isinstance(item.get("index"), int)
            and not isinstance(item.get("index"), bool)
        }
        if not shot_ids:
            shot_ids = {
                item.get("shot_index") for item in samples
                if isinstance(item.get("shot_index"), int)
            and not isinstance(item.get("shot_index"), bool)
            }
        sample_ids = {
            item.get("sample_index") for item in samples
            if isinstance(item.get("sample_index"), int)
            and not isinstance(item.get("sample_index"), bool)
        }
        prompt = f"""
You are ShortClipr's visual quality reviewer. Review the supplied contact sheet
against the visual bible and storyboard context. The contact sheet is a row-major
grid: sample images appear in ascending sample_index order. Use the sample mapping
below to associate each visible tile with its shot and time.

Assess only what is visible in the captured frames. Do not claim to verify motion
between frames, physical correctness, narration synchronization, or details that
cannot be seen in these stills. A mechanism can be visually plausible without
being physically correct. Do not invent a problem when evidence is ambiguous.
Look for: character identity and appearance consistency; prop/environment continuity;
style adherence; focal hierarchy and composition; readable spatial depth;
storytelling clarity; visual clutter, clipping, overlaps and obvious rendering
artifacts; whether the frame composition appears to support each shot's stated
visual objective and visual change. Treat diversity of shot composition as a
quality signal, not a rigid rule.

Return strict JSON only with this schema:
{{
  "overall_score": 0,
  "overall_assessment": "brief evidence-based assessment",
  "shot_reviews": [{{"shot_index": 0, "score": 0, "summary": "..."}}],
  "findings": [{{
    "category": "composition",
    "severity": "medium",
    "shot_index": 0,
    "evidence_sample_indices": [0],
    "issue": "specific visible issue",
    "recommendation": "specific targeted correction",
    "confidence": 0.0
  }}],
  "recommended_next_action": "short next step"
}}
Allowed finding categories: {sorted(CATEGORIES)}
Allowed severity values: {sorted(SEVERITIES)}
Score the visual evidence, not the ambition of the plan. Be candid and specific.
A score is a prioritization aid, not an objective measurement. No more than 30 findings.

VISUAL BIBLE AND ART DIRECTION:
{json.dumps(visual_context.get("visual_bible", {}), ensure_ascii=False, separators=(",", ":"))}

STORYBOARD:
{json.dumps(visual_context.get("storyboard", []), ensure_ascii=False, separators=(",", ":"))}

SAMPLE INDEX / SHOT / TIME MAPPING:
{json.dumps(samples, ensure_ascii=False, separators=(",", ":"))}
""".strip()
        encoded = base64.b64encode(contact_sheet_path.read_bytes()).decode("ascii")
        response = await self.client.chat.completions.create(
            model=self.model,
            messages=[
                {
                    "role": "system",
                    "content": "You are a rigorous visual QA reviewer for deterministic 2D animated explainers. Return JSON only.",
                },
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/png;base64,{encoded}",
                                "detail": "original",
                            },
                        },
                    ],
                },
            ],
            response_format={"type": "json_object"},
            max_tokens=5000,
            reasoning_effort="none",
            extra_body={"thinking": {"type": "disabled"}},
        )
        message = response.choices[0].message if response.choices else None
        raw = (message.content or "").strip() if message else ""
        if not raw:
            raise RuntimeError("DeepSeek visual QA returned an empty response")
        result = self.validate_review(json.loads(raw), shot_ids, sample_ids)
        result["model"] = self.model
        usage = response.usage
        logger.info("visual_qa.review_complete", extra={
            "model": self.model,
            "overall_score": result["overall_score"],
            "finding_count": len(result["findings"]),
            "shot_count": len(result["shot_reviews"]),
            "prompt_tokens": getattr(usage, "prompt_tokens", None),
            "completion_tokens": getattr(usage, "completion_tokens", None),
        })
        return result
