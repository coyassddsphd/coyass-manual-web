import fs from "fs";
import path from "path";
import ManualViewer from "./ManualViewer";

export default function Home() {
  // サーバーサイドでMarkdownファイルの読み込み
  const filePath = path.join(process.cwd(), "manual_blueprint.md");
  let markdownContent = "マニュアルファイルが見つかりません。";

  if (fs.existsSync(filePath)) {
    markdownContent = fs.readFileSync(filePath, "utf-8");
  }

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      <ManualViewer initialMarkdown={markdownContent} />
    </main>
  );
}
