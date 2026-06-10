import sys
sys.path.insert(0, 'backend')
import os
from pathlib import Path

env_file = Path('backend/.env')
with open(env_file) as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, v = line.split('=', 1)
            os.environ[k] = v

from app.core.proxy import get_proxy_url
import yt_dlp

proxy = get_proxy_url()

# Test different proxy ports
for port in [8080, 31112, 10001, 10002, 10003]:
    try:
        test_proxy = proxy.replace(':8080', f':{port}')
        opts = {'quiet': True, 'skip_download': True, 'proxy': test_proxy, 'format': 'best', 'extractor_args': {'youtube': {'player_client': ['tv_embedded']}}}
        info = yt_dlp.YoutubeDL(opts).extract_info('https://www.youtube.com/watch?v=6FNRVY2vYXw', download=False)
        url = info.get('url', '') if info else ''
        if url:
            print(f"Port {port} + tv_embedded: SUCCESS - {url[:50]}...")
        else:
            print(f"Port {port}: FAILED - No URL")
    except Exception as e:
        print(f"Port {port}: FAILED - {str(e)[:80]}")