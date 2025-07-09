import { NextRequest, NextResponse } from 'next/server';
import { processWebhook } from '@/lib/telegram';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    await processWebhook(body);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Telegram webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}