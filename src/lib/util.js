import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

export const CHART_COLORS = [
  "#0f172a",
  "#2563eb",
  "#0d9488",
  "#d97706",
  "#7c3aed",
  "#dc2626",
];