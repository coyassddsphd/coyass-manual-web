"use client";

import React, { useState, useEffect, useRef } from "react";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { motion, AnimatePresence } from "framer-motion";
import {
    Menu,
    X,
    Edit3,
    CheckCircle2,
    AlertCircle,
    Search,
    BookOpen,
    ArrowRight,
    MessageSquare,
    Image as ImageIcon,
    Camera
} from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface ManualViewerProps {
    initialMarkdown: string;
}

interface ImageData {
    data: string;
    mimeType: string;
    previewUrl: string;
}

export default function ManualViewer({ initialMarkdown }: ManualViewerProps) {
    const [markdown] = useState(initialMarkdown);
    const [selectedSection, setSelectedSection] = useState<string | null>(null);
    const [comment, setComment] = useState("");
    const [attachedImage, setAttachedImage] = useState<ImageData | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState("");
    const [activeSection, setActiveSection] = useState<number>(0);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");

    const fileInputRef = useRef<HTMLInputElement>(null);

    // セクション分割
    const sections = markdown.split(/(?=\n## )/).filter((sec) => sec.trim() !== "");

    // 目次のタイトル抽出
    const titles = sections.map(sec => {
        const match = sec.match(/## (.*)/);
        return match ? match[1] : "Untitled Section";
    });

    // スクロール追従ハイライト
    const sectionRefs = useRef<(HTMLElement | null)[]>([]);
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        const index = sectionRefs.current.indexOf(entry.target as HTMLElement);
                        if (index !== -1) setActiveSection(index);
                    }
                });
            },
            { threshold: 0.2, rootMargin: "-10% 0% -70% 0%" }
        );

        sectionRefs.current.forEach((ref) => {
            if (ref) observer.observe(ref);
        });

        return () => observer.disconnect();
    }, [sections]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onloadend = () => {
            const base64String = reader.result as string;
            setAttachedImage({
                data: base64String.split(",")[1],
                mimeType: file.type,
                previewUrl: base64String
            });
        };
        reader.readAsDataURL(file);
    };

    const handleSubmit = async () => {
        if (!selectedSection || !comment.trim()) return;

        setIsLoading(true);
        setMessage("AIがマニュアルと画像を解析中...少々お待ちください🤖");

        try {
            const res = await fetch("/api/update-manual", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    originalText: selectedSection,
                    comment: comment,
                    imageData: attachedImage ? {
                        data: attachedImage.data,
                        mimeType: attachedImage.mimeType
                    } : null
                }),
            });

            const data = await res.json();
            if (data.success) {
                setMessage("✅ 更新成功！ページをリロードして反映します...");
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

    const scrollToSection = (index: number) => {
        sectionRefs.current[index]?.scrollIntoView({ behavior: "smooth" });
        setIsSidebarOpen(false);
    };

    const filteredSections = sections.filter((sec, idx) =>
        titles[idx].toLowerCase().includes(searchQuery.toLowerCase()) ||
        sec.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="flex min-h-screen bg-[#f8fafc]">
            {/* モバイル用ナビゲーションヘッダー */}
            <div className="lg:hidden fixed top-0 left-0 right-0 z-40 h-16 glass flex items-center justify-between px-6 border-b border-gray-200/50">
                <div className="flex items-center gap-3">
                    <BookOpen className="w-6 h-6 text-blue-600" />
                    <span className="font-bold text-slate-800 tracking-tight">Coyass Manual</span>
                </div>
                <button
                    onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                    className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                    aria-label={isSidebarOpen ? "メニューを閉じる" : "メニューを開く"}
                >
                    {isSidebarOpen ? <X /> : <Menu />}
                </button>
            </div>

            {/* サイドバー (目次) */}
            <aside className={cn(
                "fixed inset-y-0 left-0 z-50 w-[var(--sidebar-w)] bg-white border-r border-slate-200 transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-auto",
                isSidebarOpen ? "translate-x-0" : "-translate-x-full"
            )}>
                <div className="sticky top-0 h-screen flex flex-col py-8 overflow-y-auto px-4 scrollbar-hide">
                    <div className="flex items-center gap-4 mb-10 px-4">
                        <div className="p-2 bg-blue-600 rounded-xl shadow-lg shadow-blue-200">
                            <BookOpen className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h2 className="font-bold text-slate-900 leading-tight">中目黒コヤス歯科</h2>
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Web Manual System</p>
                        </div>
                    </div>

                    <div className="mb-6 px-2">
                        <div className="relative group">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                            <input
                                type="text"
                                placeholder="マニュアルを検索..."
                                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>

                    <nav className="space-y-1 flex-1">
                        <p className="px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">CHAPTERS</p>
                        {titles.map((title, idx) => (
                            <button
                                key={idx}
                                onClick={() => scrollToSection(idx)}
                                className={cn(
                                    "w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-all flex items-center gap-3",
                                    activeSection === idx
                                        ? "bg-blue-50 text-blue-700 shadow-sm shadow-blue-100/50"
                                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                )}
                                aria-current={activeSection === idx ? "page" : undefined}
                            >
                                <span className={cn(
                                    "w-1.5 h-1.5 rounded-full",
                                    activeSection === idx ? "bg-blue-600 animate-pulse" : "bg-slate-300"
                                )} />
                                {title}
                            </button>
                        ))}
                    </nav>

                    <div className="mt-8 pt-8 border-t border-slate-100 flex justify-center items-center gap-4 px-4 opacity-50">
                        <Image src="/logos/nameco.png" alt="nameco" width={32} height={32} className="grayscale" />
                        <Image src="/logos/migakuma.png" alt="migakuma" width={28} height={28} className="grayscale" />
                    </div>
                </div>
            </aside>

            {/* メインコンテンツ */}
            <main className="flex-1 lg:max-w-none pt-24 lg:pt-0">
                <div className="max-w-4xl mx-auto py-12 px-6 lg:px-12">
                    <header className="mb-16 text-center lg:text-left">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6 }}
                        >
                            <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-xs font-bold mb-4">
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-600"></span>
                                </span>
                                AI Vision & OCR Enabled
                            </div>
                            <h1 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tight leading-tight mb-6">
                                スタッフ専用<span className="text-blue-600">（お引越し完了版）</span><br className="sm:hidden" />
                                自動更新マニュアル
                            </h1>
                            <p className="text-lg text-slate-500 max-w-2xl leading-relaxed">
                                現場の気づきをAIが形にする。最新のプロトコルを常に手元に。
                                気になる項目は「AIに更新指示」を送るだけで、マニュアルが自動的に最新化されます。
                            </p>
                        </motion.div>
                    </header>

                    <div className="space-y-12">
                        {sections.map((sec, idx) => {
                            const isReadOnly = sec.includes("Webマニュアル自動更新対象外");
                            const isFiltered = filteredSections.includes(sec);

                            if (searchQuery && !isFiltered) return null;

                            return (
                                <motion.section
                                    key={idx}
                                    ref={(el) => { sectionRefs.current[idx] = el; }}
                                    initial={{ opacity: 0, scale: 0.98 }}
                                    whileInView={{ opacity: 1, scale: 1 }}
                                    viewport={{ once: true, margin: "-100px" }}
                                    className={cn(
                                        "bg-white rounded-3xl p-8 md:p-10 border shadow-sm transition-all duration-300",
                                        activeSection === idx ? "border-blue-200 ring-4 ring-blue-50 shadow-xl shadow-blue-100/20" : "border-slate-100"
                                    )}
                                >
                                    <article className="prose prose-slate prose-blue max-w-none prose-headings:font-black prose-headings:tracking-tight prose-a:text-blue-600 prose-strong:text-slate-900 prose-img:rounded-2xl">
                                        <ReactMarkdown
                                            remarkPlugins={[remarkGfm]}
                                            components={{
                                                img: ({ src, alt }) => (
                                                    <div className="relative group/img-container my-8">
                                                        {src && (
                                                            <div className="relative w-full aspect-video md:aspect-[16/9]">
                                                                <Image
                                                                    src={src as string}
                                                                    alt={alt || "manual image"}
                                                                    fill
                                                                    className="rounded-2xl shadow-lg object-cover"
                                                                />
                                                            </div>
                                                        )}
                                                        {!isReadOnly && (
                                                            <button
                                                                onClick={() => {
                                                                    // 画像差し替えのフローを開始
                                                                    const input = document.createElement('input');
                                                                    input.type = 'file';
                                                                    input.accept = 'image/*';
                                                                    input.onchange = async (e) => {
                                                                        const file = (e.target as HTMLInputElement).files?.[0];
                                                                        if (!file) return;

                                                                        setIsLoading(true);
                                                                        setMessage("画像をアップロード中...");

                                                                        const reader = new FileReader();
                                                                        reader.onloadend = async () => {
                                                                            const base64 = (reader.result as string).split(',')[1];
                                                                            try {
                                                                                // 1. 画像をGitHubにアップロード
                                                                                const newFileName = `real_${Date.now()}_${file.name}`;
                                                                                const uploadRes = await fetch("/api/upload-image", {
                                                                                    method: "POST",
                                                                                    headers: { "Content-Type": "application/json" },
                                                                                    body: JSON.stringify({
                                                                                        imageData: base64,
                                                                                        imagePath: `public/images/manual/${newFileName}`,
                                                                                        comment: `Replaced ${src} with real photo`
                                                                                    }),
                                                                                });

                                                                                if (!uploadRes.ok) throw new Error("アップロード失敗");

                                                                                // 2. マニュアルのマークダウンを更新（AIに依頼）
                                                                                setMessage("マニュアルのリンクを更新中...");
                                                                                const updateRes = await fetch("/api/update-manual", {
                                                                                    method: "POST",
                                                                                    headers: { "Content-Type": "application/json" },
                                                                                    body: JSON.stringify({
                                                                                        originalText: sec,
                                                                                        comment: `画像「${src}」を「/images/manual/${newFileName}」に差し替えてください。`,
                                                                                        imageData: null
                                                                                    }),
                                                                                });

                                                                                if (updateRes.ok) {
                                                                                    setMessage("✅ 画像を差し替えました！反映まで数分かかる場合があります。");
                                                                                    setTimeout(() => window.location.reload(), 2000);
                                                                                } else {
                                                                                    throw new Error("リンク更新失敗");
                                                                                }
                                                                            } catch {
                                                                                setMessage("❌ 差し替えに失敗しました。時間をおいてお試しください。");
                                                                                setIsLoading(false);
                                                                            }
                                                                        };
                                                                        reader.readAsDataURL(file);
                                                                    };
                                                                    input.click();
                                                                }}
                                                                className="absolute top-4 right-4 bg-white/90 backdrop-blur shadow-xl text-blue-600 px-4 py-2 rounded-xl text-xs font-black opacity-0 group-hover/img-container:opacity-100 transition-all flex items-center gap-2 hover:bg-blue-600 hover:text-white border border-blue-100"
                                                            >
                                                                <Camera className="w-4 h-4" />
                                                                実際の写真に差し替える
                                                            </button>
                                                        )}
                                                    </div>
                                                )
                                            }}
                                        >
                                            {sec}
                                        </ReactMarkdown>
                                    </article>

                                    {!isReadOnly && (
                                        <div className="mt-10 flex justify-end">
                                            <button
                                                onClick={() => {
                                                    setSelectedSection(sec);
                                                    setComment("");
                                                    setMessage("");
                                                    setAttachedImage(null);
                                                }}
                                                className="group relative inline-flex items-center gap-2 px-6 py-3 bg-slate-900 text-white text-sm font-bold rounded-2xl hover:bg-blue-600 transition-all hover:shadow-xl hover:shadow-blue-200"
                                            >
                                                <Edit3 className="w-4 h-4 group-hover:scale-110 transition-transform" />
                                                この項目をAIに更新指示する
                                                <div className="absolute inset-0 rounded-2xl ring-2 ring-slate-900 group-hover:ring-blue-600 transition-all scale-105 opacity-0 group-hover:opacity-10" />
                                            </button>
                                        </div>
                                    )}

                                    {isReadOnly && (
                                        <div className="mt-8 p-4 bg-orange-50 border border-orange-100 rounded-2xl flex items-center gap-3">
                                            <AlertCircle className="w-5 h-5 text-orange-400" />
                                            <span className="text-sm font-bold text-orange-700">この項目は外部連携中のため Web からの更新は制限されています</span>
                                        </div>
                                    )}
                                </motion.section>
                            );
                        })}
                    </div>

                    <footer className="mt-24 pt-12 border-t border-slate-100 text-center">
                        <div className="flex justify-center items-center gap-6 mb-8 opacity-20 hover:opacity-100 transition-opacity duration-700">
                            <Image src="/logos/nameco.png" alt="nameco" width={48} height={48} />
                            <Image src="/logos/migakuma.png" alt="migakuma" width={42} height={42} />
                        </div>
                        <p className="text-slate-400 text-xs font-bold tracking-widest uppercase">
                            &copy; {new Date().getFullYear()} Nakameguro Coyasu Dental Clinic. Powered by Gemini AI.
                        </p>
                    </footer>
                </div>
            </main>

            {/* 更新モーダル */}
            <AnimatePresence>
                {selectedSection && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 md:p-8">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => !isLoading && setSelectedSection(null)}
                            className="absolute inset-0 bg-slate-900/40 backdrop-blur-md"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            className="relative bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
                        >
                            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-100">
                                        <MessageSquare className="text-white w-6 h-6" />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-black text-slate-900 leading-tight">AIに改訂を依頼する</h3>
                                        <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mt-1">AI Automated Revision</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setSelectedSection(null)}
                                    className="p-2 hover:bg-slate-200 rounded-full transition-colors"
                                    disabled={isLoading}
                                    aria-label="閉じる"
                                >
                                    <X className="w-6 h-6 text-slate-400" />
                                </button>
                            </div>

                            <div className="p-8 space-y-6 overflow-y-auto flex-1">
                                <div>
                                    <label className="flex items-center gap-2 text-xs font-black text-slate-400 uppercase tracking-widest mb-3">
                                        Target Context
                                    </label>
                                    <div className="bg-slate-50 p-6 rounded-[1.5rem] text-sm text-slate-500 italic border border-slate-100 max-h-32 overflow-y-auto leading-relaxed">
                                        {selectedSection}
                                    </div>
                                </div>

                                <div>
                                    <label className="flex items-center gap-2 text-xs font-black text-slate-900 uppercase tracking-widest mb-3" htmlFor="instructions">
                                        Change Instructions (話し言葉でOK)
                                    </label>
                                    <textarea
                                        id="instructions"
                                        className="w-full p-6 bg-white border-2 border-slate-100 rounded-[1.5rem] focus:outline-none focus:border-blue-600 transition-all resize-none text-slate-800 text-lg leading-relaxed placeholder:text-slate-300 shadow-sm"
                                        rows={3}
                                        placeholder="例：写真のグラフをマニュアルに追加して！"
                                        value={comment}
                                        onChange={(e) => setComment(e.target.value)}
                                        disabled={isLoading}
                                    />
                                </div>

                                {/* 画像添付セクション */}
                                <div>
                                    <label className="flex items-center gap-2 text-xs font-black text-slate-900 uppercase tracking-widest mb-3">
                                        Photo / Documents (任意)
                                    </label>
                                    <div
                                        onClick={() => !isLoading && fileInputRef.current?.click()}
                                        className={cn(
                                            "relative border-2 border-dashed rounded-[1.5rem] p-6 transition-all cursor-pointer flex flex-col items-center justify-center gap-3",
                                            attachedImage ? "border-blue-200 bg-blue-50/30" : "border-slate-200 hover:border-blue-400 bg-slate-50/50 hover:bg-white"
                                        )}
                                    >
                                        <input
                                            type="file"
                                            ref={fileInputRef}
                                            className="hidden"
                                            accept="image/*"
                                            onChange={handleFileChange}
                                            aria-label="画像を選択"
                                        />

                                        {attachedImage ? (
                                            <div className="relative w-full h-32">
                                                <Image
                                                    src={attachedImage.previewUrl}
                                                    alt="Preview"
                                                    fill
                                                    className="object-contain rounded-xl"
                                                />
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setAttachedImage(null);
                                                    }}
                                                    className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full shadow-lg"
                                                    aria-label="画像を削除"
                                                    title="画像を削除"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="flex gap-4">
                                                    <div className="p-3 bg-white rounded-xl shadow-sm border border-slate-100">
                                                        <Camera className="w-6 h-6 text-slate-400" />
                                                    </div>
                                                    <div className="p-3 bg-white rounded-xl shadow-sm border border-slate-100">
                                                        <ImageIcon className="w-6 h-6 text-slate-400" />
                                                    </div>
                                                </div>
                                                <p className="text-sm font-bold text-slate-500">
                                                    タップして写真撮影 or 書類を選択
                                                </p>
                                                <p className="text-[10px] text-slate-400 uppercase tracking-widest">
                                                    書類やグラフをAIが瞬時に文字化します
                                                </p>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {message && (
                                    <motion.div
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        className={cn(
                                            "p-6 rounded-2xl flex items-center gap-4 border",
                                            message.includes("❌") ? "bg-red-50 border-red-100 text-red-700" : "bg-blue-50 border-blue-100 text-blue-800"
                                        )}
                                    >
                                        {message.includes("❌") ? <AlertCircle className="w-5 h-5 flex-shrink-0" /> : <CheckCircle2 className="w-5 h-5 flex-shrink-0 animate-bounce" />}
                                        <span className="text-sm font-black">{message}</span>
                                    </motion.div>
                                )}
                            </div>

                            <div className="p-8 bg-slate-50 border-t border-slate-100 flex justify-end gap-4 sticky bottom-0">
                                <button
                                    onClick={() => setSelectedSection(null)}
                                    className="px-6 py-3 text-sm font-bold text-slate-400 hover:text-slate-600 transition-colors"
                                    disabled={isLoading}
                                >
                                    キャンセル
                                </button>
                                <button
                                    onClick={handleSubmit}
                                    disabled={isLoading || !comment.trim()}
                                    className="relative overflow-hidden px-8 py-3 bg-blue-600 text-white text-sm font-black rounded-2xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed group transition-all shadow-lg shadow-blue-100"
                                >
                                    {isLoading ? (
                                        <div className="flex items-center gap-3">
                                            <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                            AIが解析中...
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            AIに更新を指示する
                                            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                        </div>
                                    )}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
