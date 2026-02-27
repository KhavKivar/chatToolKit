#!/usr/bin/env python3
"""
Create Twitch clips from VODs using the Twitch clip editor.
Uses undetected-chromedriver to bypass Twitch browser checks.

First run: Chrome opens, log in to Twitch manually — session is saved in
           twitch_chrome_profile/ and reused on every subsequent run.

Usage:
    python create_twitch_clips.py [--input clips.json] [--top N] [--dry-run]
"""

import argparse
import json
import sys
import time
from pathlib import Path

import undetected_chromedriver as uc
from selenium.webdriver.common.by import By
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException

CHROME_PROFILE_DIR = Path("twitch_chrome_profile").resolve()
TWITCH_LOGIN_URL = "https://www.twitch.tv/login"
TWITCH_BASE = "https://www.twitch.tv"

MAX_CLIP_DURATION = 60
INTER_CLIP_DELAY = 3


# ── Browser ───────────────────────────────────────────────────────────────────

def start_browser() -> uc.Chrome:
    CHROME_PROFILE_DIR.mkdir(exist_ok=True)
    options = uc.ChromeOptions()
    options.add_argument(f"--user-data-dir={CHROME_PROFILE_DIR}")
    options.add_argument("--profile-directory=Default")
    options.add_argument("--no-first-run")
    options.add_argument("--no-default-browser-check")
    driver = uc.Chrome(options=options, headless=False, version_main=145)
    driver.implicitly_wait(5)
    return driver


# ── Session management ────────────────────────────────────────────────────────

def ensure_logged_in(driver: uc.Chrome) -> bool:
    """
    Navigate to /login — Twitch auto-redirects away if already logged in.
    If we stay on /login, wait for the user to log in manually.
    """
    driver.get(TWITCH_LOGIN_URL)
    time.sleep(4)

    if "/login" not in driver.current_url:
        print("[+] Already logged in (session from Chrome profile)")
        return True

    print("[*] Please log in to Twitch in the browser window (waiting up to 5 min)...")
    for _ in range(300):
        time.sleep(1)
        if "/login" not in driver.current_url and "twitch.tv" in driver.current_url:
            time.sleep(2)
            print("[+] Login detected — session saved in Chrome profile")
            return True

    print("[!] Login timed out")
    return False


# ── Clip creation ─────────────────────────────────────────────────────────────

def build_clip_editor_url(channel: str, offset_seconds: int) -> str:
    return f"https://clips.twitch.tv/create?channel={channel}&vodOffset={offset_seconds}"


def wait_for(driver, selector, timeout=15):
    try:
        return WebDriverWait(driver, timeout).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, selector))
        )
    except TimeoutException:
        return None


def drag_handle_js(driver, handle_sel: str, target_pct: float, timeline_sel: str) -> bool:
    result = driver.execute_script(f"""
        const handle = document.querySelector({json.dumps(handle_sel)});
        const timeline = document.querySelector({json.dumps(timeline_sel)});
        if (!handle || !timeline) return null;
        const hBox = handle.getBoundingClientRect();
        const tBox = timeline.getBoundingClientRect();
        return {{
            hx: hBox.x + hBox.width / 2,  hy: hBox.y + hBox.height / 2,
            tx: tBox.x + tBox.width * {target_pct}, ty: tBox.y + tBox.height / 2
        }};
    """)
    if not result:
        return False

    hx, hy, tx, ty = result["hx"], result["hy"], result["tx"], result["ty"]
    steps = 20

    driver.execute_script(f"""
        const el = document.querySelector({json.dumps(handle_sel)});
        el.dispatchEvent(new MouseEvent('mousedown', {{bubbles:true, clientX:{hx}, clientY:{hy}}}));
    """)
    time.sleep(0.1)

    for i in range(steps + 1):
        x = hx + (tx - hx) * i / steps
        y = hy + (ty - hy) * i / steps
        driver.execute_script(f"""
            document.dispatchEvent(new MouseEvent('mousemove', {{bubbles:true, clientX:{x}, clientY:{y}}}));
        """)
        time.sleep(0.02)

    driver.execute_script(f"""
        document.dispatchEvent(new MouseEvent('mouseup', {{bubbles:true, clientX:{tx}, clientY:{ty}}}));
    """)
    time.sleep(0.3)
    return True


