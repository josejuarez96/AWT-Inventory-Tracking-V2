import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(val: number | null | undefined): string {
  if (val === null || val === undefined) return '--';
  return `$${val.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Safely parse a date string, handling date-only strings ("2024-02-19")
 * by treating them as local midnight instead of UTC midnight.
 */
export function parseDate(dateStr: string): Date {
  if (dateStr.length === 10 && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return new Date(dateStr + 'T00:00:00');
  }
  return new Date(dateStr);
}

/** Format a date string for display: "Feb 19, 2024" */
export function formatDate(dateStr: string): string {
  return parseDate(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Format a datetime string for display: "Feb 19, 2024, 2:30 PM" */
export function formatDateTime(dateStr: string): string {
  return parseDate(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Get today's date as YYYY-MM-DD in local timezone */
export function todayLocalStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
