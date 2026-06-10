import sys
import os
from pathlib import Path

backend_dir = Path(__file__).parent.parent / "backend"
sys.path.insert(0, str(backend_dir))

env_file = backend_dir / ".env"
if env_file.exists():
    with open(env_file) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, val = line.split('=', 1)
                os.environ[key] = val

from app.pipeline.stream import _fmt, _fmt_relaxed
print('_fmt(1080):', _fmt(1080))
print('_fmt_relaxed(1080):', _fmt_relaxed(1080))