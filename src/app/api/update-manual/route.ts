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

        const ai = new GoogleGenAI({ apiKey });
        // imageData: { data: string (base64), mimeType: string }
        const { originalText, comment, imageData } = await request.json();

        if (!originalText || !comment) {
            return NextResponse.json(
                { error: "オリジナルテキストとコメントは必須です" },
                { status: 400 }
            );
        }

        // --- GitHubからの原本取得 ---
        let fullMarkdown = "";
        let fileSha = "";
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
        fileSha = fileData.sha;
        fullMarkdown = Buffer.from(fileData.content, 'base64').toString('utf-8');

        if (!fullMarkdown.includes(originalText)) {
            return NextResponse.json(
                { error: "指定された元の文章が見つかりません。リロードして最新の状態を確認してください。" },
                { status: 400 }
            );
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
            // 画像がある場合のマルチモーダルプロンプト
            result = await model.generateContent([
                prompt,
                {
                    inlineData: {
                        data: imageData.data,
                        mimeType: imageData.mimeType
                    }
                }
            ]);
        } else {
            // テキストのみの場合
            result = await model.generateContent(prompt);
        }

        const response = await result.response;
        let updatedText = response.text() || "";
        updatedText = updatedText.replace(/^```markdown\n?/, "").replace(/\n?```$/, "");

        if (!updatedText) {
            return NextResponse.json(
                { error: "AIがテキストの生成に失敗しました" },
                { status: 500 }
            );
        }

        // --- GitHubへの保存 ---
        const newFullMarkdown = fullMarkdown.replace(originalText, updatedText);
        const encodedContent = Buffer.from(newFullMarkdown, 'utf-8').toString('base64');

        const updateRes = await fetch(apiUrl, {
            method: "PUT",
            headers: {
                "Authorization": `token ${githubToken}`,
                "Accept": "application/vnd.github.v3+json",
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                message: `Update via AI Vision by staff: ${comment.substring(0, 30)}...`,
                content: encodedContent,
                sha: fileSha,
                branch: "main"
            })
        });

        if (!updateRes.ok) {
            throw new Error("GitHubへのコミットに失敗しました");
        }

        return NextResponse.json({
            success: true,
            updatedText: updatedText,
            message: "画像解析とマニュアル更新が成功し、保存されました！",
        });
    } catch (error: any) {
        console.error("API Error:", error);
        return NextResponse.json(
            { error: "サーバーエラーが発生しました", details: error.message },
            { status: 500 }
        );
    }
}
