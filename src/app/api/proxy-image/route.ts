import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const urlParam = searchParams.get('url') || searchParams.get('path'); // 両方のパラメータに対応
        const githubToken = process.env.GITHUB_TOKEN;
        const repoOwner = "coyassddsphd";
        const repoName = "coyass-manual-web";

        if (!urlParam) {
            return new Response("URL or Path is required", { status: 400 });
        }

        let targetUrl = "";
        let headers: Record<string, string> = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        };

        if (urlParam.startsWith('http')) {
            // 外部URLの場合
            targetUrl = urlParam;
        } else {
            // GitHub内部パスの場合
            if (!githubToken) {
                return new Response("GITHUB_TOKEN is missing for internal path", { status: 500 });
            }
            // Raw URLを優先（高速）
            targetUrl = `https://raw.githubusercontent.com/${repoOwner}/${repoName}/main/${urlParam}`;
            headers["Authorization"] = `token ${githubToken}`;
        }

        console.log(`Proxying image: ${targetUrl}`);

        const res = await fetch(targetUrl, {
            headers: headers,
            cache: 'no-store'
        });

        if (!res.ok) {
            // GitHub内部パスでRawが失敗した場合はAPIを試す
            if (!urlParam.startsWith('http')) {
                const apiUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${urlParam}`;
                const apiRes = await fetch(apiUrl, {
                    headers: {
                        "Authorization": `Bearer ${githubToken}`,
                        "Accept": "application/vnd.github.v3+raw",
                        "User-Agent": "Coyass-Manual-App"
                    },
                    cache: 'no-store'
                });
                if (apiRes.ok) {
                    return new Response(apiRes.body, {
                        headers: {
                            'Content-Type': apiRes.headers.get('Content-Type') || 'image/png',
                            'Cache-Control': 'public, max-age=86400',
                        },
                    });
                }
            }
            return new Response(`Error fetching image: ${res.status}`, { status: res.status });
        }

        const contentType = res.headers.get('Content-Type') || 'image/png';

        return new Response(res.body, {
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
            },
        });

    } catch (error) {
        console.error("Proxy Image Error:", error);
        return new Response("Internal Server Error", { status: 500 });
    }
}
