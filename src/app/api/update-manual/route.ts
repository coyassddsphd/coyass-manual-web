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

        // --- AIによる特定セクションの修正 ---
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

        const systemPrompt = `あなたは歯科医院のマニュアル編集者です。
与えられた「修正前の文章」を、ユーザーの「要望コメント」および「画像（もしあれば）」に基づいて修正・改善してください。

【出力ルール】
1. 修正したセクションの文章「のみ」を出力してください。
2. 前後の挨拶、解説、Markdownコードブロック( \`\`\` )などは一切含めないでください。
3. 専門用語や口調、既存の構成との整合性を保ってください。`;

        const userContext = `
【修正前の文章】
${originalText}

【スタッフの要望コメント】
${comment}
`;

        console.log("Calling Gemini API (Section Update)...");
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
        let updatedSectionText = response.text() || "";

        // パース
        updatedSectionText = updatedSectionText
            .replace(/^```markdown\n?/, "")
            .replace(/^```\n?/, "")
            .replace(/\n?```$/, "")
            .trim();

        console.log("AI generation completed (Section). Length:", updatedSectionText.length);

        if (!updatedSectionText || updatedSectionText.length < 5) {
            throw new Error("AIが有効な回答を生成できませんでした。内容を具体的に記述してください。");
        }

        // --- 全文の再構築 ---
        // originalText を updatedSectionText で置換する
        // ※ originalText が正確に fullMarkdown 内に存在することを前提にする
        let newFullMarkdown = fullMarkdown;
        if (fullMarkdown.includes(originalText)) {
            newFullMarkdown = fullMarkdown.replace(originalText, updatedSectionText);
            console.log("Merged updated section into full manual.");
        } else {
            // 完全一致しない場合（まれ）、AIに再構成を頼む（フォールバック）が、トークン削減のため基本は置換
            console.warn("Exact match not found for replacement. Using fallback reconstruction.");
            newFullMarkdown = fullMarkdown + "\n\n" + updatedSectionText;
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
                message: `Section update via AI: ${comment.substring(0, 30)}...`,
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

        console.log("Manual (section) updated successfully on GitHub.");

        return NextResponse.json({
            success: true,
            updatedText: "指定箇所が正常に更新されました",
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
