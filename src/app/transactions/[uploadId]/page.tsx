'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  category: string | null;
  confidence: number | null;
  status: string;
  xeroStatus: string | null;
  needsClarification: boolean;
}

export default function TransactionsPage() {
  const params = useParams();
  const uploadId = params.uploadId as string;
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [upload, setUpload] = useState<any>(null);

  useEffect(() => {
    fetchTransactions();
  }, [uploadId]);

  const fetchTransactions = async () => {
    try {
      const response = await fetch(`/api/transactions/${uploadId}`);
      if (response.ok) {
        const data = await response.json();
        setTransactions(data.transactions);
        setUpload(data.upload);
      }
    } catch (error) {
      console.error('Error fetching transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePostToXero = async (transactionId: string) => {
    try {
      const response = await fetch(`/api/transactions/${transactionId}/post-to-xero`, {
        method: 'POST'
      });
      
      if (response.ok) {
        // Refresh the transactions list
        fetchTransactions();
      }
    } catch (error) {
      console.error('Error posting to Xero:', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'CATEGORIZED':
        return 'bg-green-100 text-green-800';
      case 'NEEDS_CLARIFICATION':
        return 'bg-yellow-100 text-yellow-800';
      case 'CLARIFIED':
        return 'bg-blue-100 text-blue-800';
      case 'POSTED_TO_XERO':
        return 'bg-purple-100 text-purple-800';
      case 'FAILED':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading transactions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Link href="/" className="text-xl font-semibold">
                Bookkeeping Automation
              </Link>
            </div>
            <div className="flex items-center">
              <Link
                href="/"
                className="text-gray-700 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
              >
                Back to Dashboard
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-medium text-gray-900">
                  Transactions for {upload?.originalName}
                </h2>
                <div className="text-sm text-gray-500">
                  Total: {transactions.length} transactions
                </div>
              </div>
              
              {transactions.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500">No transactions found</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Date
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Description
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Amount
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Category
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {transactions.map((transaction) => (
                        <tr key={transaction.id}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {new Date(transaction.date).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">
                            {transaction.description}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            ${Math.abs(transaction.amount).toFixed(2)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {transaction.category || 'Uncategorized'}
                            {transaction.confidence && (
                              <div className="text-xs text-gray-500">
                                {Math.round(transaction.confidence * 100)}% confidence
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(transaction.status)}`}>
                              {transaction.status}
                            </span>
                            {transaction.needsClarification && (
                              <div className="text-xs text-yellow-600 mt-1">
                                Telegram sent
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            {transaction.status === 'CLARIFIED' && (
                              <button
                                onClick={() => handlePostToXero(transaction.id)}
                                className="text-blue-600 hover:text-blue-900"
                              >
                                Post to Xero
                              </button>
                            )}
                            {transaction.status === 'POSTED_TO_XERO' && (
                              <span className="text-green-600">✓ Posted</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}