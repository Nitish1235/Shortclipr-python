"""Debug proxy configuration"""
import sys
import os

# Set up path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

os.environ.setdefault('APP_ENV', 'development')

from app.core.config import get_settings
settings = get_settings()

print("PROXY_HOST:", repr(settings.PROXY_HOST))
print("PROXY_USER:", repr(settings.PROXY_USER))
pass_val = settings.PROXY_PASS[:10] + "..." if settings.PROXY_PASS else "None"
print("PROXY_PASS:", repr(pass_val))
print("PROXY_PORT:", repr(settings.PROXY_PORT))
print("PROXY_PORT type:", type(settings.PROXY_PORT))

# Try to validate
try:
    from app.core.proxy import validate_proxy_env
    validate_proxy_env()
    print("Validation passed")
except Exception as e:
    print(f"Validation failed: {e}")

# Try to get proxy URL
from app.core.proxy import get_proxy_url
proxy = get_proxy_url()
print(f"Proxy URL: {proxy}")