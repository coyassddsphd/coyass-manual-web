import ManualViewer from "./ManualViewer";
import fs from "fs";
import path from "path";

// キャッシュを無効化し、常に最新のマニュアルを反映させる
export const dynamic = 'force-dynamic';

export default async function Home() {
  let markdownContent = "マニュアルファイルが見つかりません。";
  const githubToken = process.env.GITHUB_TOKEN;

  if (githubToken) {
    // Vercel本番環境：GitHubのリポジトリから直接最新のマニュアルを取り寄せる (fsエラー回避)
    try {
      const repoOwner = "drcoyass";
      const repoName = "coyasu-manual";
      const filePathInRepo = "manual_blueprint.md";
      const apiUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${filePathInRepo}`;

      const getFileRes = await fetch(apiUrl, {
        headers: {
          "Authorization": `token ${githubToken}`,
          "Accept": "application/vnd.github.v3+json",
        },
        cache: 'no-store' // 常に最新を取得
      });

      if (getFileRes.ok) {
        const fileData = await getFileRes.json();
        // Base64エンコードされている中身をデコード
        markdownContent = Buffer.from(fileData.content, 'base64').toString('utf-8');
      } else {
        markdownContent = "GitHubからのマニュアル取得に失敗しました。";
        console.error("Fetch Error:", await getFileRes.text());
      }
    } catch (e) {
      console.error("GitHub fetch exception:", e);
      markdownContent = "マニュアル取得時にサーバーエラーが発生しました。";
    }
  } else {
    // ローカル環境等のフォールバック
    try {
      const filePath = path.join(process.cwd(), "manual_blueprint.md");
      if (fs.existsSync(filePath)) {
        markdownContent = fs.readFileSync(filePath, "utf-8");
      }
    } catch (e) {
      console.error("Local file read error:", e);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      <ManualViewer initialMarkdown={markdownContent} />
    </main>
  );
}
