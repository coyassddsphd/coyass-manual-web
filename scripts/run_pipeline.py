import subprocess
import os
import json

def run_step(name, command):
    print(f"--- [Step] {name} ---")
    try:
        result = subprocess.run(command, shell=True, check=True, capture_output=True, text=True)
        print(result.stdout)
        return True
    except subprocess.CalledProcessError as e:
        print(f"Error in {name}: {e.stderr}")
        return False

def main():
    # 1. Docoapoからの予約情報取得（ブラウザ連携を想定）
    # run_step("Fetching Docoapo Data", "python3 scripts/fetch_docoapo.py")
    
    # 2. PLAUDからの録音データ取得
    # run_step("Fetching PLAUD Transcript", "python3 scripts/fetch_plaud.py")
    
    # 3. サブカルテ生成
    run_step("Generating Sub-Chart", "python3 scripts/generate_subchart.py")

if __name__ == "__main__":
    main()
