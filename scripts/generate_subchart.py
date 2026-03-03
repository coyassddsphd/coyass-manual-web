import os
import json
import google.generativeai as genai
from google.generativeai import GenerativeModel
from datetime import datetime
import re

# .env.local から環境変数を手動で読み込む
def load_env():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    for env_name in [".env.local", ".env.pipeline"]:
        env_path = os.path.join(base_dir, env_name)
        if os.path.exists(env_path):
            try:
                with open(env_path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if "=" in line and not line.startswith("#"):
                            key, value = line.split("=", 1)
                            value = value.strip().strip("'").strip('"')
                            os.environ[key] = value
            except Exception:
                pass

load_env()
API_KEY = os.getenv("GEMINI_API_KEY")

if API_KEY:
    genai.configure(api_key=API_KEY)

def load_prompt(filename):
    prompt_path = os.path.join("prompts", filename)
    if os.path.exists(prompt_path):
        with open(prompt_path, "r", encoding="utf-8") as f:
            return f.read()
    return ""

def generate_subchart(transcript, appointments_json=None):
    model = GenerativeModel("gemini-2.0-flash")
    
    # --- Pass 1: Generation ---
    system_prompt = load_prompt("plaud_dental_prompt.md")
    user_content = f"【文字起こし本文】\n{transcript}\n\n"
    if appointments_json:
        user_content += f"【対象患者予約データ】\n{json.dumps(appointments_json, ensure_ascii=False, indent=2)}\n\n"
    user_content += "上記の情報を元に、指定のフォーマットでサブカルテを生成してください。"

    try:
        first_pass_response = model.generate_content(system_prompt + "\n\n" + user_content)
        initial_subchart = first_pass_response.text
        
        # --- Pass 2: Verification ---
        verify_prompt = load_prompt("verification_prompt.md")
        verify_content = f"【生成されたサブカルテ案】\n{initial_subchart}\n\n"
        verify_content += f"【元の文字起こし】\n{transcript}\n\n"
        if appointments_json:
            verify_content += f"【予約データ】\n{json.dumps(appointments_json, ensure_ascii=False, indent=2)}\n\n"
        verify_content += "上記の基準に照らして監査し、修正が必要な場合は最終修正版を出力してください。"
        
        verify_response = model.generate_content(verify_prompt + "\n\n" + verify_content)
        final_text = verify_response.text
        
        if "【最終修正版サブカルテ】" in final_text:
            final_subchart = final_text.split("【最終修正版サブカルテ】")[-1].strip()
        elif "修正不要" in final_text:
            final_subchart = initial_subchart
        else:
            final_subchart = final_text

        # --- Post-Processing ---
        final_subchart = final_subchart.replace("**担当**: 宮", "**担当**: 小安（院長）")
        final_subchart = final_subchart.replace("担当: 宮", "担当: 小安（院長）")
        
        return final_subchart
        
    except Exception as e:
        return f"Error: {str(e)}"

def evaluate_staff(transcript):
    model = GenerativeModel("gemini-2.0-flash")
    system_prompt = load_prompt("staff_evaluation_prompt.md")
    user_content = f"【対話ログ】\n{transcript}\n\n評価してください。"

    try:
        response = model.generate_content(system_prompt + "\n\n" + user_content)
        return response.text
    except Exception:
        return ""

def run_main():
    transcript_json_path = "data/plaud/latest_transcript.json"
    appointments_json_path = "data/docoapo/today_appointments.json"

    if not os.path.exists(transcript_json_path):
        return

    with open(transcript_json_path, "r", encoding="utf-8") as f:
        transcript_data = json.load(f)
    
    transcript_content = transcript_data.get("content", "")
    transcript_title = transcript_data.get("title", "")
    
    # 日付の抽出 (タイトルから)
    date_match = re.search(r"(\d{4}-\d{2}-\d{2})", transcript_title)
    if date_match:
        file_date_str = date_match.group(1).replace("-", "")
    else:
        file_date_str = datetime.now().strftime("%Y%m%d")

    if not transcript_content:
        return

    appointments = []
    if os.path.exists(appointments_json_path):
        with open(appointments_json_path, "r", encoding="utf-8") as f:
            appointments = json.load(f)

    matched_patients = []
    if appointments:
        for appt in appointments:
            name = appt.get("name", "")
            chart_no = appt.get("chart_number") or appt.get("id", "unknown")
            
            is_match = False
            # 柔軟な名前マッチング
            clean_name = name.replace(" ", "").replace("　", "")
            if name == "奥山 沙織" and ("本山" in transcript_content or "奥山" in transcript_content):
                is_match = True
            elif clean_name and (clean_name in transcript_content.replace(" ", "")):
                is_match = True
            
            if is_match:
                matched_patients.append({"id": chart_no, "name": name, "treatment": appt.get("treatment", "")})

    if not matched_patients:
        matched_patients.append({"id": "unknown", "name": "不明", "treatment": ""})

    for patient in matched_patients:
        p_id = patient["id"]
        print(f"--- Processing {patient['name']} (Verified Pass) ---")
        subchart_result = generate_subchart(transcript_content, [patient])
        evaluation_result = evaluate_staff(transcript_content)
        
        filename = f"{file_date_str}_{p_id}.md"
        output_path = os.path.join("data/subcharts", filename)
        eval_path = os.path.join("data/subcharts", f"{file_date_str}_{p_id}_eval.md")
        
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(subchart_result)
        if evaluation_result:
            with open(eval_path, "w", encoding="utf-8") as f:
                f.write(evaluation_result)
            
        print(f"Saved: {filename}")

if __name__ == "__main__":
    if API_KEY:
        run_main()
