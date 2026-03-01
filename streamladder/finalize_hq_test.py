import os
import django
import httpx
import sys
from pathlib import Path
from dotenv import load_dotenv

# Setup Django
load_dotenv()
sys.path.append('/home/kvir/PersonalProjects/chat-download')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from scraper.models import Clip
from streamladder.s3_uploader import S3Uploader

HQ_URL = "https://long-storage.streamladder.com/streamladder/ssr/881d40c6-e2ab-46b7-b611-4b2254301626/video.mp4"
CLIP_ID = "00193734-4e2e-46ea-bb5f-977a4d3349f3"

def run():
    # 1. Download HQ video
    print(f"[*] Downloading HQ video from {HQ_URL}...")
    local_path = "hq_test.mp4"
    with httpx.stream("GET", HQ_URL) as r:
        with open(local_path, "wb") as f:
            for chunk in r.iter_bytes():
                f.write(chunk)
    
    # 2. Upload to S3
    print("[*] Uploading to S3...")
    uploader = S3Uploader()
    s3_url = uploader.upload_file(local_path, f"clips/{CLIP_ID}_hq.mp4")
    
    if not s3_url:
        print("[!] S3 upload failed")
        return

    print(f"[+] S3 URL: {s3_url}")
    
    # 3. Update DB
    try:
        clip = Clip.objects.get(streamladder_id=CLIP_ID)
        clip.s3_url = s3_url
        clip.save()
        print(f"[+] Database updated for clip: {clip.title}")
    except Clip.DoesNotExist:
        print(f"[!] Clip with streamladder_id {CLIP_ID} not found in DB")

if __name__ == "__main__":
    run()
