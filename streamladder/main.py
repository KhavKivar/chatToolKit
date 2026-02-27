#!/usr/bin/env python3
"""
StreamLadder → YouTube & DB Metadata Sync
Scrapes clips from StreamLadder ClipGPT results and syncs them to the Django DB.
Now includes clip downloading to facilitate YouTube uploads.
"""

import asyncio
import sys
import json
import os
import requests
from pathlib import Path
from loguru import logger

# Django setup
import django
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")
django.setup()

from scraper.models import Video, Streamer, Clip
import scrape_clips

CLIPS_DIR = Path("downloaded_clips")

def download_clip(url, filename):
    if not url:
        return None
    
    CLIPS_DIR.mkdir(exist_ok=True)
    target_path = CLIPS_DIR / filename
    
    if target_path.exists():
        return target_path

    try:
        logger.info(f"Downloading: {filename}...")
        r = requests.get(url, stream=True)
        r.raise_for_status()
        with open(target_path, 'wb') as f:
            for chunk in r.iter_content(chunk_size=8192):
                f.write(chunk)
        return target_path
    except Exception as e:
        logger.error(f"Failed to download {filename}: {e}")
        return None

async def run_sync():
    logger.info("Starting StreamLadder Metadata Sync & Download...")
    
    # 1. Scrape from Streamladder (metadata only)
    await scrape_clips.main()
    
    CLIPS_JSON = Path("clips.json")
    if not CLIPS_JSON.exists():
        logger.error("No clips.json found. Scrape failed?")
        return

    with open(CLIPS_JSON, "r") as f:
        clips_data = json.load(f)

    logger.info(f"Syncing {len(clips_data)} items...")

    for data in clips_data:
        sl_id = data.get("id")
        vod_id = data.get("vod_id")
        title = data.get("title", "Untitled Clip")
        video_url = data.get("video_url")

        if not sl_id or not video_url:
            continue

        # Download clip (optional, but requested infrastructure)
        # Use SL ID as filename to keep it unique
        filename = f"{sl_id}.mp4"
        local_path = download_clip(video_url, filename)

        try:
            video = Video.objects.get(id=vod_id)
            streamer = video.streamer
        except Video.DoesNotExist:
            logger.warning(f"Video {vod_id} not in DB - skipping clip '{title}'")
            continue

        # Update or create clip entries
        clip, created = Clip.objects.get_or_create(
            streamladder_id=sl_id,
            defaults={
                "video": video,
                "streamer": streamer,
                "title": title,
                "youtube_url": data.get("youtube_url", ""),
                "youtube_video_id": data.get("youtube_video_id", ""),
            }
        )

        if created:
            logger.success(f"Tracked new clip: {title}")
        else:
            if clip.title != title:
                clip.title = title
            
            # Sync YouTube fields if your test script updates them
            if data.get("youtube_url"):
                clip.youtube_url = data["youtube_url"]
                clip.youtube_video_id = data.get("youtube_video_id", "")
            
            clip.save()

    logger.info("Sync complete. Ready for YouTube upload script.")

if __name__ == "__main__":
    asyncio.run(run_sync())
