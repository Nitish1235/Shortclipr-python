"""
migrate_characters_to_gcs.py — one-time upload of the 105-character roster
to the Brainrot GCS bucket.

Uploads:
  gs://{BRAINROT_GCS_BUCKET_NAME}/characters/characters.json   — roster metadata
  gs://{BRAINROT_GCS_BUCKET_NAME}/characters/{id}/canon.png    — each character's canon image

app/pipeline/brainrot_characters.py reads characters.json back from GCS at
request time (cached in-process) — this script is the only thing that writes
it, so re-run it whenever the roster in docs/brainrot/characters.json changes.
No backend redeploy needed for a roster update, just re-run this script.

Run from the backend/ directory with the main backend venv active (needs
google-cloud-storage + pydantic-settings, both already in requirements.txt):

    cd backend
    python scripts/migrate_characters_to_gcs.py

Requires:
  - BRAINROT_GCS_BUCKET_NAME set in backend/.env
  - Local gcloud application-default credentials with write access to that
    bucket (`gcloud auth application-default login`), OR
    GOOGLE_APPLICATION_CREDENTIALS pointing at a service account key —
    uploader.py's GCS client picks either up automatically.
"""
import asyncio
import json
import sys
from pathlib import Path

# Repo root is two levels up from backend/scripts/ — characters.json and the
# canon.png assets live in docs/brainrot/ at the repo root, not under backend/.
REPO_ROOT = Path(__file__).resolve().parents[2]
CHARACTERS_JSON = REPO_ROOT / "docs" / "brainrot" / "characters.json"
ASSETS_DIR = REPO_ROOT / "docs" / "brainrot" / "assets"

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # backend/ on sys.path for `app.*` imports

from app.core.config import get_settings  # noqa: E402
from app.pipeline.uploader import _get_gcs_client, _upload_to_gcs  # noqa: E402

settings = get_settings()


def main() -> None:
    if not settings.BRAINROT_GCS_BUCKET_NAME:
        raise SystemExit("BRAINROT_GCS_BUCKET_NAME is not set in backend/.env — aborting.")

    data = json.loads(CHARACTERS_JSON.read_text(encoding="utf-8"))
    characters = data["characters"]
    print(f"Migrating {len(characters)} characters to gs://{settings.BRAINROT_GCS_BUCKET_NAME}/characters/")

    # Sanity-check bucket access before doing any work.
    client = _get_gcs_client()
    bucket = client.bucket(settings.BRAINROT_GCS_BUCKET_NAME)
    if not bucket.exists():
        raise SystemExit(
            f"Bucket '{settings.BRAINROT_GCS_BUCKET_NAME}' does not exist or isn't accessible "
            f"with your current credentials."
        )

    uploaded, missing = 0, []
    for c in characters:
        canon_path = ASSETS_DIR / c["id"] / "canon.png"
        if not canon_path.exists():
            missing.append(c["id"])
            continue
        blob_name = f"characters/{c['id']}/canon.png"
        _upload_to_gcs(canon_path, blob_name, "image/png", settings.BRAINROT_GCS_BUCKET_NAME)
        uploaded += 1
        print(f"  [{uploaded}/{len(characters)}] {c['id']}")

    # Upload the roster metadata itself last, so a partial run never leaves
    # characters.json pointing at images that don't exist yet.
    if missing:
        print(f"\nWARNING: {len(missing)} character(s) had no local canon.png, skipped: {missing}")
        print("Not uploading characters.json — fix the missing assets and re-run.")
        raise SystemExit(1)

    metadata_blob = bucket.blob("characters/characters.json")
    metadata_blob.upload_from_string(
        json.dumps(data), content_type="application/json",
    )
    print(f"\nUploaded {uploaded} character images + characters.json — migration complete.")


if __name__ == "__main__":
    main()
