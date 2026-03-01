#!/usr/bin/env python3
"""
Scrape ALL StreamLadder AI projects.
"""

import json
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

SESSION_FILE = "session.json"
BASE_URL = "https://app.streamladder.com"
CLIP_GPT_URL = f"{BASE_URL}/clip-gpt"
SL_API = "https://api.streamladder.com/api"

def ms_to_seconds(ms: int) -> int:
    return ms // 1000

async def do_login(pw) -> dict:
    print("[*] Opening browser for login...")
    browser = await pw.chromium.launch(headless=False)
    context = await browser.new_context()
    page = await context.new_page()
    await page.goto(BASE_URL)
    await page.wait_for_url(
        lambda url: "streamladder.com" in url and "/login" not in url and "/auth" not in url,
        timeout=300_000,
    )
    await page.wait_for_load_state("networkidle")
    await asyncio.sleep(2)
    cookies = await context.cookies()
    local_storage = await page.evaluate("() => Object.entries(localStorage)")
    session = {"cookies": cookies, "localStorage": dict(local_storage)}
    Path(SESSION_FILE).write_text(json.dumps(session, indent=2))
    await browser.close()
    return session

async def scrape_project(context, project_id):
    page = await context.new_page()
    print(f"[*] Scraping project: {project_id}")
    
    project_data = {}
    transcript_data = []

    async def handle_resp(r):
        nonlocal project_data
        if f"{SL_API}/ClipGptProjects/{project_id}" in r.url and r.request.method == "GET":
            try:
                project_data = await r.json()
            except: pass

    page.on("response", handle_resp)
    
    try:
        await page.goto(f"{BASE_URL}/clip-gpt/{project_id}")
        # Wait for the project data to be captured (it should trigger on page load)
        for _ in range(10):
            if project_data: break
            await asyncio.sleep(1)
        
        if not project_data:
            print(f"[!] Could not capture data for {project_id}")
            await page.close()
            return None

        # Transcript
        t_url = project_data.get("transcriptionFileUrl")
        if t_url:
            print(f"    - Found transcript: {t_url}")
            try:
                transcript_data = await page.evaluate("url => fetch(url).then(r => r.json())", t_url)
            except Exception as e:
                print(f"    - Transcript fail: {e}")
        
        await page.close()
        return {
            "project_id": project_id,
            "data": project_data,
            "transcript": transcript_data
        }
    except Exception as e:
        print(f"[!] Error on {project_id}: {e}")
        await page.close()
        return None

async def main():
    async with async_playwright() as pw:
        # Load session
        session_path = Path("streamladder") / SESSION_FILE
        if session_path.exists():
            session = json.loads(session_path.read_text())
        else:
            session = await do_login(pw)
            # Ensure it's in the streamladder folder too
            (Path("streamladder") / SESSION_FILE).write_text(json.dumps(session))

        browser = await pw.chromium.launch(headless=False)
        context = await browser.new_context()
        await context.add_cookies(session["cookies"])
        
        page = await context.new_page()
        if session.get("localStorage"):
            await page.goto(BASE_URL)
            await page.evaluate(
                "entries => { for (const [k,v] of entries) localStorage.setItem(k, v); }",
                list(session["localStorage"].items()),
            )
        
        await page.goto(CLIP_GPT_URL)
        await page.wait_for_load_state("networkidle")
        await asyncio.sleep(3)
        
        # Get all project IDs from cards
        links = await page.query_selector_all("a[href*='/clip-gpt/']")
        project_ids = []
        for a in links:
            href = await a.get_attribute("href")
            if href:
                parts = href.split("/")
                # Usually /clip-gpt/ID
                for part in parts:
                    if len(part) > 20 and "-" in part: # UUID-like
                        project_ids.append(part)
        
        project_ids = list(set(project_ids))
        print(f"[+] Found {len(project_ids)} projects to sync.")
        
        all_results = []
        for pid in project_ids:
            res = await scrape_project(context, pid)
            if res:
                all_results.append(res)
        
        await browser.close()
        
        # Process and save
        all_clips = []
        # We will save transcripts as a dict {vod_id: data}
        all_transcripts_map = {}
        
        for res in all_results:
            p_data = res["data"]
            p_id = res["project_id"]
            vod_id = p_data.get("videoId", "")
            streamer = p_data.get("streamerName", "")
            
            if res["transcript"]:
                all_transcripts_map[vod_id] = res["transcript"]
            
            for c in p_data.get("clips", []):
                start_sec = ms_to_seconds(c.get("start", 0))
                end_sec = ms_to_seconds(c.get("end", 0))
                all_clips.append({
                    "id": c.get("id"),
                    "title": c.get("title"),
                    "score": c.get("score"),
                    "streamer": streamer,
                    "vod_id": vod_id,
                    "video_url": c.get("videoUrl"),
                    "start_time_sec": start_sec,
                    "end_time_sec": end_sec,
                    "status": c.get("status")
                })
        
        Path("streamladder/all_clips.json").write_text(json.dumps(all_clips, indent=2))
        Path("streamladder/all_transcripts.json").write_text(json.dumps(all_transcripts_map, indent=2))
        print(f"\n[DONE] Saved {len(all_clips)} clips and {len(all_transcripts_map)} transcripts.")

if __name__ == "__main__":
    asyncio.run(main())
