import json
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright, Page, BrowserContext
from loguru import logger
import config

STREAMLADDER_URL = "https://app.streamladder.com/"
CLIPS_URL = "https://app.streamladder.com/clips"


async def _save_cookies(context: BrowserContext) -> None:
    cookies = await context.cookies()
    Path(config.SESSION_FILE).write_text(json.dumps(cookies, indent=2))
    logger.info(f"Session saved to {config.SESSION_FILE}")


async def _load_cookies(context: BrowserContext) -> None:
    cookies = json.loads(Path(config.SESSION_FILE).read_text())
    await context.add_cookies(cookies)
    logger.info(f"Session loaded from {config.SESSION_FILE}")


async def login_and_save_session(playwright) -> list[dict]:
    """
    Open a headful browser, wait for the user to log in manually,
    then scrape clips and save the session for future headless runs.
    """
    browser = await playwright.chromium.launch(headless=False)
    context = await browser.new_context()
    page = await context.new_page()

    logger.info("Opening StreamLadder — please log in manually in the browser window.")
    await page.goto(STREAMLADDER_URL)

    # Wait until the user is past the login page (URL changes away from auth pages)
    await page.wait_for_url(
        lambda url: "streamladder.com" in url and "/login" not in url and "/auth" not in url,
        timeout=300_000,
    )
    logger.info("Login detected. Navigating to clips page...")

    clips = await get_clips(page)
    await _save_cookies(context)
    await browser.close()
    return clips


async def load_session_and_scrape(playwright) -> list[dict]:
    """Load a saved session and scrape clips headlessly."""
    browser = await playwright.chromium.launch(headless=True)
    context = await browser.new_context()
    await _load_cookies(context)
    page = await context.new_page()

    logger.info("Navigating to StreamLadder clips page (headless)...")
    await page.goto(CLIPS_URL)

    # If redirected to login, the session has expired
    if "/login" in page.url or "/auth" in page.url:
        await browser.close()
        raise RuntimeError(
            "Session expired or invalid. Delete session.json and re-run to log in again."
        )

    clips = await get_clips(page)
    await browser.close()
    return clips


async def get_clips(page: Page) -> list[dict]:
    """
    Scrape the StreamLadder clips dashboard.
    Returns a list of dicts: [{title, twitch_clip_url}]
    """
    await page.goto(CLIPS_URL)
    await page.wait_for_load_state("networkidle")

    clips = []

    # StreamLadder renders clips as cards. We look for anchor tags that point
    # to clips.twitch.tv — these are the original source links embedded in the UI.
    # Adjust the selector if the site layout changes.
    clip_cards = await page.query_selector_all("[data-testid='clip-card'], .clip-card, article")

    if not clip_cards:
        # Fallback: find all Twitch clip links on the page
        logger.debug("No clip cards found via primary selector, falling back to link scan.")
        links = await page.query_selector_all("a[href*='clips.twitch.tv']")
        for link in links:
            href = await link.get_attribute("href")
            title = await link.inner_text()
            if href:
                clips.append({"title": title.strip() or href, "twitch_clip_url": href})
        logger.info(f"Found {len(clips)} Twitch clip links on the page.")
        return clips

    for card in clip_cards:
        title_el = await card.query_selector("h2, h3, [class*='title']")
        title = (await title_el.inner_text()).strip() if title_el else "Unknown"

        twitch_link = await card.query_selector("a[href*='clips.twitch.tv']")
        if not twitch_link:
            logger.debug(f"No Twitch clip link found in card: {title!r}, skipping.")
            continue

        twitch_url = await twitch_link.get_attribute("href")
        clips.append({"title": title, "twitch_clip_url": twitch_url})

    logger.info(f"Scraped {len(clips)} clips from StreamLadder.")
    return clips


async def scrape(playwright=None) -> list[dict]:
    """
    Entry point: use saved session if available, otherwise prompt interactive login.
    Can accept an existing playwright instance or create a new one.
    """
    session_exists = Path(config.SESSION_FILE).exists()

    if playwright is not None:
        if session_exists:
            return await load_session_and_scrape(playwright)
        else:
            return await login_and_save_session(playwright)

    async with async_playwright() as pw:
        if session_exists:
            return await load_session_and_scrape(pw)
        else:
            return await login_and_save_session(pw)
