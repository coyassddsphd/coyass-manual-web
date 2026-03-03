import os
import json

def fetch_plaud_data():
    """
    PLAUDから最新の文字起こしデータを抽出する。
    """
    data_path = "data/plaud/latest_transcript.json"
    if os.path.exists(data_path):
        with open(data_path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}

if __name__ == "__main__":
    transcript_data = fetch_plaud_data()
    if transcript_data:
        print(f"Extracted transcript: {transcript_data.get('title', 'No Title')}")
    else:
        print("No transcript data found at data/plaud/latest_transcript.json")
