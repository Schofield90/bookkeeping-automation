import { NextResponse } from 'next/server';
import { xero } from '@/lib/xero';

export async function GET(request: Request) {
    try {
        const tokenSet = await xero.apiCallback(request.url);
        await xero.updateTenants(false);

        const activeTenant = xero.tenants[0];

        // TODO: Store tokenSet and activeTenant.id in a secure session or database
        console.log('Authenticated with tenant:', activeTenant.tenantId);

        return NextResponse.redirect(new URL('/dashboard', request.url));
    } catch (e) {
        console.error('Callback error:', e);
        return NextResponse.json({ error: 'Failed to authenticate with Xero' }, { status: 500 });
    }
}
