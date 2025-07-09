import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizationUrl } from '@/lib/xero';

export async function GET(request: NextRequest) {
  try {
    const authUrl = getAuthorizationUrl();
    return NextResponse.json({ authUrl });
  } catch (error) {
    console.error('Error generating Xero auth URL:', error);
    return NextResponse.json(
      { error: 'Failed to generate authorization URL' },
      { status: 500 }
    );
  }
}