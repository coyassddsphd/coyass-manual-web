import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import path from "path";

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

        // マニュアルのパス
        const filePath = path.join(process.cwd(), "manual_blueprint.md");
        if (!fs.existsSync(filePath)) {
            return NextResponse.json(
                { error: "マニュアルファイルが見つかりません" },
                { status: 404 }
            );
        }

        const fullMarkdown = fs.readFileSync(filePath, "utf-8");

        // 指定されたテキストが存在するか確認
        if (!fullMarkdown.includes(originalText)) {
            return NextResponse.json(
                { error: "指定されたテキストが元のファイルに見つかりません。最新版に更新してからやり直してください。" },
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

        // Vercelなどの本番環境ではファイルシステムが読み取り専用のため、GitHub API経由で保存する
        const githubToken = process.env.GITHUB_TOKEN;

        if (githubToken) {
            // 1. まず現在のファイルのSHA（ハッシュ）を取得する
            const repoOwner = "drcoyass";
            const repoName = "coyasu-manual";
            const filePathInRepo = "manual_blueprint.md";
            const apiUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${filePathInRepo}`;

            const getFileRes = await fetch(apiUrl, {
                headers: {
                    "Authorization": `token ${githubToken}`,
                    "Accept": "application/vnd.github.v3+json",
                }
            });

            if (!getFileRes.ok) {
                console.error("GitHubからのファイル情報取得に失敗:", await getFileRes.text());
                throw new Error("GitHubからのファイル情報取得に失敗しました");
            }

            const fileData = await getFileRes.json();
            const fileSha = fileData.sha;

            // 2. 新しい内容をBase64にエンコードして上書きコミット（PUT）する
            // Node.jsのBufferを使ってUTF-8の文字列をBase64に変換
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

            // ローカルでも一応保存を試みる（ローカル開発用）
            try {
                fs.writeFileSync(filePath, newFullMarkdown, "utf-8");
            } catch (fsError) {
                console.log("ローカルファイルへの書き込みはスキップされました（Vercel環境など）");
            }

        } else {
            // GITHUB_TOKENがない場合は従来のローカルファイル保存のみ（ローカル開発環境用）
            fs.writeFileSync(filePath, newFullMarkdown, "utf-8");
        }

        return NextResponse.json({
            success: true,
            updatedText: updatedText,
            message: "マニュアルが自動更新され、クラウドに保存されました！反映まで1〜2分お待ちください。",
        });
    } catch (error: unknown) {
        console.error("API Error:", error);
        const errorMessage = error instanceof Error ? error.message : "不明なエラー";
        return NextResponse.json(
            { error: "サーバーエラーが発生しました", details: errorMessage },
            { status: 500 }
        );
    }
}
