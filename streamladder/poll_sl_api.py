import json
import httpx
import sys
from pathlib import Path

SESSION_FILE = "session.json"
SL_REST_API = "https://auth.streamladder.com/rest/v1/ClipEditorProjects"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL2lkc2JicnFsZWN5a3ljaHBzY2J4LnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiJiNTczMzY2Yy0zYzlhLTQ5OWYtOGE4ZS1hYzA3NjhjMDZmNWQiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzcyMjM3ODAyLCJpYXQiOjE3NzIyMzQyMDIsImVtYWlsIjoic2ViYXN0aWFuLmNhbGRlcm9uQHNhbnNhbm8udXNtLmNsIiwicGhvbmUiOiIiLCJhcHBfbWV0YWRhdGEiOnsicHJvdmlkZXIiOiJnb29nbGUiLCJwcm92aWRlcnMiOlsiZ29vZ2xlIl0sInN0cmVhbWxhZGRlcl91c2VyaWQiOiIzYTRlMmFkYS1lYjkzLTQ3YmEtOTZiOC0yNmQyMGE4MjQ5YzEiLCJzdWJzY3JpcHRpb24iOnsicHJvZHVjdHMiOlt7ImVuZF9kYXRlIjpudWxsLCJpZCI6InNsX2dvbGQiLCJzdGF0ZSI6ImFjdGl2ZSJ9LHsiZW5kX2RhdGUiOm51bGwsImlkIjoic2xfY2xpcGdwdCIsInN0YXRlIjoiYWN0aXZlIn1dLCJwcm92aWRlcl9jdXN0b21lcl9pZCI6ImN0bV8wMWtqZGJoanp0dG5rcGd3YWc4ejNxNDlrZiIsInN0YXRlIjoidHJpYWxpbmcifX0sInVzZXJfbWV0YWRhdGEiOnsiYXZhdGFyX3VybCI6Imh0dHBzOi8vbGgzLmdvb2dsZXVzZXJjb250ZW50LmNvbS9hL0FDZzhvY0xQM0Z4Tzd0eHFHNURjUWZwZ0pqWVJWTmZjR2dJZGhROFhnbFhtbUJCeUt4SDE9czk2LWMiLCJjdXN0b21fY2xhaW1zIjp7ImhkIjoic2Fuc2Fuby51c20uY2wifSwiZGlzcGxheV9uYW1lIjoiU2ViYXN0acOhbiBDYWxkZXLDs24iLCJlbWFpbCI6InNlYmFzdGlhbi5jYWxkZXLvbkBzYW5zYW5vLnVzbS5jbCIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJmdWxsX25hbWUiOiJTZWJhc3Rpw6FuIENhbGRlcsOzbiIsImlzcyI6Imh0dHBzOi8vYWNjb3VudHMuZ29vZ2xlLmNvbSIsIm5hbWUiOiJTZWJhc3Rpw6FuIENhbGRlcsOzbiIsIm9uYm9hcmRpbmdfdmVyc2lvbiI6Im9uYm9hcmRpbmctdjIiLCJwaG9uZV92ZXJpZmllZCI6ZmFsc2UsInBpY3R1cmUiOiJodHRwczovL2xoMy5nb29nbGV1c2VyY29udGVudC5jb20vYS9BQ2c4b2NMUDNGeE83dHhxRzVEY1FmcGdKallSVk5mY0dnSWRoUThYZ2xYbW1CQnlLeEgxPXM5Ni1jIiwicHJvdmlkZXJfaWQiOiIxMTAzOTkxNjEwMTI0MDE0NjE2NzkiLCJzdWIiOiIxMTAzOTkxNjEwMTI0MDE0NjE2NzkifSwicm9sZSI6ImF1dGhlbnRpY2F0ZWQiLCJhYWwiOiJhYWwxIiwiYW1yIjpbeyJtZXRob2QiOiJvYXV0aCIsInRpbWVzdGFtcCI6MTc3MjIzNDIwMH1dLCJzZXNzaW9uX2lkIjoiMjUyOWNiMDgtY2U0OC00YzBhLTkyYjItMWU2ZWZiNjAzMjYzIiwiaXNfYW5vbnltb3VzIjpmYWxzZX0.nGZxFmcmoKlMtwKGLB5hjKT-HoXUH24Ssqd8YmwqUfE" # api-key from subagent logs

def get_token():
    session_path = Path(SESSION_FILE)
    if not session_path.exists():
        print("Error: session.json not found")
        return None
    
    session = json.loads(session_path.read_text())
    token_data = json.loads(session["localStorage"].get("sb-auth-auth-token", "{}"))
    return token_data.get("access_token")

def check_clip(clip_id, token):
    headers = {
        "Authorization": f"Bearer {token}",
        "apikey": SUPABASE_KEY,
        "Content-Type": "application/json"
    }
    
    url = f"{SL_REST_API}?select=Id,Title,ResultUrl&Id=eq.{clip_id}"
    
    resp = httpx.get(url, headers=headers)
    if resp.status_code == 200:
        data = resp.json()
        if data:
            print(f"[+] Found: {data[0].get('Title')} | URL: {data[0].get('ResultUrl')}")
            return data[0].get('ResultUrl')
        else:
            print(f"[-] Clip {clip_id} not found in ClipEditorProjects")
    else:
        print(f"[!] Error {resp.status_code}: {resp.text}")
    return None

if __name__ == "__main__":
    token = get_token()
    if not token:
        sys.exit(1)
        
    ids = [
        "0901c93c-0369-48a8-92a9-0114e8cb748b",
        "3512f8f8-4a50-45e2-855f-e002dd159757",
        "a9c9f159-f70e-4598-9527-b69c05772673"
    ]
    
    for cid in ids:
        check_clip(cid, token)
