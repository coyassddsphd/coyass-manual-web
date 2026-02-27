import ManualViewer from "./ManualViewer";

// キャッシュを無効化し、常に最新のマニュアルを反映させる
export const dynamic = 'force-dynamic';

export default async function Home() {
  let markdownContent = "マニュアルファイルが見つかりません。";
  const githubToken = process.env.GITHUB_TOKEN;

  if (githubToken) {
    // Vercel本番環境：GitHubのリポジトリから直接最新のマニュアルを取り寄せる (fsエラー回避)
    try {
      const repoOwner = "coyassddsphd";
      const repoName = "coyasu-manual-web";
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
    // ローカル環境等でGITHUB_TOKENがない場合（Vercelではこの分岐には入らない想定）
    markdownContent = "GITHUB_TOKENが設定されていません。環境変数を確認してください。";
    console.error("GITHUB_TOKEN is not set.");
  }

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      <ManualViewer initialMarkdown={markdownContent} />
    </main>
  );
}
