import json
import os
from django.http import StreamingHttpResponse
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.renderers import JSONRenderer, BrowsableAPIRenderer, BaseRenderer
from .models import Video, Comment, Streamer, ScrapeTask, ClassificationTask, Clip, TranscriptEntry
from .serializers import (
    VideoSerializer, CommentSerializer, StreamerSerializer, 
    ScrapeTaskSerializer, ClassificationTaskSerializer, ClipSerializer,
    TranscriptEntrySerializer
)
from .services import TwitchScraperService
from datetime import datetime, timezone, timedelta
from django.db.models import Count, Q, F, FloatField, ExpressionWrapper, Case, When, IntegerField
from django.db.models.functions import Cast


class SSERenderer(BaseRenderer):
    media_type = 'text/event-stream'
    format = 'txt'

    def render(self, data, accepted_media_type=None, renderer_context=None):
        return data


class VideoViewSet(viewsets.ModelViewSet):
    queryset = Video.objects.all().order_by('-created_at')
    serializer_class = VideoSerializer
    filterset_fields = ['streamer', 'streamer_login']

    @action(detail=False, methods=['post'], url_path='scrape/(?P<video_id>[^/.]+)')
    def scrape(self, request, video_id=None):
        """Standard blocking scrape — kept for backwards compat."""
        pages = request.query_params.get('pages')
        if pages:
            pages = int(pages)
        oauth = request.data.get('oauth') or os.getenv("TWITCH_OAUTH_TOKEN")

        service = TwitchScraperService(oauth_token=oauth)
        try:
            service.scrape_video(video_id, limit_pages=pages)
            return Response(
                {"status": f"Scraping of video {video_id} completed."},
                status=status.HTTP_200_OK
            )
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        finally:
            service.cleanup()

    @action(detail=False, methods=['get'], url_path='scrape-stream/(?P<video_id>[^/.]+)', renderer_classes=[SSERenderer])
    def scrape_stream(self, request, video_id=None):
        """
        SSE endpoint — GET /api/videos/scrape-stream/<video_id>/
        Streams Server-Sent Events with scraping progress.
        """
        oauth = request.query_params.get('oauth') or os.getenv("TWITCH_OAUTH_TOKEN")

        def event_stream():
            service = TwitchScraperService(oauth_token=oauth)

            def on_progress(data: dict):
                payload = json.dumps(data)
                yield f"data: {payload}\n\n"

            try:
                # We need to collect yields from on_progress and stream them.
                # Since generators can't yield from callbacks directly, we use a queue.
                import queue, threading

                q: queue.Queue = queue.Queue()
                error_holder = []

                def progress_cb(data):
                    q.put(data)

                def run_scrape():
                    try:
                        service.scrape_video(video_id, on_progress=progress_cb)
                    except Exception as e:
                        error_holder.append(str(e))
                        q.put({"error": str(e), "done": True})
                    finally:
                        service.cleanup()

                t = threading.Thread(target=run_scrape, daemon=True)
                t.start()

                while True:
                    try:
                        data = q.get(timeout=60)
                        yield f"data: {json.dumps(data)}\n\n"
                        if data.get("done") or data.get("error"):
                            break
                    except queue.Empty:
                        # Heartbeat to keep connection alive
                        yield ": heartbeat\n\n"

                t.join(timeout=5)

            except Exception as e:
                yield f"data: {json.dumps({'error': str(e), 'done': True})}\n\n"

        response = StreamingHttpResponse(
            event_stream(),
            content_type='text/event-stream'
        )
        response['Cache-Control'] = 'no-cache'
        response['X-Accel-Buffering'] = 'no'
        return response


class CommentViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = CommentSerializer
    filterset_fields = ['video_id', 'video__streamer', 'is_toxic']
    search_fields = ['message', 'commenter_display_name']
    ordering_fields = ['content_offset_seconds', 'created_at']

    def get_queryset(self):
        qs = Comment.objects.select_related('video').order_by('-video__created_at', 'content_offset_seconds')
        search_or = self.request.query_params.get('search_or')
        if search_or:
            from django.db.models import Q
            # Split keywords by comma
            keywords = [k.strip() for k in search_or.split(',') if k.strip()]
            if keywords:
                q_objs = Q()
                for kw in keywords:
                    q_objs |= Q(message__icontains=kw) | Q(commenter_display_name__icontains=kw)
                qs = qs.filter(q_objs)
                
        exclude_users = self.request.query_params.get('exclude_users')
        if exclude_users:
            users = [u.strip().lower() for u in exclude_users.split(',') if u.strip()]
            if users:
                for u in users:
                    qs = qs.exclude(commenter_display_name__iexact=u)

        min_toxicity = self.request.query_params.get('min_toxicity')
        if min_toxicity:
            try:
                threshold = float(min_toxicity) / 100.0
                qs = qs.filter(toxicity_score__gte=threshold)
            except ValueError:
                pass
                    
        return qs


    @action(detail=False, methods=['get'])
    def context(self, request):
        video_id = request.query_params.get('video_id')
        target_offset = request.query_params.get('target_offset')

        if not video_id or not target_offset:
            return Response({"error": "video_id and target_offset are required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            target_offset = int(target_offset)
        except ValueError:
            return Response({"error": "target_offset must be an integer"}, status=status.HTTP_400_BAD_REQUEST)

        start_time = max(0, target_offset - 30)
        end_time = target_offset + 120

        comments = Comment.objects.filter(
            video_id=video_id,
            content_offset_seconds__gte=start_time,
            content_offset_seconds__lte=end_time
        ).order_by('content_offset_seconds')

        serializer = self.get_serializer(comments, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def stats(self, request):
        streamer_id = request.query_params.get('streamer_id')
        
        qs = Comment.objects.all()
        if streamer_id:
            qs = qs.filter(video__streamer_id=streamer_id)
            
        # 1. Top commenters
        top_commenters = qs.values('commenter_login', 'commenter_display_name')\
            .annotate(count=Count('id'))\
            .order_by('-count')[:10]
            
        # 2. Most toxic users (absolute)
        most_toxic_absolute = qs.filter(is_toxic=True)\
            .values('commenter_login', 'commenter_display_name')\
            .annotate(toxic_count=Count('id'))\
            .order_by('-toxic_count')[:10]
            
        # 3. Most toxic users (relative - percentage)
        # Filter by min 10 comments to be statistically significant
        most_toxic_relative = qs.values('commenter_login', 'commenter_display_name')\
            .annotate(
                total_count=Count('id'),
                toxic_count=Count('id', filter=Q(is_toxic=True))
            )\
            .filter(total_count__gte=10)\
            .annotate(
                ratio=ExpressionWrapper(
                    Cast(F('toxic_count'), FloatField()) / Cast(F('total_count'), FloatField()) * 100,
                    output_field=FloatField()
                )
            )\
            .order_by('-ratio')[:10]

        # 4. Toxicity by Video & Engagement
        toxicity_by_video = qs.values('video__id', 'video__title', 'video__streamer_display_name', 'video__created_at', 'video__length_seconds')\
            .annotate(
                total_count=Count('id'),
                toxic_count=Count('id', filter=Q(is_toxic=True)),
                ratio=ExpressionWrapper(
                    Cast(F('toxic_count'), FloatField()) / Cast(F('total_count'), FloatField()) * 100,
                    output_field=FloatField()
                ),
                engagement_density=ExpressionWrapper(
                    Cast(F('total_count'), FloatField()) / (Cast(Case(When(video__length_seconds__gt=0, then=F('video__length_seconds')), default=1, output_field=IntegerField()), FloatField()) / 60.0),
                    output_field=FloatField()
                )
            )\
            .order_by('-ratio')[:10]

        # 5. Top 5 Videos by total comments
        top_videos_by_volume = qs.values('video__id', 'video__title', 'video__streamer_display_name', 'video__created_at')\
            .annotate(total_count=Count('id'))\
            .order_by('-total_count')[:5]

        # 6. Hourly Activity (Activity vs Toxicity by hour of day)
        # We group by hour of the day to see when things get heated
        from django.db.models.functions import ExtractHour
        hourly_stats = qs.annotate(hour=ExtractHour('created_at'))\
            .values('hour')\
            .annotate(
                count=Count('id'),
                toxic_count=Count('id', filter=Q(is_toxic=True))
            )\
            .order_by('hour')

        total_videos = qs.values('video__id').distinct().count()

        # 7. Streamer top words (from transcripts)
        transcript_qs = TranscriptEntry.objects.all()
        if streamer_id:
            transcript_qs = transcript_qs.filter(streamer_id=streamer_id)
        
        # Higher limit to cover more historical data (approx 100-150 hours)
        transcripts = transcript_qs.only('text').order_by('-id')[:50000]
        
        import re
        from collections import Counter
        
        all_words = []
        # Stop words (simplified set)
        STOP_WORDS = {
            'a', 'the', 'and', 'or', 'to', 'of', 'in', 'is', 'it', 'for', 'with', 'on', 'as', 'at', 'this', 'that', 'from', 'but', 'not', 'by', 'an', 'be', 'are', 'was', 'were', 'have', 'has', 'had', 'do', 'does', 'did', 'if', 'then', 'than', 'up', 'down', 'out', 'off', 'me', 'you', 'he', 'she', 'they', 'them', 'my', 'your', 'his', 'her', 'their', 'our', 'what', 'which', 'who', 'how', 'where', 'when', 'why',
            'la', 'el', 'en', 'y', 'de', 'un', 'una', 'con', 'por', 'que', 'lo', 'los', 'las', 'del', 'mi', 'tu', 'su', 'nos', 'os', 'les', 'este', 'esta', 'esto', 'eso', 'para', 'porque', 'pero', 'como', 'si', 'no', 'ya', 'muy', 'mas', 'tan', 'muy', 'todo', 'nada', 'otro', 'cada', 'una', 'uno', 'donde', 'cual', 'esta', 'estos', 'estas', 'ser', 'estar', 'ha', 'has', 'he', 'han', 'hay',
            'like', 'know', 'just', 'get', 'think', 'yeah', 'okay', 'right', 'well', 'really', 'now', 'time', 'good', 'see', 'can', 'don', 'actually', 'maybe', 'lot', 'little', 'bit', 'would', 'going', 'there', 'mean', 'one', 'here', 'man', 'got', 'something', 'everything', 'everyone', 'someone'
        }
        
        for t in transcripts:
            if t.text:
                t_words = re.findall(r'\b\w+\b', t.text.lower())
                for w in t_words:
                    if len(w) > 2 and w not in STOP_WORDS:
                        all_words.append(w)
        
        top_streamer_words = Counter(all_words).most_common(12) # Fetch a few more for filter buffer
        top_streamer_words = [{"word": w, "count": c} for w, c in top_streamer_words][:10]

        # 8. Complex words (length > 8)
        complex_words = [w for w in all_words if len(w) > 8]
        top_complex_words = Counter(complex_words).most_common(10)
        top_complex_words = [{"word": w, "count": c} for w, c in top_complex_words]

        # 9. Top Mentioned Users (Who does the streamer talk about?)
        # We look for names of active community members in the transcripts
        community_names = qs.values_list('commenter_display_name', flat=True).distinct()[:100]
        # Filter out short names or common words to avoid false positives
        community_names = [name for name in community_names if len(name) > 3]
        
        mention_counts = Counter()
        # Combine transcripts for faster searching
        full_transcript_text = " ".join([t.text for t in transcripts if t.text]).lower()
        
        for name in community_names:
            # We use word boundaries to avoid matching sub-strings
            count = len(re.findall(r'\b' + re.escape(name.lower()) + r'\b', full_transcript_text))
            if count > 0:
                mention_counts[name] = count
        
        top_mentioned_users = [{"username": name, "count": count} for name, count in mention_counts.most_common(10)]

        return Response({
            "top_commenters": list(top_commenters),
            "most_toxic_absolute": list(most_toxic_absolute),
            "most_toxic_relative": list(most_toxic_relative),
            "top_streamer_words": top_streamer_words,
            "top_complex_words": top_complex_words,
            "toxicity_by_video": list(toxicity_by_video),
            "top_videos_by_volume": list(top_videos_by_volume),
            "hourly_stats": list(hourly_stats),
            "total_videos": total_videos,
            "top_mentioned_users": top_mentioned_users,
        })


class StreamerViewSet(viewsets.ModelViewSet):
    queryset = Streamer.objects.all()
    serializer_class = StreamerSerializer

    @action(detail=True, methods=['post'])
    def refresh_vods(self, request, pk=None):
        streamer = self.get_object()
        oauth = request.data.get('oauth') or os.getenv("TWITCH_OAUTH_TOKEN")
        
        service = TwitchScraperService(oauth_token=oauth)
        try:
            vods = service.fetch_streamer_vods(streamer.login, limit=50)
            queued_count = 0
            for vod in vods:
                video_id = vod['id']
                
                # Check for existing completed task
                is_done = ScrapeTask.objects.filter(video_id=video_id, status='Completed').exists()
                
                # Also check if it's currently being worked on
                has_active_task = ScrapeTask.objects.filter(video_id=video_id, status__in=['Pending', 'InProgress']).exists()
                
                should_requeue = False
                if is_done and not has_active_task:
                    # If it's done, but VOD is recent (less than 24h old), re-queue to capture more comments
                    # as it might have been live when first scraped.
                    created_at = datetime.fromisoformat(vod['createdAt'].replace('Z', '+00:00'))
                    if datetime.now(timezone.utc) - created_at < timedelta(hours=24):
                        should_requeue = True

                if (not is_done or should_requeue) and not has_active_task:
                    # If it failed or we want to requeue, we reset the task (delete any non-active task)
                    ScrapeTask.objects.filter(video_id=video_id).exclude(status__in=['Pending', 'InProgress']).delete()
                    ScrapeTask.objects.create(
                        video_id=video_id,
                        streamer=streamer,
                        status='Pending'
                    )
                    queued_count += 1
            
            print(f"REFRESH COMPLETE for {streamer.display_name}: Queued {queued_count} new tasks.")
            return Response({"status": "Refresh completed", "queued_vods": queued_count})
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        finally:
            service.cleanup()

    def create(self, request, *args, **kwargs):
        login = request.data.get('login')
        oauth = request.data.get('oauth') or os.getenv("TWITCH_OAUTH_TOKEN")
        if not login:
            return Response({"error": "login is required"}, status=status.HTTP_400_BAD_REQUEST)

        service = TwitchScraperService(oauth_token=oauth)
        try:
            # 1. Fetch streamer info
            user_info = service.fetch_streamer_info(login)
            if not user_info:
                return Response({"error": f"Streamer {login} not found on Twitch"}, status=status.HTTP_404_NOT_FOUND)
            
            streamer, created = Streamer.objects.update_or_create(
                id=user_info['id'],
                defaults={
                    'login': user_info['login'],
                    'display_name': user_info['displayName'],
                    'profile_image_url': user_info.get('profileImageURL')
                }
            )

            # 2. Fetch recent VODs
            vods = service.fetch_streamer_vods(login, limit=50)
            queued_count = 0
            for vod in vods:
                video_id = vod['id']
                
                # Only consider it done if there's a Completed ScrapeTask
                is_done = ScrapeTask.objects.filter(video_id=video_id, status='Completed').exists()
                
                has_active_task = ScrapeTask.objects.filter(video_id=video_id, status__in=['Pending', 'InProgress']).exists()
                
                should_requeue = False
                if is_done and not has_active_task:
                    created_at = datetime.fromisoformat(vod['createdAt'].replace('Z', '+00:00'))
                    if datetime.now(timezone.utc) - created_at < timedelta(hours=24):
                        should_requeue = True

                if (not is_done or should_requeue) and not has_active_task:
                    ScrapeTask.objects.filter(video_id=video_id).exclude(status__in=['Pending', 'InProgress']).delete()
                    ScrapeTask.objects.create(
                        video_id=video_id,
                        streamer=streamer,
                        status='Pending'
                    )
                    queued_count += 1

            serializer = self.get_serializer(streamer)
            response_data = serializer.data
            response_data['queued_vods'] = queued_count
            print(f"Created/Updating streamer {login}: Queued {queued_count} tasks.")
            return Response(response_data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        finally:
            service.cleanup()


class ScrapeTaskViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = ScrapeTaskSerializer
    filterset_fields = ['streamer_id', 'status']
    ordering_fields = ['created_at', 'updated_at']
    pagination_class = None  # Return all tasks — frontend needs full list for queue UI

    def get_queryset(self):
        from django.db.models import Case, When, IntegerField
        # Show InProgress first, then Pending, then Failed, then Completed
        return ScrapeTask.objects.annotate(
            status_order=Case(
                When(status='InProgress', then=0),
                When(status='Pending', then=1),
                When(status='Failed', then=2),
                When(status='Completed', then=3),
                default=4,
                output_field=IntegerField(),
            )
        ).order_by('status_order', '-updated_at')

    @action(detail=False, methods=['post'], url_path='clear-failed')
    def clear_failed(self, request):
        """
        Delete all tasks with status 'Failed'.
        POST /api/scrape-tasks/clear-failed/
        """
        deleted, _ = ScrapeTask.objects.filter(status='Failed').delete()
        return Response({'deleted': deleted}, status=status.HTTP_200_OK)

class ClassificationTaskViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = ClassificationTaskSerializer
    filterset_fields = ['video_id', 'status']
    ordering_fields = ['created_at', 'updated_at']
    pagination_class = None

    def get_queryset(self):
        from django.db.models import Case, When, IntegerField
        return ClassificationTask.objects.annotate(
            status_order=Case(
                When(status='InProgress', then=0),
                When(status='Pending', then=1),
                When(status='Failed', then=2),
                When(status='Completed', then=3),
                default=4,
                output_field=IntegerField(),
            )
        ).order_by('status_order', '-updated_at')

    @action(detail=False, methods=['post'], url_path='clear-failed')
    def clear_failed(self, request):
        """
        Delete all tasks with status 'Failed'.
        POST /api/classification-tasks/clear-failed/
        """
        deleted, _ = ClassificationTask.objects.filter(status='Failed').delete()
        return Response({'deleted': deleted}, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], url_path='requeue')
    def requeue(self, request):
        """
        Re-queue classification for a video, resetting toxicity scores so all
        comments get re-classified from scratch.
        POST /api/classification-tasks/requeue/  { "video_id": "..." }
        """
        video_id = request.data.get('video_id')
        if not video_id:
            return Response({'error': 'video_id is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            video = Video.objects.get(pk=video_id)
        except Video.DoesNotExist:
            return Response({'error': 'Video not found'}, status=status.HTTP_404_NOT_FOUND)

        # Block if already running
        if ClassificationTask.objects.filter(video=video, status__in=['Pending', 'InProgress']).exists():
            return Response({'error': 'Classification already in progress for this video'}, status=status.HTTP_409_CONFLICT)

        # Reset all toxicity scores so the worker re-classifies everything
        Comment.objects.filter(video=video).update(toxicity_score=None, is_toxic=False)

        # Replace any existing tasks with a fresh pending one
        ClassificationTask.objects.filter(video=video).delete()
        task = ClassificationTask.objects.create(video=video, status='Pending')

        return Response(self.get_serializer(task).data, status=status.HTTP_201_CREATED)


class ClipViewSet(viewsets.ModelViewSet):
    queryset = Clip.objects.all().order_by('-created_at')
    serializer_class = ClipSerializer
    filterset_fields = ['streamer', 'video']

class TranscriptEntryViewSet(viewsets.ModelViewSet):
    queryset = TranscriptEntry.objects.all().order_by('-video__created_at', 'start_seconds')
    serializer_class = TranscriptEntrySerializer
    filterset_fields = ['video', 'streamer']
    from django_filters.rest_framework import DjangoFilterBackend
    from rest_framework.filters import OrderingFilter
    filter_backends = [DjangoFilterBackend, OrderingFilter]

    def get_queryset(self):
        qs = super().get_queryset().select_related('video', 'streamer')
        # Try both 'search' and 'search_or' for backwards compatibility/consistency
        search_query = self.request.query_params.get('search_or') or self.request.query_params.get('search')
        if search_query:
            from django.db.models import Q
            # Only split by comma to allow spaces within a single keyword phrase
            keywords = [k.strip() for k in search_query.split(',') if k.strip()]
            if keywords:
                q_objs = Q()
                for kw in keywords:
                    q_objs |= Q(text__icontains=kw)
                qs = qs.filter(q_objs)

        video_id = self.request.query_params.get('video')
        if video_id:
            qs = qs.filter(video_id=video_id)

        streamer_id = self.request.query_params.get('streamer')
        if streamer_id:
            qs = qs.filter(streamer_id=streamer_id)

        return qs

    @action(detail=False, methods=['post'], url_path='upload')
    def upload(self, request):
        """
        POST /api/transcripts/upload/
        Body: { "video_id": "...", "entries": [ { "Text": "...", "StartMs": 0, "EndMs": 2000 }, ... ] }

        - Si el VOD no existe en la BD → error 404
        - Si ya tiene transcripts → los reemplaza (actualiza)
        - Si no tiene transcripts → los crea
        """
        video_id = request.data.get('video_id')
        entries = request.data.get('entries')

        if not video_id:
            return Response({'error': 'video_id es requerido'}, status=status.HTTP_400_BAD_REQUEST)
        if not isinstance(entries, list) or not entries:
            return Response({'error': 'entries debe ser una lista no vacía'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            video = Video.objects.get(pk=video_id)
        except Video.DoesNotExist:
            return Response(
                {'error': f'El VOD {video_id} no existe en la base de datos'},
                status=status.HTTP_404_NOT_FOUND
            )

        streamer = video.streamer
        if not streamer:
            return Response(
                {'error': f'El VOD {video_id} no tiene streamer asociado en la base de datos'},
                status=status.HTTP_400_BAD_REQUEST
            )

        existing_count = TranscriptEntry.objects.filter(video=video).count()
        is_update = existing_count > 0

        if is_update:
            TranscriptEntry.objects.filter(video=video).delete()

        new_entries = []
        for item in entries:
            start_ms = item.get('StartMs') if item.get('StartMs') is not None else item.get('start_ms', 0)
            end_ms = item.get('EndMs') if item.get('EndMs') is not None else item.get('end_ms', 0)
            text = item.get('Text') if item.get('Text') is not None else item.get('text', '')
            new_entries.append(TranscriptEntry(
                video=video,
                streamer=streamer,
                start_seconds=float(start_ms) / 1000.0,
                end_seconds=float(end_ms) / 1000.0,
                text=text,
            ))

        TranscriptEntry.objects.bulk_create(new_entries)

        action_taken = 'actualizado' if is_update else 'creado'
        http_status = status.HTTP_200_OK if is_update else status.HTTP_201_CREATED
        return Response(
            {
                'message': f'Transcript {action_taken} para VOD {video_id}',
                'video_id': video_id,
                'entries_saved': len(new_entries),
                'action': action_taken,
            },
            status=http_status
        )
