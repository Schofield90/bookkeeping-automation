import React from 'react';
import styles from './Card.module.css';

interface CardProps {
    children: React.ReactNode;
    className?: string;
    title?: string;
}

export const Card: React.FC<CardProps> = ({ children, className, title }) => {
    return (
        <div className={`${styles.card} ${className || ''}`}>
            {title && <h3 className={styles.title}>{title}</h3>}
            {children}
        </div>
    );
};
