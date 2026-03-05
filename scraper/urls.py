from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    VideoViewSet, CommentViewSet, StreamerViewSet,
    ScrapeTaskViewSet, ClassificationTaskViewSet, ClipViewSet,
    TranscriptEntryViewSet, UserAliasViewSet, ExcludedShoutoutViewSet,
)

router = DefaultRouter()
router.register(r'videos', VideoViewSet)
router.register(r'comments', CommentViewSet, basename='comment')
router.register(r'streamers', StreamerViewSet)
router.register(r'scrape-tasks', ScrapeTaskViewSet, basename='scrapetask')
router.register(r'classification-tasks', ClassificationTaskViewSet, basename='classificationtask')
router.register(r'clips', ClipViewSet)
router.register(r'transcripts', TranscriptEntryViewSet)
router.register(r'aliases', UserAliasViewSet)
router.register(r'excluded-shoutouts', ExcludedShoutoutViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
