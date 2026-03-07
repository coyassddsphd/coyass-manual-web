import asyncio
import json
import os
from playwright.async_api import async_playwright

async def fetch_docoapo_data():
    """
    Extracts today's appointment list from Docoapo using Playwright.
    """
    LOGIN_URL = os.getenv("DOCOAPO_URL", "https://docoapo.jp/login")
    USER_ID = os.getenv("DOCOAPO_USER_ID")
    PASSWORD = os.getenv("DOCOAPO_PASSWORD")
    
    if not USER_ID or not PASSWORD:
        print("Error: DOCOAPO_USER_ID or DOCOAPO_PASSWORD not set.")
        return []

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()

        print(f"Navigating to {LOGIN_URL}...")
        await page.goto(LOGIN_URL)

        # Login process
        await page.fill('input[name="user_id"]', USER_ID) # Adjust selector as needed
        await page.fill('input[name="password"]', PASSWORD) # Adjust selector as needed
        await page.click('button[type="submit"]') # Adjust selector as needed
        await page.wait_for_load_state("networkidle")

        # Navigate to Dashboard/Board view
        # Board view typically has the list of patients
        print("Navigating to Board view...")
        # Example: await page.goto("https://docoapo.jp/board") 
        
        # Extraction logic (Simulation based on typical structure)
        # We need to find the patient names, times, and medical record numbers/treatments
        appointments = []
        
        # Example selector: '.patient-row' or similar
        rows = await page.query_selector_all('.appointment-row')
        for row in rows:
            time_str = await row.query_selector('.time')
            name_str = await row.query_selector('.name')
            treatment_str = await row.query_selector('.treatment')
            
            if time_str and name_str:
                appointments.append({
                    "time": await time_str.inner_text(),
                    "name": await name_str.inner_text(),
                    "treatments": await treatment_str.inner_text() if treatment_str else ""
                })

        await browser.close()
        
async def update_docoapo_memo(patient_name, memo_text):
    """
    Updates the 'memo' field for a specific patient in Docoapo.
    """
    LOGIN_URL = os.getenv("DOCOAPO_URL", "https://docoapo.jp/login")
    USER_ID = os.getenv("DOCOAPO_USER_ID")
    PASSWORD = os.getenv("DOCOAPO_PASSWORD")
    
    if not USER_ID or not PASSWORD:
        return False

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()

        await page.goto(LOGIN_URL)
        await page.fill('input[name="user_id"]', USER_ID)
        await page.fill('input[name="password"]', PASSWORD)
        await page.click('button[type="submit"]')
        await page.wait_for_load_state("networkidle")

        # 予約ボードまたは検索画面で患者を探す
        print(f"Searching for patient: {patient_name} to update memo...")
        # 実際の実装は、検索窓に入力してエンター、詳細画面へ遷移し、
        # メモ欄（textarea等）を fill して保存ボタンをクリックする流れになる。
        # 以下はシミュレーション。
        
        # await page.fill('#search-input', patient_name)
        # await page.press('#search-input', 'Enter')
        # await page.click(f'text="{patient_name}"')
        # await page.fill('textarea[name="memo"]', f"[AI自動要約 {datetime.now().strftime('%m/%d')}]: {memo_text}")
        # await page.click('.save-button')
        
        await browser.close()
        return True

        # Save extracted data
        data_path = "data/docoapo/today_appointments.json"
        os.makedirs(os.path.dirname(data_path), exist_ok=True)
        with open(data_path, "w", encoding="utf-8") as f:
            json.dump(appointments, f, ensure_ascii=False, indent=2)
            
        return appointments

if __name__ == "__main__":
    loop = asyncio.get_event_loop()
    results = loop.run_until_complete(fetch_docoapo_data())
    if results:
        print(f"Extracted {len(results)} appointments.")
