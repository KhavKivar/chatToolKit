#!/usr/bin/env python3
"""
Twitch OAuth helper — gets a user access token with clips:edit scope.

Usage:
    python get_token.py

Prerequisites:
    - TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET set in .env (or environment)
    - Your Twitch app's OAuth redirect URI must include: http://localhost:3000
      (set this in the Twitch Developer Console under your app's settings)
"""

import http.server
import threading
import urllib.parse
import webbrowser
import requests
from loguru import logger
from dotenv import load_dotenv
import os

load_dotenv()

CLIENT_ID = os.getenv("TWITCH_CLIENT_ID")
CLIENT_SECRET = os.getenv("TWITCH_CLIENT_SECRET")
REDIRECT_URI = "http://localhost:3000"
SCOPE = "clips:edit"
AUTH_URL = "https://id.twitch.tv/oauth2/authorize"
TOKEN_URL = "https://id.twitch.tv/oauth2/token"

_auth_code: str | None = None
_server_done = threading.Event()


class _CallbackHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        global _auth_code
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)

        if "code" in params:
            _auth_code = params["code"][0]
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write(b"<h1>Authorization successful! You can close this tab.</h1>")
        else:
            error = params.get("error", ["unknown"])[0]
            self.send_response(400)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write(f"<h1>Authorization failed: {error}</h1>".encode())

        _server_done.set()

    def log_message(self, format, *args):
        pass  # Suppress server logs


def main():
    if not CLIENT_ID or not CLIENT_SECRET:
        raise EnvironmentError(
            "TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET must be set in .env"
        )

    # Build the authorization URL
    params = urllib.parse.urlencode({
        "client_id": CLIENT_ID,
        "redirect_uri": REDIRECT_URI,
        "response_type": "code",
        "scope": SCOPE,
    })
    auth_url = f"{AUTH_URL}?{params}"

    # Start local callback server
    server = http.server.HTTPServer(("localhost", 3000), _CallbackHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    logger.info(f"Opening browser for Twitch authorization...")
    logger.info(f"If the browser doesn't open, visit:\n  {auth_url}")
    webbrowser.open(auth_url)

    _server_done.wait(timeout=120)
    server.shutdown()

    if not _auth_code:
        raise RuntimeError("Authorization timed out or was denied.")

    # Exchange code for access token
    resp = requests.post(TOKEN_URL, data={
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "code": _auth_code,
        "grant_type": "authorization_code",
        "redirect_uri": REDIRECT_URI,
    })
    resp.raise_for_status()
    token_data = resp.json()

    access_token = token_data["access_token"]
    refresh_token = token_data.get("refresh_token", "")

    print()
    print("=" * 60)
    print("SUCCESS! Add these to your .env file:")
    print(f"  TWITCH_ACCESS_TOKEN={access_token}")
    if refresh_token:
        print(f"  TWITCH_REFRESH_TOKEN={refresh_token}")
    print("=" * 60)


if __name__ == "__main__":
    main()
