
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
            console.log(`[Proxy] Proxying external URL: ${urlParam}`);
            const res = await fetch(urlParam, {
                headers: {
                    "Accept": "image/*, */*",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
                    "Referer": "https://dr-coyass.com/" // 自分のドメインをRefererとして送ることで制限回避を試みる
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

        // --- GitHub内部パスの場合 ---
        if (!githubToken) {
            console.error("[Proxy] GITHUB_TOKEN is not set");
            return new Response("Server configuration error: Missing GITHUB_TOKEN", { status: 500 });
        }

        // パス候補の生成 (GitHubリポジトリ上の正確な位置を探索)
        // 1. 指定されたパスそのもの
        // 2. public/images/ を付与
        // 3. images/ を付与
        // 4. 重複を削った純粋なファイル名のみにして再構築

        const rawPath = urlParam;
        const fileName = urlParam.split('/').pop() || "";

        const pathCandidates = Array.from(new Set([
            rawPath, // そのまま
            `public/images/${fileName}`,
            `images/${fileName}`,
            `public/images/${rawPath.replace(/^(public\/|images\/|\/)/g, '')}`,
            rawPath.replace(/^\//, '')
        ])).filter(p => p && p.length > 0);

        console.log(`[Proxy] Start searching candidates for: ${urlParam}`);

        for (const imagePath of pathCandidates) {
            console.log(`[Proxy] Testing candidate: ${imagePath}`);
            const apiUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${imagePath}`;

            // 第1試行: JSON/Base64デコード方式 (最も安定)
            try {
                const jsonRes = await fetch(apiUrl, {
                    headers: {
                        "Authorization": `token ${githubToken}`,
                        "Accept": "application/vnd.github.v3+json",
                        "User-Agent": "Coyass-Manual-App/1.0"
                    },
                    cache: 'no-store'
                });

                if (jsonRes.ok) {
                    const data = await jsonRes.json();
                    if (data.content) {
                        console.log(`[Proxy] SUCCESS! Found at: ${imagePath} (via JSON)`);
                        const buffer = Buffer.from(data.content, 'base64');
                        const ext = imagePath.split('.').pop()?.toLowerCase() || 'jpg';
                        const contentTypeMap: Record<string, string> = {
                            'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
                            'gif': 'image/gif', 'webp': 'image/webp', 'svg': 'image/svg+xml'
                        };
                        return new Response(buffer, {
                            headers: {
                                'Content-Type': contentTypeMap[ext] || 'image/jpeg',
                                'Cache-Control': 'public, max-age=86400', // 24時間キャッシュ
                                'X-Resolved-Path': imagePath,
                                'X-Proxy-Method': 'JSON-Base64'
                            },
                        });
                    }
                } else {
                    console.log(`[Proxy] Candidate failed (JSON): ${imagePath} -> Status: ${jsonRes.status}`);
                }
            } catch (e) {
                console.error(`[Proxy] JSON Exception for ${imagePath}:`, e);
            }

            // 第2試行: raw取得 (念のため)
            try {
                const rawRes = await fetch(apiUrl, {
                    headers: {
                        "Authorization": `token ${githubToken}`,
                        "Accept": "application/vnd.github.v3+raw",
                        "User-Agent": "Coyass-Manual-App/1.0"
                    },
                    cache: 'no-store'
                });

                if (rawRes.ok) {
                    console.log(`[Proxy] SUCCESS! Found at: ${imagePath} (via Raw)`);
                    const buffer = await rawRes.arrayBuffer();
                    const ext = imagePath.split('.').pop()?.toLowerCase() || 'jpg';
                    const contentTypeMap: Record<string, string> = {
                        'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
                        'gif': 'image/gif', 'webp': 'image/webp', 'svg': 'image/svg+xml'
                    };
                    return new Response(buffer, {
                        headers: {
                            'Content-Type': contentTypeMap[ext] || 'image/jpeg',
                            'Cache-Control': 'public, max-age=86400',
                            'X-Resolved-Path': imagePath,
                            'X-Proxy-Method': 'Raw'
                        },
                    });
                }
            } catch (e) {
                console.error(`[Proxy] Raw Exception for ${imagePath}:`, e);
            }
        }

        console.error(`[Proxy] ALL candidates failed for: ${urlParam}`);
        return new Response(JSON.stringify({
            error: "Image not found",
            requested: urlParam,
            tried: pathCandidates
        }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : "Unknown error";
        console.error("[Proxy Error]", errMsg);
        return new Response(`Proxy Error: ${errMsg}`, { status: 500 });
    }
}
