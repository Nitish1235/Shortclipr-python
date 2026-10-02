import re
from pathlib import Path

f_path = Path('f:/SAAS/git-shortclipr/Shortclipr-python/backend/app/pipeline/extractor.py')
code = f_path.read_text('utf-8')

inject_gameplay_split = '''
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
    else:  # gameplay_face
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

code = code.replace('def _build_template_filter(\n', inject_gameplay_split)

s1 = '''    face_track: list[tuple[float, float, float]] | None = None,
    src_w: int = 0,
    src_h: int = 0,
    out_label: str = "out",
) -> str:'''
# Wait, let's just make it easier. We will replace `_build_template_filter` definition.

build_filter_old = '''def _build_template_filter(
    template: str,
    bar_color: str,
    zoom_beats: list[float] | None,
    width: int,
    height: int,
    face_track: list[tuple[float, float, float]] | None = None,
    src_w: int = 0,
    src_h: int = 0,
    out_label: str = "out",
) -> str:
    """Dispatch to the filter-string builder for `template`, ending in [{out_label}].

    `face_track`/`src_w`/`src_h` come from `face_tracker.compute_face_track()`
    — empty/None reproduces the previous centre-default behaviour exactly.
    """
    if template == "crop_fill":
        return _fc_crop_fill(width, height, face_track, src_w, src_h, out_label=out_label)
    elif template == "blur_bg":
        return _fc_blur_bg(width, height, zoom_beats, face_track, src_w, src_h, out_label=out_label)
    elif template == "zoom_blur":
        return _fc_zoom_blur(width, height, zoom_beats, face_track, src_w, src_h, out_label=out_label)
    elif template == "glass":
        return _fc_glass(width, height, zoom_beats, face_track, src_w, src_h, out_label=out_label)
    elif template == "color_bars":
        return _fc_colour_bars(bar_color, zoom_beats, width, height, face_track, src_w, src_h, out_label=out_label)
    elif template == "full_screen":
        return _fc_full_screen(width, height, face_track, src_w, src_h, out_label=out_label)
    # elif template == "gameplay":  # temporarily disabled, will rework — function kept above
    #     return _fc_gameplay(zoom_beats, width, height, face_track, src_w, src_h, out_label=out_label)
    return _fc_crop_fill(width, height, face_track, src_w, src_h, out_label=out_label)'''

build_filter_new = '''def _build_template_filter(
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
) -> str:
    """Dispatch to the filter-string builder for `template`, ending in [{out_label}].
    """
    if template == "crop_fill":
        return _fc_crop_fill(width, height, face_track, src_w, src_h, out_label=out_label)
    elif template == "blur_bg":
        return _fc_blur_bg(width, height, zoom_beats, face_track, src_w, src_h, out_label=out_label)
    elif template == "zoom_blur":
        return _fc_zoom_blur(width, height, zoom_beats, face_track, src_w, src_h, out_label=out_label)
    elif template == "glass":
        return _fc_glass(width, height, zoom_beats, face_track, src_w, src_h, out_label=out_label)
    elif template == "color_bars":
        return _fc_colour_bars(bar_color, zoom_beats, width, height, face_track, src_w, src_h, out_label=out_label)
    elif template == "full_screen":
        return _fc_full_screen(width, height, face_track, src_w, src_h, out_label=out_label)
    elif template.startswith("gameplay_"):
        return _fc_gameplay_split(template, gameplay_idx, width, height, face_track, out_label=out_label)
    return _fc_crop_fill(width, height, face_track, src_w, src_h, out_label=out_label)'''

code = code.replace(build_filter_old, build_filter_new)


# Now we modify `_encode_reframed_and_captioned` to handle `gameplay_bg_path`
enc_old_sig = '''async def _encode_reframed_and_captioned(
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
) -> None:'''

enc_new_sig = '''async def _encode_reframed_and_captioned(
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
) -> None:'''

code = code.replace(enc_old_sig, enc_new_sig)


# And the inner part where we add it to extra_inputs and call build_filter
enc_inner_old = '''    title_color_hex = TITLE_TEXT_COLORS.get(title_color, TITLE_TEXT_COLORS[DEFAULT_TITLE_TEXT_COLOR])
    box_path: Path | None = None
    try:
        fc = _build_template_filter(template, bar_color, zoom_beats, width, height, face_track, src_w, src_h, out_label="reframed_base")
        extra_inputs: list[str] = []
        
        logo_path = Path(__file__).parent.parent / "assets" / "logo.png"
        wm_png_path: Path | None = None'''

enc_inner_new = '''    title_color_hex = TITLE_TEXT_COLORS.get(title_color, TITLE_TEXT_COLORS[DEFAULT_TITLE_TEXT_COLOR])
    box_path: Path | None = None
    try:
        extra_inputs: list[str] = []
        if gameplay_bg_path:
            extra_inputs.extend(["-stream_loop", "-1", "-i", str(gameplay_bg_path)])
            gameplay_idx = 1
        else:
            gameplay_idx = None
            
        fc = _build_template_filter(template, bar_color, zoom_beats, width, height, face_track, src_w, src_h, out_label="reframed_base", gameplay_idx=gameplay_idx)
        
        logo_path = Path(__file__).parent.parent / "assets" / "logo.png"
        wm_png_path: Path | None = None'''

code = code.replace(enc_inner_old, enc_inner_new)

# Oh wait, when we do wm_png_path, we used `logo_idx = len(extra_inputs) // 2`.
# Now `extra_inputs` might contain `["-stream_loop", "-1", "-i", str(gameplay_bg_path), "-i", wm_png_path]`
# The stream index would be 1 for gameplay, 2 for watermark.
# Previously `len(["-i", wm_png_path]) // 2` was 1.
# Now `len(extra_inputs) // 2` is `len(["-stream_loop", "-1", "-i", gameplay_bg_path, "-i", wm_png_path]) // 2` which is `6 // 2 = 3`. THIS IS WRONG!!!
# It should be 2. Let's fix that. We count the number of `-i` flags.
wm_old = '''        if is_marketer and logo_path.exists():
            wm_png_path = _render_marketer_watermark_png(logo_path, width, opacity=0.70)
            
            if wm_png_path:
                extra_inputs.extend(["-i", str(wm_png_path)])
                logo_idx = len(extra_inputs) // 2'''

