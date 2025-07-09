import TelegramBot from 'node-telegram-bot-api';
import { prisma } from '@/lib/db';

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN || 'placeholder', {
  polling: process.env.NODE_ENV === 'development'
});

export async function sendTelegramMessage(message: string): Promise<number> {
  try {
    const chatId = process.env.TELEGRAM_CHAT_ID || 'placeholder';
    const response = await bot.sendMessage(chatId, message);
    return response.message_id;
  } catch (error) {
    console.error('Error sending Telegram message:', error);
    throw error;
  }
}

export async function processWebhook(body: any) {
  try {
    if (body.message && body.message.text) {
      const message = body.message;
      const chatId = message.chat.id.toString();
      const text = message.text.trim();
      
      // Check if this is a response to a transaction clarification
      if (message.reply_to_message) {
        const originalMessageId = message.reply_to_message.message_id;
        
        // Find the transaction waiting for clarification
        const transaction = await prisma.transaction.findFirst({
          where: {
            telegramMessageId: originalMessageId,
            status: 'NEEDS_CLARIFICATION'
          }
        });
        
        if (transaction) {
          await handleClarificationResponse(transaction, text);
        }
      } else {
        // Regular message - send acknowledgment
        await bot.sendMessage(chatId, 'Message received. I respond to transaction clarifications.');
      }
    }
  } catch (error) {
    console.error('Error processing Telegram webhook:', error);
    throw error;
  }
}

async function handleClarificationResponse(transaction: any, response: string) {
  try {
    let category = '';
    
    // Check if response is a number (selecting from alternatives)
    const num = parseInt(response);
    if (!isNaN(num)) {
      // Get the original categorization to find alternatives
      const originalCategory = transaction.category;
      
      // This is simplified - in reality you'd need to store the alternatives
      // For now, just use the original category
      category = originalCategory;
    } else {
      // User provided a custom category
      category = response;
    }
    
    // Update transaction with user's choice
    await prisma.transaction.update({
      where: { id: transaction.id },
      data: {
        category,
        confidence: 1.0, // User confirmed, so confidence is 100%
        status: 'CLARIFIED',
        userResponse: response
      }
    });
    
    // Send confirmation message
    await bot.sendMessage(
      process.env.TELEGRAM_CHAT_ID || 'placeholder',
      `✅ Transaction categorized as "${category}". It will be posted to Xero shortly.`
    );
    
    // Post to Xero (this would trigger the Xero posting process)
    await postToXero(transaction.id);
    
  } catch (error) {
    console.error('Error handling clarification response:', error);
    await bot.sendMessage(
      process.env.TELEGRAM_CHAT_ID || 'placeholder',
      `❌ Error processing your response. Please try again.`
    );
  }
}

async function postToXero(transactionId: string) {
  try {
    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId }
    });
    
    if (!transaction) return;
    
    // Import here to avoid circular dependencies
    const { createBankTransaction } = await import('@/lib/xero');
    
    await createBankTransaction(transaction);
    
    await bot.sendMessage(
      process.env.TELEGRAM_CHAT_ID || 'placeholder',
      `💰 Transaction posted to Xero successfully!`
    );
  } catch (error) {
    console.error('Error posting to Xero:', error);
    await bot.sendMessage(
      process.env.TELEGRAM_CHAT_ID || 'placeholder',
      `❌ Error posting to Xero: ${error.message}`
    );
  }
}

// Set up webhook for production
export async function setupWebhook() {
  if (process.env.NODE_ENV === 'production') {
    const webhookUrl = `${process.env.NEXTAUTH_URL}/api/webhooks/telegram`;
    await bot.setWebHook(webhookUrl);
  }
}