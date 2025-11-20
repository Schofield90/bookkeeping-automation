'use client'

/**
 * Searchable Chart of Accounts Selector
 * Fetches and displays Xero Chart of Accounts with search functionality
 */

import React, { useState, useEffect, useRef } from 'react'
import { getChartOfAccounts } from '@/lib/api'
import styles from './AccountSelector.module.css'

interface ChartOfAccount {
  code: string
  name: string
  type?: string
  description?: string
  tax_type?: string
  status?: string
}

interface AccountSelectorProps {
  organizationId: string
  value?: { code: string; name: string }
  onChange: (account: { code: string; name: string }) => void
  placeholder?: string
}

export function AccountSelector({
  organizationId,
  value,
  onChange,
  placeholder = 'Search Chart of Accounts...'
}: AccountSelectorProps) {
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([])
  const [filteredAccounts, setFilteredAccounts] = useState<ChartOfAccount[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Load Chart of Accounts on mount
  useEffect(() => {
    loadAccounts()
  }, [organizationId])

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Filter accounts based on search term
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredAccounts(accounts)
      return
    }

    const term = searchTerm.toLowerCase()
    const filtered = accounts.filter(
      (account) =>
        account.code.toLowerCase().includes(term) ||
        account.name.toLowerCase().includes(term) ||
        account.type?.toLowerCase().includes(term)
    )
    setFilteredAccounts(filtered)
  }, [searchTerm, accounts])

  const loadAccounts = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await getChartOfAccounts(organizationId)
      setAccounts(response.accounts || [])
      setFilteredAccounts(response.accounts || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Chart of Accounts')
      console.error('Error loading Chart of Accounts:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSelectAccount = (account: ChartOfAccount) => {
    onChange({ code: account.code, name: account.name })
    setSearchTerm('')
    setIsOpen(false)
  }

  const handleInputClick = () => {
    setIsOpen(true)
    if (accounts.length === 0 && !loading && !error) {
      loadAccounts()
    }
  }

  return (
    <div className={styles.wrapper} ref={wrapperRef}>
      <div className={styles.inputWrapper}>
        <input
          type="text"
          className={styles.input}
          placeholder={value ? `${value.code} - ${value.name}` : placeholder}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onClick={handleInputClick}
          onFocus={() => setIsOpen(true)}
        />
        <span className={styles.icon}>🔍</span>
      </div>

      {isOpen && (
        <div className={styles.dropdown}>
          {loading && (
            <div className={styles.loadingState}>
              <span className={styles.spinner}>⟳</span>
              Loading Chart of Accounts...
            </div>
          )}

          {error && (
            <div className={styles.errorState}>
              <span className={styles.errorIcon}>❌</span>
              {error}
              <button className={styles.retryButton} onClick={loadAccounts}>
                Retry
              </button>
            </div>
          )}

          {!loading && !error && filteredAccounts.length === 0 && (
            <div className={styles.emptyState}>
              <span className={styles.emptyIcon}>🔍</span>
              No accounts found matching "{searchTerm}"
            </div>
          )}

          {!loading && !error && filteredAccounts.length > 0 && (
            <div className={styles.accountList}>
              {filteredAccounts.map((account) => (
                <div
                  key={account.code}
                  className={styles.accountItem}
                  onClick={() => handleSelectAccount(account)}
                >
                  <div className={styles.accountCode}>{account.code}</div>
                  <div className={styles.accountDetails}>
                    <div className={styles.accountName}>{account.name}</div>
                    {account.type && (
                      <div className={styles.accountType}>{account.type}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
