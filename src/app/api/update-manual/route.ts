import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

// Vercel Serverless Functionの設定
// 確実に動的に実行させ、AIの回答待ちのタイムアウト（最大60秒）を許容する
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return NextResponse.json(
                { error: "APIキーが設定されていません。システム管理者に連絡してください。" },
                { status: 500 }
            );
        }

        const ai = new GoogleGenAI({ apiKey });
        const { originalText, comment } = await request.json();

        if (!originalText || !comment) {
            return NextResponse.json(
                { error: "オリジナルテキストとコメントは必須です" },
                { status: 400 }
            );
        }

        // --- 1. マニュアルの現在のテキストを取得 ---
        let fullMarkdown = "";
        let fileSha = ""; // 後でGitHubコミット用に使う
        const githubToken = process.env.GITHUB_TOKEN;
        const repoOwner = "drcoyass";
        const repoName = "coyasu-manual";
        const filePathInRepo = "manual_blueprint.md";

        if (!githubToken) {
            return NextResponse.json(
                { error: "システム設定エラー：GITHUB_TOKENが見つかりません。VercelのEnvironment Variablesを確認してください。" },
                { status: 500 }
            );
        }

        // 常にGitHub API経由で直接ファイルを取得する (VercelのEROFS制限を完全回避)
        const apiUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${filePathInRepo}`;
        const getFileRes = await fetch(apiUrl, {
            headers: {
                "Authorization": `token ${githubToken}`,
                "Accept": "application/vnd.github.v3+json",
            },
            cache: 'no-store' // 常に最新を取得
        });

        if (!getFileRes.ok) {
            console.error("GitHubからのファイル情報取得に失敗:", await getFileRes.text());
            return NextResponse.json(
                { error: "通信エラー：GitHubからのマニュアル原本の取得に失敗しました。" },
                { status: 500 }
            );
        }

        const fileData = await getFileRes.json();
        fileSha = fileData.sha;
        // GitHubのcontentはBase64エンコードされているのでデコードする
        fullMarkdown = Buffer.from(fileData.content, 'base64').toString('utf-8');

        // 指定されたテキストが存在するか確認
        if (!fullMarkdown.includes(originalText)) {
            return NextResponse.json(
                { error: "指定された元の文章が見つかりません。別の人が既に編集したか、画面が古くなっています。リロードしてください。" },
                { status: 400 }
            );
        }

        // Gemini APIでAIアシスタントに修正を依頼
        const prompt = `あなたは歯科医院のマニュアルを編集する優秀なAIアシスタントです。
以下の【元のマニュアルの該当部分】に対して、【スタッフのコメント（要望）】の内容を反映させて、適切に書き直した新しいテキストだけを出力してください。
Markdownの書式や箇条書きの階層構造は崩さずに維持してください。
解説や「わかりました」などの挨拶、さらにマークダウンのコードブロック行（\`\`\`markdown など）は一切不要です。変更後のテキストそのものだけを直接出力してください。

【元のマニュアルの該当部分】
${originalText}

【スタッフのコメント（要望）】
${comment}`;

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
        });

        let updatedText = response.text || "";
        // 余分なマークダウン装飾を剥がす
        updatedText = updatedText.replace(/^```markdown\n?/, "").replace(/\n?```$/, "");

        if (!updatedText) {
            return NextResponse.json(
                { error: "AIがテキストの生成に失敗しました" },
                { status: 500 }
            );
        }

        // 元のファイルの該当部分を置換
        const newFullMarkdown = fullMarkdown.replace(originalText, updatedText);

        // 新しい内容をBase64にエンコードして上書きコミット（PUT）する
        const encodedContent = Buffer.from(newFullMarkdown, 'utf-8').toString('base64');

        const updateRes = await fetch(apiUrl, {
            method: "PUT",
            headers: {
                "Authorization": `token ${githubToken}`,
                "Accept": "application/vnd.github.v3+json",
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                message: `Update manual via AI by staff comment: ${comment.substring(0, 30)}...`,
                content: encodedContent,
                sha: fileSha,
                branch: "main"
            })
        });

        if (!updateRes.ok) {
            console.error("GitHubへのコミットに失敗:", await updateRes.text());
            throw new Error("GitHubへのコミット（保存）に失敗しました");
        }

        console.log("GitHub API経由での保存完了（完全クラウド実行）");

        return NextResponse.json({
            success: true,
            updatedText: updatedText,
            message: "マニュアルが自動更新され、クラウドに保存されました！反映まで1〜2分お待ちください。",
        });
    } catch (error: any) {
        console.error("=== API CRITICAL ERROR ===", error);

        // Errorオブジェクトの全てを出力して原因を探る
        let errorMessage = "不明なエラー";
        let errorStack = "";

        if (error instanceof Error) {
            errorMessage = error.message;
            errorStack = error.stack || "";
        } else if (typeof error === 'string') {
            errorMessage = error;
        } else {
            errorMessage = JSON.stringify(error);
        }

        return NextResponse.json(
            {
                error: "サーバーエラーが発生しました",
                details: `${errorMessage}\n${errorStack}`.substring(0, 500)
            },
            { status: 500 }
        );
    }
}
