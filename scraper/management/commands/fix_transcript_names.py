from django.core.management.base import BaseCommand, CommandError
from scraper.services import fix_transcript_usernames


class Command(BaseCommand):
    help = 'Re-apply username correction on existing transcripts (from raw_text)'

    def add_arguments(self, parser):
        group = parser.add_mutually_exclusive_group(required=True)
        group.add_argument('--video_id', type=str, help='Fix a single video by ID')
        group.add_argument('--streamer_login', type=str, help='Fix all transcribed videos for a streamer')
        group.add_argument('--all', action='store_true', dest='all_videos', help='Fix all videos with transcripts')

    def handle(self, *args, **options):
        from scraper.models import TranscriptEntry, Video

        if options['video_id']:
            video_ids = [options['video_id']]
        elif options['streamer_login']:
            video_ids = list(
                Video.objects
                .filter(streamer_login__iexact=options['streamer_login'])
                .filter(transcripts__isnull=False)
                .values_list('id', flat=True)
                .distinct()
            )
            if not video_ids:
                raise CommandError(f"No transcribed videos found for streamer '{options['streamer_login']}'")
        else:  # --all
            video_ids = list(
                Video.objects
                .filter(transcripts__isnull=False)
                .values_list('id', flat=True)
                .distinct()
            )
            if not video_ids:
                raise CommandError("No videos with transcripts found in the database")

        total_corrected = 0
        for video_id in video_ids:
            corrected = fix_transcript_usernames(video_id)
            total_corrected += corrected
            self.stdout.write(f"  video {video_id}: {corrected} entries updated")

        self.stdout.write(self.style.SUCCESS(
            f"Done. {total_corrected} transcript entries updated across {len(video_ids)} video(s)."
        ))
