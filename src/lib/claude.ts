import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '@/lib/db';
import { sendTelegramMessage } from '@/lib/telegram';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || 'placeholder',
});

const TRANSACTION_CATEGORIES = [
  'Office Supplies',
  'Travel & Transportation',
  'Meals & Entertainment',
  'Software & Subscriptions',
  'Professional Services',
  'Utilities',
  'Rent & Lease',
  'Insurance',
  'Advertising & Marketing',
  'Payroll & Benefits',
  'Bank Fees',
  'Taxes',
  'Equipment',
  'Income',
  'Other'
];

export async function categorizeTransactions(uploadId: string) {
  try {
    // Get all pending transactions for this upload
    const transactions = await prisma.transaction.findMany({
      where: {
        uploadId,
        status: 'PENDING'
      }
    });

    // Process transactions in batches
    const batchSize = 10;
    for (let i = 0; i < transactions.length; i += batchSize) {
      const batch = transactions.slice(i, i + batchSize);
      await processBatch(batch);
    }
  } catch (error) {
    console.error('Error categorizing transactions:', error);
    throw error;
  }
}

async function processBatch(transactions: any[]) {
  const prompt = `You are a bookkeeping assistant. Categorize the following bank transactions into one of these categories:
${TRANSACTION_CATEGORIES.join(', ')}

For each transaction, provide:
1. The most appropriate category
2. A confidence score from 0 to 1 (1 being very confident)
3. If confidence is below 0.7, suggest 2-3 alternative categories

Transactions:
${transactions.map((tx, idx) => `${idx + 1}. Date: ${tx.date.toLocaleDateString()}, Description: "${tx.description}", Amount: $${Math.abs(tx.amount)}`).join('\n')}

Respond in JSON format:
[
  {
    "transactionIndex": 1,
    "category": "Office Supplies",
    "confidence": 0.95,
    "alternatives": []
  },
  ...
]`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-sonnet-20240229',
      max_tokens: 1000,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    const content = response.content[0];
    if (content.type === 'text') {
      const categorizations = JSON.parse(content.text);
      
      // Update transactions with categorizations
      for (const cat of categorizations) {
        const tx = transactions[cat.transactionIndex - 1];
        
        if (cat.confidence >= 0.7) {
          // High confidence - categorize directly
          await prisma.transaction.update({
            where: { id: tx.id },
            data: {
              category: cat.category,
              confidence: cat.confidence,
              status: 'CATEGORIZED'
            }
          });
        } else {
          // Low confidence - needs clarification
          await prisma.transaction.update({
            where: { id: tx.id },
            data: {
              category: cat.category,
              confidence: cat.confidence,
              status: 'NEEDS_CLARIFICATION',
              needsClarification: true
            }
          });
          
          // Send Telegram message for clarification
          await requestClarification(tx, cat);
        }
      }
    }
  } catch (error) {
    console.error('Error processing batch:', error);
    // Mark transactions as failed
    for (const tx of transactions) {
      await prisma.transaction.update({
        where: { id: tx.id },
        data: { status: 'FAILED' }
      });
    }
  }
}

async function requestClarification(transaction: any, categorization: any) {
  const message = `🤔 Need clarification for transaction:

📅 Date: ${transaction.date.toLocaleDateString()}
📝 Description: "${transaction.description}"
💰 Amount: $${Math.abs(transaction.amount)}

Suggested category: ${categorization.category} (${Math.round(categorization.confidence * 100)}% confidence)

Alternative categories:
${categorization.alternatives.map((alt: string, idx: number) => `${idx + 1}. ${alt}`).join('\n')}

Reply with the number of your chosen category or type a new category name.`;

  const messageId = await sendTelegramMessage(message);
  
  // Store the Telegram message ID for tracking responses
  await prisma.transaction.update({
    where: { id: transaction.id },
    data: { telegramMessageId: messageId }
  });
}