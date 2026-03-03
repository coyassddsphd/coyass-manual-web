import os
import shutil
import subprocess

def get_dir_size(path):
    total = 0
    try:
        for entry in os.scandir(path):
            if entry.is_file():
                total += entry.stat().st_size
            elif entry.is_dir():
                total += get_dir_size(entry.path)
    except (PermissionError, FileNotFoundError):
        pass
    return total

def format_size(size):
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if size < 1024:
            return f"{size:.2f} {unit}"
        size /= 1024

def cleanup_dev_artifacts(root_dir):
    print(f"--- Cleaning up dev artifacts in {root_dir} ---")
    
    # 削除対象のパターン
    targets = [
        ".next",
        "node_modules", # 注意：これを消すと npm install が必要
        "__pycache__",
        ".pytest_cache",
        "dist",
        "build"
    ]
    
    freed_space = 0
    for root, dirs, files in os.walk(root_dir):
        for d in list(dirs):
            if d in targets:
                target_path = os.path.join(root, d)
                size = get_dir_size(target_path)
                print(f"Removing {target_path} ({format_size(size)})...")
                try:
                    shutil.rmtree(target_path)
                    freed_space += size
                except Exception as e:
                    print(f"Failed to remove {target_path}: {e}")
                dirs.remove(d) # これ以上深く潜らない
                
    return freed_space

def main():
    base_dir = os.path.expanduser("~/kaihatsu/crinicdrmanual/web_app")
    
    print("Disk Space Management Script")
    print("----------------------------")
    
    # 1. プロジェクト内のクリーンアップ
    space_saved = cleanup_dev_artifacts(base_dir)
    print(f"\nTotal space freed in project: {format_size(space_saved)}")
    
    # 2. NPM キャッシュの確認（ユーザーにコマンドを推奨）
    print("\n--- Additional Recommendations ---")
    print("To clear npm cache, run: npm cache clean --force")
    print("To find other large files in home directory, run: du -sh ~/* | sort -hr | head -n 10")

if __name__ == "__main__":
    main()
