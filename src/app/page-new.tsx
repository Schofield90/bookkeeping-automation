'use client'

/**
 * Homepage - AI-Powered Bookkeeping
 * Landing page with navigation to all features
 */

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import styles from './page-new.module.css'

export default function HomePage() {
  const router = useRouter()

  return (
    <main className={styles.main}>
      {/* Hero Section */}
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <h1 className={styles.heroTitle}>
            AI-Powered <span className={styles.gradient}>Bookkeeping</span>
          </h1>
          <p className={styles.heroSubtitle}>
            Upload statements. AI categorizes. You review. System learns. Sync to Xero.
          </p>
          <div className={styles.heroActions}>
            <Link href="/upload">
              <button className={styles.primaryBtn}>
                📄 Upload Statement
              </button>
            </Link>
            <Link href="/analytics">
              <button className={styles.secondaryBtn}>
                📊 View Analytics
              </button>
            </Link>
          </div>

          {/* Features Preview */}
          <div className={styles.features}>
            <div className={styles.feature}>
              <div className={styles.featureIcon}>🛡️</div>
              <h3>Safety First</h3>
              <p>Golden Equation validates every statement</p>
            </div>
            <div className={styles.feature}>
              <div className={styles.featureIcon}>🧠</div>
              <h3>Progressive Learning</h3>
              <p>AI improves with every correction</p>
            </div>
            <div className={styles.feature}>
              <div className={styles.featureIcon}>🔄</div>
              <h3>Xero Integration</h3>
              <p>One-click sync to your ledger</p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className={styles.howItWorks}>
        <h2 className={styles.sectionTitle}>How It Works</h2>
        <div className={styles.steps}>
          <div className={styles.step}>
            <div className={styles.stepNumber}>1</div>
            <h3>Upload</h3>
            <p>Upload your bank statement (PDF or CSV)</p>
          </div>
          <div className={styles.stepArrow}>→</div>

          <div className={styles.step}>
            <div className={styles.stepNumber}>2</div>
            <h3>Safety Check</h3>
            <p>Golden Equation validates the math</p>
          </div>
          <div className={styles.stepArrow}>→</div>

          <div className={styles.step}>
            <div className={styles.stepNumber}>3</div>
            <h3>AI Categorizes</h3>
            <p>RAG + LLM suggest categories</p>
          </div>
          <div className={styles.stepArrow}>→</div>

          <div className={styles.step}>
            <div className={styles.stepNumber}>4</div>
            <h3>You Review</h3>
            <p>Approve or correct suggestions</p>
          </div>
          <div className={styles.stepArrow}>→</div>

          <div className={styles.step}>
            <div className={styles.stepNumber}>5</div>
            <h3>AI Learns</h3>
            <p>Your corrections train the system</p>
          </div>
          <div className={styles.stepArrow}>→</div>

          <div className={styles.step}>
            <div className={styles.stepNumber}>6</div>
            <h3>Sync to Xero</h3>
            <p>Push verified data to ledger</p>
          </div>
        </div>
      </section>

      {/* Quick Navigation */}
      <section className={styles.quickNav}>
        <h2 className={styles.sectionTitle}>Quick Access</h2>
        <div className={styles.navGrid}>
          <Link href="/upload" className={styles.navCard}>
            <div className={styles.navIcon}>📤</div>
            <h3>Upload Statement</h3>
            <p>Process a new bank statement</p>
          </Link>

          <Link href="/analytics" className={styles.navCard}>
            <div className={styles.navIcon}>📈</div>
            <h3>Analytics</h3>
            <p>View AI performance metrics</p>
          </Link>

          <div className={styles.navCard} onClick={() => alert('Connect via /upload page')}>
            <div className={styles.navIcon}>🔗</div>
            <h3>Connect Xero</h3>
            <p>Link your Xero account</p>
          </div>

          <Link href="/analytics" className={styles.navCard}>
            <div className={styles.navIcon}>🎓</div>
            <h3>AI Training</h3>
            <p>See what the AI has learned</p>
          </Link>
        </div>
      </section>

      {/* Technical Details */}
      <section className={styles.techDetails}>
        <h2 className={styles.sectionTitle}>Powered By</h2>
        <div className={styles.techGrid}>
          <div className={styles.techCard}>
            <h4>🔒 Supabase</h4>
            <p>PostgreSQL + pgvector for RAG</p>
          </div>
          <div className={styles.techCard}>
            <h4>🤖 OpenAI</h4>
            <p>GPT-4o + embeddings</p>
          </div>
          <div className={styles.techCard}>
            <h4>⚡ FastAPI</h4>
            <p>High-performance Python backend</p>
          </div>
          <div className={styles.techCard}>
            <h4>📊 Xero API</h4>
            <p>OAuth + ledger integration</p>
          </div>
        </div>
      </section>
    </main>
  )
}
