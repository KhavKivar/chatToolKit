import json
import os
import re
import uuid
import time
import requests
import subprocess
import tempfile
import shutil
from pathlib import Path
from typing import Dict, Iterable, List, Optional
from django.conf import settings
from .models import Video, Comment, Streamer
from datetime import datetime

# --- CONFIGURATION ---
GQL_URL = "https://gql.twitch.tv/gql"
INTEGRITY_URL = "https://gql.twitch.tv/integrity"
CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko"
USER_AGENT = "Mozilla/5.0"

GQL_USER_QUERY = """
query GetUser($login: String!) {
  user(login: $login) {
    id
    login
    displayName
    profileImageURL(width: 300)
  }
}
""".strip()

GQL_USER_VIDEOS_QUERY = """
query GetUserVideos($login: String!, $limit: Int!, $cursor: Cursor) {
  user(login: $login) {
    videos(first: $limit, after: $cursor, type: ARCHIVE) {
      edges {
        cursor
        node {
          id
          title
          lengthSeconds
          createdAt
        }
      }
      pageInfo {
        hasNextPage
      }
    }
  }
}
""".strip()

GQL_QUERY = """
query VideoCommentsByOffsetOrCursor($videoID: ID!, $contentOffsetSeconds: Int, $cursor: Cursor) {
  video(id: $videoID) {
    lengthSeconds
    title
    createdAt
    previewThumbnailURL(width: 320, height: 180)
    owner {
        login
        displayName
    }
    comments(contentOffsetSeconds: $contentOffsetSeconds, after: $cursor) {
      edges {
        cursor
        node {
          id
          createdAt
          contentOffsetSeconds
          commenter {
            id
            login
            displayName
          }
          message {
            fragments {
              text
            }
          }
        }
      }
      pageInfo {
        hasNextPage
      }
    }
  }
}
""".strip()

