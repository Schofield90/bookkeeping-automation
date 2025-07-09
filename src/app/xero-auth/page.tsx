'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function XeroAuthPage() {
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [organization, setOrganization] = useState('');

  useEffect(() => {
    checkConnection();
  }, []);

  const checkConnection = async () => {
    try {
      const response = await fetch('/api/xero/status');
      const data = await response.json();
      setConnected(data.connected);
      setOrganization(data.organization || '');
    } catch (error) {
      console.error('Error checking Xero connection:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    try {
      const response = await fetch('/api/xero/auth');
      const data = await response.json();
      if (data.authUrl) {
        window.location.href = data.authUrl;
      }
    } catch (error) {
      console.error('Error initiating Xero auth:', error);
    }
  };

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

      <main className="max-w-3xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">
                Xero Integration
              </h2>
              
              {loading ? (
                <p>Loading...</p>
              ) : connected ? (
                <div>
                  <div className="rounded-md bg-green-50 p-4 mb-4">
                    <div className="flex">
                      <div className="flex-shrink-0">
                        <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div className="ml-3">
                        <p className="text-sm text-green-800">
                          Connected to Xero organization: <strong>{organization}</strong>
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-4">
                    <button
                      onClick={handleConnect}
                      className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                    >
                      Reconnect to Different Organization
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-gray-600 mb-4">
                    Connect your Xero account to automatically post categorized transactions.
                  </p>
                  
                  <button
                    onClick={handleConnect}
                    className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
                  >
                    Connect to Xero
                  </button>
                </div>
              )}
              
              <div className="mt-6 border-t border-gray-200 pt-6">
                <h3 className="text-sm font-medium text-gray-900">
                  What happens when you connect?
                </h3>
                <ul className="mt-2 text-sm text-gray-500 list-disc list-inside space-y-1">
                  <li>You'll be redirected to Xero to authorize access</li>
                  <li>We'll only access transaction and account data</li>
                  <li>Categorized transactions will be automatically posted</li>
                  <li>You can disconnect at any time</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}