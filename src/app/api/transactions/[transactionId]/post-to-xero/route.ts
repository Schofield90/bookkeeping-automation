import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { sessionOptions, SessionData } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { createBankTransaction } from '@/lib/xero';

export async function POST(
  request: NextRequest,
  { params }: { params: { transactionId: string } }
) {
  const response = NextResponse.next();
  const session = await getIronSession<SessionData>(request, response, sessionOptions);

  if (!session.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const transactionId = params.transactionId;
    
    // Get transaction
    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId }
    });
    
    if (!transaction) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }
    
    if (transaction.status !== 'CLARIFIED' && transaction.status !== 'CATEGORIZED') {
      return NextResponse.json(
        { error: 'Transaction not ready for posting' },
        { status: 400 }
      );
    }
    
    // Post to Xero
    const xeroTransaction = await createBankTransaction(transaction);
    
    return NextResponse.json({ 
      success: true, 
      xeroTransaction: xeroTransaction.bankTransactionID 
    });
  } catch (error) {
    console.error('Error posting to Xero:', error);
    return NextResponse.json(
      { error: 'Failed to post to Xero' },
      { status: 500 }
    );
  }
}