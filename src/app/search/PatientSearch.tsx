'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Search, History, Calendar, User, ArrowLeft } from 'lucide-react';

interface SearchResult {
    date: string;
    content: string;
    filename: string;
}

const PatientSearch = () => {
    const [patientId, setPatientId] = useState('');
    const [date, setDate] = useState(''); // YYYYMMDD
    const [results, setResults] = useState<SearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!patientId && !date) {
            setError('患者番号または診療日の少なくとも一方を入力してください');
            return;
        }

        setLoading(true);
        setError('');
        setResults([]);

        try {
            const formattedDate = date.replace(/-/g, ''); // Convert YYYY-MM-DD to YYYYMMDD
            const params = new URLSearchParams();
            if (patientId) params.append('patientId', patientId);
            if (formattedDate) params.append('date', formattedDate);

            const url = `/api/patient/history?${params.toString()}`;
            const response = await fetch(url);

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.message || data.error || '検索に失敗しました');
            }

            const data = await response.json();
            setResults(data.results || []);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : '予期せぬエラーが発生しました';
            setError(message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-5xl mx-auto">
                {/* 戻るボタン */}
                <Link href="/" className="inline-flex items-center gap-2 text-slate-500 hover:text-blue-600 font-bold mb-8 transition-colors group">
                    <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                    マニュアルTOPへ戻る
                </Link>

                <div className="bg-white shadow-2xl shadow-blue-100 rounded-[2.5rem] overflow-hidden border border-slate-100">
                    <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-8 md:p-12 text-white">
                        <div className="flex items-center gap-4 mb-6">
                            <div className="p-3 bg-blue-500 rounded-2xl shadow-lg">
                                <History className="w-8 h-8 text-white" />
                            </div>
                            <div>
                                <h1 className="text-3xl md:text-4xl font-black tracking-tight">患者カルテ・AIメンター検索</h1>
                                <p className="text-slate-400 font-medium">患者番号または診療日で過去の記録を検索できます</p>
                            </div>
                        </div>

                        <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-7 gap-4">
                            <div className="md:col-span-3">
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">患者番号 (任意)</label>
                                <div className="relative">
                                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                                    <input
                                        type="text"
                                        className="w-full pl-12 pr-4 py-4 bg-white/10 border border-white/20 rounded-2xl text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-bold"
                                        placeholder="例: 12345"
                                        value={patientId}
                                        onChange={(e) => setPatientId(e.target.value)}
                                    />
                                </div>
                            </div>
                            <div className="md:col-span-3">
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">診療日 (任意)</label>
                                <div className="relative">
                                    <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                                    <input
                                        type="date"
                                        className="w-full pl-12 pr-4 py-4 bg-white/10 border border-white/20 rounded-2xl text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-bold"
                                        value={date}
                                        onChange={(e) => setDate(e.target.value)}
                                    />
                                </div>
                            </div>
                            <div className="md:col-span-1 flex items-end">
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full h-[60px] bg-blue-500 hover:bg-blue-400 text-white font-black rounded-2xl transition-all shadow-lg shadow-blue-500/30 disabled:bg-slate-700 flex items-center justify-center gap-2"
                                >
                                    {loading ? <span className="animate-spin border-2 border-white/30 border-t-white rounded-full w-5 h-5" /> : <Search className="w-5 h-5" />}
                                    <span className="md:hidden">検索</span>
                                </button>
                            </div>
                        </form>
                    </div>

                    <div className="p-8 md:p-12">
                        {error && (
                            <div className="bg-red-50 border-l-4 border-red-500 p-6 rounded-r-2xl mb-8 animate-shake">
                                <div className="flex items-center gap-3 text-red-700 font-bold">
                                    <AlertCircle className="w-5 h-5" />
                                    {error}
                                </div>
                            </div>
                        )}

                        <div className="space-y-12">
                            {results.map((record, index) => (
                                <div key={index} className="group">
                                    <div className="flex items-center gap-4 mb-6">
                                        <div className="h-px flex-1 bg-slate-200" />
                                        <div className="px-6 py-2 bg-slate-100 rounded-full text-sm font-black text-slate-600 shadow-sm border border-slate-200">
                                            {record.date.slice(0, 4)}年{record.date.slice(4, 6)}月{record.date.slice(6, 8)}日 の記録
                                        </div>
                                        <div className="h-px flex-1 bg-slate-200" />
                                    </div>

                                    <div className="bg-white rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/50 overflow-hidden">
                                        <div className="p-8 md:p-10 prose prose-slate prose-blue max-w-none prose-headings:font-black prose-p:text-slate-700 prose-p:font-medium prose-li:font-semibold">
                                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                {record.content}
                                            </ReactMarkdown>
                                        </div>
                                    </div>
                                </div>
                            ))}

                            {!loading && results.length === 0 && !error && (
                                <div className="text-center py-24">
                                    <div className="inline-flex p-6 bg-slate-100 rounded-full mb-6">
                                        <Search className="w-12 h-12 text-slate-300" />
                                    </div>
                                    <h3 className="text-xl font-bold text-slate-900 mb-2">記録が見つかりませんでした</h3>
                                    <p className="text-slate-500 font-medium">患者番号や日付を変えて再度お試しください</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <style jsx global>{`
                @keyframes shake {
                    0%, 100% { transform: translateX(0); }
                    25% { transform: translateX(-5px); }
                    75% { transform: translateX(5px); }
                }
                .animate-shake { animation: shake 0.4s ease-in-out; }
            `}</style>
        </div>
    );
};

const AlertCircle = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" /></svg>
);

export default PatientSearch;
