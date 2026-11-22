from __future__ import annotations

import pytest

from app.services.art_direction import (
    ART_DIRECTION_SCHEMA_VERSION,
    build_art_direction,
    format_art_direction,
    validate_art_direction,
)


@pytest.mark.parametrize(
    "style_id",
    [
        "paper-cutout", "risograph", "comic", "70s-poster",
        "engraving", "blueprint", "line", "pixel-art",
        "cinematic-editorial", "isometric-technical", "layered-paper",
    ],
)
def test_every_registered_legacy_style_has_a_complete_direction_contract(style_id: str) -> None:
    contract = build_art_direction(
        style_id, requested_style=style_id, style_notes="Selected by user"
    )
    validated = validate_art_direction(contract, style_id)
    assert validated["schema_version"] == ART_DIRECTION_SCHEMA_VERSION
    assert validated["mode"] == "explicit"
    assert validated["selected_by"] == "user"
    assert validated["rationale"] == "Selected by user"
    assert len(format_art_direction(validated)) > 100


def test_auto_direction_records_model_selection() -> None:
    contract = build_art_direction(
        "risograph", requested_style=None, style_notes="Best fit for print-led story"
    )
    assert contract["mode"] == "auto"
    assert contract["selected_by"] == "model"


def test_direction_rejects_mismatched_style() -> None:
    contract = build_art_direction("paper-cutout", requested_style="Paper craft")
    with pytest.raises(ValueError, match="does not match"):
        validate_art_direction(contract, "risograph")


def test_direction_rejects_unknown_schema_version() -> None:
    contract = build_art_direction("line", requested_style="Diagrammatic")
    contract["schema_version"] = 99
    with pytest.raises(ValueError, match="schema version"):
        validate_art_direction(contract, "line")


def test_direction_requires_all_visual_rules() -> None:
    contract = build_art_direction("comic", requested_style="comic")
    del contract["rules"]["materials"]
    with pytest.raises(ValueError, match="missing required"):
        validate_art_direction(contract, "comic")


def test_direction_format_contains_binding_avoid_rules() -> None:
    contract = build_art_direction("line", requested_style="line")
    prompt = format_art_direction(contract)
    assert "Avoid:" in prompt
    assert "stick-figure people" in prompt
    assert "Do not silently change visual style" in prompt
