import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const path = searchParams.get('path');
        const githubToken = process.env.GITHUB_TOKEN;
        const repoOwner = "coyassddsphd";
        const repoName = "coyass-manual-web";

        if (!path) {
            return new Response("Path is required", { status: 400 });
        }

        if (!githubToken) {
            return new Response("GITHUB_TOKEN is missing", { status: 500 });
        }

        // 従来のContents APIではなく、Raw URLを使用してバイナリを直接取得する（高速・大容量対応）
        const rawUrl = `https://raw.githubusercontent.com/${repoOwner}/${repoName}/main/${path}`;

        const res = await fetch(rawUrl, {
            headers: {
                "Authorization": `token ${githubToken}`, // raw.githubusercontent.com はこの形式
                "User-Agent": "Coyass-Manual-App"
            },
            cache: 'no-store'
        });

        if (!res.ok) {
            // Rawがだめなら一応API経由を試す（fallback）
            const apiUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${path}`;
            const apiRes = await fetch(apiUrl, {
                headers: {
                    "Authorization": `Bearer ${githubToken}`,
                    "Accept": "application/vnd.github.v3+raw", // rawを指定するとバイナリが直接返る
                    "User-Agent": "Coyass-Manual-App"
                },
                cache: 'no-store'
            });

            if (!apiRes.ok) {
                return new Response(`Error fetching image from GitHub: ${apiRes.status}`, { status: apiRes.status });
            }

            return new Response(apiRes.body, {
                headers: {
                    'Content-Type': apiRes.headers.get('Content-Type') || 'image/png',
                    'Cache-Control': 'public, max-age=3600',
                },
            });
        }

        // MIME Typeの決定
        const extension = path.split('.').pop()?.toLowerCase();
        let contentType = 'image/png';
        if (extension === 'jpg' || extension === 'jpeg') contentType = 'image/jpeg';
        if (extension === 'gif') contentType = 'image/gif';
        if (extension === 'webp') contentType = 'image/webp';
        if (extension === 'svg') contentType = 'image/svg+xml';

        return new Response(res.body, {
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
            },
        });

    } catch (error) {
        console.error("Proxy Image Error:", error);
        return new Response("Internal Server Error", { status: 500 });
    }
}
