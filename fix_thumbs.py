import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()
from scraper.models import Video
from scraper.services import TwitchScraperService
svc = TwitchScraperService()

vids = Video.objects.filter(thumbnail_url__isnull=True)
print(vids.count(), "videos to update")
for v in vids:
    res = svc.fetch_gql({"videoID": v.id, "cursor": None, "contentOffsetSeconds": 0})
    data = res.get("data", {}).get("video")
    if data and data.get("previewThumbnailURL"):
        v.thumbnail_url = data["previewThumbnailURL"]
        v.save()
        print(f"Updated {v.id}")
print("Done")
