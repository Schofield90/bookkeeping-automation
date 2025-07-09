import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const token = await prisma.xeroToken.findFirst({
      orderBy: { createdAt: 'desc' }
    });
    
    if (!token) {
      return NextResponse.json({ connected: false });
    }
    
    // Check if token is still valid
    const now = new Date();
    const isValid = token.expiresAt > now;
    
    return NextResponse.json({ 
      connected: isValid,
      organization: token.tenantId ? 'Connected Organization' : null
    });
  } catch (error) {
    console.error('Error checking Xero status:', error);
    return NextResponse.json(
      { error: 'Failed to check connection status' },
      { status: 500 }
    );
  }
}