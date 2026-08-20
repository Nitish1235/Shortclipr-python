"""
animation_catalog.py — entry/exit motion presets for character overlays.

Each motion is a named way a character appears (entry) or leaves (exit) the
frame during its speaking turn. Motions are symmetric — the same set is
offered for both entry and exit, and a character's entry and exit can differ
(e.g. rise up from the bottom, then slide off to the side).

The catalog here is pure metadata for the frontend picker + API validation.
The geometry (how far off-canvas, ramp speed) is resolved at render time in
brainrot_composite.py::_motion_offset, which is the single place that knows
the canvas size and the character's on-screen box.
"""
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Motion:
    id: str
    label: str
    description: str


MOTIONS: list[Motion] = [
    Motion("slide",  "Slide",  "Slides in from the character's own side edge."),
    Motion("bounce", "Bounce", "Slides in from the side and overshoots before settling — springy."),
    Motion("rise",   "Rise Up", "Rises up from below the bottom edge."),
    Motion("drop",   "Drop In", "Drops down from above the top edge."),
    Motion("pop",    "Pop",    "Quick little pop into place."),
    Motion("cut",    "Cut",    "Appears instantly, no travel."),
    Motion("float",  "Float",  "Rises up slowly and gently — dreamy, unhurried."),
    Motion("swoop",  "Swoop",  "Enters diagonally from the side and slightly above — an arcing swoop."),
    Motion("snap",   "Snap",   "Barely moves, then snaps into place at the last instant — a spring-release."),
    Motion("none",   "None",   "No travel, in place like Cut — but grows slightly while it's their turn."),
]

VALID_MOTIONS: set[str] = {m.id for m in MOTIONS}
DEFAULT_ENTRY = "slide"
DEFAULT_EXIT = "slide"


def valid_motion(motion_id: str, fallback: str = DEFAULT_ENTRY) -> str:
    return motion_id if motion_id in VALID_MOTIONS else fallback
