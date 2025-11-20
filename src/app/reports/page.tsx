'use client';

import React from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import styles from './reports.module.css';

export default function ReportsPage() {
    return (
        <main className={styles.main}>
            <div className={styles.header}>
                <h1 className={styles.title}>Reconciliation Report</h1>
                <Button>Export PDF</Button>
            </div>

            <div className={styles.summary}>
                <Card title="Reconciliation Status" className={styles.statusCard}>
                    <div className={styles.statusIcon}>✅</div>
                    <div className={styles.statusText}>All Balanced</div>
                    <p className={styles.statusSub}>Xero matches Bank Statement</p>
                </Card>

                <Card title="Summary">
                    <div className={styles.row}>
                        <span>Total Debits</span>
                        <span className={styles.amount}>$12,450.00</span>
                    </div>
                    <div className={styles.row}>
                        <span>Total Credits</span>
                        <span className={styles.amount}>$4,200.00</span>
                    </div>
                    <div className={styles.divider} />
                    <div className={styles.row}>
                        <span>Net Movement</span>
                        <span className={styles.amount}>-$8,250.00</span>
                    </div>
                </Card>
            </div>

            <Card title="Recent Syncs" className={styles.history}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Items</th>
                            <th>Status</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>Today, 10:23 AM</td>
                            <td>45</td>
                            <td><span className={styles.badgeSuccess}>Success</span></td>
                            <td><a href="#" className={styles.link}>View</a></td>
                        </tr>
                        <tr>
                            <td>Nov 18, 2023</td>
                            <td>12</td>
                            <td><span className={styles.badgeSuccess}>Success</span></td>
                            <td><a href="#" className={styles.link}>View</a></td>
                        </tr>
                    </tbody>
                </table>
            </Card>
        </main>
    );
}
