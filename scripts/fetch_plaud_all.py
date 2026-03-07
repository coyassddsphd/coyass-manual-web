import requests
import json
import os
import gzip
import time
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
import socket

# Authentication and connection settings
BEARER_TOKEN = os.getenv("PLAUD_BEARER_TOKEN", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJlZDcwZWYyMWY4Y2RkZTIyODYyNmZhMzBjZDA3NjI4MSIsImF1ZCI6IiIsImV4cCI6MTc5ODQzNzIzOCwiaWF0IjoxNzcyNTE3MjM4LCJjbGllbnRfaWQiOiJ3ZWIiLCJyZWdpb24iOiJhd3M6YXAtbm9ydGhlYXN0LTEifQ.5kkvjKFZqhAc565osW1oTG4v0pW-DIPEoYS-heXx0NE")
DEVICE_ID = os.getenv("PLAUD_DEVICE_ID", "3c30c68de122d22f")
USER_ID = os.getenv("PLAUD_USER_ID", "f10eb25d742bfa0c5648fe47b7be3a16fd7305c80955e7f5992e16b9a15158e5")

HEADERS = {
    "authorization": f"bearer {BEARER_TOKEN}",
    "x-device-id": DEVICE_ID,
    "x-pld-user": USER_ID,
    "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
}

# DNS and API Settings
HOST_NAME = "api.plaud.ai"
# Attempt to use normal URL first, fallback to IP if DNS fails
API_BASE = f"https://{HOST_NAME}"
API_IP = "104.18.7.192" # Cloudflare IP for api.plaud.ai fallback

import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Robust session with retry and host header handling
def get_session():
    session = requests.Session()
    # Check if DNS resolution works, if not, switch to IP
    try:
        socket.gethostbyname(HOST_NAME)
        print(f"DNS resolution for {HOST_NAME} successful.")
    except socket.gaierror:
        print(f"DNS resolution failed for {HOST_NAME}. Using IP fallback: {API_IP}")
        global API_BASE
        API_BASE = f"https://{API_IP}"
        session.verify = False 
        session.headers.update({"Host": HOST_NAME})

    retries = Retry(total=5, backoff_factor=1, status_forcelist=[502, 503, 504])
    session.mount('https://', HTTPAdapter(max_retries=retries))
    return session


session = get_session()


def resolve_dns_manually(hostname):
    # 名前解決ができない環境への対策
    try:
        return socket.gethostbyname(hostname)
    except Exception:
        # 既知のIPアドレスへのフォールバック（例示、実際にはdig等の結果を元に更新）
        # もし特定のIPが判明していればここに書くが、動的なのでリトライに任せるか
        # 外部のDNS APIを叩く手段もある
        print(f"Warning: Could not resolve {hostname}")
        return None


def fetch_all_note_ids():
    url = f"{API_BASE}/file/simple/web"
    params = {
        "limit": 9999,
        "skip": 0,
        "sort_by": "start_time",
        "is_desc": "true"
    }
    response = session.get(url, headers=HEADERS, params=params)
    if response.status_code == 200:
        data = response.json()
        return data.get("file_list", [])
    return []

def fetch_note_detail(file_id):
    url = f"{API_BASE}/file/detail/{file_id}"
    response = session.get(url, headers=HEADERS)
    if response.status_code == 200:
        return response.json()
    return None

def download_and_extract(url, save_path):
    response = session.get(url)
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
    print("Historical fetcher starting...")
    run_full_sync()
