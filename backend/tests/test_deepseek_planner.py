import json
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

from app.services.deepseek_planner import DeepSeekStoryPlanner


def response_with(content: str):
    return SimpleNamespace(
        id="planner-response",
        choices=[SimpleNamespace(
            message=SimpleNamespace(content=content),
            finish_reason="stop",
        )],
        usage=SimpleNamespace(
            prompt_tokens=100,
            completion_tokens=50,
            completion_tokens_details=None,
        ),
    )


def make_planner(responses):
    planner = DeepSeekStoryPlanner.__new__(DeepSeekStoryPlanner)
    planner.model = "deepseek-flash"
    planner.low_reasoning_effort = "low"
    planner.medium_reasoning_effort = "medium"
    planner.max_output_tokens = 4096
    planner.client = SimpleNamespace(
        chat=SimpleNamespace(
            completions=SimpleNamespace(create=AsyncMock(side_effect=responses))
        )
    )
    return planner


class StoryPlannerRepairTests(unittest.IsolatedAsyncioTestCase):
    async def test_invalid_story_plan_is_retried_with_error_and_project_brief(self):
        planner = make_planner([
            response_with('{"title":"first candidate"}'),
            response_with('{"title":"corrected candidate"}'),
        ])
        planner._normalize_plan = Mock(side_effect=[
            ValueError("Shot 2 references an undeclared prop ID"),
            {"title": "Corrected drawbridge story"},
        ])
        project = {
            "brief": "Explain how a drawbridge opens over a flowing river.",
            "clip_type": "explainer",
            "department": "education",
            "language": "English",
            "visual_style": "AI Auto",
            "duration_seconds": 15,
            "aspect_ratio": "9:16",
            "user_id": "must-not-be-sent",
            "voice_id": "must-not-be-sent",
        }

        result = await planner.plan(project)

        self.assertEqual(result["title"], "Corrected drawbridge story")
        self.assertEqual(planner.client.chat.completions.create.await_count, 2)
        first_prompt = planner.client.chat.completions.create.await_args_list[0].kwargs["messages"][0]["content"]
        retry_prompt = planner.client.chat.completions.create.await_args_list[1].kwargs["messages"][0]["content"]
        self.assertIn(project["brief"], first_prompt)
        self.assertIn("STORY PLAN VALIDATION REPAIR REQUIRED", retry_prompt)
        self.assertIn("Shot 2 references an undeclared prop ID", retry_prompt)
        self.assertIn('{"title":"first candidate"}', retry_prompt)
        self.assertNotIn("must-not-be-sent", first_prompt)

    async def test_story_planner_fails_closed_after_three_invalid_candidates(self):
        planner = make_planner([
            response_with('{"title":"candidate one"}'),
            response_with('{"title":"candidate two"}'),
            response_with('{"title":"candidate three"}'),
        ])
        planner._normalize_plan = Mock(side_effect=ValueError("narration is too short"))

        with self.assertRaisesRegex(RuntimeError, "after 3 attempts"):
            await planner.plan({
                "brief": "Explain a drawbridge.",
                "clip_type": "explainer",
                "department": "education",
                "language": "English",
                "visual_style": "AI Auto",
                "duration_seconds": 15,
                "aspect_ratio": "9:16",
            })

        self.assertEqual(planner.client.chat.completions.create.await_count, 3)


if __name__ == "__main__":
    unittest.main()
