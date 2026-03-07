import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const patientId = searchParams.get('patientId');
  const date = searchParams.get('date'); // YYYYMMDD

  if (!patientId && !date) {
    return NextResponse.json({ error: 'patientId or date is required' }, { status: 400 });
  }

  const dataDir = path.join(process.cwd(), 'data', 'subcharts');

  if (!fs.existsSync(dataDir)) {
    return NextResponse.json({ error: 'Data directory not found' }, { status: 404 });
  }

  try {
    const files = fs.readdirSync(dataDir);

    // 検索条件に一致するファイルをフィルタリング
    // ファイル名形式: YYYYMMDD_PatientID.md
    const matches = files.filter(file => {
      if (file === 'last_generated.md') return false;
      const parts = file.replace('.md', '').split('_');
      if (parts.length !== 2) return false;

      const [fileDate, filePid] = parts;

      const pidMatch = patientId ? filePid === patientId : true;
      const dateMatch = date ? fileDate === date : true;

      return pidMatch && dateMatch;
    });

    if (matches.length === 0) {
      return NextResponse.json({ message: '条件に一致する記録が見当たりませんでした' }, { status: 404 });
    }

    // 最新のものを取得
    const results = matches.map(file => {
      const filePath = path.join(dataDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const baseName = file.replace('.md', '');
      const dateStr = baseName.split('_')[0];

      // 関連するアラートやメモがあれば読み込む
      let alertContent = '';
      let memoContent = '';

      const alertPath = path.join(dataDir, `${baseName}_alert.md`);
      if (fs.existsSync(alertPath)) alertContent = fs.readFileSync(alertPath, 'utf-8');

      const memoPath = path.join(dataDir, `${baseName}_memo.md`);
      if (fs.existsSync(memoPath)) memoContent = fs.readFileSync(memoPath, 'utf-8');

      return {
        date: dateStr,
        content: content,
        filename: file,
        alert: alertContent,
        memo: memoContent
      };
    }).sort((a, b) => b.date.localeCompare(a.date));

    return NextResponse.json({ results });
  } catch (error) {
    console.error('Error reading subcharts:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
