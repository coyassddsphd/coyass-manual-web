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
        const githubToken = process.env.GITHUB_TOKEN || process.env.NEXT_PUBLIC_GITHUB_TOKEN;
        const repoFullName = process.env.NEXT_PUBLIC_GITHUB_REPO || "coyassddsphd/coyass-manual-web";
        const [repoOwner, repoName] = repoFullName.split("/");
        const filePathInRepo = "manual_blueprint.md";

        if (!githubToken) {
            console.error("GITHUB_TOKEN is missing in environment variables.");
            return NextResponse.json(
                { error: "GitHub連携のためのトークン(GITHUB_TOKEN)が設定されていません。" },
                { status: 500 }
            );
        }

        const apiUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${filePathInRepo}`;

        let newImagePath = "";

        // --- [NEW] 画像の物理保存処理 (imageDataがある場合) ---
        if (imageData && imageData.data && imageData.mimeType) {
            console.log("Image data detected. Uploading to GitHub...");
            const timestamp = Date.now();
            const extension = imageData.mimeType.split('/')[1] || 'jpg';
            const fileName = `uploaded_${timestamp}.${extension}`;
            // GitHubリポジトリのpublic/imagesディレクトリに保存 (プロキシのデフォルトパスに合わせる)
            const imagePathInRepo = `public/images/${fileName}`;
            const imageApiUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${imagePathInRepo}`;

            const uploadImageRes = await fetch(imageApiUrl, {
                method: "PUT",
                headers: {
                    "Authorization": `Bearer ${githubToken}`,
                    "Accept": "application/vnd.github.v3+json",
                    "Content-Type": "application/json",
                    "User-Agent": "Coyass-Manual-App"
                },
                body: JSON.stringify({
                    message: `Upload image: ${fileName}`,
                    content: imageData.data, // Base64そのままでOK
                    branch: "main"
                })
            });

            if (uploadImageRes.ok) {
                // proxy-image APIを通してGitHubから画像を取得するURLを生成
                newImagePath = `/api/proxy-image?path=${imagePathInRepo}`;
                console.log(`Image uploaded and proxied: ${newImagePath}`);
            } else {
                const errText = await uploadImageRes.text();
                console.error("Image upload failed:", errText);
                throw new Error(`画像のアップロードに失敗しました: ${errText}`);
            }
        }

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
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

        const systemPrompt = `あなたは高度な歯科医院マニュアルの編集者です。
与えられた「マニュアル全文」の中から、指定された「修正対象セクション」を特定し、スタッフの「要望コメント」に基づいて内容を更新してください。

【画像処理に関する重要ルール】
${newImagePath ? `- **新しい画像がアップロードされました**: 現在のセクション内にある画像タグ（![...]）のパスを、必ず \`${newImagePath}\` に書き換えてください。もし画像タグがない場合は、適切な場所に \`![イメージ](${newImagePath})\` を新設してください。` : "- 画像のパスは既存のものを**絶対に変更しないでください**。"}
- 画像パスは必ず \`/api/proxy-image?path=images/xxxxx.jpg\` の形式を維持してください。 \`/images/xxxxx.png\` や \`file:///...\` のようなパスを絶対に使用しないでください。既存の \`/api/proxy-image?path=...\` 形式のパスはそのまま保持してください。

【編集モードの自動切り替え】
- **個別項目修正モード**: 渡されたテキストが単一のセクション（例: H3のみ）の場合、その内容を忠実に更新してください。
- **章全体構造モード**: 渡されたテキストに章（H2）と複数の小項目（H3, H4）が含まれる場合、ユーザーの要望に応じて「項目の入れ替え」「新しい項目の新設」「不要な項目の統合」など、章全体の構成をダイナミックに最適化してください。

【情報の抽出と反映】
- 添付された画像データ（imageData）がある場合は、記載されている内容（数値、手順、図表、注釈など）を正確に読み取り、マニュアル形式の「文字情報」に変換して適切に反映させてください。

【最重要任務：自律的構造修復】
1. **章番号の不整合修正**: 第3章の下にある項目が「4.1」になっているなど、章番号とセクション番号の不整合を見つけたら、自動的に正しい番号（例: 3.1）に修正してください。
2. **フォーマットの維持**: Markdownの階層構造（##, ###）を崩さず、専門用語の統一感を保ってください。
3. **最新情報の保持**: 更新対象以外のセクションは、一字一句変えずにそのまま保持してください。

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

        console.log("Calling Gemini API (Image-Aware Mode)...");

        const callAIWithRetry = async (maxRetries = 2) => {
            for (let i = 0; i <= maxRetries; i++) {
                try {
                    const promptParts: (string | { inlineData: { data: string; mimeType: string } })[] = [systemPrompt + userContext];
                    if (imageData && imageData.data && imageData.mimeType) {
                        promptParts.push({ inlineData: { data: imageData.data, mimeType: imageData.mimeType } });
                    }
                    return await model.generateContent(promptParts);
                } catch (err: unknown) {
                    const errorMessage = err instanceof Error ? err.message : "";
                    if (errorMessage.includes("429") && i < maxRetries) {
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

        console.log("AI generation completed. New Image Path:", newImagePath);

        if (!newFullMarkdown || newFullMarkdown.length < fullMarkdown.length * 0.5) {
            throw new Error("AIが有効なマニュアル全体を生成できませんでした。");
        }

        // --- GitHubへの保存 (最新のSHAを再取得して409 Conflictを回避) ---
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
                message: `Section update via AI: ${comment.substring(0, 30)}...${newImagePath ? ' and Image Upload' : ''}`,
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
