import { NextResponse } from 'next/server';
import { getXeroUrl } from '@/lib/xero';

export async function GET() {
    try {
        const url = await getXeroUrl();
        return NextResponse.redirect(url);
    } catch (error) {
        console.error('Login error:', error);
        return NextResponse.json({ error: 'Failed to initiate login' }, { status: 500 });
    }
}
