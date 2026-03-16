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
from .models import Video, Comment, Streamer, ClassificationTask
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
            
            self.integrity_token = (body or {}).get("token")
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
        return ((res or {}).get("data") or {}).get("user")

    def fetch_streamer_vods(self, login: str, limit: int = 20) -> List[Dict]:
        self.refresh_integrity()
        res = self.fetch_gql({"login": login, "limit": limit, "cursor": None}, query=GQL_USER_VIDEOS_QUERY, operation_name="GetUserVideos")
        user_data = ((res or {}).get("data") or {}).get("user")
        if not user_data: return []
        
        edges = (user_data.get("videos") or {}).get("edges", [])
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



    def scrape_video(self, video_id: str, limit_pages: Optional[int] = None, on_progress=None):
        print(f"Scraping video {video_id}...")
        self.refresh_integrity()
        
        # Check for existing comments to resume from
        from .models import Comment
        last_comment = Comment.objects.filter(video_id=video_id).order_by('-content_offset_seconds').first()
        offset = last_comment.content_offset_seconds if last_comment else 0
        
        page = 0
        video_obj = None
        seen_ids = set()
        total_comments = Comment.objects.filter(video_id=video_id).count()
        length_seconds = None

        while True:
            if limit_pages and page >= limit_pages: break
            
            res = self.fetch_gql({"videoID": video_id, "cursor": None, "contentOffsetSeconds": offset})
            if not isinstance(res, dict):
                raise ValueError(f"Video {video_id} not found on Twitch (it may have been deleted or expired).")
            data = ((res.get("data") or {})).get("video")
            if not data:
                raise ValueError(f"Video {video_id} not found on Twitch (it may have been deleted or expired).")
            
            if not video_obj:
                length_seconds = data.get("lengthSeconds") or 0
                video_data = {
                    "id": video_id,
                    "title": data.get("title"),
                    "streamer_login": (data.get("owner") or {}).get("login"),
                    "streamer_display_name": (data.get("owner") or {}).get("displayName"),
                    "length_seconds": length_seconds,
                    "created_at": data.get("createdAt"),
                    "thumbnail_url": data.get("previewThumbnailURL")
                }

                
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

            comments_data = data.get("comments") or {}
            edges = comments_data.get("edges") or []
            if not edges: break
            
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
                local_batch.append(Comment(
                    id=cid,
                    video=video_obj,
                    commenter_login=comment_data["commenter_login"],
                    commenter_display_name=comment_data["commenter_display_name"],
                    content_offset_seconds=node_offset,
                    message=message,
                    created_at=comment_data["created_at"]
                ))
            

                
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

            if not (comments_data.get("pageInfo") or {}).get("hasNextPage"): break
            
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

        # Queue classification for any unscored comments (handles partial scrapes / re-scrapes)
        unscored = Comment.objects.filter(video=video_obj, toxicity_score__isnull=True).count()
        has_active = ClassificationTask.objects.filter(video=video_obj, status__in=['Pending', 'InProgress']).exists()
        if unscored > 0 and not has_active:
            # Remove stale completed/failed tasks and create a fresh pending one
            ClassificationTask.objects.filter(video=video_obj).exclude(status__in=['Pending', 'InProgress']).delete()
            ClassificationTask.objects.create(
                video=video_obj,
                status='Pending'
            )

    def cleanup(self):
        if os.path.exists(self.cookie_path):
            os.remove(self.cookie_path)


# ── Transcript post-processing: fix usernames using chat commenter names ──────

def _levenshtein(a: str, b: str) -> int:
    m, n = len(a), len(b)
    dp = list(range(n + 1))
    for i in range(1, m + 1):
        prev, dp[0] = dp[0], i
        for j in range(1, n + 1):
            temp = dp[j]
            dp[j] = prev if a[i - 1] == b[j - 1] else 1 + min(dp[j], dp[j - 1], prev)
            prev = temp
    return dp[n]


