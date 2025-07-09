import { parse } from 'csv-parse';
import { promises as fs } from 'fs';
// import pdf from 'pdf-parse';

export interface ParsedTransaction {
  date: Date;
  description: string;
  amount: number;
  balance?: number;
}

export async function parseCSV(filepath: string): Promise<ParsedTransaction[]> {
  const fileContent = await fs.readFile(filepath, 'utf-8');
  
  return new Promise((resolve, reject) => {
    const transactions: ParsedTransaction[] = [];
    
    parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    })
    .on('readable', function() {
      let record;
      while ((record = this.read()) !== null) {
        // Try to detect common CSV formats
        const transaction = parseCSVRecord(record);
        if (transaction) {
          transactions.push(transaction);
        }
      }
    })
    .on('error', reject)
    .on('end', () => resolve(transactions));
  });
}

function parseCSVRecord(record: any): ParsedTransaction | null {
  try {
    // Common CSV column mappings - adjust based on your bank
    const dateKeys = ['Date', 'date', 'Transaction Date', 'Trans Date', 'Post Date'];
    const descriptionKeys = ['Description', 'description', 'Details', 'Transaction Details', 'Payee'];
    const amountKeys = ['Amount', 'amount', 'Debit/Credit', 'Transaction Amount'];
    const balanceKeys = ['Balance', 'balance', 'Running Balance', 'Available Balance'];
    
    // Find the correct columns
    const dateKey = dateKeys.find(key => record[key] !== undefined);
    const descriptionKey = descriptionKeys.find(key => record[key] !== undefined);
    const amountKey = amountKeys.find(key => record[key] !== undefined);
    
    if (!dateKey || !descriptionKey || !amountKey) {
      return null;
    }
    
    const balanceKey = balanceKeys.find(key => record[key] !== undefined);
    
    // Parse values
    const date = parseDate(record[dateKey]);
    const description = record[descriptionKey].trim();
    const amount = parseAmount(record[amountKey]);
    const balance = balanceKey ? parseAmount(record[balanceKey]) : undefined;
    
    if (!date || !description || isNaN(amount)) {
      return null;
    }
    
    return { date, description, amount, balance };
  } catch (error) {
    console.error('Error parsing CSV record:', error, record);
    return null;
  }
}

function parseDate(dateStr: string): Date | null {
  try {
    // Try common date formats
    const formats = [
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, // MM/DD/YYYY or DD/MM/YYYY
      /^(\d{4})-(\d{2})-(\d{2})$/, // YYYY-MM-DD
      /^(\d{1,2})-(\d{1,2})-(\d{4})$/, // DD-MM-YYYY or MM-DD-YYYY
    ];
    
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date;
    }
    
    // Try manual parsing for ambiguous formats
    for (const format of formats) {
      const match = dateStr.match(format);
      if (match) {
        // Assume MM/DD/YYYY for US banks
        return new Date(`${match[1]}/${match[2]}/${match[3]}`);
      }
    }
    
    return null;
  } catch {
    return null;
  }
}

function parseAmount(amountStr: string): number {
  try {
    // Remove currency symbols and commas
    const cleaned = amountStr.replace(/[$,]/g, '').trim();
    
    // Handle negative amounts (could be in parentheses)
    if (cleaned.startsWith('(') && cleaned.endsWith(')')) {
      return -parseFloat(cleaned.slice(1, -1));
    }
    
    return parseFloat(cleaned);
  } catch {
    return NaN;
  }
}

export async function parsePDF(filepath: string): Promise<ParsedTransaction[]> {
  // PDF parsing temporarily disabled for deployment
  throw new Error('PDF parsing temporarily disabled for deployment');
}