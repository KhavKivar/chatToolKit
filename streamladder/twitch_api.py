import requests
from loguru import logger
import config


def _headers() -> dict:
    return {
        "Client-Id": config.TWITCH_CLIENT_ID,
        "Authorization": f"Bearer {config.TWITCH_ACCESS_TOKEN}",
    }


def get_broadcaster_id(clip_slug: str) -> str | None:
    """Resolve a Twitch clip slug to its broadcaster_id."""
    url = "https://api.twitch.tv/helix/clips"
    resp = requests.get(url, headers=_headers(), params={"id": clip_slug})
    resp.raise_for_status()
    data = resp.json().get("data", [])
    if not data:
        logger.warning(f"No clip found for slug: {clip_slug}")
        return None
    return data[0]["broadcaster_id"]


def is_live(broadcaster_id: str) -> bool:
    """Return True if the broadcaster currently has an active stream."""
    url = "https://api.twitch.tv/helix/streams"
    resp = requests.get(url, headers=_headers(), params={"user_id": broadcaster_id})
    resp.raise_for_status()
    return bool(resp.json().get("data"))


def create_clip(broadcaster_id: str) -> str | None:
    """
    Create a clip on the broadcaster's channel.
    Returns the clip URL on success, or None if the broadcaster is offline.
    """
    url = "https://api.twitch.tv/helix/clips"
    resp = requests.post(
        url, headers=_headers(), params={"broadcaster_id": broadcaster_id}
    )
    if resp.status_code == 404:
        logger.warning(f"Broadcaster {broadcaster_id} is offline, clip skipped.")
        return None
    resp.raise_for_status()
    data = resp.json().get("data", [])
    if not data:
        logger.error(f"Unexpected empty response when creating clip for {broadcaster_id}")
        return None
    edit_url = data[0]["edit_url"]
    # Convert edit URL to the public clip URL
    clip_url = edit_url.replace("?editor", "")
    return clip_url
