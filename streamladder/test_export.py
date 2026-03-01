import json
import asyncio
import sys
from pathlib import Path
from playwright.async_api import async_playwright

SESSION_FILE = "session.json"
BASE_URL = "https://app.streamladder.com"

async def test_export(clip_id):
    async with async_playwright() as pw:
        # Load session data
        if not Path(SESSION_FILE).exists():
            print(f"Error: {SESSION_FILE} not found")
            return
        
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context()
        
        # 1. Add cookies to context
        session = json.loads(Path(SESSION_FILE).read_text())
        await context.add_cookies(session["cookies"])
        
        page = await context.new_page()
        
        # 2. Go to login page and try to bypass/click
        print("[*] Navigating to login page...")
        await page.goto(f"{BASE_URL}/login")
        await page.wait_for_timeout(3000)
        
        # Inject localStorage here just in case
        if session.get("localStorage"):
            await page.evaluate(
                "entries => { for (const [k,v] of entries) localStorage.setItem(k, v); }",
                list(session["localStorage"].items()),
            )
            
        # Try to click 'Login with Google' if visible
        google_btn = page.locator('button:has-text("Login with Google")')
        if await google_btn.is_visible():
            print("[*] Clicking 'Login with Google'...")
            await google_btn.click()
            await page.wait_for_timeout(5000)
        
        # 3. Navigate to actual content
        url = f"{BASE_URL}/content-publisher/project/{clip_id}"
        print(f"[*] Navigating to {url}...")
        await page.goto(url)
        
        # Wait for either the editor OR the login screen for diagnostic
        try:
            await page.wait_for_selector("button:has-text('Export'), button:has-text('Login')", timeout=15000)
        except:
            pass
            
        await page.screenshot(path="debug_export.png")
        print("[*] Diagnostic screenshot saved.")
        
        # Check if already exported or need to trigger
        try:
            # Look for Export button
            export_btn = page.locator('button:has-text("Export clip")')
            if await export_btn.is_visible():
                print("[*] Clicking 'Export clip'...")
                await export_btn.click()
            else:
                # Check if it says "Exporting" or "Download"
                content = await page.content()
                if "Exporting" in content:
                    print("[*] Already exporting...")
                elif "Download" in content:
                    print("[*] Already exported. Polling for ResultUrl...")
                else:
                    print("[!] 'Export clip' button not found.")
        except Exception as e:
            print(f"[!] Export trigger error: {e}")

        # Polling for ResultUrl or Download button
        print("[*] Polling for completion...")
        result_url = None
        
        async def handle_response(response):
            nonlocal result_url
            # Intercept Supabase project GET request
            if "rest/v1/ClipEditorProjects" in response.url and response.request.method == "GET":
                try:
                    data = await response.json()
                    projects = data if isinstance(data, list) else [data]
                    for project in projects:
                        if project.get("ResultUrl"):
                            result_url = project.get("ResultUrl")
                            print(f"[+] Intercepted ResultUrl: {result_url}")
                except:
                    pass

        page.on("response", handle_response)

        max_attempts = 40 
        for i in range(max_attempts):
            # Check for Download button as a fallback/visual cue
            download_btn = page.locator('button:has-text("Download")')
            if await download_btn.count() > 0:
                if await download_btn.first.is_visible() or result_url:
                    print("[+] Export finished!")
                    break
            
            if result_url:
                break
                
            await asyncio.sleep(5)
            
        if result_url:
            print(f"\n[SUCCESS] Final Video URL: {result_url}")
        else:
            print("\n[FAILURE] Could not get ResultUrl")

        await browser.close()

if __name__ == "__main__":
    cid = "13c8569a-f6a3-4efa-82a4-35adee39d503"
    asyncio.run(test_export(cid))
