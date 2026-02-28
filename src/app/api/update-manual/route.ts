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
        const fullMarkdown = Buffer.from(fileData.content, 'base64').toString('utf-8');

        // --- AIによるマニュアルの自己修復と更新 ---
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        const systemPrompt = `あなたは高度な歯科医院マニュアルの編集者です。
与えられた「マニュアル全文」の中から、指定された「修正対象セクション」を特定し、スタッフの「要望コメント」に基づいて内容を更新してください。

【添付ファイル（画像・PDF）の取り扱い】
- **情報の抽出と反映**: 添付された画像やPDF書類がある場合は、記載されている内容（数値、手順、図表、注釈など）を正確に読み取り、マニュアル形式の「文字情報」に変換して適切に反映させてください。

【最重要任務：自律的構造修復】
1. **章番号の不整合修正**: 第3章の下にある項目が「4.1」になっているなど、章番号とセクション番号の不整合を見つけたら、自動的に正しい番号（例: 3.1）に修正してください。
2. **フォーマットの維持**: Markdownの階層構造（##, ###）を崩さず、専門用語の統一感を保ってください。
3. **最新情報の保持**: 更新対象以外のセクションは、一字一句変えずにそのまま保持してください。
4. **自己検閲**: 保存前に「章番号は正しいか？」「重複はないか？」「日本語として自然か？」を再チェックし、完璧な状態で出力してください。

【出力ルール】
1. 修正・修復が完了した **マニュアルの「全文」** をMarkdown形式で出力してください。
2. 前後の挨拶、解説、Markdownコードブロック( \`\`\` )などは一切含めないでください。`;

        const userContext = `
【マニュアル全文】
${fullMarkdown}

【修正対象セクション（この付近を重点的に更新）】
${originalText}

【スタッフの要望コメント】
${comment}
`;

        console.log("Calling Gemini API (Full Manual Auto-Correction Mode)...");

        const callAIWithRetry = async (maxRetries = 2) => {
            for (let i = 0; i <= maxRetries; i++) {
                try {
                    const promptParts: any[] = [systemPrompt + userContext];
                    if (imageData && imageData.data && imageData.mimeType) {
                        promptParts.push({ inlineData: { data: imageData.data, mimeType: imageData.mimeType } });
                    }
                    return await model.generateContent(promptParts);
                } catch (err: any) {
                    if (err.message?.includes("429") && i < maxRetries) {
                        console.log(`Quota exceeded. Retrying in 10s... (Attempt ${i + 1}/${maxRetries})`);
                        await new Promise(resolve => setTimeout(resolve, 10000));
                        continue;
                    }
                    throw err;
                }
            }
            throw new Error("Retry limit reached");
        };

        const result = await callAIWithRetry();
        const response = await result.response;
        let newFullMarkdown = response.text() || "";

        // 不要なマークダウン装飾の除去
        newFullMarkdown = newFullMarkdown
            .replace(/^```markdown\n?/, "")
            .replace(/^```\n?/, "")
            .replace(/\n?```$/, "")
            .trim();

        console.log("AI generation completed (Full Healing). Length:", newFullMarkdown.length);

        if (!newFullMarkdown || newFullMarkdown.length < fullMarkdown.length * 0.5) {
            throw new Error("AIが有効なマニュアル全体を生成できませんでした。内容を保持したまま再試行してください。");
        }

        // --- GitHubへの保存 (最新のSHAを再取得して409 Conflictを回避) ---
        console.log("Refetching latest SHA to avoid 409 Conflict...");
        const latestFileRes = await fetch(apiUrl, {
            headers: {
                "Authorization": `Bearer ${githubToken}`,
                "Accept": "application/vnd.github.v3+json",
                "User-Agent": "Coyass-Manual-App"
            },
            cache: 'no-store'
        });

        if (!latestFileRes.ok) {
            throw new Error("保存直前の最新SHA取得に失敗しました");
        }

        const latestFileData = await latestFileRes.json();
        const latestSha = latestFileData.sha;

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
                sha: latestSha, // 最新のSHAを使用
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

        let details = errorMessage;
        if (errorMessage.includes("429")) {
            details = "現在AIの利用制限がかかっています。1分ほど待ってから再度お試しいただくか、Google AI Studioで有料プランへの切り替えをご検討ください。";
        } else if (errorMessage.includes("404")) {
            details = "AIモデルのメンテナンス中です。システム管理者にモデル設定の更新を依頼してください。";
        } else if (errorMessage.includes("409")) {
            details = "他のユーザーが同時に更新したため、競合が発生しました。一度ページをリロードして、もう一度お試しください。";
        }

        return NextResponse.json(
            { error: "処理中にエラーが発生しました", details: details, success: false },
            { status: 500 }
        );
    }
}
