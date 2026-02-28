import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(req: NextRequest) {
    const basicAuth = req.headers.get('authorization')

    // .env に設定されたユーザー名とパスワードを取得。未設定の場合はデフォルト値（coyasu / dental）をフォールバックに。
    const user = process.env.BASIC_AUTH_USER || 'coyass'
    const pwd = process.env.BASIC_AUTH_PASSWORD || 'dental'

    const expectedAuth = Buffer.from(`${user}:${pwd}`).toString('base64')

    if (basicAuth) {
        const authValue = basicAuth.split(' ')[1]
        if (authValue === expectedAuth) {
            return NextResponse.next()
        }
    }

    // 認証失敗時または未入力時
    return new NextResponse('Authentication Required!', {
        status: 401,
        headers: {
            'WWW-Authenticate': 'Basic realm="Secure Area"',
        },
    })
}

// 適用範囲を絞る（Next.jsのシステムファイルや静的画像にはかけない）
export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - api/update-manual (APIエンドポイントは別の認証なりを行う想定。Basicはかけない、もしくは別に処理)
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico, sitemap.xml, robots.txt (metadata files)
         * - logos (公開画像フォルダ)
         * - images (公開画像フォルダ)
         */
        '/((?!api|_next/static|_next/image|favicon.ico|logos|images).*)',
    ],
}
