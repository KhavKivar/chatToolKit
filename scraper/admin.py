from django.contrib import admin
from .models import Video, Comment

@admin.register(Video)
class VideoAdmin(admin.ModelAdmin):
    list_display = ('id', 'title', 'streamer_login', 'created_at')
    search_fields = ('title', 'streamer_login')

@admin.register(Comment)
class CommentAdmin(admin.ModelAdmin):
    list_display = ('id', 'video', 'commenter_display_name', 'content_offset_seconds', 'created_at')
    list_filter = ('video',)
    search_fields = ('message', 'commenter_display_name')
