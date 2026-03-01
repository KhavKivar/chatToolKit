from rest_framework import serializers
from .models import Video, Comment, Streamer, ScrapeTask, ClassificationTask, Clip, TranscriptEntry

class VideoSerializer(serializers.ModelSerializer):
    clip_count = serializers.SerializerMethodField()
    first_clip_url = serializers.SerializerMethodField()
    has_transcript = serializers.SerializerMethodField()

    class Meta:
        model = Video
        fields = [
            'id', 'title', 'streamer', 'streamer_login', 'streamer_display_name',
            'length_seconds', 'created_at', 'thumbnail_url', 'clip_count', 'first_clip_url',
            'has_transcript'
        ]

    def get_clip_count(self, obj):
        return obj.clips.count()

    def get_first_clip_url(self, obj):
        clip = obj.clips.exclude(s3_url=None).exclude(s3_url='').first()
        return clip.s3_url if clip else None

    def get_has_transcript(self, obj):
        return obj.transcripts.exists()

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

class ClipSerializer(serializers.ModelSerializer):
    streamer_name = serializers.CharField(source='streamer.display_name', read_only=True)
    video_title = serializers.CharField(source='video.title', read_only=True)

    class Meta:
        model = Clip
        fields = '__all__'


class TranscriptEntrySerializer(serializers.ModelSerializer):
    streamer_name = serializers.CharField(source='streamer.display_name', read_only=True)
    video_title = serializers.CharField(source='video.title', read_only=True)
    video_created_at = serializers.DateTimeField(source='video.created_at', read_only=True)

    class Meta:
        model = TranscriptEntry
        fields = '__all__'
