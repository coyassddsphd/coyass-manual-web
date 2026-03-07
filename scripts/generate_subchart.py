import os
import json
from datetime import datetime
import re
import requests


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

# if API_KEY:
#     genai.configure(api_key=API_KEY)


def load_prompt(filename):
    prompt_path = os.path.join("prompts", filename)
    if os.path.exists(prompt_path):
        with open(prompt_path, "r", encoding="utf-8") as f:
            return f.read()
    return ""

import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Gemini API via IP bypass
GEMINI_IP = "142.251.39.138" # Google API IP
GEMINI_HOST = "generativelanguage.googleapis.com"

import socket

def call_gemini_api(system_prompt, user_content):
    # Determine the base URL based on DNS availability
    current_host = GEMINI_HOST
    try:
        socket.gethostbyname(GEMINI_HOST)
        base_url = f"https://{GEMINI_HOST}"
    except socket.gaierror:
        print(f"DNS failure for {GEMINI_HOST}. Using IP fallback: {GEMINI_IP}")
        base_url = f"https://{GEMINI_IP}"

    url = f"{base_url}/v1beta/models/gemini-2.0-flash:generateContent?key={API_KEY}"
    headers = {
        "Content-Type": "application/json",
        "Host": GEMINI_HOST
    }
    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [{"text": system_prompt + "\n\n" + user_content}]
            }
        ],
        "generationConfig": {
            "temperature": 0.2,
            "topP": 0.8,
            "topK": 40
        }
    }
    
    try:
        # If using IP, disable certificate verification
        verify = (base_url == f"https://{GEMINI_HOST}")
        response = requests.post(url, headers=headers, json=payload, verify=verify, timeout=60)
        
        if response.status_code == 200:
            res_json = response.json()
            return res_json['candidates'][0]['content']['parts'][0]['text']
        else:
            return f"Error: {response.status_code} - {response.text}"
    except Exception as e:
        return f"Exception: {str(e)}"

def load_context():
    context_path = os.path.join("data", "clinic_context.json")
    if os.path.exists(context_path):
        with open(context_path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}

def segment_transcript(transcript):
    """
    分かち書きプロンプトを使用して、文字起こしを患者ごとに分割する。
    """
    segment_prompt = load_prompt("segmentation_prompt.md")
    if not segment_prompt:
        return [{"patient_name": "不明", "content": transcript, "reason": "No segmentation prompt found"}]
    
    result = call_gemini_api(segment_prompt, f"【文字起こし全文】\n{transcript}")
    
    # JSON抽出
    try:
        # ```json ... ``` のタグを剥がす
        json_match = re.search(r"```json\s*(.*?)\s*```", result, re.DOTALL)
        if json_match:
            return json.loads(json_match.group(1))
        return json.loads(result)
    except Exception as e:
        print(f"Segmentation JSON parse error: {e}")
        return [{"patient_name": "不明", "content": transcript, "reason": "Parse error"}]

def generate_subchart(transcript, appointments_json=None):
    # --- Context Loading ---
    clinic_context = load_context()
    context_str = json.dumps(clinic_context, ensure_ascii=False, indent=2)

    # --- Pass 1: Generation ---
    system_prompt = load_prompt("plaud_dental_prompt.md")
    user_content = f"【医院用共通コンテキスト（材料・用語）】\n{context_str}\n\n"
    user_content += f"【文字起こし本文】\n{transcript}\n\n"
    if appointments_json:
        user_content += f"【対象患者予約データ】\n{json.dumps(appointments_json, ensure_ascii=False, indent=2)}\n\n"
    user_content += "上記の情報を元に、指定のフォーマットでサブカルテを生成してください。"

    initial_subchart = call_gemini_api(system_prompt, user_content)
    if initial_subchart.startswith("Error"):
        return initial_subchart
        
    # --- Pass 2: Verification ---
    verify_prompt = load_prompt("verification_prompt.md")
    verify_content = f"【生成されたサブカルテ案】\n{initial_subchart}\n\n"
    verify_content += f"【元の文字起こし】\n{transcript}\n\n"
    if appointments_json:
        verify_content += f"【予約データ】\n{json.dumps(appointments_json, ensure_ascii=False, indent=2)}\n\n"
    verify_content += "上記の基準に照らして監査し、修正が必要な場合は最終修正版を出力してください。"
    
    final_text = call_gemini_api(verify_prompt, verify_content)
    if final_text.startswith("Error"):
        return final_text
    
    # 監査結果から最終版を抽出
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

