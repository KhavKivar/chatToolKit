import time
from datetime import datetime, timedelta
from django.core.management.base import BaseCommand
from django.utils import timezone
from scraper.models import Streamer, ScrapeTask, Video
from scraper.services import TwitchScraperService

class Command(BaseCommand):
    help = 'Checks all tracked streamers for new VODs and enqueues them for scraping'

    def add_arguments(self, parser):
        parser.add_argument(
            '--loop',
            action='store_true',
            help='Run in a continuous loop every 6 hours',
        )

    def handle(self, *args, **options):
        is_loop = options.get('loop')
        
        while True:
            self.stdout.write(self.style.SUCCESS(f'Running VOD auto-sync at {timezone.now()}...'))
            self.run_sync()
            
            if not is_loop:
                break
                
            self.stdout.write(self.style.SUCCESS('Sync complete. Waiting 6 hours for next run...'))
            # 6 hours = 6 * 60 * 60 seconds
            time.sleep(6 * 3600)

    def run_sync(self):
        service = TwitchScraperService()
        streamers = Streamer.objects.all()

        total_queued = 0
        now = timezone.now()
        threshold_48h = now - timedelta(hours=48)

        for streamer in streamers:
            self.stdout.write(f"Checking VODs for {streamer.display_name}...")
            try:
                # Fetch recent VODs (limit 20 is usually enough for a daily check)
                vods = service.fetch_streamer_vods(streamer.login, limit=20)
                queued_for_streamer = 0
                
                for vod in vods:
                    video_id = vod['id']
                    
                    # Parse creation time to check if it's within the 48h window
                    # Twitch GQL returns ISO format: 2024-02-23T12:34:56Z
                    created_at_str = vod.get('createdAt')
                    is_recent = False
                    if created_at_str:
                        created_at = datetime.fromisoformat(created_at_str.replace('Z', '+00:00'))
                        if created_at > threshold_48h:
                            is_recent = True

                    video_exists = Video.objects.filter(id=video_id).exists()
                    # Check if there's already a pending or in-progress task for this video
                    active_task = ScrapeTask.objects.filter(
                        video_id=video_id, 
                        status__in=['Pending', 'InProgress']
                    ).exists()

                    if active_task:
                        continue

                    # Queue if it doesn't exist OR if it's recent (within 48h) and we want to refresh it
                    should_queue = not video_exists or is_recent

                    if should_queue:
                        ScrapeTask.objects.create(
                            video_id=video_id,
                            streamer=streamer,
                            status='Pending'
                        )
                        queued_for_streamer += 1
                        total_queued += 1
                
                self.stdout.write(self.style.SUCCESS(f"Queued {queued_for_streamer} VODs for {streamer.display_name}"))
            except Exception as e:
                self.stdout.write(self.style.ERROR(f"Error checking VODs for {streamer.display_name}: {e}"))
            
            # Small delay to avoid rate limits
            time.sleep(1)

        self.stdout.write(self.style.SUCCESS(f"Auto-sync cycle complete. Total VODs queued: {total_queued}"))
