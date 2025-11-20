import React from 'react';
import styles from './Button.module.css';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'ghost';
    size?: 'sm' | 'md' | 'lg';
    isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
    children,
    variant = 'primary',
    size = 'md',
    isLoading,
    className,
    ...props
}) => {
    const classes = [
        styles.button,
        styles[variant],
        styles[size],
        isLoading ? styles.loading : '',
        className
    ].join(' ');

    return (
        <button className={classes} disabled={isLoading || props.disabled} {...props}>
            {isLoading ? <span className={styles.spinner} /> : children}
        </button>
    );
};
