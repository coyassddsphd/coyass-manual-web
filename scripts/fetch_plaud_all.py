import requests
import json
import os
import gzip
import time

# Credentials from existing browser session (Simulation)
HEADERS = {
    "authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...", # Placeholder
    "x-device-id": "web-75458B87-4E1B-1B43-A218-830BC4AE042C",
    "x-pld-user": "ed70ef21f8cdde228626fa30cd076281",
    "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
}

API_BASE = "https://api-apne1.plaud.ai"

def fetch_all_note_ids():
    url = f"{API_BASE}/file/simple/web"
    params = {
        "limit": 9999,
        "skip": 0,
        "sort_by": "start_time",
        "is_desc": "true"
    }
    response = requests.get(url, headers=HEADERS, params=params)
    if response.status_code == 200:
        data = response.json()
        return data.get("file_list", [])
    return []

def fetch_note_detail(file_id):
    url = f"{API_BASE}/file/detail/{file_id}"
    response = requests.get(url, headers=HEADERS)
    if response.status_code == 200:
        return response.json()
    return None

def download_and_extract(url, save_path):
    response = requests.get(url)
    if response.status_code == 200:
        with open(save_path, "wb") as f:
            f.write(gzip.decompress(response.content))
        return True
    return False

def run_full_sync():
    os.makedirs("data/plaud/history", exist_ok=True)
    notes = fetch_all_note_ids()
    print(f"Total notes found: {len(notes)}")
    
    for note in notes:
        file_id = note["file_id"]
        title = note.get("title", "Untitled")
        print(f"Processing: {title} ({file_id})")
        
        detail = fetch_note_detail(file_id)
        if detail and "content_list" in detail:
            for content in detail["content_list"]:
                if content["data_type"] == "auto_sum_note": # Summary
                    url = content["url"]
                    save_path = f"data/plaud/history/{file_id}_summary.md"
                    download_and_extract(url, save_path)
                elif content["data_type"] == "transaction": # Transcript
                    url = content["url"]
                    save_path = f"data/plaud/history/{file_id}_transcript.json"
                    download_and_extract(url, save_path)
        
        # Rate limiting
        time.sleep(0.5)

if __name__ == "__main__":
    # Actual implementation will use tokens extracted from the browser session
    print("Historical fetcher starting...")