def build_global_names_dict():
    """Build the global commenter names dictionary (all distinct names in DB)."""
    from .models import Comment
    return {
        n.lower(): n
        for n in Comment.objects
            .values_list('commenter_display_name', flat=True)
            .distinct()
        if n and len(n) >= 3
    }


def build_aliases_dict():
    """Build alias → canonical_name mapping from UserAlias table."""
    from .models import UserAlias
    return {a.alias.lower(): a.canonical_name for a in UserAlias.objects.all()}


def fix_transcript_usernames(video_id: str, names: dict = None, aliases: dict = None) -> int:
    """
    Post-process transcript entries for a video by correcting misspelled
    usernames using all unique commenter display names across the entire DB.

    For each transcript segment, the top 10 chatters active in a ±60s window
    around that segment are treated as "priority" names and matched with a
    lower 65% similarity threshold. All other names require 80%.

    Pass a pre-built names dict to avoid re-querying the DB on every call.
    Returns the number of transcript entries that were corrected.
    """
    import bisect
    from collections import Counter
    from .models import TranscriptEntry, Comment, Video

    try:
        video = Video.objects.get(pk=video_id)
    except Video.DoesNotExist:
        return 0

    if names is None:
        names = build_global_names_dict()
    if aliases is None:
        aliases = build_aliases_dict()
    if not names and not aliases:
        return 0

    # Also add the streamer's display name
    if video.streamer and video.streamer.display_name:
        sn = video.streamer.display_name
        names[sn.lower()] = sn

    transcripts = list(TranscriptEntry.objects.filter(video=video))

    # Pre-load all comments for this video sorted by offset for fast window lookup
    raw_comments = list(
        Comment.objects.filter(video=video)
        .values_list('commenter_display_name', 'content_offset_seconds')
        .order_by('content_offset_seconds')
    )
    comment_offsets = [c[1] for c in raw_comments]
    comment_names_list = [c[0] for c in raw_comments]

    ACTIVE_WINDOW_SECONDS = 60  # ±60s around transcript entry midpoint
    TOP_ACTIVE = 10             # top N active chatters get the lower threshold

    updated = []

    for entry in transcripts:
        # Find active chatters in the time window around this entry
        mid = (entry.start_seconds + entry.end_seconds) / 2
        lo = bisect.bisect_left(comment_offsets, mid - ACTIVE_WINDOW_SECONDS)
        hi = bisect.bisect_right(comment_offsets, mid + ACTIVE_WINDOW_SECONDS)

        chatter_counts = Counter(comment_names_list[lo:hi])
        priority_names = {
            n.lower(): n
            for n, _ in chatter_counts.most_common(TOP_ACTIVE)
            if n and len(n) >= 3
        }

        # Always re-apply from raw_text so improvements stack cleanly
        source = entry.raw_text if entry.raw_text else entry.text
        fixed = _fix_names_in_text(source, names, aliases=aliases, priority_names=priority_names)
        if fixed != entry.text:
            entry.text = fixed
            updated.append(entry)

    if updated:
        TranscriptEntry.objects.bulk_update(updated, ['text'])

    return len(updated)


