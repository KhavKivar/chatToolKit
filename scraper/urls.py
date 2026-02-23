from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import VideoViewSet, CommentViewSet, StreamerViewSet, ScrapeTaskViewSet

router = DefaultRouter()
router.register(r'videos', VideoViewSet)
router.register(r'comments', CommentViewSet)
router.register(r'streamers', StreamerViewSet)
router.register(r'scrape-tasks', ScrapeTaskViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
