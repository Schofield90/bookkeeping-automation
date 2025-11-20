'use client'

/**
 * Analytics Dashboard - AI Performance Metrics
 *
 * Shows:
 * 1. Correction Rate (how often AI is wrong) - should decrease over time
 * 2. Overconfidence Analysis (AI confident but wrong)
 * 3. Learning Effectiveness (vector match rate) - should increase over time
 */

import React, { useState, useEffect } from 'react'
import {
  getCorrectionRate,
  getOverconfidenceAnalysis,
  getLearningEffectiveness
} from '@/lib/api'
import styles from './analytics.module.css'

// Mock organization ID
const MOCK_ORG_ID = '550e8400-e29b-41d4-a716-446655440000'

export default function AnalyticsPage() {
  const [correctionData, setCorrectionData] = useState<any>(null)
  const [overconfidenceData, setOverconfidenceData] = useState<any[]>([])
  const [learningData, setLearningData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(30)

  useEffect(() => {
    loadAnalytics()
  }, [days])

  const loadAnalytics = async () => {
    try {
      setLoading(true)

      const [correction, overconfidence, learning] = await Promise.all([
        getCorrectionRate(MOCK_ORG_ID, days),
        getOverconfidenceAnalysis(MOCK_ORG_ID),
        getLearningEffectiveness(MOCK_ORG_ID)
      ])

      setCorrectionData(correction)
      setOverconfidenceData(overconfidence)
      setLearningData(learning)
      setLoading(false)
    } catch (err) {
      console.error('Analytics error:', err)
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <main className={styles.main}>
        <div className={styles.loading}>
          <div className={styles.spinner}></div>
          <p>Loading analytics...</p>
        </div>
      </main>
    )
  }

  return (
    <main className={styles.main}>
      <div className={styles.container}>
        {/* Header */}
        <div className={styles.header}>
          <h1 className={styles.title}>AI Performance Analytics</h1>
          <p className={styles.subtitle}>
            Track how your AI is learning and improving over time
          </p>

          {/* Time Range Selector */}
          <div className={styles.timeSelector}>
            <button
              className={days === 7 ? styles.activeBtn : styles.btn}
              onClick={() => setDays(7)}
            >
              7 Days
            </button>
            <button
              className={days === 30 ? styles.activeBtn : styles.btn}
              onClick={() => setDays(30)}
            >
              30 Days
            </button>
            <button
              className={days === 90 ? styles.activeBtn : styles.btn}
              onClick={() => setDays(90)}
            >
              90 Days
            </button>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className={styles.grid}>
          {/* Correction Rate Card */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>📊 Correction Rate</h2>
              <span className={styles.cardSubtitle}>Lower is better</span>
            </div>

            {correctionData && (
              <>
                <div className={styles.metricBig}>
                  {correctionData.correction_rate_percentage !== undefined
                    ? `${correctionData.correction_rate_percentage.toFixed(1)}%`
                    : 'N/A'}
                </div>
                <div className={styles.metricDetails}>
                  <div className={styles.stat}>
                    <span className={styles.statLabel}>Corrections</span>
                    <span className={styles.statValue}>
                      {correctionData.corrections || 0}
                    </span>
                  </div>
                  <div className={styles.stat}>
                    <span className={styles.statLabel}>Confirmations</span>
                    <span className={styles.statValue}>
                      {correctionData.confirmations || 0}
                    </span>
                  </div>
                  <div className={styles.stat}>
                    <span className={styles.statLabel}>Total Reviews</span>
                    <span className={styles.statValue}>
                      {correctionData.total_reviews || 0}
                    </span>
                  </div>
                </div>

                <div className={styles.interpretation}>
                  {correctionData.correction_rate_percentage < 15 ? (
                    <p className={styles.good}>
                      ✅ Excellent! Your AI is highly accurate.
                    </p>
                  ) : correctionData.correction_rate_percentage < 30 ? (
                    <p className={styles.okay}>
                      ⚠️ Good, but there's room for improvement.
                    </p>
                  ) : (
                    <p className={styles.poor}>
                      ❌ AI needs more training data. Keep reviewing!
                    </p>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Learning Effectiveness Card */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>🧠 Learning Effectiveness</h2>
              <span className={styles.cardSubtitle}>Higher is better</span>
            </div>

            {learningData && learningData.monthly_data && learningData.monthly_data.length > 0 ? (
              <>
                <div className={styles.metricBig}>
                  {learningData.monthly_data[0].vector_match_percentage || 0}%
                </div>
                <div className={styles.metricLabel}>Vector Match Rate</div>

                <div className={styles.trendChart}>
                  {learningData.monthly_data.slice(0, 6).reverse().map((month: any, i: number) => (
                    <div key={i} className={styles.chartBar}>
                      <div
                        className={styles.chartFill}
                        style={{ height: `${month.vector_match_percentage || 0}%` }}
                      ></div>
                      <div className={styles.chartLabel}>
                        {new Date(month.month).toLocaleDateString('en', { month: 'short' })}
                      </div>
                    </div>
                  ))}
                </div>

                <div className={styles.interpretation}>
                  <p className={styles.info}>
                    📈 {learningData.interpretation}
                  </p>
                </div>
              </>
            ) : (
              <div className={styles.noData}>
                <p>Not enough data yet. Keep reviewing transactions!</p>
              </div>
            )}
          </div>

          {/* Overconfidence Analysis Card */}
          <div className={`${styles.card} ${styles.fullWidth}`}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>⚠️ Overconfidence Analysis</h2>
              <span className={styles.cardSubtitle}>
                Cases where AI was confident but wrong
              </span>
            </div>

            {overconfidenceData && overconfidenceData.length > 0 ? (
              <div className={styles.table}>
                <table>
                  <thead>
                    <tr>
                      <th>Description</th>
                      <th>AI Suggested</th>
                      <th>User Corrected To</th>
                      <th>Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overconfidenceData.slice(0, 10).map((item, i) => (
                      <tr key={i}>
                        <td>{item.transaction_description || 'N/A'}</td>
                        <td>
                          <span className={styles.codeTag}>
                            {item.ai_suggested_account_code}
                          </span>
                        </td>
                        <td>
                          <span className={styles.codeTag}>
                            {item.user_approved_account_code}
                          </span>
                        </td>
                        <td>
                          <span className={styles.confidenceTag}>
                            {((item.ai_confidence_score || 0) * 100).toFixed(0)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className={styles.interpretation}>
                  <p className={styles.info}>
                    💡 These patterns help identify categories where the AI struggles.
                    The more you correct, the better it gets!
                  </p>
                </div>
              </div>
            ) : (
              <div className={styles.noData}>
                <p>✨ No overconfidence issues detected!</p>
              </div>
            )}
          </div>
        </div>

        {/* Info Box */}
        <div className={styles.infoBox}>
          <h3>📖 How to Read These Metrics</h3>
          <ul>
            <li>
              <strong>Correction Rate:</strong> Should decrease as AI learns. Target: &lt;15%
            </li>
            <li>
              <strong>Vector Match Rate:</strong> Should increase as you review more. Target: &gt;70%
            </li>
            <li>
              <strong>Overconfidence:</strong> Helps identify problematic categories that need more training
            </li>
          </ul>
        </div>
      </div>
    </main>
  )
}
