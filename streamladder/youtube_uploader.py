import os
import pickle
import socket
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
from loguru import logger

# OAuth 2.0 scopes
SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]

class YouTubeUploader:
    def __init__(self, client_secrets_file="client_secrets.json", token_file="youtube_token.json"):
        self.client_secrets_file = client_secrets_file
        self.token_file = token_file
        self.youtube = self._get_authenticated_service()

    def _get_authenticated_service(self):
        creds = None
        if os.path.exists(self.token_file):
            with open(self.token_file, "rb") as token:
                creds = pickle.load(token)
        
        if not creds or not creds.valid:
            if creds and creds.expired and creds.refresh_token:
                creds.refresh(Request())
            else:
                if not os.path.exists(self.client_secrets_file):
                    logger.error(f"Missing {self.client_secrets_file}. Please download it from Google Cloud Console.")
                    return None
                
                flow = InstalledAppFlow.from_client_secrets_file(self.client_secrets_file, SCOPES)
                # Use a fixed port to avoid issues on servers
                creds = flow.run_local_server(port=8080, prompt="consent")
            
            with open(self.token_file, "wb") as token:
                pickle.dump(creds, token)

        return build("youtube", "v3", credentials=creds)

    def upload_video(self, file_path, title, description, tags=None, category_id="20"):
        """
        Uploads a video to YouTube.
        - category_id 20 is 'Gaming'
        """
        if not self.youtube:
            logger.error("YouTube service not authenticated.")
            return None

        if not os.path.exists(file_path):
            logger.error(f"File not found: {file_path}")
            return None

        body = {
            "snippet": {
                "title": title[:100],
                "description": description,
                "tags": tags or [],
                "categoryId": category_id
            },
            "status": {
                "privacyStatus": "public",  # Can be "private", "public", or "unlisted"
                "selfDeclaredMadeForKids": False
            }
        }

        media = MediaFileUpload(file_path, chunksize=-1, resumable=True, mimetype="video/mp4")
        
        request = self.youtube.videos().insert(
            part="snippet,status",
            body=body,
            media_body=media
        )

        logger.info(f"Uploading {title}...")
        response = None
        while response is None:
            status, response = request.next_chunk()
            if status:
                logger.info(f"Upload progress: {int(status.progress() * 100)}%")

        video_id = response.get("id")
        logger.success(f"Upload successful! Video ID: {video_id}")
        return video_id
