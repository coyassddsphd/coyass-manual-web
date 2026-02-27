import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

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

        // SDKの初期化
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

        // --- AIによるマニュアル全体の再構成 ---
        // 従来の「部分置換」ではなく「全体生成」に切り替えることで、照合エラーを回避
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

        let result;
        if (imageData && imageData.data && imageData.mimeType) {
            // 画像データがある場合はマルチモーダルで処理
            result = await model.generateContent([
                systemPrompt + userContext,
                { inlineData: { data: imageData.data, mimeType: imageData.mimeType } }
            ]);
        } else {
            // テキスト指示のみの場合
            result = await model.generateContent(systemPrompt + userContext);
        }

        const response = await result.response;
        let newFullMarkdown = response.text() || "";

        // 余計な記号を削除
        newFullMarkdown = newFullMarkdown.replace(/^```markdown\n?/, "").replace(/\n?```$/, "").trim();

        if (!newFullMarkdown || newFullMarkdown.length < fullMarkdown.length * 0.5) {
            // 生成された内容が極端に短い場合はエラー（AIが全文を返さなかった可能性）
            throw new Error("AIがマニュアル全文の生成に失敗したか、不完全なデータを返しました。");
        }

        // --- GitHubへの保存 ---
        const encodedContent = Buffer.from(newFullMarkdown, 'utf-8').toString('base64');

        const updateRes = await fetch(apiUrl, {
            method: "PUT",
            headers: {
                "Authorization": `token ${githubToken}`,
                "Accept": "application/vnd.github.v3+json",
                "Content-Type": "application/json",
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
            throw new Error(`GitHub保存失敗: ${updateRes.status} ${errText}`);
        }

        return NextResponse.json({
            success: true,
            updatedText: "マニュアル全体が正常に更新されました",
            message: "更新が成功し、保存されました！",
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
