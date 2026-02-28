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

        const apiUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${path}`;

        const res = await fetch(apiUrl, {
            headers: {
                "Authorization": `Bearer ${githubToken}`,
                "Accept": "application/vnd.github.v3+json",
                "User-Agent": "Coyass-Manual-App"
            },
            cache: 'no-store'
        });

        if (!res.ok) {
            return new Response(`Error fetching from GitHub: ${res.status}`, { status: res.status });
        }

        const data = await res.json();

        // Base64デコード
        const content = Buffer.from(data.content, 'base64');

        // MIME Typeの決定
        const extension = path.split('.').pop()?.toLowerCase();
        let contentType = 'image/png';
        if (extension === 'jpg' || extension === 'jpeg') contentType = 'image/jpeg';
        if (extension === 'gif') contentType = 'image/gif';
        if (extension === 'webp') contentType = 'image/webp';
        if (extension === 'svg') contentType = 'image/svg+xml';

        return new Response(content, {
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
