"use client";

import React, { useState } from "react";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ManualViewerProps {
    initialMarkdown: string;
}

export default function ManualViewer({ initialMarkdown }: ManualViewerProps) {
    const [markdown] = useState(initialMarkdown);
    const [selectedSection, setSelectedSection] = useState<string | null>(null);
    const [comment, setComment] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState("");

    // マークダウンを「## 」(章や節) ごとに分割する
    // 最初の部分（タイトルなど）が空にならないよう注意
    const sections = markdown.split(/(?=\n## )/).filter((sec) => sec.trim() !== "");

    const handleSubmit = async () => {
        if (!selectedSection || !comment.trim()) return;

        setIsLoading(true);
        setMessage("AIがマニュアル本文を書き換え中...少々お待ちください🤖");

        try {
            const res = await fetch("/api/update-manual", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    originalText: selectedSection,
                    comment: comment,
                }),
            });

            const data = await res.json();
            if (data.success) {
                setMessage("✅ 更新成功！ページをリロードして最新版を反映します...");
                setTimeout(() => {
                    window.location.reload();
                }, 1500);
            } else {
                setMessage("❌ エラー: " + (data.error || "不明なエラー"));
                setIsLoading(false);
            }
        } catch (error) {
            console.error(error);
            setMessage("❌ 通信エラーが発生しました");
            setIsLoading(false);
        }
    };

    return (
        <div className="max-w-5xl mx-auto py-8 px-4 sm:px-6">
            <header className="mb-10 border-b-2 border-blue-200 pb-6 text-center">
                <div className="flex justify-center items-center gap-6 mb-6">
                    {/* なめこ・医院ロゴ */}
                    <div className="relative w-24 h-24 sm:w-32 sm:h-32 drop-shadow-md">
                        <Image
                            src="/logos/nameco.png"
                            alt="中目黒コヤス歯科 ロゴ"
                            fill
                            className="object-contain"
                            priority
                        />
                    </div>
                    {/* ミガクマ */}
                    <div className="relative w-20 h-20 sm:w-28 sm:h-28 drop-shadow-md">
                        <Image
                            src="/logos/migakuma.png"
                            alt="ミガクマ"
                            fill
                            className="object-contain"
                            priority
                        />
                    </div>
                </div>
                <h1 className="text-3xl md:text-4xl font-extrabold text-blue-900 tracking-tight">
                    中目黒コヤス歯科 スタッフ専用マニュアル
                </h1>
                <p className="text-gray-500 mt-3 font-medium">
                    各項目の「更新コメントを送る」から変更要望を書くと、AIが自動でマニュアル本編を最新化します。
                </p>
            </header>

            <div className="space-y-8">
                {sections.map((sec, idx) => {
                    // DropboxのRead-Onlyエリア（第5章として定義した部分）はコメントボタンを出さない
                    const isReadOnly = sec.includes("Webマニュアル自動更新対象外");

                    return (
                        <section
                            key={idx}
                            className={`bg-white rounded-2xl shadow-sm border p-6 md:p-8 relative group ${isReadOnly ? "border-red-200 bg-red-50/20" : "border-gray-200 hover:border-blue-300 transition-colors"
                                }`}
                        >
                            <article className="prose prose-sm sm:prose-base prose-blue max-w-none">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>{sec}</ReactMarkdown>
                            </article>

                            {!isReadOnly && (
                                <div className="mt-6 pt-4 border-t border-gray-100 text-right opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={() => {
                                            setSelectedSection(sec);
                                            setComment("");
                                            setMessage("");
                                        }}
                                        className="inline-flex items-center px-4 py-2 bg-blue-50 text-blue-700 text-sm font-semibold rounded-lg hover:bg-blue-600 hover:text-white transition-all shadow-sm"
                                    >
                                        📝AIに更新コメントを送る
                                    </button>
                                </div>
                            )}
                        </section>
                    );
                })}
            </div>

            {/* スティッキーなフッター */}
            <footer className="mt-16 text-center text-sm text-gray-400">
                <p>&copy; {new Date().getFullYear()} Nakameguro Coyasu Dental Clinic.</p>
            </footer>

            {/* モーダルウィンドウ */}
            {selectedSection && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-gray-100">
                            <h3 className="text-xl font-bold text-gray-900">マニュアルの自動更新（AI改訂）</h3>
                            <p className="text-sm text-gray-500 mt-1">
                                右下の送信ボタンを押すと、AIが元の文章をあなたの要望に合わせて書き換えます。
                            </p>
                        </div>

                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    更新対象の文章（AIが読み取ります）
                                </label>
                                <div className="bg-gray-50 p-4 rounded-lg text-sm text-gray-500 h-40 overflow-y-auto border border-gray-200">
                                    {selectedSection}
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-900 mb-2">
                                    変更内容・要望を（話し言葉でOK）入力してください
                                </label>
                                <textarea
                                    className="w-full p-4 border border-blue-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all resize-none text-gray-800"
                                    rows={4}
                                    placeholder="例：初診時の持ち物に『保険証とマイナンバーカード』の両方を記載するように変更して！"
                                    value={comment}
                                    onChange={(e) => setComment(e.target.value)}
                                    disabled={isLoading}
                                />
                            </div>

                            {message && (
                                <div className={`p-4 rounded-lg text-sm font-medium animate-in slide-in-from-bottom-2 ${message.includes("❌") ? "bg-red-50 text-red-700 border border-red-200" : "bg-blue-50 text-blue-800 border border-blue-200"
                                    }`}>
                                    {message}
                                </div>
                            )}
                        </div>

                        <div className="p-6 bg-gray-50 border-t flex justify-end gap-3 sticky bottom-0">
                            <button
                                onClick={() => setSelectedSection(null)}
                                className="px-5 py-2.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                                disabled={isLoading}
                            >
                                キャンセル
                            </button>
                            <button
                                onClick={handleSubmit}
                                disabled={isLoading || !comment.trim()}
                                className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {isLoading ? (
                                    <>
                                        <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        更新処理中...
                                    </>
                                ) : (
                                    "✨ AIで更新する"
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
