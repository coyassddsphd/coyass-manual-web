import os
import csv
import json
import glob
from datetime import datetime
from generate_subchart import generate_subchart_context, evaluate_staff

def load_docoapo_history(csv_path):
    history = {}
    if not os.path.exists(csv_path):
        print(f"Error: {csv_path} not found.")
        return history
    
    with open(csv_path, mode='r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Docoapo CSV formats can vary, assuming common headers
            # Adjust mapping based on actual CSV content
            date_str = row.get('日付') or row.get('date')
            name = row.get('氏名') or row.get('name')
            pid = row.get('カルテ番号') or row.get('id')
            
            if date_str and name and pid:
                # Standardize date to YYYYMMDD
                try:
                    dt = datetime.strptime(date_str, '%Y/%m/%d')
                    key = (dt.strftime('%Y%m%d'), name)
                    history[key] = pid
                except:
                    continue
    return history

def process_historical_files(plaud_dir, docoapo_history):
    files = glob.glob(os.path.join(plaud_dir, "*.md"))
    print(f"Found {len(files)} historical transcripts.")
    
    for file_path in files:
        filename = os.path.basename(file_path)
        # Assuming filename starts with YYYY-MM-DD or similar
        # Extract date from Plaud filename or content
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
            
        # Placeholder for AI logic to extract date/patient name from transcript
        # and match with docoapo_history
        print(f"Processing {filename}...")
        # (AI Logic implementation will follow once sample data is seen)

if __name__ == "__main__":
    docoapo_csv = "data/docoapo/history.csv"
    plaud_history_dir = "data/plaud/history"
    
    history = load_docoapo_history(docoapo_csv)
    process_historical_files(plaud_history_dir, history)
