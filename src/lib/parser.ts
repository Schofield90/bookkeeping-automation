import Papa from 'papaparse';
// import pdf from 'pdf-parse'; // Note: pdf-parse is server-side mostly. For client-side, we might need a different approach or send file to API.

export interface Transaction {
    date: string;
    description: string;
    amount: number;
    type: 'debit' | 'credit';
}

export const parseCSV = (file: File): Promise<Transaction[]> => {
    return new Promise((resolve, reject) => {
        Papa.parse(file, {
            header: true,
            complete: (results) => {
                const transactions: Transaction[] = results.data.map((row: any) => {
                    // Basic heuristic mapping - can be improved with AI later
                    const amount = parseFloat(row['Amount'] || row['amount'] || row['Value'] || '0');
                    return {
                        date: row['Date'] || row['date'],
                        description: row['Description'] || row['description'] || row['Memo'],
                        amount: Math.abs(amount),
                        type: amount < 0 ? 'debit' : 'credit'
                    };
                }).filter(t => t.date && t.amount); // Filter invalid rows
                resolve(transactions);
            },
            error: (error) => reject(error)
        });
    });
};

// For PDF, we usually need to send it to the server to parse effectively using libraries like pdf-parse
// or use a client-side library like pdf.js which is heavier.
// For this MVP, we'll focus on CSV and stub PDF to suggest server-side processing.
export const parsePDF = async (file: File): Promise<Transaction[]> => {
    throw new Error("PDF parsing requires server-side processing. Please upload CSV for immediate client-side preview, or implement the API endpoint.");
};
