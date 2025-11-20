import { XeroClient } from 'xero-node';

const client_id = process.env.XERO_CLIENT_ID || '';
const client_secret = process.env.XERO_CLIENT_SECRET || '';
const redirectUrl = process.env.XERO_REDIRECT_URI || 'http://localhost:3000/api/auth/callback/xero';

const scopes = [
    'openid',
    'profile',
    'email',
    'accounting.transactions',
    'accounting.settings',
    'offline_access'
];

export const xero = new XeroClient({
    clientId: client_id,
    clientSecret: client_secret,
    redirectUris: [redirectUrl],
    scopes: scopes.join(' '),
});

export const getXeroUrl = async () => {
    try {
        const consentUrl = await xero.buildConsentUrl();
        return consentUrl;
    } catch (err) {
        console.error('Error building consent URL:', err);
        throw err;
    }
};
