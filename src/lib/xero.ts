import { XeroClient } from 'xero-node';
import { prisma } from '@/lib/db';

const xero = new XeroClient({
  clientId: process.env.XERO_CLIENT_ID!,
  clientSecret: process.env.XERO_CLIENT_SECRET!,
  redirectUris: [process.env.XERO_REDIRECT_URI!],
  scopes: process.env.XERO_SCOPES!.split(' ')
});

export function getAuthorizationUrl() {
  return xero.buildConsentUrl();
}

export async function handleCallback(code: string) {
  try {
    const tokenSet = await xero.apiCallback(code);
    
    // Get tenant information
    const tenants = await xero.updateTenants();
    
    if (tenants.length === 0) {
      throw new Error('No Xero organizations connected');
    }
    
    // Save token to database
    const expiresAt = new Date(Date.now() + tokenSet.expires_in * 1000);
    
    await prisma.xeroToken.create({
      data: {
        accessToken: tokenSet.access_token,
        refreshToken: tokenSet.refresh_token!,
        expiresAt,
        tenantId: tenants[0].tenantId
      }
    });
    
    return { success: true, organization: tenants[0].tenantName };
  } catch (error) {
    console.error('Xero callback error:', error);
    throw error;
  }
}

export async function getXeroClient() {
  // Get the latest token from database
  const token = await prisma.xeroToken.findFirst({
    orderBy: { createdAt: 'desc' }
  });
  
  if (!token) {
    throw new Error('No Xero connection found. Please authorize Xero first.');
  }
  
  // Check if token needs refresh
  const now = new Date();
  if (token.expiresAt < now) {
    // Refresh the token
    const newTokenSet = await xero.refreshWithRefreshToken(
      token.refreshToken,
      token.tenantId
    );
    
    // Update token in database
    const expiresAt = new Date(Date.now() + newTokenSet.expires_in * 1000);
    await prisma.xeroToken.update({
      where: { id: token.id },
      data: {
        accessToken: newTokenSet.access_token,
        refreshToken: newTokenSet.refresh_token!,
        expiresAt
      }
    });
    
    xero.setTokenSet(newTokenSet);
  } else {
    xero.setTokenSet({
      access_token: token.accessToken,
      refresh_token: token.refreshToken,
      expires_in: Math.floor((token.expiresAt.getTime() - now.getTime()) / 1000),
      token_type: 'Bearer',
      scope: process.env.XERO_SCOPES!
    });
  }
  
  await xero.updateTenants();
  return xero;
}

export async function createBankTransaction(transaction: any) {
  const xeroClient = await getXeroClient();
  const token = await prisma.xeroToken.findFirst({
    orderBy: { createdAt: 'desc' }
  });
  
  if (!token) throw new Error('No Xero token found');
  
  // Map our transaction to Xero format
  const bankTransaction = {
    type: transaction.amount < 0 ? 'SPEND' : 'RECEIVE',
    contact: {
      name: transaction.description.slice(0, 50) // Use description as contact name
    },
    lineItems: [{
      description: transaction.description,
      quantity: 1,
      unitAmount: Math.abs(transaction.amount),
      accountCode: getAccountCodeForCategory(transaction.category)
    }],
    date: transaction.date.toISOString().split('T')[0],
    reference: transaction.id,
    status: 'AUTHORISED'
  };
  
  try {
    const response = await xeroClient.accountingApi.createBankTransactions(
      token.tenantId,
      { bankTransactions: [bankTransaction] }
    );
    
    const createdTransaction = response.body.bankTransactions?.[0];
    
    if (createdTransaction) {
      // Update our transaction with Xero ID
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: {
          xeroId: createdTransaction.bankTransactionID,
          xeroStatus: 'POSTED',
          status: 'POSTED_TO_XERO'
        }
      });
      
      return createdTransaction;
    }
  } catch (error) {
    console.error('Error creating Xero transaction:', error);
    throw error;
  }
}

function getAccountCodeForCategory(category: string): string {
  // Map categories to Xero account codes
  // You'll need to customize this based on your Chart of Accounts
  const categoryMap: Record<string, string> = {
    'Office Supplies': '400',
    'Travel & Transportation': '420',
    'Meals & Entertainment': '421',
    'Software & Subscriptions': '425',
    'Professional Services': '430',
    'Utilities': '445',
    'Rent & Lease': '450',
    'Insurance': '460',
    'Advertising & Marketing': '470',
    'Payroll & Benefits': '477',
    'Bank Fees': '404',
    'Taxes': '490',
    'Equipment': '410',
    'Income': '200',
    'Other': '499'
  };
  
  return categoryMap[category] || '499'; // Default to Other
}