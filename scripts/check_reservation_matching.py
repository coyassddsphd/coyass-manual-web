import json
import os
from datetime import datetime

def check_reservation_matching(call_summary, docoapo_data):
    """
    電話の要約内容と予約データの突合を行い、矛盾があればアラートを生成する。
    """
    alerts = []
    
    # docoapo_data は [ { 'name': '...', 'time': '...', 'treatment': '...' }, ... ] 形式
    # call_summary は Gemini が生成した電話対応の要約
    
    # 簡易版：名前が一致する予約を探索
    for appt in docoapo_data:
        patient_name = appt.get('name')
        if patient_name and patient_name in call_summary:
            # 日時や処置内容の不整合チェック（将来的に LLM で行う）
            # 現状は「電話があったことを検知」という簡易アラート
            alerts.append({
                'type': 'MATCH',
                'message': '電話対応に関連する予約が見つかりました',
                'patient': patient_name,
                'details': f"予約内容: {appt.get('treatment')} ({appt.get('time')})"
            })
            
    # 名前が見つからない電話へのアラート
    if "患者名:" in call_summary:
        extracted_name = call_summary.split("患者名:")[1].split("\n")[0].strip()
        if not any(appt.get('name') == extracted_name for appt in docoapo_data):
            alerts.append({
                'type': 'MISSING_RESERVATION',
                'message': '電話の内容に対する予約登録が Docoapo に見当たりません',
                'patient': extracted_name
            })

    return alerts

def generate_alert_markdown(alerts):
    if not alerts:
        return "### ✅ 予約の不整合は見当たりません"
    
    md = "### ⚠️ 予約照合レポート\n\n"
    for alert in alerts:
        icon = "📌" if alert['type'] == 'MATCH' else "❌"
        md += f"- **{icon} {alert['type']}**: {alert['message']} (患者: {alert['patient']})\n"
        if 'details' in alert:
            md += f"  - {alert['details']}\n"
    return md

if __name__ == "__main__":
    # モックデータでの動作確認
    print("Reservation matching logic initialized.")
