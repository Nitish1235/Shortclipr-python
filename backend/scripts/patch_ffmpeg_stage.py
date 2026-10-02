import re
from pathlib import Path

f_path = Path('f:/SAAS/git-shortclipr/Shortclipr-python/backend/app/pipeline/ffmpeg_stage.py')
code = f_path.read_text('utf-8')

# 1. Unpacking options
#     aspect           = options.get("aspect",          "9:16")
opts_old = '''    aspect           = options.get("aspect",          "9:16")

    reserved_credits       = options.get("reserved_credits",       0)'''

opts_new = '''    aspect           = options.get("aspect",          "9:16")
    gameplay_clip_id = options.get("gameplay_clip_id", None)

    reserved_credits       = options.get("reserved_credits",       0)'''

code = code.replace(opts_old, opts_new)


# 2. Download gameplay right before DASH batch download
dash_start_old = '''        try:
            async with _step(job_id, f"DASH parallel download ({len(timestamps)} clips)"):'''

dash_start_new = '''        gameplay_bg_path = None
        if gameplay_clip_id and settings.GAMEPLAY_GCS_BUCKET_NAME:
            async with _step(job_id, "downloading gameplay bg"):
                gameplay_bg_path = job_dir / "gameplay_bg.mp4"
                def _dl_gameplay():
                    from google.cloud import storage
                    bucket = storage.Client().bucket(settings.GAMEPLAY_GCS_BUCKET_NAME)
                    blob = bucket.blob(f"gameplay_clips/{gameplay_clip_id}.mp4")
                    if blob.exists():
                        blob.download_to_filename(str(gameplay_bg_path))
                    else:
                        raise ValueError(f"Gameplay clip not found: {gameplay_clip_id}")
                loop = asyncio.get_running_loop()
                await loop.run_in_executor(None, _dl_gameplay)

        try:
            async with _step(job_id, f"DASH parallel download ({len(timestamps)} clips)"):'''

code = code.replace(dash_start_old, dash_start_new)


# 3. Pass to reframe_and_caption
call_old = '''                        job_semaphore=job_encode_semaphore,
                        is_marketer=is_marketer,
                        cta_settings=cta_settings,
                    )'''

call_new = '''                        job_semaphore=job_encode_semaphore,
                        is_marketer=is_marketer,
                        cta_settings=cta_settings,
                        gameplay_bg_path=gameplay_bg_path,
                    )'''

code = code.replace(call_old, call_new)

f_path.write_text(code, 'utf-8')
print("ffmpeg_stage patched!")
