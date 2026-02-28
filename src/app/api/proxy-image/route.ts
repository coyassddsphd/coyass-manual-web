
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    // 'path' または 'url' パラメータを受け取る（両方に対応）
    const urlParam = searchParams.get('path') || searchParams.get('url');
    const githubToken = process.env.GITHUB_TOKEN;
    const repoOwner = "coyassddsphd";
    const repoName = "coyass-manual-web";

    if (!urlParam) {
        return new Response("Missing URL/Path parameter", { status: 400 });
    }

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
                return new Response(`Error: ${res.status}`, { status: res.status });
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

        console.log(`[Proxy] Fetching GitHub image: ${imagePath}`);

        // GitHub Contents API を使って画像を取得（Accept: vnd.github.v3+raw でrawコンテンツ直接取得）
        const apiUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${imagePath}`;

        const apiRes = await fetch(apiUrl, {
            headers: {
                "Authorization": `Bearer ${githubToken}`,
                "Accept": "application/vnd.github.v3+raw",
                "User-Agent": "Coyass-Manual-App/1.0"
            },
            cache: 'no-store'
        });

        if (apiRes.ok) {
            const buffer = await apiRes.arrayBuffer();
            // ファイル拡張子からContent-Typeを判定
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

        console.error(`[Proxy] GitHub API failed: ${imagePath} -> ${apiRes.status}`);

        // フォールバック: raw.githubusercontent.com を試す
        const rawUrl = `https://raw.githubusercontent.com/${repoOwner}/${repoName}/main/${imagePath}`;
        const rawRes = await fetch(rawUrl, {
            headers: {
                "Authorization": `token ${githubToken}`,
                "User-Agent": "Coyass-Manual-App/1.0"
            },
            cache: 'no-store'
        });

        if (rawRes.ok) {
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

        return new Response(`Image not found: ${imagePath} (${apiRes.status})`, { status: 404 });

    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : "Unknown error";
        console.error("[Proxy Error]", errMsg);
        return new Response(`Proxy Error: ${errMsg}`, { status: 500 });
    }
}
