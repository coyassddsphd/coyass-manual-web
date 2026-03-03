import os
import json
import requests

def get_plaud_config():
    config_path = os.path.expanduser("~/Library/Application Support/Plaud/config.json")
    if os.path.exists(config_path):
        with open(config_path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}

def fetch_latest_transcript_via_api():
    """
    PLAUD APIを使用して最新の文字起こしを取得する
    ※実際の運用にはデスクトップアプリのトークンが必要です。
    """
    config = get_plaud_config()
    user_id = config.get("pcsStatusRecord", {}).keys()
    if not user_id:
        return {"error": "User ID not found in config."}
    
    user_id = list(user_id)[0]
    api_url = f"https://api-apne1.plaud.ai/v1/users/{user_id}/files?page=1&limit=1"
    
    # ここにトークンの自動取得ロジックを追加検討中
    # 現時点では手動設定またはブラウザ経由のバックアップを想定
    headers = {
        "Accept": "application/json",
        "User-Agent": "Plaud/1.0.3 (Macintosh; Intel Mac OS X 10_15_7)",
    }
    
    print(f"Fetching from: {api_url}")
    # response = requests.get(api_url, headers=headers)
    # 接続確認などのデバッグ用（実際にはトークン不足で401になる可能性が高い）
    
    # 代替案：ローカルの pcm-cache や pcm-discard から最新ファイルを取得して文字起こしを再送する
    return {"status": "implementing", "user_id": user_id}

if __name__ == "__main__":
    result = fetch_latest_transcript_via_api()
    print(json.dumps(result, indent=2))
