import { xero } from './xero';
import { AnalyzedTransaction } from './ai';

export const syncToXero = async (transactions: AnalyzedTransaction[]) => {
    try {
        // Ensure we have a valid token (in real app, retrieve from storage)
        // const tokenSet = ...
        // xero.setTokenSet(tokenSet);

        const xeroTransactions = transactions.map(t => ({
            date: t.original.date,
            amount: t.original.amount,
            description: t.original.description,
            accountCode: t.category, // Assuming category maps to code
            type: t.original.type === 'debit' ? 'SPEND' : 'RECEIVE',
            status: 'AUTHORISED'
        }));

        // Batch create transactions
        // const response = await xero.accountingApi.createBankTransactions(activeTenantId, { bankTransactions: xeroTransactions });

        console.log('Syncing to Xero:', xeroTransactions.length, 'transactions');

        // Mock success for now
        return { success: true, count: xeroTransactions.length };
    } catch (error) {
        console.error('Sync failed:', error);
        throw error;
    }
};
