import PatientSearch from './PatientSearch';

export const metadata = {
    title: '患者カルテ検索 | 中目黒コヤス歯科 マニュアル',
    description: '患者番号と日付から過去の診療録を検索します。',
};

export default function SearchPage() {
    return (
        <main className="min-h-screen bg-gray-50 py-12 px-4">
            <PatientSearch />
        </main>
    );
}