def move_handle_keys(driver, handle_el, delta_seconds: int):
    """Move a clip handle using arrow keys (1 key = 1 second)."""
    if delta_seconds == 0:
        return
    from selenium.webdriver.common.keys import Keys
    key = Keys.ARROW_RIGHT if delta_seconds > 0 else Keys.ARROW_LEFT
    handle_el.click()
    for _ in range(abs(delta_seconds)):
        handle_el.send_keys(key)
        time.sleep(0.05)


def open_clip_editor(driver: uc.Chrome, clip: dict) -> bool:
    """
    Navigate to the VOD, hover the player overlay to reveal controls,
    click the Clip button (aria-label="Clip (alt+x)"), then wait for
    the inline popup (#CLIP_EDITOR_POPUP_ID) to appear.
    """
    vod_url = f"https://www.twitch.tv/videos/{clip['vod_id']}?t={clip['start_fmt']}"
    print(f"    VOD: {vod_url}")
    driver.get(vod_url)
    time.sleep(6)

    # Hover the player overlay to make controls visible
    overlay = wait_for(driver, '[data-a-target="player-overlay-click-handler"]', timeout=10)
    if overlay:
        try:
            ActionChains(driver).move_to_element(overlay).perform()
            time.sleep(1)
        except Exception:
            pass

    # Clip button has aria-label="Clip (alt+x)" — no data-a-target
    clip_btn = wait_for(driver, 'button[aria-label="Clip (alt+x)"]', timeout=10)
    if not clip_btn:
        labels = driver.execute_script(
            "return [...document.querySelectorAll('button[aria-label]')].map(b => b.getAttribute('aria-label'));"
        )
        print(f"    [!] Clip button not found. Visible buttons: {labels}")
        return False

    clip_btn.click()
    print("    [*] Clicked Clip — waiting for editor popup (up to 15s)...")

    # Editor opens as an inline popup on the same page — wait for it
    popup = wait_for(driver, '#CLIP_EDITOR_POPUP_ID', timeout=15)
    if not popup:
        print("    [!] Clip editor popup did not appear")
        return False

    print("    [+] Clip editor popup open")
    return True


