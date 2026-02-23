import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()
from scraper.models import Streamer, Video
vids = Video.objects.filter(streamer__isnull=True)
count = 0
for v in vids:
    s = Streamer.objects.filter(login__iexact=v.streamer_login).first()
    if s:
        v.streamer = s
        v.save()
        count += 1
        print(f"Linked {v.id} to {s.display_name}")
print(f"Fixed {count} videos")
