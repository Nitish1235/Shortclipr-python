import re
from pathlib import Path

f_path = Path('f:/SAAS/git-shortclipr/Shortclipr-python/backend/app/pipeline/extractor.py')
code = f_path.read_text('utf-8')

inject = '''
def _fc_gameplay_split(
    template: str,
    gameplay_idx: int | None,
    width: int,
    height: int,
    face_track: list[tuple[float, float, float]] | None,
    out_label: str = "out",
) -> str:
    if template == "gameplay_40_60":
        top_h = _even_round(height * 0.4)
    elif template == "gameplay_50_50":
        top_h = _even_round(height * 0.5)
    else:
        top_h = _even_round(height * 0.4)

    bot_h = height - top_h
    
    if template == "gameplay_face":
        cx = _fc_crop_offset(face_track, "x", "iw", "ow", "(iw-ow)/2")
        cy = _fc_crop_offset(face_track, "y", "ih", "oh", "(ih-oh)/2")
        top_f = (
            f"[0:v]scale={width}:{top_h}:force_original_aspect_ratio=increase:flags=bicubic,"
            f"crop={width}:{top_h}:'{cx}':'{cy}'[top];"
        )
    else:
        top_f = (
            f"[0:v]scale={width}:{top_h}:force_original_aspect_ratio=increase:flags=fast_bilinear,"
            f"crop={width}:{top_h},"
            f"{_fast_boxblur_bg(width, top_h, 25, 1)}[top_bg];"
            f"[0:v]scale={width}:-2:force_original_aspect_ratio=decrease[top_fg];"
            f"[top_bg][top_fg]overlay=(W-w)/2:(H-h)/2[top];"
        )
        
    if gameplay_idx is not None:
        bot_f = (
            f"[{gameplay_idx}:v]scale={width}:{bot_h}:force_original_aspect_ratio=increase:flags=bicubic,"
            f"crop={width}:{bot_h}:(in_w-{width})/2:(in_h-{bot_h})/2[bot];"
        )
    else:
        bot_f = f"color=c=black:s={width}x{bot_h}[bot];"
        
    fc = top_f + bot_f + "[top][bot]vstack[pre]"
    return fc + ";" + _fast_crop_pan("pre", out_label, width, height)

def _build_template_filter(
'''

if '_fc_gameplay_split' not in code:
    code = code.replace('def _build_template_filter(', inject)

# Fix _build_template_filter sig
code = re.sub(
    r'def _build_template_filter\([\s\S]*?out_label: str = "out",\n\) -> str:',
    '''def _build_template_filter(
    template: str,
    bar_color: str,
    zoom_beats: list[float] | None,
    width: int,
    height: int,
    face_track: list[tuple[float, float, float]] | None = None,
    src_w: int = 0,
    src_h: int = 0,
    out_label: str = "out",
    gameplay_idx: int | None = None,
) -> str:''',
    code
)

# Add template.startswith("gameplay_")
if 'startswith("gameplay_")' not in code:
    code = re.sub(
        r'elif template == "full_screen":[\s\S]*?out_label=out_label\)',
        '''elif template == "full_screen":
        return _fc_full_screen(width, height, face_track, src_w, src_h, out_label=out_label)
    elif template.startswith("gameplay_"):
        return _fc_gameplay_split(template, gameplay_idx, width, height, face_track, out_label=out_label)''',
        code
    )

# Fix _encode_reframed_and_captioned
code = re.sub(
    r'async def _encode_reframed_and_captioned\([\s\S]*?cta_settings: dict \| None = None,\n\) -> None:',
    '''async def _encode_reframed_and_captioned(
    input_path: Path,
    raw_output_path: Path,
    captioned_output_path: Path,
    template: str,
    bar_color: str,
    zoom_beats: list[float] | None,
    width: int,
    height: int,
    captions: list[Caption] | None,
    style: str,
    color: str,
    h_align: str,
    v_align: str,
    words_per_line: int,
    hook_title: str | None = None,
    face_track: list[tuple[float, float, float]] | None = None,
    src_w: int = 0,
    src_h: int = 0,
    title_permanent: bool = False,
    clip_duration: float = 0.0,
    font: str = "default",
    title_color: str = DEFAULT_TITLE_TEXT_COLOR,
    title_bg: str = DEFAULT_TITLE_BG,
    title_bg_opacity: float = DEFAULT_TITLE_BG_OPACITY,
    job_semaphore: asyncio.Semaphore | None = None,
    is_marketer: bool = False,
    cta_settings: dict | None = None,
    gameplay_bg_path: Path | None = None,
) -> None:''',
    code
)

code = re.sub(
    r'        fc = _build_template_filter\([\s\S]*?out_label="reframed_base"\)\n        extra_inputs: list\[str\] = \[\]\n        ',
    '''        extra_inputs: list[str] = []
        if gameplay_bg_path:
            extra_inputs.extend(["-stream_loop", "-1", "-i", str(gameplay_bg_path)])
            gameplay_idx = 1
        else:
            gameplay_idx = None
            
        fc = _build_template_filter(template, bar_color, zoom_beats, width, height, face_track, src_w, src_h, out_label="reframed_base", gameplay_idx=gameplay_idx)
        ''',
    code
)

# Fix len(extra_inputs) // 2 bugs
code = re.sub(r'logo_idx = len\(extra_inputs\) // 2', 'logo_idx = extra_inputs.count("-i")', code)
code = re.sub(r'box_idx = len\(extra_inputs\) // 2', 'box_idx = extra_inputs.count("-i")', code)

# Fix reframe_and_caption
code = re.sub(
    r'async def reframe_and_caption\([\s\S]*?cta_settings: dict \| None = None,\n\) -> tuple\[Path, Path\]:',
    '''async def reframe_and_caption(
    input_path: Path,
    raw_output_path: Path,
    captioned_output_path: Path,
    template: str = "full_screen",
    bar_color: str = "#0d0d0d",
    zoom_beats: list[float] | None = None,
    aspect: str = "9:16",
    captions: list[Caption] | None = None,
    style: str = "minimal",
    color: str = "white_black",
    h_align: str = "center",
    v_align: str = "bottom",
    words_per_line: int = 3,
    hook_title: str | None = None,
    face_track: list[tuple[float, float, float]] | None = None,
    src_w: int = 0,
    src_h: int = 0,
    title_permanent: bool = False,
    clip_duration: float = 0.0,
    font: str = "default",
    title_color: str = DEFAULT_TITLE_TEXT_COLOR,
    title_bg: str = DEFAULT_TITLE_BG,
    title_bg_opacity: float = DEFAULT_TITLE_BG_OPACITY,
    job_semaphore: asyncio.Semaphore | None = None,
    is_marketer: bool = False,
    cta_settings: dict | None = None,
    gameplay_bg_path: Path | None = None,
) -> tuple[Path, Path]:''',
    code
)

code = re.sub(
    r'            cta_settings=cta_settings,\n        \)',
    '''            cta_settings=cta_settings,
            gameplay_bg_path=gameplay_bg_path,
        )''',
    code,
    count=1
)

code = re.sub(
    r'            cta_settings=None,\n        \)',
    '''            cta_settings=None,
            gameplay_bg_path=None,
        )''',
    code,
    count=1
)

f_path.write_text(code, 'utf-8')
print("Patched!")
