
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    // 'path' または 'url' パラメータを受け取る（両方に対応）
    const rawParam = searchParams.get('path') || searchParams.get('url');
    const githubToken = process.env.GITHUB_TOKEN;
    const repoOwner = "coyassddsphd";
    const repoName = "coyass-manual-web";

    if (!rawParam) {
        return new Response("Missing URL/Path parameter", { status: 400 });
    }

    // URLがエンコードされている場合はデコードする
    const urlParam = decodeURIComponent(rawParam);

    try {
        // 外部URLの場合はそのまま取得
        if (urlParam.startsWith('http')) {
            const res = await fetch(urlParam, {
                headers: {
                    "Accept": "image/*, */*",
                    "User-Agent": "Coyass-Manual-App/1.0"
                },
                cache: 'no-store'
            });

            if (!res.ok) {
                console.error(`[Proxy] External URL failed: ${urlParam} -> ${res.status}`);
                return new Response(`External URL Error: ${res.status}`, { status: res.status });
            }

            const buffer = await res.arrayBuffer();
            const contentType = res.headers.get('Content-Type') || 'image/jpeg';

            return new Response(buffer, {
                headers: {
                    'Content-Type': contentType,
                    'Cache-Control': 'public, max-age=86400',
                    'X-Proxy-Source': 'External'
                },
            });
        }

        // GitHub内部パスの場合
        if (!githubToken) {
            console.error("[Proxy] GITHUB_TOKEN is not set");
            return new Response("Server configuration error: Missing GITHUB_TOKEN", { status: 500 });
        }

        // パスを正規化（先頭の/を除去、images/ プレフィックスを確認）
        const imagePath = urlParam.startsWith('/') ? urlParam.slice(1) : urlParam;

        console.log(`[Proxy] Attempting to fetch from GitHub API: ${imagePath}`);

        // GitHub Contents API を使って画像を取得
        const apiUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${imagePath}`;

        const apiRes = await fetch(apiUrl, {
            headers: {
                "Authorization": `token ${githubToken}`,
                "Accept": "application/vnd.github.v3+raw",
                "User-Agent": "Coyass-Manual-App/1.0"
            },
            cache: 'no-store'
        });

        if (apiRes.ok) {
            console.log(`[Proxy] GitHub API Success: ${imagePath}`);
            const buffer = await apiRes.arrayBuffer();
            const ext = imagePath.split('.').pop()?.toLowerCase() || 'jpg';
            const contentTypeMap: Record<string, string> = {
                'jpg': 'image/jpeg',
                'jpeg': 'image/jpeg',
                'png': 'image/png',
                'gif': 'image/gif',
                'webp': 'image/webp',
                'svg': 'image/svg+xml',
            };
            const contentType = contentTypeMap[ext] || 'image/jpeg';

            return new Response(buffer, {
                headers: {
                    'Content-Type': contentType,
                    'Cache-Control': 'public, max-age=3600',
                    'X-Proxy-Source': 'GitHub-Contents-API'
                },
            });
        }

        const apiErrorInfo = await apiRes.text();
        console.error(`[Proxy] GitHub API failed: ${imagePath} -> Status: ${apiRes.status}`, apiErrorInfo);

        // フォールバック: raw.githubusercontent.com を試す
        const rawUrl = `https://raw.githubusercontent.com/${repoOwner}/${repoName}/main/${imagePath}`;
        console.log(`[Proxy] Attempting fallback to Raw URL: ${rawUrl}`);

        const rawRes = await fetch(rawUrl, {
            headers: {
                "Authorization": `token ${githubToken}`,
                "User-Agent": "Coyass-Manual-App/1.0"
            },
            cache: 'no-store'
        });

        if (rawRes.ok) {
            console.log(`[Proxy] GitHub Raw Success: ${imagePath}`);
            const buffer = await rawRes.arrayBuffer();
            const contentType = rawRes.headers.get('Content-Type') || 'image/jpeg';
            return new Response(buffer, {
                headers: {
                    'Content-Type': contentType,
                    'Cache-Control': 'public, max-age=3600',
                    'X-Proxy-Source': 'GitHub-Raw'
                },
            });
        }

        console.error(`[Proxy] GitHub Raw failed: ${imagePath} -> Status: ${rawRes.status}`);

        return new Response(`Image not found: ${imagePath} (API: ${apiRes.status}, Raw: ${rawRes.status})`, { status: 404 });

    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : "Unknown error";
        console.error("[Proxy Error]", errMsg);
        return new Response(`Proxy Error: ${errMsg}`, { status: 500 });
    }
}
