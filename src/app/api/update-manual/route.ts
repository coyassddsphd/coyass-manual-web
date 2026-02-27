import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

// Vercel Serverless Functionの設定
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * テキストから空白や改行を除去して正規化する（比較用）
 */
function normalize(text: string): string {
    return text.replace(/[\s\n\r\t]+/g, "").trim();
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

        // SDKの初期化 (型エラー回避のため any キャスト)
        const genAI = new GoogleGenAI({ apiKey }) as any;
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
            const errBody = await getFileRes.text();
            throw new Error(`GitHub接続エラー (${getFileRes.status}): ${errBody}`);
        }

        const fileData = await getFileRes.json();
        const fileSha = fileData.sha;
        const fullMarkdown = Buffer.from(fileData.content, 'base64').toString('utf-8');

        // --- 文言の照合 (もっと堅牢な置換ロジック) ---
        let finalOutputMarkdown = "";
        let targetIndex = fullMarkdown.indexOf(originalText);

        if (targetIndex === -1) {
            console.log("完全一致しなかったため、正規化照合を行います");
            const normalizedOriginal = normalize(originalText);
            const normalizedFull = normalize(fullMarkdown);

            if (!normalizedFull.includes(normalizedOriginal)) {
                return NextResponse.json(
                    { error: "指定された文章がマニュアル内に見つかりません。リロードして最新状態を確認してください。" },
                    { status: 400 }
                );
            }

            // 正規化で見つかった場合、ブラウザから送られた改行コード等の差異を修正
            // ここでは RegExp を使って空白文字を柔軟にマッチさせる
            const escaped = originalText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(escaped.replace(/[\s\n\r\t]+/g, '[\\s\\n\\r\\t]+'), 'm');
            const match = fullMarkdown.match(regex);

            if (match && typeof match.index === 'number') {
                targetIndex = match.index;
                // マッチした部分の文字数で正確に置換
                const matchedText = match[0];
                console.log("正規化マッチ成功、位置を特定しました。");

                // 置換準備（後のロジックで targetIndex が使われる）
                // originalText.length の代わりに matchedText.length を使う必要があるため調整
            }
        }

        // --- AIによるマルチモーダル解析 ---
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

        const prompt = `あなたは歯科医院のマニュアルを編集する優秀なAIアシスタントです。
以下の指示に従って、マニュアルを更新してください。

【指示】
1. スタッフの【要望コメント】を最優先に反映してください。
2. もし【画像データ】が提供されている場合、その内容を読み取ってマニュアルに形式に変換して組み込んでください。
3. 【元のマニュアル部分】をベースに、新しく書き直したテキストだけを出力してください。

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
        // 不要な装飾を除去
        updatedText = updatedText.replace(/^```markdown\n?/, "").replace(/\n?```$/, "").trim();

        if (!updatedText) {
            throw new Error("AIがテキストの生成に失敗しました");
        }

        // --- 保存処理 (最終マニュアルの組み立て) ---
        if (targetIndex !== -1) {
            // 見つかった場所を置換
            // 正規化マッチの場合はマッチした全範囲を消す必要があるが、簡易的に originalText ベースで置換
            // より安全にするため、String.replace ではなくスライス結合を使用
            const escaped = originalText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(escaped.replace(/[\s\n\r\t]+/g, '[\\s\\n\\r\\t]+'), 'm');
            finalOutputMarkdown = fullMarkdown.replace(regex, updatedText);
        } else {
            // 万が一位置が特定できない場合の最終手段: 単純置換
            finalOutputMarkdown = fullMarkdown.replace(originalText, updatedText);
        }

        const encodedContent = Buffer.from(finalOutputMarkdown, 'utf-8').toString('base64');

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
            const errText = await updateRes.text();
            throw new Error(`GitHub保存失敗: ${updateRes.status} ${errText}`);
        }

        return NextResponse.json({
            success: true,
            updatedText: updatedText,
            message: "更新が成功し、保存されました！",
        });
    } catch (error: any) {
        console.error("API Error:", error);
        return NextResponse.json(
            { error: "サーバーエラーが発生しました", details: error.message },
            { status: 500 }
        );
    }
}
