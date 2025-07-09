import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { createBankTransaction } from '@/lib/xero';

export async function GET(request: NextRequest) {
  try {
    // Check for authorization header in production
    const authHeader = request.headers.get('authorization');
    if (process.env.NODE_ENV === 'production' && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Find transactions that are categorized but not yet posted to Xero
    const transactions = await prisma.transaction.findMany({
      where: {
        status: 'CATEGORIZED',
        xeroId: null
      },
      take: 10 // Process 10 at a time
    });

    let processed = 0;
    let failed = 0;

    for (const transaction of transactions) {
      try {
        await createBankTransaction(transaction);
        processed++;
      } catch (error) {
        console.error(`Failed to post transaction ${transaction.id}:`, error);
        failed++;
        
        // Mark as failed after 3 attempts
        const currentFailures = (transaction.rawData as any)?.failureCount || 0;
        if (currentFailures >= 2) {
          await prisma.transaction.update({
            where: { id: transaction.id },
            data: { status: 'FAILED' }
          });
        } else {
          await prisma.transaction.update({
            where: { id: transaction.id },
            data: {
              rawData: {
                ...(transaction.rawData as any),
                failureCount: currentFailures + 1
              }
            }
          });
        }
      }
    }

    return NextResponse.json({ 
      processed, 
      failed, 
      total: transactions.length 
    });
  } catch (error) {
    console.error('Cron job error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}