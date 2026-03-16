
import os
import django
import sys

# Setup Django
sys.path.append('/home/kvir/PersonalProjects/chat-download')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from scraper.services import TwitchScraperService, GQL_USER_VIDEOS_QUERY
from scraper.models import Video, Streamer

def find_missing_vods(login):
    service = TwitchScraperService()
    streamer = Streamer.objects.filter(login__iexact=login).first()
    if not streamer:
        print(f"Streamer {login} not found in database.")
        return []
    
    print(f"Fetching VODs for {login} from Twitch (Paginated)...")
    
    existing_vod_ids = set(Video.objects.filter(streamer=streamer).values_list('id', flat=True))
    twitch_vod_ids = []
    
    cursor = None
    service.refresh_integrity()
    
    while True:
        res = service.fetch_gql(
            {"login": login, "limit": 100, "cursor": cursor}, 
            query=GQL_USER_VIDEOS_QUERY, 
            operation_name="GetUserVideos"
        )
        user_data = ((res or {}).get("data") or {}).get("user")
        if not user_data: break
        
        videos_data = user_data.get("videos") or {}
        edges = videos_data.get("edges", [])
        if not edges: break
        
        for edge in edges:
            node = edge.get("node")
            if node:
                twitch_vod_ids.append(node['id'])
            cursor = edge.get("cursor")
            
        if not videos_data.get("pageInfo", {}).get("hasNextPage"):
            break
            
    missing_vods = [vid for vid in twitch_vod_ids if vid not in existing_vod_ids]
    return missing_vods

if __name__ == "__main__":
    missing = find_missing_vods("leonblack")
    print(f"vods_missing = {missing}")
