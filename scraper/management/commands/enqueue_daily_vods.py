import time
from django.core.management.base import BaseCommand
from scraper.models import Streamer, ScrapeTask, Video
from scraper.services import TwitchScraperService

class Command(BaseCommand):
    help = 'Checks all tracked streamers for new VODs and enqueues them for scraping'

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('Running daily VOD auto-sync...'))
        service = TwitchScraperService()
        streamers = Streamer.objects.all()

        total_queued = 0

        for streamer in streamers:
            self.stdout.write(f"Checking VODs for {streamer.display_name}...")
            try:
                # Fetch recent VODs (limit 20 is usually enough for a daily check)
                vods = service.fetch_streamer_vods(streamer.login, limit=20)
                queued_for_streamer = 0
                
                for vod in vods:
                    video_id = vod['id']
                    # Only queue if not already downloaded and not already pending/in-progress
                    if not Video.objects.filter(id=video_id).exists() and not ScrapeTask.objects.filter(video_id=video_id).exists():
                        ScrapeTask.objects.create(
                            video_id=video_id,
                            streamer=streamer,
                            status='Pending'
                        )
                        queued_for_streamer += 1
                        total_queued += 1
                
                self.stdout.write(self.style.SUCCESS(f"Queued {queued_for_streamer} new VODs for {streamer.display_name}"))
            except Exception as e:
                self.stdout.write(self.style.ERROR(f"Error checking VODs for {streamer.display_name}: {e}"))
            
            # Small delay to avoid rate limits
            time.sleep(1)

        self.stdout.write(self.style.SUCCESS(f"Daily auto-sync complete. Total new VODs queued: {total_queued}"))
