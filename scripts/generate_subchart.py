import os
import json
import google.generativeai as genai
from google.generativeai import GenerativeModel
from datetime import datetime

# .env.local から環境変数を手動で読み込む
def load_env():
    # プロジェクトルートにある .env.local または .env.pipeline を探す
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    for env_name in [".env.local", ".env.pipeline"]:
        env_path = os.path.join(base_dir, env_name)
        if os.path.exists(env_path):
            print(f"Loading environment from {env_path}")
            try:
                with open(env_path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if "=" in line and not line.startswith("#"):
                            key, value = line.split("=", 1)
                            # クォートがあれば除去
                            value = value.strip().strip("'").strip('"')
                            os.environ[key] = value
                            if key == "GEMINI_API_KEY":
                                print(f"Found {key} in {env_name}")
            except PermissionError:
                print(f"Permission denied: {env_path}. Skipping.")
            except Exception as e:
                print(f"Error loading {env_name}: {e}")
    else:
        print(f"Warning: {env_path} not found.")

load_env()
API_KEY = os.getenv("GEMINI_API_KEY")

if API_KEY:
    genai.configure(api_key=API_KEY)

def load_prompt():
    prompt_path = "prompts/plaud_dental_prompt.md"
    if os.path.exists(prompt_path):
        with open(prompt_path, "r", encoding="utf-8") as f:
            return f.read()
    return "You are a world-class dental expert. Summarize the following transcript in SOAP format."

def load_evaluation_prompt():
    prompt_path = "prompts/staff_evaluation_prompt.md"
    if os.path.exists(prompt_path):
        with open(prompt_path, "r", encoding="utf-8") as f:
            return f.read()
    return "You are a hospitality expert. Evaluate the staff's performance in the following transcript."

def generate_subchart(transcript, appointments_json=None):
    """
    文字起こしと予約リストを受け取り、Geminiを使用してサブカルテを生成する。
    """
    # 利用可能なモデル名に変更
    model = GenerativeModel("gemini-2.5-flash")
    
    system_prompt = load_prompt()
    
    user_content = f"【文字起こし本文】\n{transcript}\n\n"
    if appointments_json:
        user_content += f"【本日の予約リスト】\n{json.dumps(appointments_json, ensure_ascii=False, indent=2)}\n\n"
    
    user_content += "上記の情報を元に、指定のフォーマットでサブカルテを生成してください。"

    try:
        response = model.generate_content(system_prompt + "\n\n" + user_content)
        return response.text
    except Exception as e:
        return f"Error generating subchart: {str(e)}"

def evaluate_staff(transcript):
    """
    文字起こしを受け取り、スタッフの接遇・コンサル能力を評価する。
    """
    model = GenerativeModel("gemini-2.5-flash")
    system_prompt = load_evaluation_prompt()
    
    user_content = f"【対話ログ】\n{transcript}\n\n"
    user_content += "上記の対話を元に、スタッフの評価とフィードバックを行ってください。"

    try:
        response = model.generate_content(system_prompt + "\n\n" + user_content)
        return response.text
    except Exception as e:
        return f"Error generating evaluation: {str(e)}"

def run_main():
    # 実データの取得
    transcript_json_path = "data/plaud/latest_transcript.json"
    appointments_json_path = "data/docoapo/today_appointments.json"

    if not os.path.exists(transcript_json_path):
        print(f"Error: {transcript_json_path} not found.")
        return

    with open(transcript_json_path, "r", encoding="utf-8") as f:
        transcript_data = json.load(f)
    
    transcript_content = transcript_data.get("content", "")
    if not transcript_content:
        print("Error: No content in transcript.")
        return

    appointments = []
    if os.path.exists(appointments_json_path):
        with open(appointments_json_path, "r", encoding="utf-8") as f:
            appointments = json.load(f)

    # --- 改善されたマルチマッチングロジック ---
    matched_patients = []
    if appointments:
        for appt in appointments:
            name = appt.get("name", "")
            chart_no = appt.get("chart_number") or appt.get("id", "unknown")
            treatment = appt.get("treatment", "")
            
            # 手動の例外ルール (本山 -> 奥山)
            is_match = False
            if name == "奥山 沙織" and ("本山" in transcript_content or "奥山" in transcript_content):
                is_match = True
            elif name and (name in transcript_content or name.replace(" ", "") in transcript_content or name.split(" ")[0] in transcript_content):
                is_match = True
            
            if is_match:
                matched_patients.append({
                    "id": chart_no,
                    "name": name,
                    "treatment": treatment
                })

    if not matched_patients:
        matched_patients.append({"id": "unknown", "name": "不明", "treatment": ""})

    # 今日の日付を取得
    today_str = datetime.now().strftime("%Y%m%d")
    
    for patient in matched_patients:
        p_id = patient["id"]
        p_name = patient["name"]
        
        print(f"--- Generating Sub-Chart for {p_name} (ID: {p_id}) ---")
        # 予約票の情報をAIに渡すことで精度を向上
        subchart_result = generate_subchart(transcript_content, [patient])
        
        print(f"--- Evaluating Staff for {p_name} ---")
        evaluation_result = evaluate_staff(transcript_content)
        
        # ファイルに保存 (日付_患者番号.md)
        filename = f"{today_str}_{p_id}.md"
        output_path = os.path.join("data/subcharts", filename)
        
        eval_filename = f"{today_str}_{p_id}_eval.md"
        eval_path = os.path.join("data/subcharts", eval_filename)
        
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(subchart_result)
        
        with open(eval_path, "w", encoding="utf-8") as f:
            f.write(evaluation_result)
            
        print(f"Saved: {filename} and {eval_filename}")

    # 最新版として last_generated.md にも保存
    with open("data/subcharts/last_generated.md", "w", encoding="utf-8") as f:
        f.write(f"# Latest Sync Status\n\nMatched {len(matched_patients)} patients.")

if __name__ == "__main__":
    if not API_KEY:
        print("Error: GEMINI_API_KEY not found in environment variables.")
    else:
        run_main()
