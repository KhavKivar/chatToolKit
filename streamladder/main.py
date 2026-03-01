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

from asgiref.sync import sync_to_async
from scraper.models import Video, Streamer, Clip, TranscriptEntry
import scrape_clips
from s3_uploader import S3Uploader

@sync_to_async
def sync_transcript_to_db(transcript_data, vod_id):
    if not transcript_data or not vod_id:
        return 0

    try:
        video = Video.objects.get(id=vod_id)
        streamer = video.streamer
    except Video.DoesNotExist:
        logger.warning(f"Video {vod_id} not in DB - skipping transcript sync")
        return 0

    # Avoid duplicate transcripts for the same video
    if TranscriptEntry.objects.filter(video=video).exists():
        logger.info(f"Transcript for video {vod_id} already exists. Skipping bulk sync.")
        return 0
    
    entries = []
    for item in transcript_data:
        # Streamladder transcript JSON format: {"Text": "...", "StartMs": 123, "EndMs": 456}
        # Supporting both PascalCase (found in raw API) and lowercase (usual convention)
        start_ms = item.get("StartMs") if item.get("StartMs") is not None else item.get("start", 0)
        end_ms = item.get("EndMs") if item.get("EndMs") is not None else item.get("end", 0)
        text = item.get("Text") if item.get("Text") is not None else item.get("text", "")

        entries.append(TranscriptEntry(
            video=video,
            streamer=streamer,
            start_seconds=float(start_ms) / 1000.0,
            end_seconds=float(end_ms) / 1000.0,
            text=text
        ))
    
    if entries:
        TranscriptEntry.objects.bulk_create(entries)
        return len(entries)
    return 0

CLIPS_DIR = Path("downloaded_clips")

def download_clip(url, filename):
    if not url:
        return None
    
    CLIPS_DIR.mkdir(exist_ok=True)
    target_path = CLIPS_DIR / filename
    
    if target_path.exists():
        # logger.info(f"Skipping download, already exists: {filename}")
        return target_path

    try:
        logger.info(f"Downloading: {filename}...")
        r = requests.get(url, stream=True, timeout=30)
        r.raise_for_status()
        with open(target_path, 'wb') as f:
            for chunk in r.iter_content(chunk_size=8192):
                f.write(chunk)
        return target_path
    except Exception as e:
        logger.error(f"Failed to download {filename}: {e}")
        return None

@sync_to_async
def sync_clip_to_db(data):
    sl_id = data.get("id")
    vod_id = data.get("vod_id")
    title = data.get("title", "Untitled Clip")
    
    if not sl_id or not vod_id:
        return None, False

    try:
        video = Video.objects.get(id=vod_id)
        streamer = video.streamer
    except Video.DoesNotExist:
        logger.warning(f"Video {vod_id} not in DB - skipping clip '{title}'")
        return None, False

    clip, created = Clip.objects.get_or_create(
        streamladder_id=sl_id,
        defaults={
            "video": video,
            "streamer": streamer,
            "title": title,
        }
    )

    needs_upload_s3 = not clip.s3_url
    
    if not created:
        if clip.title != title:
            clip.title = title
            clip.save()
    
    return clip, needs_upload_s3

@sync_to_async
def update_clip_hosting(clip_id, s3_url=None):
    try:
        clip = Clip.objects.get(id=clip_id)
        if s3_url:
            clip.s3_url = s3_url
        clip.save()
        return True
    except Exception as e:
        logger.error(f"Failed to update clip in DB: {e}")
        return False

async def run_sync():
    logger.info("Starting StreamLadder Metadata Sync, Download & S3 Upload...")
    
    # Initialize S3 Uploader
    s3_uploader = S3Uploader()
    do_uploads_s3 = s3_uploader.s3_client is not None

    # Load All Clips
    CLIPS_JSON = Path("streamladder/all_clips.json")
    if not CLIPS_JSON.exists():
        logger.error("No streamladder/all_clips.json found. Run scrape_all_batch.py first.")
        return

    with open(CLIPS_JSON, "r") as f:
        clips_data = json.load(f)

    logger.info(f"Processing {len(clips_data)} clips in batch...")

    unique_vod_ids = set()
    for data in clips_data:
        sl_id = data.get("id")
        video_url = data.get("video_url")
        status = data.get("status")
        title = data.get("title", "AI Moment")
        vod_id = data.get("vod_id")
        if vod_id: unique_vod_ids.add(vod_id)

        if status != "succeeded" or not video_url:
            continue

        # Sync to DB
        clip, needs_s3 = await sync_clip_to_db(data)
        if not clip:
            continue

        # Download clip if needed
        filename = f"{sl_id}.mp4"
        local_path = download_clip(video_url, filename)

        # Upload to S3
        if do_uploads_s3 and needs_s3 and local_path:
            s3_url = s3_uploader.upload_file(str(local_path), f"clips/{sl_id}.mp4")
            if s3_url:
                await update_clip_hosting(clip.id, s3_url=s3_url)
                logger.success(f"Clip '{title}' is live!")

    # Load Batch Transcripts
    TRANSCRIPTS_JSON = Path("streamladder/all_transcripts.json")
    if TRANSCRIPTS_JSON.exists():
        logger.info(f"Processing transcripts for {len(unique_vod_ids)} unique videos...")
        with open(TRANSCRIPTS_JSON, "r") as f:
            all_transcripts_map = json.load(f)
        
        for vod_id in unique_vod_ids:
            transcript_data = all_transcripts_map.get(vod_id)
            if transcript_data:
                count = await sync_transcript_to_db(transcript_data, vod_id)
                if count > 0:
                    logger.success(f"Synced {count} transcript entries for video {vod_id}.")

    logger.info("Batch sync complete.")

if __name__ == "__main__":
    asyncio.run(run_sync())
