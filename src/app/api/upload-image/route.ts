import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
    try {
        const { imageData, imagePath, comment } = await request.json();

        if (!imageData || !imagePath) {
            return NextResponse.json({ error: "画像データと保存パスは必須です" }, { status: 400 });
        }

        const githubToken = process.env.GITHUB_TOKEN;
        const repoOwner = "coyassddsphd";
        const repoName = "coyass-manual-web";

        if (!githubToken) {
            return NextResponse.json({ error: "GITHUB_TOKENが設定されていません" }, { status: 500 });
        }

        // --- 既存ファイルのSHAを取得 (上書き用) ---
        const apiUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${imagePath}`;

        let sha: string | undefined;
        try {
            const getFileRes = await fetch(apiUrl, {
                headers: {
                    "Authorization": `token ${githubToken}`,
                    "Accept": "application/vnd.github.v3+json",
                },
                cache: 'no-store'
            });
            if (getFileRes.ok) {
                const fileData = await getFileRes.json();
                sha = fileData.sha;
            }
        } catch (e) {
            console.log("新規ファイルとして作成します");
        }

        // --- GitHubへアップロード ---
        const updateRes = await fetch(apiUrl, {
            method: "PUT",
            headers: {
                "Authorization": `token ${githubToken}`,
                "Accept": "application/vnd.github.v3+json",
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                message: `Image updated: ${comment || "User upload"}`,
                content: imageData, // Base64
                sha: sha,
                branch: "main"
            })
        });

        if (!updateRes.ok) {
            const errText = await updateRes.text();
            throw new Error(`GitHubアップロード失敗: ${updateRes.status} ${errText}`);
        }

        return NextResponse.json({
            success: true,
            message: "画像が正常にアップロードされました！反映まで数分かかる場合があります。"
        });

    } catch (error: any) {
        console.error("Upload Image Error:", error);
        return NextResponse.json(
            { error: "アップロードに失敗しました", details: error.message },
            { status: 500 }
        );
    }
}
