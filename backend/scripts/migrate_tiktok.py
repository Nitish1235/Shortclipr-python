import asyncio
import os
import sys
import asyncpg
from dotenv import load_dotenv

async def main():
    # Load .env file
    env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
    load_dotenv(env_path)

    url = os.getenv("SUPABASE_DB_URL")
    if not url:
        print("Error: SUPABASE_DB_URL missing from .env")
        sys.exit(1)

    print(f"Connecting to database...")
    try:
        conn = await asyncpg.connect(url)
        
        migration_path = os.path.join(
            os.path.dirname(__file__), 
            "..", 
            "migrations", 
            "019_tiktok_events_log.sql"
        )
        
        with open(migration_path, "r") as f:
            sql = f.read()

        print("Executing migration 019_tiktok_events_log.sql...")
        await conn.execute(sql)
        print("Migration complete!")
        
    except Exception as e:
        print(f"Failed to migrate: {e}")
        
    finally:
        if 'conn' in locals():
            await conn.close()

if __name__ == "__main__":
    asyncio.run(main())
