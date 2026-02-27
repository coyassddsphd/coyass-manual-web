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

        // ファイルを上書き保存
        fs.writeFileSync(filePath, newFullMarkdown, "utf-8");

        return NextResponse.json({
            success: true,
            updatedText: updatedText,
            message: "マニュアルが自動更新されました",
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
