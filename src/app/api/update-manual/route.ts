import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

// Vercel Serverless Functionの設定
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * テキストから空白や改行を除去して正規化する
 */
function normalize(text: string) {
    return text.replace(/\s+/g, "").trim();
}

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
        const repoName = "coyasu-manual-web";
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
                "Authorization": `token ${githubToken}`,
                "Accept": "application/vnd.github.v3+json",
            },
            cache: 'no-store'
        });

        if (!getFileRes.ok) {
            return NextResponse.json(
                { error: "GitHubからの原本取得に失敗しました。" },
                { status: 500 }
            );
        }

        const fileData = await getFileRes.json();
        const fileSha = fileData.sha;
        const fullMarkdown = Buffer.from(fileData.content, 'base64').toString('utf-8');

        // --- 文言の照合 (柔軟な検索) ---
        // 完全一致しない場合、空白や改行を無視して検索する
        const targetIndex = fullMarkdown.indexOf(originalText);

        if (targetIndex === -1) {
            console.log("完全一致しなかったため、正規化して再検索します");
            const normalizedOriginal = normalize(originalText);

            // 非常に重い処理にならないよう、ある程度のウィンドウで検索
            // 実際には originalText の長さに基づいてスライディングウィンドウで探す
            // ここでは簡易的に、送信された originalText が原本に含まれているか、
            // 多少の改行コードの違いがあっても見つけられるようにする
            const normalizedFull = normalize(fullMarkdown);
            if (!normalizedFull.includes(normalizedOriginal)) {
                return NextResponse.json(
                    { error: "指定されたセクションが見つかりません。マニュアルが他者によって大幅に書き換えられた可能性があります。一度ページをリロードしてください。" },
                    { status: 400 }
                );
            }

            // 正規化して見つかった場合でも、置換のために「正確な元の文字列」を特定する必要がある
            // (通常、このエラーは改行コードの \n 対 \r\n の違いなどで起こる)
            // ここでは originalText をベースに、置換ロジックを工夫する
            // 完全に特定できない場合は、一番近い部分を探す
        }

        // --- AIによるマルチモーダル解析とテキスト生成 ---
        const model = ai.getGenerativeModel({ model: "gemini-2.0-flash" });

        const prompt = `あなたは歯科医院のマニュアルを編集する優秀なAIアシスタントです。
以下の指示に従って、マニュアルを更新してください。

【指示】
1. スタッフの【要望コメント】を最優先に反映してください。
2. もし【画像データ】が提供されている場合、その画像内の文字情報、書類の内容、グラフ、表などを読み取り、マニュアルにふさわしい形式（文字やMarkdownの表など）に変換して組み込んでください。
3. 【元のマニュアル部分】をベースに、上記の内容を統合して、新しく書き直したテキストだけを出力してください。

【制約】
- Markdownの書式を維持してください。
- 解説、挨拶、コードブロック( \`\`\` )などは一切出力しないでください。変更後のテキストそのものだけを出力してください。

【元のマニュアル部分】
${originalText}

【スタッフの要望コメント】
${comment}`;

        let result;
        if (imageData && imageData.data && imageData.mimeType) {
            result = await model.generateContent([
                prompt,
                { inlineData: { data: imageData.data, mimeType: imageData.mimeType } }
            ]);
        } else {
            result = await model.generateContent(prompt);
        }

        const response = await result.response;
        let updatedText = response.text() || "";
        updatedText = updatedText.replace(/^```markdown\n?/, "").replace(/\n?```$/, "");

        if (!updatedText) {
            throw new Error("AIがテキストの生成に失敗しました");
        }

        // --- GitHubへの保存 (置換処理の強化) ---
        let newFullMarkdown: string;
        if (targetIndex !== -1) {
            // 完全一致で見つかった場合
            newFullMarkdown = fullMarkdown.substring(0, targetIndex) + updatedText + fullMarkdown.substring(targetIndex + originalText.length);
        } else {
            // 正規化で見つかっていた場合 (簡易的なフォールバック置換)
            const escaped = originalText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(escaped.replace(/\s+/g, '\\s+'), 'g');
            newFullMarkdown = fullMarkdown.replace(regex, updatedText);
        }

        const encodedContent = Buffer.from(newFullMarkdown, 'utf-8').toString('base64');

        const updateRes = await fetch(apiUrl, {
            method: "PUT",
            headers: {
                "Authorization": `token ${githubToken}`,
                "Accept": "application/vnd.github.v3+json",
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                message: `Update via AI: ${comment.substring(0, 30)}...`,
                content: encodedContent,
                sha: fileSha,
                branch: "main"
            })
        });

        if (!updateRes.ok) {
            throw new Error(`GitHub保存エラー: ${updateRes.status}`);
        }

        return NextResponse.json({
            success: true,
            updatedText: updatedText,
            message: "更新が成功し、保存されました！反映まで1分ほどお待ちください。",
        });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "不明なサーバーエラー";
        console.error("API Error:", error);
        return NextResponse.json(
            { error: "サーバーエラーが発生しました", details: errorMessage },
            { status: 500 }
        );
    }
}

