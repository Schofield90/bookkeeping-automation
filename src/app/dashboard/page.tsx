'use client';

import React from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { UploadDropzone } from '@/components/UploadDropzone';
import styles from './dashboard.module.css';
import Link from 'next/link';

export default function Dashboard() {
    return (
        <main className={styles.main}>
            <div className={styles.header}>
                <h1 className={styles.title}>Dashboard</h1>
                <div className={styles.actions}>
                    <Button variant="secondary">Sync Settings</Button>
                    <Button>New Report</Button>
                </div>
            </div>

            <div className={styles.grid}>
                <Card title="Quick Upload" className={styles.uploadCard}>
                    <UploadDropzone />
                </Card>

                <div className={styles.stats}>
                    <Card title="Pending Review" className={styles.statCard}>
                        <div className={styles.statValue}>12</div>
                        <div className={styles.statLabel}>Transactions need your attention</div>
                        <Link href="/review">
                            <Button size="sm" className={styles.reviewBtn}>Review Now</Button>
                        </Link>
                    </Card>

                    <Card title="Xero Status" className={styles.statCard}>
                        <div className={styles.statusConnected}>● Connected</div>
                        <div className={styles.lastSync}>Last sync: 2 hours ago</div>
                    </Card>
                </div>
            </div>
        </main>
    );
}
