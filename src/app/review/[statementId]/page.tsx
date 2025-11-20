'use client'

/**
 * Review Page - THE LEARNING LOOP
 *
 * This is where the AI learns from user corrections!
 *
 * Flow:
 * 1. Display transactions prioritized by confidence (low confidence first)
 * 2. User approves or corrects categorization
 * 3. On correction: Generate embedding → Store in learned_patterns
 * 4. Next similar transaction → Vector search finds it!
 */

import React, { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { getReviewFeed, updateTransaction, syncToXero } from '@/lib/api'
import styles from './review.module.css'

// Mock organization ID
const MOCK_ORG_ID = '550e8400-e29b-41d4-a716-446655440000'

interface Transaction {
  id: string
  transaction_date: string
  description: string
  amount: number
  transaction_type: string
  assigned_account_code?: string
  assigned_account_name?: string
  ai_confidence_score: number
  is_user_verified: boolean
  needs_review: boolean
  categorization_source?: string
  review_priority: number
}

export default function ReviewPage() {
  const router = useRouter()
  const params = useParams()
  const statementId = params.statementId as string

  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [verifiedCount, setVerifiedCount] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    loadTransactions()
  }, [statementId])

  const loadTransactions = async () => {
    try {
      setLoading(true)
      const data = await getReviewFeed(statementId, MOCK_ORG_ID)

      setTransactions(data.transactions)
      setVerifiedCount(data.verified_count)
      setTotalCount(data.total_transactions)
      setLoading(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load transactions')
      setLoading(false)
    }
  }

  const handleApprove = async (transaction: Transaction, customCode?: string, customName?: string) => {
    try {
      const accountCode = customCode || transaction.assigned_account_code
      const accountName = customName || transaction.assigned_account_name

      if (!accountCode || !accountName) {
        alert('Please select an account category')
        return
      }

      // THE LEARNING TRIGGER!
      const result = await updateTransaction({
        transaction_id: transaction.id,
        organization_id: MOCK_ORG_ID,
        approved_account_code: accountCode,
        approved_account_name: accountName
      })

      if (result.pattern_learned) {
        // Show success message
        showToast(`✨ AI learned: "${transaction.description}" → ${accountName}`, 'success')
      }

      // Remove from list
      setTransactions(prev => prev.filter(t => t.id !== transaction.id))
      setVerifiedCount(prev => prev + 1)

      // Check if all done
      if (transactions.length === 1) {
        showToast('🎉 All transactions reviewed!', 'success')
      }

    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update transaction', 'error')
    }
  }

  const handleSyncToXero = async () => {
    if (verifiedCount < totalCount) {
      alert(`Please review all transactions first. ${totalCount - verifiedCount} remaining.`)
      return
    }

    if (!confirm('Sync all verified transactions to Xero?')) {
      return
    }

    try {
      setSyncing(true)
      const result = await syncToXero(statementId, MOCK_ORG_ID)

      if (result.success) {
        showToast(
          `✅ Successfully synced ${result.synced_count} transactions to Xero!`,
          'success'
        )
        setTimeout(() => router.push('/dashboard'), 2000)
      } else {
        showToast(`Failed to sync: ${result.errors.join(', ')}`, 'error')
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to sync to Xero', 'error')
    } finally {
      setSyncing(false)
    }
  }

  const showToast = (message: string, type: 'success' | 'error') => {
    // Simple toast implementation
    const toast = document.createElement('div')
    toast.className = `${styles.toast} ${styles[type]}`
    toast.textContent = message
    document.body.appendChild(toast)

    setTimeout(() => {
      toast.remove()
    }, 3000)
  }

  if (loading) {
    return (
      <main className={styles.main}>
        <div className={styles.loading}>
          <div className={styles.spinner}></div>
          <p>Loading transactions...</p>
        </div>
      </main>
    )
  }

  if (error) {
    return (
      <main className={styles.main}>
        <div className={styles.error}>
          <h2>Error</h2>
          <p>{error}</p>
          <button onClick={() => router.push('/upload')}>Back to Upload</button>
        </div>
      </main>
    )
  }

  return (
    <main className={styles.main}>
      <div className={styles.container}>
        {/* Header */}
        <div className={styles.header}>
          <h1 className={styles.title}>Review Transactions</h1>
          <div className={styles.progress}>
            <div className={styles.progressBar}>
              <div
                className={styles.progressFill}
                style={{ width: `${(verifiedCount / totalCount) * 100}%` }}
              ></div>
            </div>
            <p className={styles.progressText}>
              {verifiedCount} / {totalCount} verified
            </p>
          </div>
        </div>

        {/* Transaction List */}
        {transactions.length > 0 ? (
          <div className={styles.transactionList}>
            {transactions.map((transaction) => (
              <TransactionCard
                key={transaction.id}
                transaction={transaction}
                onApprove={handleApprove}
              />
            ))}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>🎉</div>
            <h2>All Transactions Reviewed!</h2>
            <p>You've verified all {totalCount} transactions.</p>

            <div className={styles.emptyActions}>
              <button
                className={styles.syncButton}
                onClick={handleSyncToXero}
                disabled={syncing}
              >
                {syncing ? 'Syncing...' : '🔄 Sync to Xero'}
              </button>
              <button
                className={styles.secondaryButton}
                onClick={() => router.push('/dashboard')}
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}

function TransactionCard({
  transaction,
  onApprove
}: {
  transaction: Transaction
  onApprove: (txn: Transaction, customCode?: string, customName?: string) => void
}) {
  const [showCustomInput, setShowCustomInput] = useState(false)
  const [customCode, setCustomCode] = useState('')
  const [customName, setCustomName] = useState('')

  // Confidence color coding
  const getConfidenceColor = (score: number) => {
    if (score >= 0.9) return '#10b981' // Green
    if (score >= 0.7) return '#f59e0b' // Orange
    return '#ef4444' // Red
  }

  // Priority badge
  const isPriority = transaction.review_priority === 1 || transaction.ai_confidence_score < 0.9

  return (
    <div className={`${styles.card} ${isPriority ? styles.priorityCard : ''}`}>
      {/* Priority Badge */}
      {isPriority && (
        <div className={styles.priorityBadge}>
          ⚠️ Needs Attention
        </div>
      )}

      {/* Transaction Header */}
      <div className={styles.cardHeader}>
        <div className={styles.date}>{transaction.transaction_date}</div>
        <div className={styles.amount}>
          {transaction.transaction_type === 'debit' || transaction.transaction_type === 'withdrawal'
            ? `-$${transaction.amount.toFixed(2)}`
            : `+$${transaction.amount.toFixed(2)}`}
        </div>
      </div>

      {/* Description */}
      <div className={styles.description}>{transaction.description}</div>

      {/* AI Suggestion */}
      <div className={styles.aiSection}>
        <div className={styles.aiHeader}>
          <span className={styles.aiIcon}>🤖</span>
          <span>AI Suggestion:</span>
          <span
            className={styles.confidence}
            style={{ color: getConfidenceColor(transaction.ai_confidence_score) }}
          >
            {(transaction.ai_confidence_score * 100).toFixed(0)}% confident
          </span>
        </div>
        <div className={styles.suggestion}>
          <strong>{transaction.assigned_account_code}</strong>: {transaction.assigned_account_name}
        </div>
        {transaction.categorization_source === 'vector_match' && (
          <div className={styles.sourceTag}>✨ From learned pattern</div>
        )}
      </div>

      {/* Custom Input (if user wants to change) */}
      {showCustomInput && (
        <div className={styles.customInput}>
          <input
            type="text"
            placeholder="Account Code (e.g., 420)"
            value={customCode}
            onChange={(e) => setCustomCode(e.target.value)}
            className={styles.input}
          />
          <input
            type="text"
            placeholder="Account Name (e.g., Entertainment)"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            className={styles.input}
          />
        </div>
      )}

      {/* Actions */}
      <div className={styles.actions}>
        {!showCustomInput ? (
          <>
            <button
              className={styles.approveButton}
              onClick={() => onApprove(transaction)}
            >
              ✓ Approve
            </button>
            <button
              className={styles.changeButton}
              onClick={() => setShowCustomInput(true)}
            >
              Change Category
            </button>
          </>
        ) : (
          <>
            <button
              className={styles.approveButton}
              onClick={() => {
                onApprove(transaction, customCode, customName)
                setShowCustomInput(false)
              }}
              disabled={!customCode || !customName}
            >
              ✓ Save & Teach AI
            </button>
            <button
              className={styles.cancelButton}
              onClick={() => setShowCustomInput(false)}
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  )
}
