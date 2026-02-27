import os
from dotenv import load_dotenv

load_dotenv()

TWITCH_CLIENT_ID = os.getenv("TWITCH_CLIENT_ID")
TWITCH_CLIENT_SECRET = os.getenv("TWITCH_CLIENT_SECRET")
TWITCH_ACCESS_TOKEN = os.getenv("TWITCH_ACCESS_TOKEN")
STREAMLADDER_EMAIL = os.getenv("STREAMLADDER_EMAIL")

SESSION_FILE = "session.json"


def validate():
    missing = [
        name
        for name, val in [
            ("TWITCH_CLIENT_ID", TWITCH_CLIENT_ID),
            ("TWITCH_ACCESS_TOKEN", TWITCH_ACCESS_TOKEN),
        ]
        if not val
    ]
    if missing:
        raise EnvironmentError(
            f"Missing required environment variables: {', '.join(missing)}\n"
            "Copy .env.example to .env and fill in the values."
        )
