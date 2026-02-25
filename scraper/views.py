import json
import os
from django.http import StreamingHttpResponse
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.renderers import JSONRenderer, BrowsableAPIRenderer, BaseRenderer
from .models import Video, Comment, Streamer, ScrapeTask, ClassificationTask
from .serializers import VideoSerializer, CommentSerializer, StreamerSerializer, ScrapeTaskSerializer, ClassificationTaskSerializer
from .services import TwitchScraperService
from datetime import datetime, timezone, timedelta


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

