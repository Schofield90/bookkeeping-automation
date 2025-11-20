import Link from 'next/link';
import styles from './Navbar.module.css';
import { Button } from './ui/Button';

export const Navbar = () => {
    return (
        <nav className={styles.navbar}>
            <div className={styles.container}>
                <Link href="/" className={styles.logo}>
                    Smart<span className={styles.highlight}>Books</span>
                </Link>

                <div className={styles.links}>
                    <Link href="/dashboard" className={styles.link}>Dashboard</Link>
                    <Link href="/upload" className={styles.link}>Upload</Link>
                    <Link href="/reports" className={styles.link}>Reports</Link>
                </div>

                <div className={styles.auth}>
                    <Link href="/api/auth/login">
                        <Button size="sm" variant="ghost">Log In</Button>
                    </Link>
                    <Link href="/dashboard">
                        <Button size="sm">Get Started</Button>
                    </Link>
                </div>
            </div>
        </nav>
    );
};
