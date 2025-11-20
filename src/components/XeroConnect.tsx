'use client'

/**
 * Xero Connection Component
 * Handles OAuth 2.0 connection flow with visual feedback
 */

import React, { useState, useEffect } from 'react'
import styles from './XeroConnect.module.css'

interface XeroConnectionStatus {
  isConnected: boolean
  organizationName?: string
  lastSync?: string
}

export function XeroConnect() {
  const [status, setStatus] = useState<XeroConnectionStatus>({ isConnected: false })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Check connection status on mount
    checkConnectionStatus()
  }, [])

  const checkConnectionStatus = async () => {
    try {
      // TODO: Call backend API to check if Xero is connected
      // For now, check localStorage for connection status
      const connected = localStorage.getItem('xero_connected') === 'true'
      const orgName = localStorage.getItem('xero_org_name')

      setStatus({
        isConnected: connected,
        organizationName: orgName || undefined,
      })
    } catch (err) {
      console.error('Error checking Xero status:', err)
    }
  }

  const handleConnect = async () => {
    try {
      setLoading(true)
      setError(null)

      // Redirect to Xero OAuth flow
      // The backend will handle the OAuth dance
      window.location.href = '/api/xero/connect?organization_id=550e8400-e29b-41d4-a716-446655440000'
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to Xero')
      setLoading(false)
    }
  }

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect from Xero?')) {
      return
    }

    try {
      // TODO: Call backend API to disconnect
      localStorage.removeItem('xero_connected')
      localStorage.removeItem('xero_org_name')
      setStatus({ isConnected: false })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect')
    }
  }

  if (status.isConnected) {
    return (
      <div className={styles.connected}>
        <div className={styles.statusHeader}>
          <div className={styles.lockIcon}>🔒</div>
          <div>
            <div className={styles.statusTitle}>Connected to Xero</div>
            <div className={styles.orgName}>{status.organizationName || 'Your Organization'}</div>
          </div>
        </div>
        <div className={styles.statusIndicator}>
          <span className={styles.greenDot}>●</span>
          <span>Active Connection</span>
        </div>
        <button
          className={styles.disconnectButton}
          onClick={handleDisconnect}
        >
          Disconnect
        </button>
      </div>
    )
  }

  return (
    <div className={styles.notConnected}>
      <div className={styles.header}>
        <h2 className={styles.title}>Connect to Xero</h2>
        <p className={styles.subtitle}>
          Securely link your Xero account to enable automatic transaction sync
        </p>
      </div>

      {error && (
        <div className={styles.error}>
          <span className={styles.errorIcon}>❌</span>
          <span>{error}</span>
        </div>
      )}

      <div className={styles.benefits}>
        <div className={styles.benefit}>
          <span className={styles.checkIcon}>✓</span>
          <span>Automatic transaction sync</span>
        </div>
        <div className={styles.benefit}>
          <span className={styles.checkIcon}>✓</span>
          <span>Real-time chart of accounts</span>
        </div>
        <div className={styles.benefit}>
          <span className={styles.checkIcon}>✓</span>
          <span>Secure OAuth 2.0 connection</span>
        </div>
      </div>

      <button
        className={styles.connectButton}
        onClick={handleConnect}
        disabled={loading}
      >
        {loading ? (
          <>
            <span className={styles.spinner}>⟳</span>
            Connecting...
          </>
        ) : (
          <>
            <span className={styles.xeroIcon}>🔗</span>
            Connect to Xero
          </>
        )}
      </button>

      <p className={styles.security}>
        🔒 Your credentials are never stored. We use OAuth 2.0 for secure authorization.
      </p>
    </div>
  )
}