_COMMON_WORDS = {
    # Common English words that could false-match gaming usernames
    'fine', 'fined', 'finer', 'matter', 'matters', 'value', 'valued', 'values',
    'itsnot', 'isnot', 'didnot', 'wasnot', 'cannot', 'dontnot',
    'blind', 'blend', 'blond', 'bland', 'align', 'alley', 'allow', 'allot',
    'about', 'above', 'again', 'after', 'along', 'among', 'apart', 'apply',
    'being', 'below', 'black', 'blank', 'block', 'blood', 'bloom', 'blown',
    'board', 'brain', 'brand', 'brave', 'break', 'breed', 'bring', 'broad',
    'broke', 'brown', 'build', 'built', 'burst', 'clean', 'clear', 'climb',
    'close', 'cloud', 'coach', 'color', 'comes', 'count', 'cover', 'crash',
    'crazy', 'cream', 'cross', 'crowd', 'cruel', 'crush', 'curve', 'cycle',
    'daily', 'dance', 'death', 'delay', 'depth', 'dirty', 'doubt', 'draft',
    'drain', 'drama', 'drawn', 'dream', 'dress', 'drink', 'drive', 'drove',
    'earth', 'eight', 'elite', 'empty', 'enemy', 'enjoy', 'enter', 'equal',
    'error', 'event', 'every', 'exact', 'exist', 'extra', 'faith', 'false',
    'fancy', 'fault', 'field', 'fight', 'final', 'first', 'fixed', 'flesh',
    'float', 'floor', 'force', 'forma', 'found', 'frame', 'frank', 'fresh',
    'front', 'froze', 'fully', 'funny', 'given', 'glass', 'going', 'grace',
    'grade', 'grand', 'grant', 'grass', 'grave', 'great', 'green', 'group',
    'grows', 'guess', 'guide', 'hands', 'happy', 'harsh', 'heart', 'heavy',
    'hence', 'hills', 'human', 'humor', 'image', 'index', 'inner', 'input',
    'issue', 'items', 'joint', 'judge', 'juice', 'keeps', 'known', 'large',
    'laser', 'later', 'laugh', 'layer', 'learn', 'least', 'leave', 'level',
    'light', 'limit', 'lined', 'lists', 'liver', 'local', 'login', 'looks',
    'loose', 'lower', 'lucky', 'lunch', 'lying', 'magic', 'major', 'maker',
    'match', 'media', 'mercy', 'merge', 'might', 'minor', 'minus', 'mixed',
    'model', 'money', 'moral', 'mount', 'mouse', 'mouth', 'moved', 'movie',
    'music', 'named', 'needs', 'nerve', 'never', 'night', 'north', 'noted',
    'novel', 'nurse', 'occur', 'offer', 'often', 'order', 'other', 'owned',
    'owner', 'paint', 'panel', 'paper', 'parts', 'party', 'pause', 'peace',
    'phone', 'photo', 'piece', 'pilot', 'pitch', 'place', 'plain', 'plane',
    'plant', 'plate', 'plaza', 'plays', 'plead', 'point', 'polar', 'power',
    'press', 'price', 'pride', 'prime', 'print', 'prior', 'prize', 'proof',
    'proud', 'prove', 'proxy', 'pulse', 'punch', 'queen', 'query', 'queue',
    'quick', 'quiet', 'quote', 'radio', 'raise', 'range', 'rapid', 'ratio',
    'reach', 'ready', 'realm', 'refer', 'reign', 'relax', 'reply', 'rider',
    'right', 'rigid', 'risky', 'rival', 'river', 'robot', 'rocky', 'roles',
    'rough', 'round', 'route', 'royal', 'rules', 'rural', 'sadly', 'saint',
    'scale', 'scene', 'score', 'sense', 'serve', 'setup', 'seven', 'share',
    'sharp', 'shift', 'short', 'shout', 'shown', 'sides', 'sight', 'signs',
    'silly', 'skill', 'sleep', 'slide', 'slope', 'small', 'smart', 'smell',
    'smile', 'smoke', 'solid', 'solve', 'sorry', 'south', 'space', 'speak',
    'speed', 'spend', 'split', 'sport', 'squad', 'stack', 'stage', 'stake',
    'stand', 'start', 'state', 'stays', 'steal', 'steel', 'steps', 'still',
    'stock', 'stone', 'stood', 'store', 'storm', 'story', 'stuck', 'study',
    'style', 'sugar', 'super', 'sweep', 'sweet', 'swift', 'sword', 'table',
    'taken', 'taste', 'teach', 'tears', 'tends', 'terms', 'thank', 'thick',
    'thing', 'think', 'third', 'three', 'throw', 'tight', 'tired', 'title',
    'today', 'topic', 'total', 'touch', 'tough', 'tower', 'toxic', 'track',
    'trade', 'trail', 'train', 'treat', 'trend', 'trial', 'tribe', 'trick',
    'tried', 'truck', 'truly', 'trust', 'truth', 'twice', 'twist', 'types',
    'under', 'union', 'until', 'upper', 'upset', 'urban', 'usage', 'usual',
    'valid', 'value', 'valve', 'video', 'viral', 'visit', 'vital', 'voice',
    'voted', 'waste', 'watch', 'water', 'whole', 'whose', 'witch', 'woman',
    'women', 'world', 'worry', 'worse', 'worst', 'worth', 'would', 'write',
    'wrote', 'young', 'yours', 'youth', 'zones',
    # Common Spanish words
    'antes', 'bueno', 'buena', 'cosas', 'claro', 'creo', 'cuanto', 'decia',
    'desde', 'donde', 'entre', 'fecha', 'forma', 'grupo', 'gusto', 'habia',
    'hacer', 'hasta', 'igual', 'juego', 'junta', 'largo', 'llega', 'lugar',
    'mejor', 'menos', 'mismo', 'mundo', 'nunca', 'parte', 'puede', 'quien',
    'quiero', 'sabes', 'salir', 'salon', 'sigue', 'sobre', 'tanto', 'tarde',
    'tener', 'tiene', 'tiempo', 'todos', 'vamos', 'verdad', 'viene', 'vista',
    'volver', 'vuelta',
}


