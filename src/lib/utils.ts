import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Convert a slug or kebab-case/snake-case string to Title Case.
 * Splits on hyphens, underscores, and whitespace.
 */
export function titleCase(input: string): string {
  return input
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Compute the date cutoff for a time range (in days).
 * Validates against allowed ranges [7, 30, 90], defaulting to 90.
 */
export function computeRangeCutoff(viewRange: number): Date {
  const days = [7, 30, 90].includes(viewRange) ? viewRange : 90;
  return new Date(Date.now() - days * 86_400_000);
}
