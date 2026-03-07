import asyncio
import os
import json
from playwright.async_api import async_playwright

async def fetch_tobila_recordings():
    """
    Logins to Tobila Phone management portal and extracts recording links.
    """
    LOGIN_URL = os.getenv("TOBILA_URL") # e.g., https://tpweb.tobila.com/admin/users/login/site:tpXXXXX
    USER_ID = os.getenv("TOBILA_USER_ID")
    PASSWORD = os.getenv("TOBILA_PASSWORD")
    
    if not LOGIN_URL or not USER_ID:
        print("Error: TOBILA credentials not set.")
        return []

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()
        
        try:
            print(f"Logging into Tobila Phone at {LOGIN_URL}...")
            await page.goto(LOGIN_URL)
            
            # Login flow (common Tobila structure)
            await page.fill('input[name="data[User][username]"]', USER_ID)
            await page.fill('input[name="data[User][password]"]', PASSWORD)
            await page.click('input[type="submit"]')
            await page.wait_for_load_state("networkidle")
            
            if "login" in page.url:
                print("Error: Login failed. Please check credentials.")
                await browser.close()
                return []

            #録音一覧ページへ遷移（必要に応じて）
            #通常ログイン後のトップに履歴がある場合が多い
            print("Extracting recording metadata...")
            recordings = []
            
            # テーブル行を取得
            rows = await page.query_selector_all('table tr')
            for row in rows:
                cells = await row.query_selector_all('td')
                if len(cells) < 5:
                    continue
                
                # 例: 日時, 相手電話番号, 種別, 再生/DL
                date_text = await cells[0].inner_text()
                phone_number = await cells[1].inner_text()
                
                # DLリンク（.mp3等）を探す
                dl_link = await row.query_selector('a[href*="download"]')
                if dl_link:
                    url = await dl_link.get_attribute('href')
                    recordings.append({
                        "date": date_text.strip(),
                        "phone": phone_number.strip(),
                        "url": url if url.startswith('http') else f"https://tpweb.tobila.com{url}"
                    })
            
            print(f"Found {len(recordings)} potential recordings.")

            # ダウンロードと保存
            os.makedirs("data/tobila/recordings", exist_ok=True)
            for rec in recordings[:5]: # 最新5件に制限（デモ用）
                file_name = f"{rec['date'].replace(' ', '_').replace(':', '')}_{rec['phone']}.mp3"
                save_path = os.path.join("data/tobila/recordings", file_name)
                
                if not os.path.exists(save_path):
                    print(f"Downloading {file_name}...")
                    # Playwrightの組み込み機能でDL
                    async with page.expect_download() as download_info:
                        await page.goto(rec['url'])
                    download = await download_info.value
                    await download.save_as(save_path)
                    rec['file_path'] = save_path
                else:
                    rec['file_path'] = save_path

        except Exception as e:
            print(f"Error during Tobila scraping: {e}")
            await page.screenshot(path="data/tobila_error.png")
        
        finally:
            await browser.close()
        
        return recordings

async def transcribe_recording(file_path):
    """
    Transcribes a single recording using Gemini.
    """
    import google.generativeai as genai
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return "Error: GEMINI_API_KEY not set."
    
    genai.configure(api_key=api_key)
    model = genai.GenerativeModel("gemini-1.5-flash") # 音声対応

    try:
        # ファイルアップロード
        audio_file = genai.upload_file(path=file_path)
        print(f"Transcribing {file_path}...")
        response = model.generate_content([
            "この電話音声を文字起こしし、重要な情報を箇条書きでまとめてください。歯科医院への予約や相談であることを想定しています。",
            audio_file
        ])
        return response.text
    except Exception as e:
        return f"Transcription error: {e}"

async def process_tobila():
    recordings = await fetch_tobila_recordings()
    for rec in recordings:
        if 'file_path' in rec:
            transcript = await transcribe_recording(rec['file_path'])
            rec['transcript'] = transcript
            
            # 保存
            history_path = f"data/tobila/history/{os.path.basename(rec['file_path'])}.json"
            os.makedirs(os.path.dirname(history_path), exist_ok=True)
            with open(history_path, "w", encoding="utf-8") as f:
                json.dump(rec, f, ensure_ascii=False, indent=2)

def download_and_transcribe(recordings):
    """
    Downloads recording files and sends them to Gemini for transcription.
    """
    pass

if __name__ == "__main__":
    asyncio.run(process_tobila())
