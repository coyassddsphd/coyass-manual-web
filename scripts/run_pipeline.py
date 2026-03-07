import subprocess
import os
import sys
import json
import asyncio

# Ensure the parent directory is in sys.path so 'scripts.xyz' can be imported
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

async def run_step_async(name, coro):
    print(f"--- [Step] {name} ---")
    try:
        await coro
        return True
    except Exception as e:
        print(f"Error in {name}: {e}")
        return False

def run_step(name, command):
    print(f"--- [Step] {name} ---")
    try:
        result = subprocess.run(command, shell=True, check=True, capture_output=True, text=True)
        print(result.stdout)
        return True
    except subprocess.CalledProcessError as e:
        print(f"Error in {name}: {e.stderr}")
        return False

async def main():
    # 1. Docoapoからの予約情報取得
    from scripts.fetch_docoapo import fetch_docoapo_data
    await run_step_async("Fetching Docoapo Data", fetch_docoapo_data())
    
    # 2. Tobila Phoneからの録音データ取得
    from scripts.fetch_tobila_phone import process_tobila
    await run_step_async("Processing Tobila Phone Recordings", process_tobila())
    
    # 3. PLAUDからの録音データ取得（既存の同期スクリプト）
    run_step("Fetching PLAUD Transcript", "python3 scripts/fetch_plaud_all.py")
    
    # 4. サブカルテ生成
    run_step("Generating Sub-Chart", "python3 scripts/generate_subchart.py")

if __name__ == "__main__":
    asyncio.run(main())
