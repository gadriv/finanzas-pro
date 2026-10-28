import type { Period } from '../types';

/** Convierte un Date a YYYY-MM-DD usando la fecha local (evita el desfase de UTC). */
export function toISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Interpreta YYYY-MM-DD como medianoche local. */
export function parseISODate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, amount: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + amount);
  return copy;
}

export function addMonths(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + amount, date.getDate());
}

/** Lunes como inicio de semana. */
export function startOfWeek(date: Date): Date {
  const day = startOfDay(date);
  const offset = (day.getDay() + 6) % 7;
  return addDays(day, -offset);
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function startOfYear(date: Date): Date {
  return new Date(date.getFullYear(), 0, 1);
}

export interface DateRange {
  start: Date;
  /** Límite superior exclusivo. */
  end: Date;
}

export function getPeriodRange(period: Period, reference: Date = new Date()): DateRange | null {
  if (period === 'all') return null;

  if (period === 'day') {
    const start = startOfDay(reference);
    return { start, end: addDays(start, 1) };
  }

  if (period === 'week') {
    const start = startOfWeek(reference);
    return { start, end: addDays(start, 7) };
  }

  if (period === 'month') {
    const start = startOfMonth(reference);
    return { start, end: addMonths(start, 1) };
  }

  const start = startOfYear(reference);
  return { start, end: new Date(start.getFullYear() + 1, 0, 1) };
}

export function isWithinRange(iso: string, range: DateRange | null): boolean {
  if (!range) return true;
  const date = parseISODate(iso);
  return date >= range.start && date < range.end;
}

export function formatDate(iso: string, locale = 'es-CR'): string {
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(parseISODate(iso));
}

export function formatDateShort(iso: string, locale = 'es-CR'): string {
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
  }).format(parseISODate(iso));
}

export function isValidISODate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = parseISODate(value);
  return !Number.isNaN(date.getTime()) && toISODate(date) === value;
}
