import os
import google.generativeai as genai
from google.generativeai import GenerativeModel

def optimize_system_prompt(raw_transcript, audit_feedback):
    """
    AIが監査結果を元に、自分自身のメインプロンプトを最適化（自己進化）させる。
    """
    model = GenerativeModel("gemini-1.5-pro") # 推論能力の高いProモデルを使用
    
    prompt_path = "prompts/plaud_dental_prompt.md"
    with open(prompt_path, "r", encoding="utf-8") as f:
        current_prompt = f.read()

    meta_prompt = f"""
あなたはプロンプトエンジニアです。
現在の歯科用AIプロンプトを、実際の失敗事例（監査フィードバック）に基づいて改善・更新してください。

### 現在のプロンプト
```markdown
{current_prompt}
```

### 失敗事例と監査フィードバック
{audit_feedback}

### 元の文字起こし
{raw_transcript}

### 改善指示
1. 特に「用語マッピング」セクションが不足している場合は、今回の誤変換を元に新しいルールを追加してください。
2. 指示が曖昧でミスを招いた場合は、ガイドラインをより具体的に書き換えてください。
3. 出力形式は、更新されたプロンプトの「全文」のみを出力してください。
"""

    try:
        response = model.generate_content(meta_prompt)
        new_prompt = response.text
        
        # プロンプトファイルを上書き更新
        with open(prompt_path, "w", encoding="utf-8") as f:
            f.write(new_prompt)
        print("System prompt successfully evolved and updated.")
        return True
    except Exception as e:
        print(f"Failed to evolve prompt: {e}")
        return False

if __name__ == "__main__":
    # テスト用
    print("Prompt optimizer module ready.")