def _fix_names_in_text(text: str, names: dict, aliases: dict = None, priority_names: dict = None) -> str:
    """
    Replace words in text that are close matches to known usernames.
    names: {lowercase_name: original_case_name}
    aliases: {alias_lower: canonical_name} — checked first, exact match only
    priority_names: {lowercase_name: original_name} — active chatters in the
        current time window; matched at 65% similarity. All other names require 80%.
    Words in _COMMON_WORDS are never fuzzy-replaced.
    """
    import re as _re
    try:
        from rapidfuzz.distance import Levenshtein as _Lev
        _levenshtein_fn = _Lev.distance
    except ImportError:
        _levenshtein_fn = _levenshtein

    # Pre-bucket names by length for fast candidate filtering
    from collections import defaultdict as _dd
    by_len = _dd(list)
    for nl in names:
        by_len[len(nl)].append(nl)

    words = _re.split(r'(\s+)', text)  # preserve whitespace
    result = []

    for token in words:
        if not token.strip():
            result.append(token)
            continue

        # Strip punctuation for matching, preserve it for output
        _punct = '.,!?;:\'"()[]{}'
        stripped = token.strip(_punct)
        prefix = token[:len(token) - len(token.lstrip(_punct))]
        _rstripped = token.rstrip(_punct)
        suffix = token[len(_rstripped):] if _rstripped != token else ''

        if len(stripped) < 3:
            result.append(token)
            continue

        lower = stripped.lower()

        # Alias exact match — highest priority (catches nicknames like "caviar" → "KhavKivar")
        if aliases and lower in aliases:
            result.append(prefix + aliases[lower] + suffix)
            continue

        # Exact match — fix casing only
        if lower in names:
            result.append(prefix + names[lower] + suffix)
            continue

        # Fuzzy match — only check names within ±2 length (pre-bucketed)
        # Skip if this word is a known common English/Spanish word
        if lower in _COMMON_WORDS:
            result.append(token)
            continue

        best_name = None
        best_dist = float('inf')
        wlen = len(lower)

        candidates = []
        for delta in range(-2, 3):
            candidates.extend(by_len.get(wlen + delta, []))

        for name_lower in candidates:
            dist = _levenshtein_fn(lower, name_lower)
            max_len = max(wlen, len(name_lower))
            # Active chatters in this time window: 65% threshold
            # All other names: 80% threshold (reduces false positives in large global dict)
            threshold = 0.65 if (priority_names and name_lower in priority_names) else 0.80
            if dist <= 2 and dist < best_dist and (1 - dist / max_len) >= threshold:
                best_dist = dist
                best_name = names[name_lower]

        if best_name and best_dist > 0:
            result.append(prefix + best_name + suffix)
        else:
            result.append(token)

    return ''.join(result)
