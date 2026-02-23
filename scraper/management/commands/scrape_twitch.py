from django.core.management.base import BaseCommand
from scraper.services import TwitchScraperService
import os

class Command(BaseCommand):
    help = 'Scrapes Twitch chat and uploads to Supabase'

    def add_arguments(self, parser):
        parser.add_argument('video_id', type=str, help='Twitch Video ID')
        parser.add_argument('--pages', type=int, help='Limit number of pages to scrape', default=None)
        parser.add_argument('--oauth', type=str, help='Twitch OAuth token', default=None)

    def handle(self, *args, **options):
        video_id = options['video_id']
        pages = options['pages']
        oauth = options['oauth'] or os.getenv("TWITCH_OAUTH_TOKEN")

        self.stdout.write(self.style.SUCCESS(f'Starting scrape for video {video_id}'))
        
        service = TwitchScraperService(oauth_token=oauth)
        try:
            service.scrape_video(video_id, limit_pages=pages)
            self.stdout.write(self.style.SUCCESS('Successfully finished scraping'))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'Error during scrape: {str(e)}'))
        finally:
            service.cleanup()
