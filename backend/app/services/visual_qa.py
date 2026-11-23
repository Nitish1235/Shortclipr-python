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
    def validate_review(
        cls, value: Any, valid_shot_ids: set[int], valid_sample_ids: set[int],
        function_registry: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        """Keep model output bounded and tied to known shots and captured samples."""
        if not isinstance(value, dict):
            raise ValueError("Visual QA response must be a JSON object")
        score = value.get("overall_score")
        if isinstance(score, bool) or not isinstance(score, (int, float)) or not 0 <= score <= 100:
            raise ValueError("Visual QA overall_score must be between 0 and 100")

        registry_by_name = {
            item.get("name"): item for item in (function_registry or [])
            if isinstance(item, dict) and isinstance(item.get("name"), str)
        }
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
                raw_function_names = item.get("function_names", [])
                if not isinstance(raw_function_names, list):
                    raw_function_names = []
                allowed_for_shot = {
                    name for name, entry in registry_by_name.items()
                    if shot_index is not None
                    and isinstance(entry.get("required_by_shots"), list)
                    and shot_index in entry["required_by_shots"]
                }
                function_names = [
                    name for name in raw_function_names[:4]
                    if isinstance(name, str) and name in allowed_for_shot
                ]
                findings.append({
                    "category": category if isinstance(category, str) and category in CATEGORIES else "other",
                    "severity": severity if isinstance(severity, str) and severity in SEVERITIES else "low",
                    "shot_index": shot_index,
                    "evidence_sample_indices": sample_ids,
                    "function_names": function_names,
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


    @staticmethod
    def build_helper_repair_queue(
        review: dict[str, Any],
        function_registry: list[dict[str, Any]],
        max_functions: int = 2,
        min_confidence: float = 0.75,
    ) -> list[dict[str, Any]]:
        """Select high-confidence visual findings attributed to known shared helpers."""
        if review.get("status") != "reviewed" or not isinstance(function_registry, list):
            return []
        if isinstance(max_functions, bool) or not isinstance(max_functions, int) or max_functions < 1:
            return []
        known = {
            item.get("name"): item for item in function_registry
            if isinstance(item, dict) and isinstance(item.get("name"), str)
            and isinstance(item.get("required_by_shots"), list)
        }
        grouped: dict[str, list[dict[str, Any]]] = {}
        findings = review.get("findings", [])
        if not isinstance(findings, list):
            return []
        for finding in findings:
            if not isinstance(finding, dict):
                continue
            if finding.get("severity") not in {"critical", "high"}:
                continue
            confidence = finding.get("confidence")
            if (isinstance(confidence, bool) or not isinstance(confidence, (int, float))
                    or confidence < min_confidence):
                continue
            issue, recommendation = finding.get("issue"), finding.get("recommendation")
            evidence = finding.get("evidence_sample_indices")
            shot_index = finding.get("shot_index")
            if (not isinstance(issue, str) or not issue.strip()
                    or not isinstance(recommendation, str) or not recommendation.strip()
                    or not isinstance(evidence, list) or not evidence
                    or isinstance(shot_index, bool) or not isinstance(shot_index, int)):
                continue
            valid_evidence = [
                value for value in evidence[:3]
                if isinstance(value, int) and not isinstance(value, bool)
            ]
            if not valid_evidence:
                continue
            names = finding.get("function_names", [])
            if not isinstance(names, list):
                continue
            for name in names[:4]:
                registry_entry = known.get(name)
                if not registry_entry or shot_index not in registry_entry["required_by_shots"]:
                    continue
                grouped.setdefault(name, []).append({
                    "shot_index": shot_index,
                    "category": finding.get("category", "other"),
                    "severity": finding["severity"],
                    "confidence": round(float(confidence), 2),
                    "evidence_sample_indices": valid_evidence,
                    "issue": issue[:500],
                    "recommendation": recommendation[:500],
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
                "function_name": name,
                "findings": sorted(
                    findings,
                    key=lambda item: (priority[item["severity"]], -item["confidence"]),
                )[:6],
            }
            for name, findings in ranked[:max_functions]
        ]

    async def review(
        self,
        contact_sheet_path: Path,
        visual_context: dict[str, Any],
        samples: list[dict[str, Any]],
    ) -> dict[str, Any]:
        if not self.enabled:
            return {"status": "skipped", "reason": "visual_qa_disabled", "repair_policy": "report_only"}
        if self.client is None:
            return {"status": "skipped", "reason": "deepseek_api_key_not_configured", "repair_policy": "report_only"}
        if not contact_sheet_path.is_file():
            return {"status": "skipped", "reason": "contact_sheet_missing", "repair_policy": "report_only"}
        size = contact_sheet_path.stat().st_size
        if size <= 0 or size > 32 * 1024 * 1024:
            return {"status": "skipped", "reason": "contact_sheet_size_out_of_range", "repair_policy": "report_only"}

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

        # === LEGACY VISUAL QA PROMPT (rollback reference; inactive) ===
        #         prompt = f"""
        # You are ShortClipr's visual quality reviewer. Review the supplied contact sheet
        # against the visual bible and storyboard context. The contact sheet is a row-major
        # grid: sample images appear in ascending sample_index order. Use the sample mapping
        # below to associate each visible tile with its shot and time.
        # 
        # Assess only what is visible in the captured frames. Do not claim to verify motion
        # between frames, physical correctness, narration synchronization, or details that
        # cannot be seen in these stills. A mechanism can be visually plausible without
        # being physically correct. Do not invent a problem when evidence is ambiguous.
        # Look for: character identity and appearance consistency; prop/environment continuity;
        # style adherence; focal hierarchy and composition; readable spatial depth;
        # storytelling clarity; visual clutter, clipping, overlaps and obvious rendering
        # artifacts; whether the frame composition appears to support each shot's stated
        # visual objective and visual change. Treat diversity of shot composition as a
        # quality signal, not a rigid rule.
        # 
        # Return strict JSON only with this schema:
        # {{
        #   "overall_score": 0,
        #   "overall_assessment": "brief evidence-based assessment",
        #   "shot_reviews": [{{"shot_index": 0, "score": 0, "summary": "..."}}],
        #   "findings": [{{
        #     "category": "composition",
        #     "severity": "medium",
        #     "shot_index": 0,
        #     "evidence_sample_indices": [0],
        #     "issue": "specific visible issue",
        #     "recommendation": "specific targeted correction",
        #     "confidence": 0.0
        #   }}],
        #   "recommended_next_action": "short next step"
        # }}
        # Allowed finding categories: {sorted(CATEGORIES)}
        # Allowed severity values: {sorted(SEVERITIES)}
        # Score the visual evidence, not the ambition of the plan. Be candid and specific.
        # A score is a prioritization aid, not an objective measurement. No more than 30 findings.
        # 
        # VISUAL BIBLE AND ART DIRECTION:
        # {json.dumps(visual_context.get("visual_bible", {}), ensure_ascii=False, separators=(",", ":"))}
        # 
        # STORYBOARD:
        # {json.dumps(visual_context.get("storyboard", []), ensure_ascii=False, separators=(",", ":"))}
        # 
        # GENERATED SHARED FUNCTION REGISTRY:
{json.dumps(visual_context.get('function_registry', []), ensure_ascii=False, separators=(',', ':'))}

FUNCTION SPECIFICATIONS:
{json.dumps(visual_context.get('function_specs', []), ensure_ascii=False, separators=(',', ':'))}

SAMPLE INDEX / SHOT / TIME MAPPING:
        # {json.dumps(samples, ensure_ascii=False, separators=(",", ":"))}
        # """.strip()
        # === END LEGACY VISUAL QA PROMPT ===
        prompt = f"""
ROLE
You are ShortClipr's independent visual-quality reviewer and animation art director.
Evaluate the rendered film as an audience would experience it. Be evidence-led,
specific and appropriately critical. The storyboard describes intent; the contact
sheet shows what was actually rendered. Judge the rendered result, not the ambition
of the instructions.

HOW TO READ THE EVIDENCE
The contact sheet is a row-major grid. Each tile corresponds to the sample mapping
below, ordered by sample_index. Use the mapping to identify shot and time.
Assess only visible evidence. Multiple samples from one shot may show different
visual states, but still images cannot establish smooth motion, frame-rate behavior,
audio synchronization, physical accuracy or events between sampled moments.
Do not claim to verify anything the images cannot show.

FUNCTION-LEVEL ATTRIBUTION
The visual function registry below lists generated shared drawing functions, their
visual responsibility and the shots that call them. When a visible defect is clearly
localized to one or more registered functions, include their exact names in that
finding's function_names array. Attribute a function only when its stated visual
responsibility and the visible evidence support the connection. If uncertain, return
an empty array. Never invent function names or blame a function merely because it is
called by the shot.

REVIEW DIMENSIONS
1. Story clarity: can a viewer understand the intended idea from the visuals?
2. Composition: focal hierarchy, subject scale, framing, negative space and balance.
3. Depth and spatial logic: meaningful foreground/midground/background, overlap,
   occlusion, scale references and coherent perspective.
4. Art direction: consistent style, palette, shape language, material treatment,
   lighting and texture restraint.
5. Identity and continuity: recurring character appearance, prop design, environment,
   relative scale and visible state continuity across sampled shots.
6. Shot variety: meaningful changes in camera distance, viewpoint and composition.
   Variety is valuable when motivated; do not penalize a deliberate sustained view.
7. Render quality: clipping, malformed shapes, broken overlaps, visual collisions,
   illegible small details, empty frames, accidental text, artifacts and clutter.
8. Storyboard fidelity: whether each shot visibly delivers its stated objective,
   focal entity and visual change.

SCORING
Use integer scores from 0 to 100.
- 90–100: polished, clear, coherent and visually distinctive; only minor refinements.
- 75–89: strong overall; a few noticeable but localized issues.
- 60–74: understandable but inconsistent, generic or visually underdeveloped.
- 40–59: major composition, continuity or clarity problems in multiple shots.
- 0–39: largely unreadable, broken, empty or substantially unlike the storyboard.
Do not inflate scores because the topic is interesting. Do not punish a deliberate
minimal style when it is clear and well executed. Overall score should reflect the
actual sampled film, not an average of unsupported assumptions.

FINDINGS
- Report only actionable issues that are visible in the contact sheet.
- Each finding must identify one specific shot and cite one or more sample_index values
  that visibly demonstrate the issue.
- Explain what is wrong, where it appears and why it harms readability or quality.
- Recommendations must tell the shot-repair model what to change: scale, position,
  silhouette, overlap, contrast, depth, crop, clutter or a specific visible object.
- Prefer a few high-impact findings over many repetitive micro-criticisms.
- Do not create duplicate findings for the same root cause.
- Use confidence honestly. If evidence is ambiguous, omit the finding or lower confidence.
- Do not ask the repair model to change narration, sound, timing, physics or anything
  that cannot be judged from these still images.
- Review every supplied shot at least once. A shot with no visible issue can receive
  a positive concise summary and no finding.
- Maximum 20 findings.

OUTPUT CONTRACT
Return one JSON object only, with this exact shape:
{{
  "overall_score": 0,
  "overall_assessment": "brief evidence-based assessment of the rendered film",
  "shot_reviews": [{{"shot_index": 0, "score": 0, "summary": "what works and the main visible weakness"}}],
  "findings": [{{
    "category": "composition",
    "severity": "medium",
    "shot_index": 0,
    "evidence_sample_indices": [0],
    "function_names": ["drawExample"],
    "issue": "specific visible defect and its effect",
    "recommendation": "specific correction the shot repair can implement",
    "confidence": 0.0
  }}],
  "recommended_next_action": "one highest-value next step"
}}
Allowed finding categories: {sorted(CATEGORIES)}
Allowed severity values: {sorted(SEVERITIES)}

VISUAL BIBLE AND ART DIRECTION:
{json.dumps(visual_context.get("visual_bible", {}), ensure_ascii=False, separators=(",", ":"))}

STORYBOARD:
{json.dumps(visual_context.get("storyboard", []), ensure_ascii=False, separators=(",", ":"))}

SAMPLE INDEX / SHOT / TIME MAPPING:
{json.dumps(samples, ensure_ascii=False, separators=(",", ":"))}

Review the supplied frames now. Be candid, concise and evidence-specific.""".strip()
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
        result = self.validate_review(
            json.loads(raw), shot_ids, sample_ids,
            visual_context.get("function_registry", []),
        )
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
