import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Vercel Serverless Functionの設定
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

        // SDKの初期化 (公式SDKは apiKey を引数に取る)
        const genAI = new GoogleGenerativeAI(apiKey);
        const { originalText, comment, imageData } = await request.json();

        if (!originalText || !comment) {
            return NextResponse.json(
                { error: "オリジナルテキストとコメントは必須です" },
                { status: 400 }
            );
        }

        // --- GitHubからの原本取得 ---
        const githubToken = process.env.GITHUB_TOKEN;
        const repoOwner = "coyassddsphd";
        const repoName = "coyass-manual-web";
        const filePathInRepo = "manual_blueprint.md";

        if (!githubToken) {
            return NextResponse.json(
                { error: "GITHUB_TOKENが見つかりません。" },
                { status: 500 }
            );
        }

        const apiUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${filePathInRepo}`;
        const getFileRes = await fetch(apiUrl, {
            headers: {
                "Authorization": `Bearer ${githubToken}`,
                "Accept": "application/vnd.github.v3+json",
                "User-Agent": "Coyass-Manual-App"
            },
            cache: 'no-store'
        });

        if (!getFileRes.ok) {
            const errBody = await getFileRes.text();
            console.error("GitHub fetch failed:", { status: getFileRes.status, body: errBody });
            throw new Error(`GitHub接続エラー (${getFileRes.status}): ${errBody}`);
        }

        const fileData = await getFileRes.json();
        const fileSha = fileData.sha;
        const fullMarkdown = Buffer.from(fileData.content, 'base64').toString('utf-8');

        // --- AIによるマニュアル全体の再構成 ---
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

        const systemPrompt = `あなたは歯科医院のマニュアル管理エキスパートです。
ユーザーから提供された「現在のマニュアル全文」に対して、特定のセクションの更新指示（コメントおよび画像解析結果）を適用し、更新されたマニュアルの「全文」を返してください。

【更新のルール】
1. 指定されたセクション（「更新対象の元の文章」に合致する部分）を、ユーザーの「要望コメント」および「画像（もしあれば）」の内容に基づいて書き換えてください。
2. その他のセクションや、全体のMarkdown構造、画像リンクなどは一切変更せず、そのまま維持してください。
3. 出力は、更新後の「マニュアルの全文」のみとしてください。解説やコードブロック( \`\`\` )などは一切含めないでください。`;

        const userContext = `
【更新対象の元の文章】
${originalText}

【スタッフの要望コメント】
${comment}

【現在のマニュアル全文】
${fullMarkdown}
`;

        console.log("Calling Gemini API...");
        let result;
        if (imageData && imageData.data && imageData.mimeType) {
            result = await model.generateContent([
                systemPrompt + userContext,
                { inlineData: { data: imageData.data, mimeType: imageData.mimeType } }
            ]);
        } else {
            result = await model.generateContent(systemPrompt + userContext);
        }

        const response = await result.response;
        let newFullMarkdown = response.text() || "";

        // AI生成結果のパース強化
        newFullMarkdown = newFullMarkdown
            .replace(/^```markdown\n?/, "")
            .replace(/^```\n?/, "")
            .replace(/\n?```$/, "")
            .trim();

        console.log("AI generation completed. Length change:", { original: fullMarkdown.length, new: newFullMarkdown.length });

        if (!newFullMarkdown || newFullMarkdown.length < fullMarkdown.length * 0.3) {
            throw new Error("AIが不完全なデータを生成しました。全文が正しく出力されていない可能性があります。");
        }

        // --- GitHubへの保存 ---
        const encodedContent = Buffer.from(newFullMarkdown, 'utf-8').toString('base64');

        const updateRes = await fetch(apiUrl, {
            method: "PUT",
            headers: {
                "Authorization": `Bearer ${githubToken}`,
                "Accept": "application/vnd.github.v3+json",
                "Content-Type": "application/json",
                "User-Agent": "Coyass-Manual-App"
            },
            body: JSON.stringify({
                message: `Manual update via AI Integration: ${comment.substring(0, 30)}...`,
                content: encodedContent,
                sha: fileSha,
                branch: "main"
            })
        });

        if (!updateRes.ok) {
            const errText = await updateRes.text();
            console.error("GitHub update failed:", { status: updateRes.status, body: errText });
            throw new Error(`GitHub保存失敗: ${updateRes.status} ${errText}`);
        }

        console.log("Manual updated successfully on GitHub.");

        return NextResponse.json({
            success: true,
            updatedText: "マニュアル全体が正常に更新されました",
            message: "更新が成功し、保存されました！",
        });

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "不明なサーバーエラー";
        console.error("Critical API Error:", error);
        return NextResponse.json(
            { error: "処理中にエラーが発生しました", details: errorMessage, success: false },
            { status: 500 }
        );
    }
}
