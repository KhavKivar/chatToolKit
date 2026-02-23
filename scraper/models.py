import uuid
from django.db import models

class Streamer(models.Model):
    id = models.CharField(max_length=100, primary_key=True) # Twitch User ID
    login = models.CharField(max_length=255)
    display_name = models.CharField(max_length=255)
    profile_image_url = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.display_name


class Video(models.Model):
    id = models.CharField(max_length=100, primary_key=True)
    title = models.TextField(null=True, blank=True)
    streamer = models.ForeignKey(Streamer, on_delete=models.SET_NULL, null=True, blank=True, related_name='videos')
    streamer_login = models.CharField(max_length=255, null=True, blank=True)
    streamer_display_name = models.CharField(max_length=255, null=True, blank=True)
    length_seconds = models.IntegerField(null=True, blank=True)
    created_at = models.DateTimeField(null=True, blank=True)
    thumbnail_url = models.TextField(null=True, blank=True)

    def __str__(self):
        return f"{self.title} ({self.id})"


class ScrapeTask(models.Model):
    STATUS_CHOICES = [
        ('Pending', 'Pending'),
        ('InProgress', 'In Progress'),
        ('Completed', 'Completed'),
        ('Failed', 'Failed'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    video_id = models.CharField(max_length=100)
    streamer = models.ForeignKey(Streamer, on_delete=models.CASCADE, related_name='scrape_tasks')
    status = models.CharField(max_length=50, choices=STATUS_CHOICES, default='Pending')
    progress_percent = models.IntegerField(default=0)
    error_message = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Task {self.video_id} - {self.status}"

class Comment(models.Model):
    id = models.CharField(max_length=100, primary_key=True)
    video = models.ForeignKey(Video, on_delete=models.CASCADE, related_name='comments')
    commenter_login = models.CharField(max_length=255, null=True, blank=True)
    commenter_display_name = models.CharField(max_length=255, null=True, blank=True)
    content_offset_seconds = models.IntegerField(null=True, blank=True)
    message = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.commenter_display_name}: {self.message[:50]}"
