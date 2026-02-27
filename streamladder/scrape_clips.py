#!/usr/bin/env python3
"""
Scrape StreamLadder ClipGPT clips by intercepting the internal API.
The API returns start/end in milliseconds — no DOM parsing for timing needed.

Output: clips.json
"""

import json
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

SESSION_FILE = "session.json"
BASE_URL = "https://app.streamladder.com"
CLIP_GPT_URL = f"{BASE_URL}/clip-gpt"
SL_API = "https://api.streamladder.com/api"

# ── Time helpers ──────────────────────────────────────────────────────────────

def ms_to_seconds(ms: int) -> int:
    return ms // 1000


def seconds_to_twitch_fmt(s: int) -> str:
    return f"{s//3600}h{(s%3600)//60}m{s%60}s"


# ── Session management ────────────────────────────────────────────────────────

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
    print(f"[+] Session saved ({len(cookies)} cookies, {len(local_storage)} localStorage keys)")
    await browser.close()
    return session


async def get_page(pw, session: dict):
    browser = await pw.chromium.launch(headless=False)
    context = await browser.new_context()
    await context.add_cookies(session["cookies"])
    page = await context.new_page()
    await page.goto(BASE_URL)
    if session.get("localStorage"):
        await page.evaluate(
            "entries => { for (const [k,v] of entries) localStorage.setItem(k, v); }",
            list(session["localStorage"].items()),
        )
    return browser, page


# ── Main ──────────────────────────────────────────────────────────────────────

async def main():
    async with async_playwright() as pw:
        # Session
        if Path(SESSION_FILE).exists():
            raw = json.loads(Path(SESSION_FILE).read_text())
            session = raw if isinstance(raw, dict) else {"cookies": raw, "localStorage": {}}
        else:
            session = await do_login(pw)

        while True:
            browser, page = await get_page(pw, session)

            await page.goto(CLIP_GPT_URL)
            await page.wait_for_load_state("networkidle")
            if "/login" in page.url or "/auth" in page.url:
                print("[!] Session expired — re-logging in...")
                await browser.close()
                Path(SESSION_FILE).unlink(missing_ok=True)
                session = await do_login(pw)
                continue
            break

        print(f"[+] Loaded: {page.url}")

        # Click first project card and simultaneously wait for the project API response
        card_sel = "article, [class*='VideoCard'], [class*='project-card']"
        await page.wait_for_selector(card_sel, timeout=15_000)
        cards = await page.query_selector_all(card_sel)
        print(f"[*] Clicking first project card (of {len(cards)})...")

        async with page.expect_response(
            lambda r: f"{SL_API}/ClipGptProjects/" in r.url
                      and r.request.method == "GET"
                      and r.url != f"{SL_API}/ClipGptProjects/",
            timeout=30_000,
        ) as response_info:
            await cards[0].click()

        response = await response_info.value
        project_data = await response.json()
        print(f"[+] Results page: {page.url}")
        print(f"[+] Captured project API: {len(project_data.get('clips', []))} clips")

        await browser.close()

    if not project_data:
        print("[!] No project data captured. Check api_responses.json and try again.")
        return

    # Build clips list from API data
    raw_clips = project_data.get("clips", [])
    vod_id = project_data.get("videoId", "")
    streamer = project_data.get("streamerName", "")
    project_title = project_data.get("title", "")

    print(f"\n[+] Project: '{project_title}' by {streamer} ({len(raw_clips)} total clips)")

    clips = []
    for c in raw_clips:
        start_sec = ms_to_seconds(c.get("start", 0))
        end_sec = ms_to_seconds(c.get("end", 0))
        duration_sec = end_sec - start_sec
        start_fmt = seconds_to_twitch_fmt(start_sec)
        end_fmt = seconds_to_twitch_fmt(end_sec)
        vod_url = f"https://www.twitch.tv/videos/{vod_id}?t={start_fmt}" if vod_id else ""

        clips.append({
            "id": c.get("id", ""),
            "title": c.get("title", ""),
            "score": c.get("score", 0),
            "hook": c.get("hook", ""),
            "hashtags": c.get("hashtags", []),
            "streamer": streamer,
            "vod_id": vod_id,
            "video_url": c.get("videoUrl", ""),
            "twitch_vod_url": vod_url,
            "start_time_sec": start_sec,
            "end_time_sec": end_sec,
            "duration_sec": duration_sec,
            "start_fmt": start_fmt,
            "end_fmt": end_fmt,
            "status": c.get("status", ""),
        })

    # Sort by score descending
    clips.sort(key=lambda x: x["score"], reverse=True)

    # Print summary
    print(f"\n{'='*60}")
    for i, c in enumerate(clips, 1):
        print(f"\n[{i:02d}] {c['title']}")
        print(f"      score    : {c['score']}/100")
        print(f"      duration : {c['duration_sec']}s")
        print(f"      start    : {c['start_fmt']}  ({c['start_time_sec']}s)")
        print(f"      end      : {c['end_fmt']}  ({c['end_time_sec']}s)")
        print(f"      status   : {c['status']}")
        print(f"      vod      : {c['twitch_vod_url']}")

    Path("clips.json").write_text(json.dumps(clips, indent=2, ensure_ascii=False))
    print(f"\n[+] Saved {len(clips)} clips to clips.json")


if __name__ == "__main__":
    asyncio.run(main())
