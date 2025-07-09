import { NextRequest, NextResponse } from 'next/server';
import { handleCallback } from '@/lib/xero';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    
    if (!code) {
      return NextResponse.redirect(new URL('/xero-auth?error=no_code', request.url));
    }
    
    const result = await handleCallback(code);
    
    if (result.success) {
      return NextResponse.redirect(new URL('/xero-auth?success=true', request.url));
    } else {
      return NextResponse.redirect(new URL('/xero-auth?error=auth_failed', request.url));
    }
  } catch (error) {
    console.error('Xero callback error:', error);
    return NextResponse.redirect(new URL('/xero-auth?error=callback_failed', request.url));
  }
}