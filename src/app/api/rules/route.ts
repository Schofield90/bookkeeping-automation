import { NextResponse } from 'next/server';
import { saveRule } from '@/lib/rules';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { pattern, category } = body;

        if (!pattern || !category) {
            return NextResponse.json({ error: 'Pattern and category are required' }, { status: 400 });
        }

        const rule = saveRule(pattern, category);
        return NextResponse.json({ rule });
    } catch (error) {
        console.error('Failed to save rule:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
