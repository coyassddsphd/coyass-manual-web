import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

export async function GET() {
    return NextResponse.json({
        has_github_token: !!process.env.GITHUB_TOKEN,
        github_token_prefix: process.env.GITHUB_TOKEN ? process.env.GITHUB_TOKEN.substring(0, 4) + "..." : "missing",
        has_gemini_api_key: !!process.env.GEMINI_API_KEY,
        node_env: process.env.NODE_ENV,
        timestamp: new Date().toISOString()
    });
}
