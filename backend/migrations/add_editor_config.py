# backend/migrations/add_editor_config.py
"""Automatic migration to add `editor_config` JSONB column with default subtitle position.
Runs on application startup. If the column already exists, the ALTER is a no‑op.
"""
import asyncio
from app.db import supabase as db

async def run_migration():
    client = await db.get_client()
    # Add column if missing
    await client.sql(
        """
        ALTER TABLE clips
        ADD COLUMN IF NOT EXISTS editor_config JSONB DEFAULT '{}'::jsonb;
        """
    ).execute()
    # Ensure every existing row has a default subtitlePosition
    await client.table("clips").update({
        "editor_config": {
            "subtitlePosition": {"x": 0.5, "y": 0.9}
        }
    }).execute()

if __name__ == "__main__":
    asyncio.run(run_migration())
