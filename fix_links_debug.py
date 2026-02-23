import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()
from scraper.models import Streamer, Video
vids = Video.objects.all()
print(f"Total videos: {vids.count()}")
count = 0
for v in vids:
    if v.streamer is None:
        s = Streamer.objects.filter(login__iexact=v.streamer_login).first()
        if s:
            v.streamer = s
            v.save()
            count += 1
            print(f"Linked {v.id} to {s.display_name}")
        else:
            print(f"Could not find streamer for login: {v.streamer_login}")
print(f"Linked {count} videos")
