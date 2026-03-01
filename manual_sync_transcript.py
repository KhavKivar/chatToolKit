import os
import sys
import json
from pathlib import Path

# Django setup
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")
import django
django.setup()

from scraper.models import Video, TranscriptEntry

def manual_sync():
    transcripts_path = Path("streamladder/transcripts.json")
    clips_path = Path("streamladder/clips.json")
    
    if not transcripts_path.exists() or not clips_path.exists():
        print("Required files not found")
        return

    with open(clips_path) as f:
        clips = json.load(f)
        if not clips: return
        vod_id = clips[0]['vod_id']
    
    with open(transcripts_path) as f:
        data = json.load(f)

    video = Video.objects.get(id=vod_id)
    streamer = video.streamer
    
    entries = []
    for item in data:
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
    
    TranscriptEntry.objects.bulk_create(entries)
    print(f"Synced {len(entries)} entries for video {vod_id}")

if __name__ == "__main__":
    manual_sync()
