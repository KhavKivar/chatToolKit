from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import VideoViewSet, CommentViewSet, StreamerViewSet, ScrapeTaskViewSet, ClassificationTaskViewSet

router = DefaultRouter()
router.register(r'videos', VideoViewSet)
router.register(r'comments', CommentViewSet, basename='comment')
router.register(r'streamers', StreamerViewSet)
router.register(r'scrape-tasks', ScrapeTaskViewSet, basename='scrapetask')
router.register(r'classification-tasks', ClassificationTaskViewSet, basename='classificationtask')

urlpatterns = [
    path('', include(router.urls)),
]