wm_new = '''        if is_marketer and logo_path.exists():
            wm_png_path = _render_marketer_watermark_png(logo_path, width, opacity=0.70)
            
            if wm_png_path:
                extra_inputs.extend(["-i", str(wm_png_path)])
                logo_idx = extra_inputs.count("-i")'''

code = code.replace(wm_old, wm_new)

# Same for hook_title box_path
hook_old = '''                    extra_inputs.extend(["-i", str(box_path)])
                    box_idx = len(extra_inputs) // 2'''

hook_new = '''                    extra_inputs.extend(["-i", str(box_path)])
                    box_idx = extra_inputs.count("-i")'''

code = code.replace(hook_old, hook_new)


# Now public `reframe_and_caption` function
pub_sig_old = '''async def reframe_and_caption(
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
) -> tuple[Path, Path]:'''

pub_sig_new = '''async def reframe_and_caption(
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
) -> tuple[Path, Path]:'''

code = code.replace(pub_sig_old, pub_sig_new)

pub_call_old = '''        await _encode_reframed_and_captioned(
            input_path, raw_output_path, captioned_output_path,
            tpl, bar_color, zoom_beats, width, height,
            captions, style, color, h_align, v_align, words_per_line,
            hook_title, face_track, src_w, src_h, title_permanent, clip_duration, font,
            title_color, title_bg, title_bg_opacity, job_semaphore, is_marketer,
            cta_settings=cta_settings,
        )'''

pub_call_new = '''        await _encode_reframed_and_captioned(
            input_path, raw_output_path, captioned_output_path,
            tpl, bar_color, zoom_beats, width, height,
            captions, style, color, h_align, v_align, words_per_line,
            hook_title, face_track, src_w, src_h, title_permanent, clip_duration, font,
            title_color, title_bg, title_bg_opacity, job_semaphore, is_marketer,
            cta_settings=cta_settings,
            gameplay_bg_path=gameplay_bg_path,
        )'''

code = code.replace(pub_call_old, pub_call_new)

# If it fails, the fallback shouldn't have gameplay_bg_path
pub_fall_old = '''            await _encode_reframed_and_captioned(
                input_path, raw_output_path, captioned_output_path,
                "blur_bg", bar_color, None, width, height,
                captions, style, color, h_align, v_align, words_per_line,
                hook_title, None, 0, 0, title_permanent, clip_duration, font,
                title_color, title_bg, title_bg_opacity, job_semaphore, False,
                cta_settings=None,
            )'''

pub_fall_new = '''            await _encode_reframed_and_captioned(
                input_path, raw_output_path, captioned_output_path,
                "blur_bg", bar_color, None, width, height,
                captions, style, color, h_align, v_align, words_per_line,
                hook_title, None, 0, 0, title_permanent, clip_duration, font,
                title_color, title_bg, title_bg_opacity, job_semaphore, False,
                cta_settings=None,
                gameplay_bg_path=None,
            )'''

code = code.replace(pub_fall_old, pub_fall_new)

f_path.write_text(code, 'utf-8')
