/**
 * Toast notification — editorial desaturated style.
 */

import { useEffect, useState } from 'react';

interface Props {
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  duration?: number;
}

export default function Toast({ message, type, duration = 4000 }: Props) {
  const [visible, setVisible] = useState(true);
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    setAnimate(true);
    const timer = setTimeout(() => {
      setAnimate(false);
      setTimeout(() => setVisible(false), 300);
    }, duration);
    return () => clearTimeout(timer);
  }, [duration]);

  if (!visible) return null;

  const typeStyle = {
    success: 'border-success-400 bg-success-50 text-success-500',
    error: 'border-accent-400 bg-accent-50 text-accent-500',
    info: 'border-[var(--color-ink-muted)] bg-[var(--color-surface-secondary)] text-[var(--color-ink-secondary)]',
    warning: 'border-warning-400 bg-warning-50 text-warning-500',
  };

  return (
    <div
      className={`fixed top-6 right-6 z-50 w-[340px] max-w-full transition-transform duration-300 ease-in-out ${animate ? 'translate-x-0' : 'translate-x-[120%]'}`}
    >
      <div className={`border-l-4 p-4 rounded-[var(--radius-md)] shadow-[var(--shadow-md)] ${typeStyle[type]}`}>
        <div className="font-medium text-sm">{message}</div>
      </div>
    </div>
  );
}
