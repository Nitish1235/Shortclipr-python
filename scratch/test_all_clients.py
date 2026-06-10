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
print(f"Proxy: {proxy}")

for client in ['android', 'mweb', 'ios', 'web', 'tv_embedded']:
    try:
        opts = {'quiet': True, 'skip_download': True, 'proxy': proxy, 'format': 'best', 'extractor_args': {'youtube': {'player_client': [client]}}}
        info = yt_dlp.YoutubeDL(opts).extract_info('https://www.youtube.com/watch?v=6FNRVY2vYXw', download=False)
        url = info.get('url', '') if info else ''
        if url:
            print(f"{client}: SUCCESS - {url[:50]}...")
        else:
            print(f"{client}: FAILED - No URL")
    except Exception as e:
        print(f"{client}: FAILED - {str(e)[:100]}")