class TwitchScraperService:
    def __init__(self, oauth_token: Optional[str] = None):
        self.supabase_url = os.getenv("SUPABASE_URL")
        self.supabase_key = os.getenv("SUPABASE_KEY")
        self.oauth_header = self._normalize_oauth(oauth_token)
        self.device_id = uuid.uuid4().hex
        self.client_session_id = str(uuid.uuid4())
        self.integrity_token, self.kpsdk_ct, self.kpsdk_r = None, None, None
        
        fd, self.cookie_path = tempfile.mkstemp(prefix="twitch_", suffix=".cookies")
        os.close(fd)

    def _normalize_oauth(self, token: Optional[str]) -> Optional[str]:
        if not token: return None
        token = token.strip()
        if not token: return None
        if token.lower().startswith("oauth "): return token
        return f"OAuth {token}"

    def _parse_headers(self, raw_headers: str) -> Dict[str, str]:
        clean = raw_headers.replace("\r", "")
        blocks = [b for b in clean.split("\n\n") if b.strip()]
        if not blocks: return {}
        last = blocks[-1]
        parsed: Dict[str, str] = {}
        for line in last.splitlines()[1:]:
            if ":" not in line: continue
            name, value = line.split(":", 1)
            parsed[name.strip().lower()] = value.strip()
        return parsed

    def refresh_integrity(self):
        headers = [
            f"Client-Id: {CLIENT_ID}",
            f"Device-Id: {self.device_id}",
            "Content-Type: text/plain;charset=UTF-8",
            f"User-Agent: {USER_AGENT}",
            "Accept: */*",
            "Origin: https://www.twitch.tv",
            "Referer: https://www.twitch.tv/"
        ]
        if self.oauth_header:
            headers.append(f"Authorization: {self.oauth_header}")
            
        fd, header_file = tempfile.mkstemp(prefix="twitch_h_", suffix=".headers")
        os.close(fd)
        
        cmd = ["curl", "-sS", "--max-time", "30", INTEGRITY_URL, "-X", "POST", "-b", self.cookie_path, "-c", self.cookie_path, "-D", header_file]
        for h in headers: cmd.extend(["-H", h])
        cmd.extend(["--data", "{}"])
        
        proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
        
        try:
            with open(header_file, "r") as f:
                res_headers = self._parse_headers(f.read())
            body = json.loads(proc.stdout)
            
            self.integrity_token = body.get("token")
            self.kpsdk_ct = res_headers.get("x-kpsdk-ct")
            self.kpsdk_r = res_headers.get("x-kpsdk-r")
        finally:
            os.remove(header_file)

    def fetch_gql(self, variables: Dict, query: str = GQL_QUERY, operation_name: str = "VideoCommentsByOffsetOrCursor") -> Dict:
        headers = {
            "Client-Id": CLIENT_ID,
            "Device-Id": self.device_id,
            "Client-Session-Id": self.client_session_id,
            "Content-Type": "application/json",
            "User-Agent": USER_AGENT,
            "Accept": "*/*"
        }
        if self.oauth_header:
            headers["Authorization"] = self.oauth_header
        if self.integrity_token:
            headers["Client-Integrity"] = self.integrity_token
        if self.kpsdk_ct:
            headers["X-Kpsdk-Ct"] = self.kpsdk_ct
        if self.kpsdk_r:
            headers["X-Kpsdk-R"] = self.kpsdk_r

        payload = {
            "operationName": operation_name,
            "variables": variables,
            "query": query
        }
        
        response = requests.post(GQL_URL, headers=headers, json=payload, cookies=self._get_cookies())
        return response.json()

    def fetch_streamer_info(self, login: str) -> Optional[Dict]:
        self.refresh_integrity()
        res = self.fetch_gql({"login": login}, query=GQL_USER_QUERY, operation_name="GetUser")
        return res.get("data", {}).get("user")

    def fetch_streamer_vods(self, login: str, limit: int = 20) -> List[Dict]:
        self.refresh_integrity()
        res = self.fetch_gql({"login": login, "limit": limit, "cursor": None}, query=GQL_USER_VIDEOS_QUERY, operation_name="GetUserVideos")
        user_data = res.get("data", {}).get("user")
        if not user_data: return []
        
        edges = user_data.get("videos", {}).get("edges", [])
        return [e.get("node") for e in edges if e.get("node")]

    def _get_cookies(self) -> Dict:
        # Simple parser for Netscape cookie format (curl)
        cookies = {}
        if os.path.exists(self.cookie_path):
            with open(self.cookie_path, 'r') as f:
                for line in f:
                    if not line.startswith('#') and line.strip():
                        parts = line.split('\t')
                        if len(parts) >= 7:
                            cookies[parts[5]] = parts[6].strip()
        return cookies

    def upload_to_supabase(self, table: str, data: List[Dict]):
        if not data: return
        url = f"{self.supabase_url}/rest/v1/{table}"
        headers = {
            "apikey": self.supabase_key,
            "Authorization": f"Bearer {self.supabase_key}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates"
        }
        response = requests.post(url, headers=headers, json=data)
        if response.status_code not in [200, 201]:
            print(f"Error uploading to Supabase: {response.text}")

    def scrape_video(self, video_id: str, limit_pages: Optional[int] = None, on_progress=None):
        print(f"Scraping video {video_id}...")
        self.refresh_integrity()
        
        offset = 0
        page = 0
        video_obj = None
        seen_ids = set()
        total_comments = 0
        length_seconds = None

        while True:
            if limit_pages and page >= limit_pages: break
            
            res = self.fetch_gql({"videoID": video_id, "cursor": None, "contentOffsetSeconds": offset})
            data = res.get("data", {}).get("video")
            if not data:
                print(f"Video {video_id} not found or error occurred.")
                break
            
            if not video_obj:
                length_seconds = data.get("lengthSeconds") or 0
                video_data = {
                    "id": video_id,
                    "title": data.get("title"),
                    "streamer_login": data.get("owner", {}).get("login"),
                    "streamer_display_name": data.get("owner", {}).get("displayName"),
                    "length_seconds": length_seconds,
                    "created_at": data.get("createdAt"),
                    "thumbnail_url": data.get("previewThumbnailURL")
                }
                # Upload to Supabase API
                self.upload_to_supabase("videos", [video_data])
                
                # Try to link to a known streamer
                streamer_login = video_data["streamer_login"]
                streamer_obj = Streamer.objects.filter(login__iexact=streamer_login).first()

                # Save to Local Django DB
                video_obj, _ = Video.objects.update_or_create(
                    id=video_id,
                    defaults={
                        "title": video_data["title"],
                        "streamer": streamer_obj,
                        "streamer_login": video_data["streamer_login"],
                        "streamer_display_name": video_data["streamer_display_name"],
                        "length_seconds": video_data["length_seconds"],
                        "created_at": video_data["created_at"],
                        "thumbnail_url": video_data["thumbnail_url"]
                    }
                )

            comments_data = data.get("comments", {})
            edges = comments_data.get("edges") or []
            if not edges: break
            
            supabase_batch = []
            local_batch = []
            max_offset_seen = offset
            
            for edge in edges:
                node = edge.get("node") or {}
                cid = node.get("id")
                if not cid or cid in seen_ids: continue
                seen_ids.add(cid)
                
                node_offset = int(node.get("contentOffsetSeconds") or 0)
                if node_offset > max_offset_seen: max_offset_seen = node_offset
                
                commenter = node.get("commenter") or {}
                fragments = (node.get("message") or {}).get("fragments") or []
                message = "".join((f or {}).get("text", "") for f in fragments)
                
                comment_data = {
                    "id": cid,
                    "video_id": video_id,
                    "commenter_login": commenter.get("login") or "",
                    "commenter_display_name": commenter.get("displayName") or "Unknown",
                    "content_offset_seconds": node_offset,
                    "message": message,
                    "created_at": node.get("createdAt")
                }
                supabase_batch.append(comment_data)
                
                local_batch.append(Comment(
                    id=cid,
                    video=video_obj,
                    commenter_login=comment_data["commenter_login"],
                    commenter_display_name=comment_data["commenter_display_name"],
                    content_offset_seconds=node_offset,
                    message=message,
                    created_at=comment_data["created_at"]
                ))
            
            if supabase_batch:
                self.upload_to_supabase("comments", supabase_batch)
                
            if local_batch:
                Comment.objects.bulk_create(local_batch, ignore_conflicts=True)
                total_comments += len(local_batch)
                print(f"Uploaded batch of {len(local_batch)} comments. Offset: {max_offset_seen}")

            # Emit progress event
            if on_progress and length_seconds:
                pct = min(int((max_offset_seen / length_seconds) * 100), 99)
                on_progress({
                    "page": page + 1,
                    "offset": max_offset_seen,
                    "total_seconds": length_seconds,
                    "total_comments": total_comments,
                    "percent": pct,
                    "video_title": video_obj.title if video_obj else "",
                })

            if not comments_data.get("pageInfo", {}).get("hasNextPage"): break
            
            offset = max_offset_seen + 1
            page += 1
            time.sleep(0.1)
        
        # Final done event
        if on_progress:
            on_progress({
                "page": page,
                "offset": offset,
                "total_seconds": length_seconds or 0,
                "total_comments": total_comments,
                "percent": 100,
                "done": True,
                "video_title": video_obj.title if video_obj else "",
            })

    def cleanup(self):
        if os.path.exists(self.cookie_path):
            os.remove(self.cookie_path)
