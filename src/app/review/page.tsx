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

export default function ReviewPage() {
    const [transactions, setTransactions] = useState(MOCK_TRANSACTIONS);

    const handleApprove = (id: number) => {
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
                    <Card key={t.id} className={styles.item}>
                        <div className={styles.itemHeader}>
                            <div className={styles.date}>{t.date}</div>
                            <div className={styles.amount}>${t.amount.toFixed(2)}</div>
                        </div>
                        <div className={styles.description}>{t.description}</div>

                        <div className={styles.aiSection}>
                            <div className={styles.aiIcon}>🤖</div>
                            <div className={styles.question}>{t.question}</div>
                        </div>

                        <div className={styles.actions}>
                            <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => handleApprove(t.id)}
                            >
                                {t.aiSuggestion} (Approve)
                            </Button>
                            <Button size="sm" variant="ghost">Other...</Button>
                        </div>
                    </Card>
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
