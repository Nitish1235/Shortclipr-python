"""Debug proxy configuration - load .env explicitly"""
import sys
import os
from pathlib import Path

# Load .env manually
backend_dir = Path(__file__).parent.parent / "backend"
env_file = backend_dir / ".env"

print(f"Looking for .env at: {env_file}")
print(f".env exists: {env_file.exists()}")

if env_file.exists():
    with open(env_file) as f:
        content = f.read()
    print(f".env first 500 chars:\n{content[:500]}")

# Now test settings
sys.path.insert(0, str(backend_dir))
os.environ.setdefault('APP_ENV', 'development')

# Load .env into environment
from dotenv import load_dotenv
load_dotenv(str(env_file))

from app.core.config import get_settings
settings = get_settings()

print("\nAfter load_dotenv:")
print("PROXY_HOST:", repr(settings.PROXY_HOST))
print("PROXY_USER:", repr(settings.PROXY_USER))
print("PROXY_PASS:", repr(settings.PROXY_PASS[:10] + "..." if settings.PROXY_PASS else "None"))
print("PROXY_PORT:", repr(settings.PROXY_PORT))