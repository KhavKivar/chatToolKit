from rest_framework import serializers
from .models import Video, Comment, Streamer, ScrapeTask, ClassificationTask

class VideoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Video
        fields = '__all__'

class CommentSerializer(serializers.ModelSerializer):
    video_id = serializers.CharField(source='video.id', read_only=True)
    video_title = serializers.CharField(source='video.title', read_only=True)
    video_streamer = serializers.CharField(source='video.streamer_display_name', read_only=True)
    video_created_at = serializers.DateTimeField(source='video.created_at', read_only=True)

    class Meta:
        model = Comment
        fields = [
            'id', 'video_id', 'video_title', 'video_streamer', 'video_created_at',
            'commenter_login', 'commenter_display_name',
            'content_offset_seconds', 'message', 'created_at',
            'is_toxic', 'toxicity_score'
        ]

class StreamerSerializer(serializers.ModelSerializer):
    video_count = serializers.SerializerMethodField()
    last_vod_at = serializers.SerializerMethodField()

    class Meta:
        model = Streamer
        fields = '__all__'
    
    def get_video_count(self, obj):
        return obj.videos.count()

    def get_last_vod_at(self, obj):
        last_v = obj.videos.order_by('-created_at').first()
        return last_v.created_at if last_v else None

class ScrapeTaskSerializer(serializers.ModelSerializer):
    streamer_login = serializers.CharField(source='streamer.login', read_only=True)
    streamer_display_name = serializers.CharField(source='streamer.display_name', read_only=True)

    class Meta:
        model = ScrapeTask
        fields = '__all__'

class ClassificationTaskSerializer(serializers.ModelSerializer):
    video_title = serializers.CharField(source='video.title', read_only=True)
    video_streamer = serializers.CharField(source='video.streamer_display_name', read_only=True)

    class Meta:
        model = ClassificationTask
        fields = '__all__'
