from __future__ import annotations

import pytest

from app.services.style_registry import (
    LEGACY_STYLE_IDS,
    apply_visual_direction,
    resolve_visual_style,
)


@pytest.mark.parametrize(
    ("label", "expected"),
    [
        ("AI Auto", None),
        ("Editorial", "risograph"),
        ("Cinematic", "70s-poster"),
        ("Diagrammatic", "line"),
        ("Paper craft", "paper-cutout"),
    ],
)
def test_ui_visual_direction_resolves_deterministically(label: str, expected: str | None) -> None:
    assert resolve_visual_style(label) == expected


@pytest.mark.parametrize("style_id", sorted(LEGACY_STYLE_IDS))
def test_legacy_style_ids_remain_supported(style_id: str) -> None:
    assert resolve_visual_style(style_id) == style_id


@pytest.mark.parametrize("value", ["", "unknown-style", None, 42])
def test_unknown_or_invalid_visual_direction_fails_closed(value: object) -> None:
    with pytest.raises(ValueError):
        resolve_visual_style(value)


def test_explicit_user_direction_overrides_model_style() -> None:
    bible = {"style_id": "blueprint", "characters": [], "props": [], "environments": []}
    result = apply_visual_direction(bible, "paper-cutout")
    assert result["style_id"] == "paper-cutout"


def test_auto_keeps_model_selected_supported_style() -> None:
    bible = {"style_id": "engraving", "characters": [], "props": [], "environments": []}
    result = apply_visual_direction(bible, None)
    assert result["style_id"] == "engraving"
