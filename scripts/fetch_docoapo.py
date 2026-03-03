import json
import os

def fetch_docoapo_data():
    """
    # Browser integration for Docoapo
    # GitHub Actions等の環境では headless=True にする必要があります
    """
    is_headless = os.getenv("GITHUB_ACTIONS") == "true"
    # サブエージェントを通じたブラウザ操作（シミュレーション）
# が必要なため、
    # ここでは抽出されたJSONデータを読み込む処理、またはブラウザツールへの命令を定義します。
    data_path = "data/docoapo/today_appointments.json"
    if os.path.exists(data_path):
        with open(data_path, "r", encoding="utf-8") as f:
            return json.load(f)
    return []

if __name__ == "__main__":
    appointments = fetch_docoapo_data()
    print(f"Extracted {len(appointments)} appointments.")
    for appt in appointments:
        print(f"- {appt.get('time')}: {appt.get('name')} ({appt.get('treatments')})")
