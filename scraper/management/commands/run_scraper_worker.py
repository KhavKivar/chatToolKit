import time
from django.core.management.base import BaseCommand
from scraper.models import ScrapeTask
from scraper.services import TwitchScraperService

class Command(BaseCommand):
    help = 'Runs the background worker to process pending ScrapeTasks'

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('Starting Scraper Background Worker...'))
        service = TwitchScraperService()

        while True:
            # Find the oldest pending task
            task = ScrapeTask.objects.filter(status='Pending').order_by('created_at').first()

            if not task:
                # No tasks, sleep for a bit
                time.sleep(5)
                continue

            self.stdout.write(f"Processing task for Video ID: {task.video_id} (Streamer: {task.streamer.login})")
            
            # Mark as InProgress
            task.status = 'InProgress'
            task.save()

            def progress_cb(data):
                # data contains percent, total_comments, offset, etc.
                pct = data.get('percent', 0)
                if pct > task.progress_percent:
                    task.progress_percent = pct
                    task.save(update_fields=['progress_percent', 'updated_at'])

            try:
                # Run the synchronous scrape with our progress callback
                service.scrape_video(task.video_id, on_progress=progress_cb)
                
                # Mark completed
                task.status = 'Completed'
                task.progress_percent = 100
                task.save()
                self.stdout.write(self.style.SUCCESS(f"Successfully completed task for Video ID: {task.video_id}"))
                
            except Exception as e:
                # Mark failed
                task.status = 'Failed'
                task.error_message = str(e)
                task.save()
                self.stdout.write(self.style.ERROR(f"Failed task for Video ID: {task.video_id}. Error: {e}"))
            
            finally:
                # Small pause between tasks to avoid hammering the DB or Twitch
                time.sleep(1)
