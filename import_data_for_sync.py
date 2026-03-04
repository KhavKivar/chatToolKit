import os
import sys
import json
from pathlib import Path

# Django setup
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")
import django
django.setup()

from scraper.models import Video, Streamer, Clip, TranscriptEntry
from django.db import transaction

def import_data():
    file_path = Path("sync_data.json")
    if not file_path.exists():
        print("Error: sync_data.json not found")
        return
    
    with open(file_path) as f:
        data = json.load(f)
    
    clips_data = data.get("clips", [])
    transcripts_data = data.get("transcripts", [])
    
    print(f"Found {len(clips_data)} clips and {len(transcripts_data)} transcripts in JSON")
    
    with transaction.atomic():
        # Sync Clips
        clip_objs = []
        for item in clips_data:
            fields = item["fields"]
            pk = item["pk"]
            
            # Check if video and streamer exist
            try:
                video = Video.objects.get(id=fields["video"])
                streamer = Streamer.objects.get(id=fields["streamer"])
                
                # We use get_or_create to avoid duplicates if rerun
                # Note: fields["title"] and streamladder_id are good identifiers
                Clip.objects.get_or_create(
                    id=pk,
                    defaults={
                        "video": video,
                        "streamer": streamer,
                        "title": fields["title"],
                        "s3_url": fields["s3_url"],
                        "streamladder_id": fields["streamladder_id"],
                        "created_at": fields["created_at"]
                    }
                )
            except (Video.DoesNotExist, Streamer.DoesNotExist):
                # If they don't exist here, skip one
                continue
        
        # Sync Transcripts
        transcript_objs = []
        for item in transcripts_data:
            fields = item["fields"]
            
            try:
                video = Video.objects.get(id=fields["video"])
                streamer = Streamer.objects.get(id=fields["streamer"])
                
                # Check if it already exists to avoid massive duplication
                exists = TranscriptEntry.objects.filter(
                    video=video,
                    start_seconds=fields["start_seconds"],
                    text=fields["text"]
                ).exists()
                
                if not exists:
                    transcript_objs.append(TranscriptEntry(
                        video=video,
                        streamer=streamer,
                        start_seconds=fields["start_seconds"],
                        end_seconds=fields["end_seconds"],
                        text=fields["text"]
                    ))
            except (Video.DoesNotExist, Streamer.DoesNotExist):
                continue
        
        if transcript_objs:
            TranscriptEntry.objects.bulk_create(transcript_objs)
            print(f"Imported {len(transcript_objs)} transcripts")
        else:
            print("No new transcripts to import")

    print("Import complete")

if __name__ == "__main__":
    import_data()
