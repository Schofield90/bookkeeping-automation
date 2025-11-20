import styles from "./page.module.css";
import Link from "next/link";

export default function Home() {
  return (
    <main className={styles.main}>
      <div className={styles.hero}>
        <h1 className={styles.title}>
          Smart <span className={styles.gradientText}>Bookkeeping</span>
        </h1>
        <p className={styles.subtitle}>
          Automated financial clarity powered by AI and Xero.
        </p>
        <div className={styles.actions}>
          <Link href="/dashboard">
            <button className={styles.primaryBtn}>Get Started</button>
          </Link>
          <button className={styles.secondaryBtn}>Learn More</button>
        </div>
      </div>
    </main>
  );
}
