import { NextResponse } from 'next/server';
import { analyzeTransactions } from '@/lib/ai';
import Papa from 'papaparse';
// import pdf from 'pdf-parse'; // Uncomment when ready for PDF

export async function POST(request: Request) {
    try {
        const contentType = request.headers.get('content-type') || '';
        let transactions = [];

        if (contentType.includes('application/json')) {
            const body = await request.json();
            transactions = body.transactions;
        } else {
            const formData = await request.formData();
            const file = formData.get('file') as File;

            if (!file) {
                return NextResponse.json({ error: 'No file provided' }, { status: 400 });
            }

            if (file.name.endsWith('.csv')) {
                const text = await file.text();
                const result = Papa.parse(text, { header: true });
                transactions = result.data;
            } else if (file.name.endsWith('.pdf')) {
                // PDF parsing logic here
                // const buffer = Buffer.from(await file.arrayBuffer());
                // const data = await pdf(buffer);
                // transactions = parsePdfText(data.text);
                return NextResponse.json({ error: 'PDF support coming soon' }, { status: 400 });
            } else {
                return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 });
            }
        }

        const analyzed = await analyzeTransactions(transactions);

        return NextResponse.json({ transactions: analyzed });
    } catch (error) {
        console.error('Analysis error:', error);
        return NextResponse.json({ error: 'Analysis failed' }, { status: 500 });
    }
}