def evaluate_staff(transcript):
    system_prompt = load_prompt("staff_evaluation_prompt.md")
    user_content = f"【対話ログ】\n{transcript}\n\n評価してください。"
    return call_gemini_api(system_prompt, user_content)


def run_batch(input_dir="data/plaud/history", output_dir="data/subcharts"):
    if not os.path.exists(input_dir):
        print(f"Input directory {input_dir} not found.")
        return

    os.makedirs(output_dir, exist_ok=True)
    files = [f for f in os.listdir(input_dir) if f.endswith(".json")]
    print(f"Found {len(files)} files in {input_dir}")

    for filename in sorted(files):
        print(f"Processing {filename}...")
        with open(os.path.join(input_dir, filename), "r", encoding="utf-8") as f:
            data = json.load(f)
        
        transcript_content = data.get("content", "")
        if not transcript_content:
            continue
            
        # ファイル名から日付を取得 (例: 260304_ID.json -> 20260304)
        date_str = filename.split("_")[0]
        if len(date_str) == 6:
            full_date_str = "20" + date_str
        else:
            full_date_str = date_str
            
        # 予約データの探索 (あれば)
        appointments = []
        # 日付に一致する予約ファイルがあれば読み込む（将来的な拡張用）
        
        # 患者リストの作成
        # 履歴データの場合は予約データとの照合が難しいため、
        # 文字起こしから抽出するか、あるいは「複数患者」として処理する
        print(f"Generating subchart for {full_date_str}...")
        subchart_result = generate_subchart(transcript_content, None)
        evaluation_result = evaluate_staff(transcript_content)
        
        save_name = f"{full_date_str}_{filename.split('_')[1].split('.')[0]}.md"
        with open(os.path.join(output_dir, save_name), "w", encoding="utf-8") as f:
            f.write(subchart_result)
        if evaluation_result:
            eval_name = save_name.replace(".md", "_eval.md")
            with open(os.path.join(output_dir, eval_name), "w", encoding="utf-8") as f:
                f.write(evaluation_result)
        
        print(f"Saved: {save_name}")

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
    file_date_str = date_match.group(1).replace("-", "") if date_match else datetime.now().strftime("%Y%m%d")

    if not transcript_content:
        return

    # --- Segmentation Pass ---
    print("Starting transcript segmentation...")
    segments = segment_transcript(transcript_content)
    print(f"Divided into {len(segments)} segments.")

    # --- Appointment Loading ---
    appointments = []
    if os.path.exists(appointments_json_path):
        with open(appointments_json_path, "r", encoding="utf-8") as f:
            appointments = json.load(f)

    # --- Subchart Generation Pass ---
    for segment in segments:
        seg_content = segment.get("content", "")
        seg_patient = segment.get("patient_name", "不明")
        
        # 予約データとのマッチング
        matched_patients = []
        if appointments:
            for appt in appointments:
                name = appt.get("name", "")
                if name in seg_patient or (name and name in seg_content):
                    chart_no = appt.get("chart_number") or appt.get("id") or "unknown"
                    matched_patients.append({"id": chart_no, "name": name, "treatment": appt.get("treatment", "")})
        
        if not matched_patients:
            matched_patients.append({"id": f"seg_{segments.index(segment)}", "name": seg_patient, "treatment": ""})

        for patient in matched_patients:
            p_id = patient["id"]
            print(f"--- Processing {patient['name']} (Segmented) ---")
            subchart_result = generate_subchart(seg_content, [patient])
            evaluation_result = evaluate_staff(seg_content)
            
            # 保存
            output_dir = "data/subcharts"
            os.makedirs(output_dir, exist_ok=True)
            filename = f"{file_date_str}_{p_id}.md"
            with open(os.path.join(output_dir, filename), "w", encoding="utf-8") as f:
                f.write(subchart_result)
            if evaluation_result:
                with open(os.path.join(output_dir, f"{file_date_str}_{p_id}_eval.md"), "w", encoding="utf-8") as f:
                    f.write(evaluation_result)
            
            print(f"Saved: {filename}")

if __name__ == "__main__":
    import sys
    if API_KEY:
        if len(sys.argv) > 1 and sys.argv[1] == "--batch":
            run_batch()
        else:
            run_main()


