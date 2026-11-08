import base64
import hashlib
import json
import secrets
import urllib.parse
import urllib.request

from py_modules.common import SPOTIFY_TOKEN_URL, _API_SSL_CTX


def _generate_pkce_pair() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(64)
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return verifier, challenge


def _spotify_token_request(params: dict) -> dict:
    data = urllib.parse.urlencode(params).encode("utf-8")
    req = urllib.request.Request(
        SPOTIFY_TOKEN_URL,
        data=data,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    with urllib.request.urlopen(req, timeout=10, context=_API_SSL_CTX) as resp:
        return json.loads(resp.read())
