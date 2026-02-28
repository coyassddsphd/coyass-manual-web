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
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    const fileInputRef = useRef<HTMLInputElement>(null);

    // セクション分割 (H2, H3, or H4 で分割)
    const sections = markdown.split(/\n(?=#{2,4} )/).filter((sec) => sec.trim() !== "");

    // 目次のタイトルとレベル（H2=2, H3=3, H4=4）を抽出
    const navigationItems = sections.map(sec => {
        const trimmedSec = sec.trim();
        const h4Match = trimmedSec.match(/^#### (.*)/);
        const h3Match = trimmedSec.match(/^### (.*)/);
        const h2Match = trimmedSec.match(/^## (.*)/);

        if (h4Match) {
            return { title: h4Match[1], level: 4 };
        } else if (h3Match) {
            return { title: h3Match[1], level: 3 };
        } else if (h2Match) {
            return { title: h2Match[1], level: 2 };
        }

        const firstLine = trimmedSec.split('\n')[0].replace(/^#+\s*/, '');
        return { title: firstLine || "Untitled", level: 2 };
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
            { threshold: 0.1, rootMargin: "-10% 0% -70% 0%" }
        );

        sectionRefs.current.forEach((ref) => {
            if (ref) observer.observe(ref);
        });

        return () => observer.disconnect();
    }, [sections]);

    const resizeImage = (file: File): Promise<{ data: string, mimeType: string, previewUrl: string }> => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = document.createElement('img');
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;
                    const maxDim = 1200;
                    if (width > height) {
                        if (width > maxDim) {
                            height *= maxDim / width;
                            width = maxDim;
                        }
                    } else {
                        if (height > maxDim) {
                            width *= maxDim / height;
                            height = maxDim;
                        }
                    }
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx?.drawImage(img, 0, 0, width, height);
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                    resolve({
                        data: dataUrl.split(',')[1],
                        mimeType: 'image/jpeg',
                        previewUrl: dataUrl
                    });
                };
                img.src = e.target?.result as string;
            };
            reader.readAsDataURL(file);
        });
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsLoading(true);
        setMessage(file.type.startsWith('image/') ? "画像を最適化中..." : "ファイルを読み込み中...");

        try {
            if (file.type.startsWith('image/')) {
                const resized = await resizeImage(file);
                setAttachedImage(resized);
            } else if (file.type === 'application/pdf') {
                const reader = new FileReader();
                const base64Promise = new Promise<{ data: string, mimeType: string, previewUrl: string }>((resolve) => {
                    reader.onload = (e) => {
                        resolve({
                            data: (e.target?.result as string).split(',')[1],
                            mimeType: 'application/pdf',
                            previewUrl: '/pdf-icon.png' // PDF用のダミープレビュー（アイコン）
                        });
                    };
                    reader.readAsDataURL(file);
                });
                const pdfData = await base64Promise;
                setAttachedImage(pdfData);
            }
            setMessage("");
        } catch (err) {
            console.error("File loading error:", err);
            setMessage("❌ ファイルの読み込みに失敗しました");
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = async () => {
        if (!selectedSection || !comment.trim()) return;

        setIsLoading(true);
        setMessage("AIがマニュアルと画像を解析中...少々お待ちください🤖");
        console.log("Starting AI manual update request...", { comment, hasImage: !!attachedImage });

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

            console.log("Response received:", { status: res.status, ok: res.ok });

            if (!res.ok) {
                const errorText = await res.text();
                console.error("API error response:", errorText);
                throw new Error(`サーバーエラー (${res.status}): ${errorText.substring(0, 100)}`);
            }

            const data = await res.json();
            console.log("Response data:", data);

            if (data.success) {
                setMessage("✅ 更新成功！マニュアルを最新の状態に読み込み直します...");
                setIsLoading(false);
                setTimeout(() => {
                    window.location.reload();
                }, 2500);
            } else {
                const errorMsg = data.error || data.details || "不明なエラー";
                console.error("Logic error from API:", errorMsg);
                setMessage("❌ エラー: " + errorMsg);
                setIsLoading(false);
            }
        } catch (error) {
            console.error("Catch block error:", error);
            const msg = error instanceof Error ? error.message : "通信エラーが発生しました";
            setMessage(`❌ ${msg}`);
            setIsLoading(false);
        }
    };

    const scrollToSection = (index: number) => {
        sectionRefs.current[index]?.scrollIntoView({ behavior: "smooth" });
        setIsSidebarOpen(false);
    };

    const filteredSections = sections.filter((sec, idx) =>
        navigationItems[idx].title.toLowerCase().includes(searchQuery.toLowerCase()) ||
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
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type="text"
                                placeholder="マニュアルを検索..."
                                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>

                    <nav className="space-y-1 flex-1">
                        <p className="px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">CHAPTERS</p>
                        {navigationItems.map((item, idx) => (
                            <button
                                key={idx}
                                onClick={() => scrollToSection(idx)}
                                className={cn(
                                    "w-full text-left px-4 py-2.5 rounded-xl text-sm transition-all flex items-center gap-3",
                                    activeSection === idx
                                        ? "bg-blue-50 text-blue-700 shadow-sm font-bold"
                                        : "text-slate-600 hover:bg-slate-50 font-medium",
                                    item.level === 3 ? "ml-4" : "",
                                    item.level === 4 ? "ml-8" : ""
                                )}
                            >
                                <span className={cn(
                                    "w-1.5 h-1.5 rounded-full",
                                    activeSection === idx ? "bg-blue-600 animate-pulse" : "bg-slate-300",
                                    item.level === 3 ? "w-1 h-1" : "",
                                    item.level === 4 ? "w-0.5 h-0.5" : ""
                                )} />
                                <span className={cn(
                                    item.level === 3 ? "text-[13px] opacity-80" : "",
                                    item.level === 4 ? "text-[12px] opacity-60" : ""
                                )}>
                                    {item.title}
                                </span>
                            </button>
                        ))}
                    </nav>
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
                                <CheckCircle2 className="w-3 h-3" />
                                最終更新: {isMounted ? new Date().toLocaleDateString('ja-JP') : "読み込み中..."}
                            </div>
                            <h1 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tight mb-4 leading-tight">
                                スタッフマニュアル <span className="text-blue-600">v2.0</span>
                            </h1>
                            <p className="text-slate-500 text-lg font-medium leading-relaxed max-w-2xl">
                                常に最新の情報にAIが自動アップデート。日々の業務の疑問を即座に解決します。
                            </p>
                        </motion.div>
                    </header>

                    <div className="space-y-12">
                        {sections.map((sec, idx) => {
                            const isFiltered = filteredSections.includes(sec);
                            const isReadOnly = sec.includes("Webマニュアル自動更新対象外");

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
                                        activeSection === idx ? "border-blue-200 ring-4 ring-blue-50 shadow-xl" : "border-slate-100"
                                    )}
                                >
                                    <article className="prose prose-slate prose-blue max-w-none prose-headings:font-black prose-headings:tracking-tight prose-a:text-blue-600 prose-strong:text-slate-900 prose-img:rounded-2xl">
                                        <ReactMarkdown
                                            remarkPlugins={[remarkGfm]}
                                            components={{
                                                p: ({ children }) => <div className="mb-6 leading-relaxed">{children}</div>,
                                                img: ({ src, alt }) => {
                                                    const isLogo = alt?.includes("ロゴ") || alt?.includes("logo");
                                                    return (
                                                        <div className={`relative group/img-container my-8 ${isLogo ? 'max-w-[200px]' : 'w-full'}`}>
                                                            {src && (
                                                                <div className={isLogo ? "relative w-full h-auto" : "relative w-full aspect-video md:aspect-[16/9]"}>
                                                                    <img
                                                                        src={src as string}
                                                                        alt={alt || "manual image"}
                                                                        className={`rounded-2xl shadow-lg ${isLogo ? 'h-auto w-auto' : 'w-full object-cover'}`}
                                                                        loading="lazy"
                                                                    />
                                                                </div>
                                                            )}
                                                            {!isReadOnly && (
                                                                <button
                                                                    onClick={async () => {
                                                                        const input = document.createElement('input');
                                                                        input.type = 'file';
                                                                        input.accept = 'image/*';
                                                                        input.onchange = async (e) => {
                                                                            const file = (e.target as HTMLInputElement).files?.[0];
                                                                            if (!file) return;
                                                                            setIsLoading(true);
                                                                            setMessage("画像を最適化してアップロード中...");
                                                                            try {
                                                                                const resized = await resizeImage(file);
                                                                                const res = await fetch("/api/update-manual", {
                                                                                    method: "POST",
                                                                                    headers: { "Content-Type": "application/json" },
                                                                                    body: JSON.stringify({
                                                                                        originalText: sec,
                                                                                        comment: "画像を更新しました",
                                                                                        imageData: {
                                                                                            data: resized.data,
                                                                                            mimeType: resized.mimeType
                                                                                        }
                                                                                    }),
                                                                                });
                                                                                if (res.ok) {
                                                                                    setMessage("✅ 画像を更新しました！リロードします...");
                                                                                    setTimeout(() => { window.location.reload(); }, 2000);
                                                                                } else {
                                                                                    const errData = await res.json();
                                                                                    setMessage("❌ 更新失敗: " + (errData.details || "サーバーエラー"));
                                                                                    setIsLoading(false);
                                                                                }
                                                                            } catch (err) {
                                                                                console.error("In-line update error:", err);
                                                                                setMessage("❌ エラーが発生しました");
                                                                                setIsLoading(false);
                                                                            }
                                                                        };
                                                                        input.click();
                                                                    }}
                                                                    title="写真を差し替える"
                                                                    className="absolute top-4 right-4 bg-white/90 backdrop-blur shadow-xl text-blue-600 px-4 py-2 rounded-xl text-xs font-black opacity-0 group-hover/img-container:opacity-100 transition-all flex items-center gap-2 hover:bg-blue-600 hover:text-white border border-blue-100"
                                                                >
                                                                    <Camera className="w-4 h-4" />
                                                                    写真に差し替える
                                                                </button>
                                                            )}
                                                        </div>
                                                    );
                                                }
                                            }}
                                        >
                                            {sec}
                                        </ReactMarkdown>
                                    </article>

                                    {!isReadOnly && (
                                        <div className="mt-10 flex justify-end">
                                            <button
                                                onClick={() => {
                                                    // インテリジェント・コンテキスト抽出ロジック
                                                    let textToEdit = sec;
                                                    if (navigationItems[idx].level === 2) {
                                                        let combinedText = sec;
                                                        for (let i = idx + 1; i < sections.length; i++) {
                                                            if (navigationItems[i].level === 2) break;
                                                            combinedText += "\n\n" + sections[i];
                                                        }
                                                        textToEdit = combinedText;
                                                    }

                                                    // 状態を完全にリセットして新しいセクションを開く
                                                    setSelectedSection(textToEdit);
                                                    setComment("");
                                                    setMessage("");
                                                    setAttachedImage(null);
                                                    setIsLoading(false);
                                                }}
                                                className="group relative inline-flex items-center gap-2 px-6 py-3 bg-slate-900 text-white text-sm font-bold rounded-2xl hover:bg-blue-600 transition-all hover:shadow-xl active:scale-95"
                                            >
                                                <Edit3 className="w-4 h-4" />
                                                {navigationItems[idx].level === 2 ? "章の構成を相談・変更する" : "この項目をAIに更新指示する"}
                                            </button>
                                        </div>
                                    )}

                                    {isReadOnly && (
                                        <div className="mt-8 p-4 bg-orange-50 border border-orange-100 rounded-2xl flex items-center gap-3">
                                            <AlertCircle className="w-5 h-5 text-orange-400" />
                                            <span className="text-sm font-bold text-orange-700">この項目はWebからの更新が制限されています</span>
                                        </div>
                                    )}
                                </motion.section>
                            );
                        })}
                    </div>

                    <footer className="mt-24 pt-12 border-t border-slate-100 text-center">
                        <div className="flex justify-center items-center gap-6 mb-8 opacity-20">
                            <Image src="/logos/nameco.png" alt="nameco" width={48} height={48} />
                            <Image src="/logos/migakuma.png" alt="migakuma" width={42} height={42} />
                        </div>
                        <p className="text-slate-400 text-xs font-bold tracking-widest uppercase">
                            &copy; {isMounted ? new Date().getFullYear() : ""} Nakameguro Coyass Dental Clinic. Powered by Gemini AI.
                        </p>
                    </footer>
                </div>
            </main>

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
                            initial={{ scale: 0.98, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ opacity: 0, scale: 0.98 }}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                                display: 'grid',
                                gridTemplateRows: 'auto 1fr auto',
                                maxHeight: '90vh',
                                width: '100%',
                                maxWidth: '640px',
                                backgroundColor: 'white',
                                borderRadius: '32px',
                                overflow: 'hidden',
                                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                                zIndex: 1001,
                                position: 'relative'
                            }}
                        >
                            {/* Header: Fixed */}
                            <div style={{
                                padding: '24px 32px',
                                background: 'linear-gradient(135deg, #2563eb 0%, #4338ca 100%)',
                                color: 'white',
                                position: 'relative'
                            }}>
                                <h3 style={{ fontSize: '24px', fontWeight: 900, marginBottom: '4px' }}>Editor Intelligence</h3>
                                <p style={{ fontSize: '14px', opacity: 0.9 }}>AIがマニュアルの更新をサポートします。</p>
                                <button
                                    onClick={() => setSelectedSection(null)}
                                    style={{
                                        position: 'absolute',
                                        top: '24px',
                                        right: '24px',
                                        background: 'rgba(255,255,255,0.2)',
                                        border: 'none',
                                        borderRadius: '50%',
                                        width: '40px',
                                        height: '40px',
                                        color: 'white',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            {/* Body: Scrollable */}
                            <div style={{
                                padding: '32px',
                                overflowY: 'auto',
                                backgroundColor: 'white',
                                minHeight: '300px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '24px'
                            }}>
                                <div>
                                    <label style={{ fontSize: '10px', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px', display: 'block' }}>
                                        Target Section
                                    </label>
                                    <div style={{
                                        padding: '16px',
                                        backgroundColor: '#f8fafc',
                                        borderRadius: '16px',
                                        fontSize: '11px',
                                        color: '#64748b',
                                        border: '1px solid #e2e8f0',
                                        maxHeight: '120px',
                                        overflowY: 'auto',
                                        whiteSpace: 'pre-wrap'
                                    }}>
                                        {selectedSection}
                                    </div>
                                </div>

                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 900, color: '#1e293b', marginBottom: '8px', display: 'block' }}>
                                        修正の指示を入力
                                    </label>
                                    <textarea
                                        autoFocus
                                        style={{
                                            width: '100%',
                                            padding: '20px',
                                            backgroundColor: '#f1f5f9',
                                            border: '2px solid #e2e8f0',
                                            borderRadius: '20px',
                                            fontSize: '18px',
                                            lineHeight: '1.6',
                                            color: '#0f172a',
                                            minHeight: '180px',
                                            outline: 'none',
                                            resize: 'none'
                                        }}
                                        placeholder="例：器具の名前を正式名称に直して"
                                        value={comment}
                                        onChange={(e) => setComment(e.target.value)}
                                        disabled={isLoading}
                                    />
                                </div>

                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 900, color: '#1e293b', marginBottom: '12px', display: 'block' }}>
                                        添付ファイル (任意)
                                    </label>
                                    <div
                                        onClick={() => !isLoading && fileInputRef.current?.click()}
                                        style={{
                                            border: '2px dashed #cbd5e1',
                                            borderRadius: '20px',
                                            padding: '24px',
                                            textAlign: 'center',
                                            cursor: 'pointer',
                                            backgroundColor: attachedImage ? '#eff6ff' : '#f8fafc'
                                        }}
                                    >
                                        <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} />
                                        {attachedImage ? (
                                            <div style={{ color: '#2563eb', fontWeight: 700 }}>ファイルが選択されました</div>
                                        ) : (
                                            <div style={{ color: '#94a3b8', fontSize: '14px' }}>写真・PDFを選択</div>
                                        )}
                                    </div>
                                </div>

                                {message && (
                                    <div style={{
                                        padding: '16px',
                                        borderRadius: '16px',
                                        backgroundColor: message.includes('❌') ? '#fef2f2' : '#f0f9ff',
                                        color: message.includes('❌') ? '#991b1b' : '#075985',
                                        fontSize: '14px',
                                        fontWeight: 700
                                    }}>
                                        {message}
                                    </div>
                                )}
                            </div>

                            {/* Footer */}
                            <div style={{
                                padding: '24px 32px',
                                backgroundColor: '#f8fafc',
                                borderTop: '1px solid #e2e8f0',
                                display: 'flex',
                                justifyContent: 'end',
                                gap: '16px'
                            }}>
                                <button
                                    onClick={() => setSelectedSection(null)}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        color: '#94a3b8',
                                        fontWeight: 700,
                                        cursor: 'pointer'
                                    }}
                                    disabled={isLoading}
                                >
                                    キャンセル
                                </button>
                                <button
                                    onClick={handleSubmit}
                                    disabled={isLoading || !comment.trim()}
                                    style={{
                                        backgroundColor: (isLoading || !comment.trim()) ? '#cbd5e1' : '#2563eb',
                                        color: 'white',
                                        padding: '12px 32px',
                                        borderRadius: '16px',
                                        border: 'none',
                                        fontWeight: 900,
                                        cursor: 'pointer',
                                        boxShadow: '0 10px 15px -3px rgba(37, 99, 235, 0.3)'
                                    }}
                                >
                                    {isLoading ? "解析中..." : "AIに更新指示"}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
