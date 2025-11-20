'use client';

import React, { useState, useCallback } from 'react';
import styles from './UploadDropzone.module.css';
import { Button } from './ui/Button';

export const UploadDropzone = () => {
    const [isDragging, setIsDragging] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [batches, setBatches] = useState<Array<{ id: number; status: 'pending' | 'processing' | 'completed' | 'error'; count: number }>>([]);
    const [progress, setProgress] = useState(0);
    const [totalTransactions, setTotalTransactions] = useState(0);

    const onDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const onDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const processFile = async (file: File) => {
        if (!file.name.endsWith('.csv')) {
            alert('Only CSV files are supported for now');
            return;
        }

        setIsProcessing(true);
        const text = await file.text();

        // Dynamic import for PapaParse to avoid SSR issues if any, though standard import works too
        const Papa = (await import('papaparse')).default;

        Papa.parse(text, {
            header: true,
            skipEmptyLines: true,
            complete: async (results) => {
                const transactions = results.data;
                setTotalTransactions(transactions.length);

                // Create batches of 50
                const batchSize = 50;
                const batchCount = Math.ceil(transactions.length / batchSize);
                const newBatches = Array.from({ length: batchCount }, (_, i) => ({
                    id: i,
                    status: 'pending' as const,
                    count: Math.min(batchSize, transactions.length - i * batchSize)
                }));

                setBatches(newBatches);

                // Process batches sequentially
                for (let i = 0; i < batchCount; i++) {
                    setBatches(prev => prev.map(b => b.id === i ? { ...b, status: 'processing' } : b));

                    const batchData = transactions.slice(i * batchSize, (i + 1) * batchSize);

                    try {
                        const response = await fetch('/api/analyze', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({ transactions: batchData }),
                        });

                        if (!response.ok) throw new Error('Batch failed');

                        // Simulate a small delay for the "futuristic" feel if it's too fast
                        await new Promise(r => setTimeout(r, 500));

                        setBatches(prev => prev.map(b => b.id === i ? { ...b, status: 'completed' } : b));
                        setProgress(((i + 1) / batchCount) * 100);
                    } catch (error) {
                        console.error(error);
                        setBatches(prev => prev.map(b => b.id === i ? { ...b, status: 'error' } : b));
                    }
                }

                setIsProcessing(false);
            }
        });
    };

    const onDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            processFile(e.dataTransfer.files[0]);
        }
    }, []);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            processFile(e.target.files[0]);
        }
    };

    return (
        <div
            className={`${styles.dropzone} ${isDragging ? styles.dragging : ''}`}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
        >
            <input
                type="file"
                id="file-upload"
                className={styles.input}
                onChange={handleFileSelect}
                accept=".csv"
                disabled={isProcessing}
            />

            <div className={styles.content}>
                {isProcessing || batches.length > 0 ? (
                    <div className={styles.visualization}>
                        <div className={styles.batchGrid}>
                            {batches.map((batch) => (
                                <div
                                    key={batch.id}
                                    className={`${styles.batchBlock} ${batch.status === 'processing' ? styles.batchProcessing :
                                            batch.status === 'completed' ? styles.batchCompleted :
                                                batch.status === 'error' ? styles.batchError :
                                                    styles.batchPending
                                        }`}
                                    title={`Batch ${batch.id + 1}: ${batch.count} transactions`}
                                />
                            ))}
                        </div>
                        <div className={styles.progressInfo}>
                            <span>Processing {totalTransactions} transactions...</span>
                            <span>{Math.round(progress)}%</span>
                        </div>
                        <div className={styles.progressBar}>
                            <div
                                className={styles.progressFill}
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                    </div>
                ) : (
                    <>
                        <div className={styles.icon}>📄</div>
                        <h3 className={styles.title}>Upload Bank Statement</h3>
                        <p className={styles.subtitle}>Drag & drop or click to browse</p>
                        <p className={styles.hint}>Supports CSV (Batched processing enabled)</p>
                        <label htmlFor="file-upload">
                            <div className={styles.browseBtn}>Browse Files</div>
                        </label>
                    </>
                )}
            </div>
        </div>
    );
};
