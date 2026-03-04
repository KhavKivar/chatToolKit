import os
import sys
import json
from pathlib import Path
from django.core import serializers

# Django setup
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")
import django
django.setup()

from scraper.models import Clip, TranscriptEntry

def export_data():
    clips = Clip.objects.all()
    transcripts = TranscriptEntry.objects.all()
    
    data = {
        "clips": json.loads(serializers.serialize("json", clips)),
        "transcripts": json.loads(serializers.serialize("json", transcripts))
    }
    
    with open("sync_data.json", "w") as f:
        json.dump(data, f, indent=2)
    
    print(f"Exported {clips.count()} clips and {transcripts.count()} transcripts to sync_data.json")

if __name__ == "__main__":
    export_data()
