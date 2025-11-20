'use client';

import React, { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import styles from './review.module.css';

// Mock data
const MOCK_TRANSACTIONS = [
    {
        id: 1,
        date: '2023-11-15',
        description: 'AMZN Mktp US',
        amount: 45.99,
        question: 'Is this for "Office Supplies" or "Cost of Goods Sold"?',
        aiSuggestion: 'Office Supplies',
        confidence: 0.7
    },
    {
        id: 2,
        date: '2023-11-16',
        description: 'Uber *Trip',
        amount: 24.50,
        question: 'Was this a client meeting or regular commute?',
        aiSuggestion: 'Travel - National',
        confidence: 0.6
    }
];

interface Transaction {
    id: number;
    date: string;
    description: string;
    amount: number;
    question?: string;
    aiSuggestion: string;
    confidence: number;
}

export default function ReviewPage() {
    const [transactions, setTransactions] = useState<Transaction[]>(MOCK_TRANSACTIONS);
    const [applyingRule, setApplyingRule] = useState<number | null>(null);

    const handleApprove = async (id: number, category: string, createRule: boolean, description: string) => {
        if (createRule) {
            try {
                await fetch('/api/rules', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ pattern: description, category })
                });
                // Optimistically update other transactions with same description
                setTransactions(prev => prev.map(t =>
                    t.description === description ? { ...t, aiSuggestion: category, confidence: 1.0, question: undefined as string | undefined } : t
                ));
            } catch (error) {
                console.error('Failed to create rule:', error);
            }
        }
        setTransactions(prev => prev.filter(t => t.id !== id));
    };

    return (
        <main className={styles.main}>
            <div className={styles.header}>
                <h1 className={styles.title}>Review Transactions</h1>
                <p className={styles.subtitle}>The AI needs your help with {transactions.length} items.</p>
            </div>

            <div className={styles.list}>
                {transactions.map(t => (
                    <TransactionCard
                        key={t.id}
                        transaction={t}
                        onApprove={handleApprove}
                    />
                ))}

                {transactions.length === 0 && (
                    <div className={styles.emptyState}>
                        <h3>All caught up! 🎉</h3>
                        <Button onClick={() => window.location.href = '/dashboard'}>Back to Dashboard</Button>
                    </div>
                )}
            </div>
        </main>
    );
}

const TransactionCard = ({ transaction, onApprove }: { transaction: any, onApprove: any }) => {
    const [createRule, setCreateRule] = useState(false);

    return (
        <Card className={styles.item}>
            <div className={styles.itemHeader}>
                <div className={styles.date}>{transaction.date}</div>
                <div className={styles.amount}>${transaction.amount.toFixed(2)}</div>
            </div>
            <div className={styles.description}>{transaction.description}</div>

            <div className={styles.aiSection}>
                <div className={styles.aiIcon}>🤖</div>
                <div className={styles.question}>{transaction.question || 'Please confirm category'}</div>
            </div>

            <div className={styles.actions}>
                <div className={styles.ruleOption}>
                    <input
                        type="checkbox"
                        id={`rule-${transaction.id}`}
                        checked={createRule}
                        onChange={(e) => setCreateRule(e.target.checked)}
                    />
                    <label htmlFor={`rule-${transaction.id}`}>Always apply for "{transaction.description}"</label>
                </div>
                <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onApprove(transaction.id, transaction.aiSuggestion, createRule, transaction.description)}
                >
                    {transaction.aiSuggestion} (Approve)
                </Button>
                <Button size="sm" variant="ghost">Other...</Button>
            </div>
        </Card>
    );
};
