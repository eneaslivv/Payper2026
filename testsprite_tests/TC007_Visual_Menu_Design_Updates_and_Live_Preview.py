import asyncio
from playwright import async_api
from playwright.async_api import expect

async def run_test():
    pw = None
    browser = None
    context = None
    
    try:
        # Start a Playwright session in asynchronous mode
        pw = await async_api.async_playwright().start()
        
        # Launch a Chromium browser in headless mode with custom arguments
        browser = await pw.chromium.launch(
            headless=True,
            args=[
                "--window-size=1280,720",         # Set the browser window size
                "--disable-dev-shm-usage",        # Avoid using /dev/shm which can cause issues in containers
                "--ipc=host",                     # Use host-level IPC for better stability
                "--single-process"                # Run the browser in a single process mode
            ],
        )
        
        # Create a new browser context (like an incognito window)
        context = await browser.new_context()
        context.set_default_timeout(5000)
        
        # Open a new page in the browser context
        page = await context.new_page()
        
        # Navigate to your target URL and wait until the network request is committed
        await page.goto("http://localhost:3005", wait_until="commit", timeout=10000)
        
        # Wait for the main page to reach DOMContentLoaded state (optional for stability)
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=3000)
        except async_api.Error:
            pass
        
        # Iterate through all iframes and wait for them to load as well
        for frame in page.frames:
            try:
                await frame.wait_for_load_state("domcontentloaded", timeout=3000)
            except async_api.Error:
                pass
        
        # Interact with the page elements to simulate user flow
        # -> Try inputting email into index 3 and password into index 4 alternatively, or try clicking the email input first to activate it
        frame = context.pages[-1]
        # Click email input to activate it
        elem = frame.locator('xpath=html/body/div/div/div[2]/div[2]/form/div/div/input').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        frame = context.pages[-1]
        # Try inputting email after activating input
        elem = frame.locator('xpath=html/body/div/div/div[2]/div[2]/form/div/div/input').nth(0)
        await page.wait_for_timeout(3000); await elem.fill('livveneas@gmail.com')
        

        frame = context.pages[-1]
        # Input password
        elem = frame.locator('xpath=html/body/div/div/div[2]/div[2]/form/div/div[2]/div/input').nth(0)
        await page.wait_for_timeout(3000); await elem.fill('test124')
        

        frame = context.pages[-1]
        # Click login button to authenticate
        elem = frame.locator('xpath=html/body/div/div/div[2]/div[2]/form/button').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # -> Click on 'Diseño Menú' link (index 7) to open the menu design editor
        frame = context.pages[-1]
        # Click 'Diseño Menú' to open the menu design editor
        elem = frame.locator('xpath=html/body/div/div/aside/div[2]/div[2]/a[2]').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # -> Add a new product with variants and add-ons to the menu
        frame = context.pages[-1]
        # Click 'add' button to add a new product
        elem = frame.locator('xpath=html/body/div/div/main/div/div/div[2]/div[2]/div/div[2]/div/div[6]/div/div/button').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # -> Try clicking the other add button at index 52 to add a new product or report the issue if no success
        frame = context.pages[-1]
        # Click alternative add button at index 52 to add a new product
        elem = frame.locator('xpath=html/body/div/div/main/div/div/div[2]/div[2]/div/div[2]/div/div[6]/div/div[3]/button').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # --> Assertions to verify final state
        frame = context.pages[-1]
        try:
            await expect(frame.locator('text=Menu design saved successfully').first).to_be_visible(timeout=1000)
        except AssertionError:
            raise AssertionError("Test case failed: The menu design changes including product variants and add-ons were not saved correctly, and the live preview did not update dynamically as expected.")
        await asyncio.sleep(5)
    
    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()
            
asyncio.run(run_test())
    