def create_clip(driver: uc.Chrome, clip: dict) -> str | None:
    duration = clip["duration_sec"]
    title = clip["title"]

    if not open_clip_editor(driver, clip):
        print("    [!] Could not open clip editor — skipping")
        return None

    # Extra wait for popup content to fully render
    time.sleep(3)

    # ── Title ─────────────────────────────────────────────────────────────────
    # Input: data-a-target="tw-input", placeholder="Add a title (required)"
    title_el = wait_for(driver, '#CLIP_EDITOR_POPUP_ID [data-a-target="tw-input"]', timeout=10)
    if not title_el:
        title_el = wait_for(driver, '#CLIP_EDITOR_POPUP_ID input[type="text"]', timeout=5)
    if title_el:
        title_el.clear()
        title_el.send_keys(title[:100])
        print(f"    [+] Title set: {title[:60]}")
    else:
        print("    [!] Title input not found — cannot save without title")
        return None

    # ── Timeline handles (keyboard-driven) ───────────────────────────────────
    # The editor window is 30s by default centred on the VOD timestamp.
    # We navigate to start_fmt, so the window is already at the right position.
    # Left handle = start (default 0:00 in window = correct)
    # Right handle = end  (default 0:30 in window)
    # Adjust right handle if needed: duration - 30 seconds (negative = move left)
    right_handle = wait_for(driver, '[aria-label="Clip End Time"]', timeout=8)
    if right_handle:
        # Default right is at 30s. Move to desired duration.
        delta = duration - 30
        if delta != 0:
            move_handle_keys(driver, right_handle, delta)
            print(f"    [+] Right handle adjusted by {delta:+d}s → {duration}s clip")
        else:
            print(f"    [+] Handles already correct (30s clip)")
    else:
        print("    [!] End handle not found — using default range")

    time.sleep(0.5)

    # ── Save ──────────────────────────────────────────────────────────────────
    # Button text is "Save Clip"; disabled until title is filled
    try:
        save_btn = WebDriverWait(driver, 10).until(
            EC.element_to_be_clickable(
                (By.XPATH, '//*[@id="CLIP_EDITOR_POPUP_ID"]//button[contains(., "Save Clip")]')
            )
        )
    except TimeoutException:
        save_btn = None

    if not save_btn:
        print("    [!] Save Clip button not found / not clickable")
        return None

    save_btn.click()
    print("    [*] Clicked Save Clip — waiting for result...")

    # ── Capture clip URL ──────────────────────────────────────────────────────
    # After saving, Twitch may show a link in the popup or open a new tab.
    for _ in range(20):
        time.sleep(2)

        # Check for new tab
        handles = driver.window_handles
        if len(handles) > 1:
            for h in handles:
                driver.switch_to.window(h)
                if "clips.twitch.tv/" in driver.current_url:
                    url = driver.current_url
                    print(f"    [+] Clip URL: {url}")
                    return url

        # Look for clip links in popup or page
        links = driver.execute_script("""
            return [...document.querySelectorAll('a[href]')]
                .map(a => a.href)
                .filter(h => h.includes('clips.twitch.tv') && !h.includes('/create'));
        """)
        if links:
            print(f"    [+] Clip URL: {links[0]}")
            return links[0]

    print("    [!] Could not capture clip URL (clip may still have been created — check your Twitch clips page)")
    return None


# ── Main ──────────────────────────────────────────────────────────────────────

def load_clips(path: str) -> list[dict]:
    p = Path(path)
    if not p.exists():
        print(f"[!] Not found: {path}")
        sys.exit(1)
    return json.loads(p.read_text())


def save_clips(clips: list[dict], path: str):
    Path(path).write_text(json.dumps(clips, indent=2, ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default="clips.json")
    parser.add_argument("--top", type=int, default=None)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    clips = load_clips(args.input)

    eligible = [c for c in clips if c.get("duration_sec", 0) <= MAX_CLIP_DURATION]
    if skipped := len(clips) - len(eligible):
        print(f"[*] Skipping {skipped} clips > {MAX_CLIP_DURATION}s")

    pending = [c for c in eligible if not c.get("twitch_clip_url")]
    if done := len(eligible) - len(pending):
        print(f"[*] Skipping {done} already-created clips")

    if args.top:
        pending = pending[:args.top]

    print(f"[*] Will process {len(pending)} clip(s)")

    if not pending:
        print("[*] Nothing to do.")
        return

    if args.dry_run:
        print("\n[DRY RUN] Would create:")
        for i, c in enumerate(pending, 1):
            print(f"  [{i:02d}] {c['title'][:60]}")
            print(f"        {c['duration_sec']}s  |  {c['start_fmt']} → {c['end_fmt']}")
            print(f"        {build_clip_editor_url(c['streamer'].lower(), c['start_time_sec'])}")
        return

    driver = start_browser()
    try:
        if not ensure_logged_in(driver):
            print("[!] Could not confirm login — aborting")
            return

        for i, clip in enumerate(pending, 1):
            print(f"\n[{i}/{len(pending)}] {clip['title'][:60]}")
            print(f"    {clip['duration_sec']}s  |  {clip['start_fmt']} → {clip['end_fmt']}")

            clip_url = create_clip(driver, clip)
            if clip_url:
                clip["twitch_clip_url"] = clip_url
                save_clips(clips, args.input)
                print(f"    [+] Saved to {args.input}")

            if i < len(pending):
                time.sleep(INTER_CLIP_DELAY)

    finally:
        driver.quit()

    created = sum(1 for c in pending if c.get("twitch_clip_url"))
    print(f"\n[+] Done. {created}/{len(pending)} clips created.")


if __name__ == "__main__":
    main()
