import type { Period, Transaction } from '../types';
import { getCategory } from '../data/categories';
import {
  addDays,
  addMonths,
  parseISODate,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from './date';

export interface Totals {
  income: number;
  expenses: number;
  balance: number;
  savingsRate: number;
}

export function computeTotals(transactions: Transaction[]): Totals {
  let income = 0;
  let expenses = 0;

  transactions.forEach((tx) => {
    if (tx.type === 'income') income += tx.amount;
    else expenses += tx.amount;
  });

  const balance = income - expenses;
  const savingsRate = income > 0 ? (balance / income) * 100 : 0;

  return { income, expenses, balance, savingsRate };
}

export interface CategoryTotal {
  id: string;
  name: string;
  color: string;
  value: number;
  share: number;
}

export function buildExpenseBreakdown(transactions: Transaction[]): CategoryTotal[] {
  const totals = new Map<string, number>();
  let grandTotal = 0;

  transactions.forEach((tx) => {
    if (tx.type !== 'expense') return;
    totals.set(tx.category, (totals.get(tx.category) ?? 0) + tx.amount);
    grandTotal += tx.amount;
  });

  return Array.from(totals.entries())
    .map(([id, value]) => {
      const category = getCategory(id);
      return {
        id,
        name: category.name,
        color: category.color,
        value,
        share: grandTotal > 0 ? (value / grandTotal) * 100 : 0,
      };
    })
    .sort((a, b) => b.value - a.value);
}

export interface TrendPoint {
  label: string;
  income: number;
  expense: number;
}

interface Bucket {
  start: Date;
  end: Date;
  label: string;
}

const WEEKDAY = new Intl.DateTimeFormat('es-CR', { weekday: 'short' });
const MONTH = new Intl.DateTimeFormat('es-CR', { month: 'short' });
const MONTH_YEAR = new Intl.DateTimeFormat('es-CR', { month: 'short', year: '2-digit' });

function buildBuckets(period: Period, reference: Date): Bucket[] {
  const buckets: Bucket[] = [];

  if (period === 'day') {
    const today = startOfDay(reference);
    for (let i = 6; i >= 0; i -= 1) {
      const start = addDays(today, -i);
      buckets.push({ start, end: addDays(start, 1), label: WEEKDAY.format(start) });
    }
    return buckets;
  }

  if (period === 'week') {
    const currentWeek = startOfWeek(reference);
    for (let i = 7; i >= 0; i -= 1) {
      const start = addDays(currentWeek, -7 * i);
      buckets.push({
        start,
        end: addDays(start, 7),
        label: `${start.getDate()} ${MONTH.format(start)}`,
      });
    }
    return buckets;
  }

  const monthsBack = period === 'year' ? 5 : period === 'month' ? 6 : 12;
  const base = startOfMonth(reference);

  if (period === 'year') {
    for (let i = monthsBack - 1; i >= 0; i -= 1) {
      const year = base.getFullYear() - i;
      buckets.push({
        start: new Date(year, 0, 1),
        end: new Date(year + 1, 0, 1),
        label: String(year),
      });
    }
    return buckets;
  }

  const formatter = period === 'all' ? MONTH_YEAR : MONTH;
  for (let i = monthsBack - 1; i >= 0; i -= 1) {
    const start = addMonths(base, -i);
    buckets.push({ start, end: addMonths(start, 1), label: formatter.format(start) });
  }
  return buckets;
}

/** Serie temporal de ingresos vs gastos. Usa todas las transacciones (no las filtradas). */
export function buildTrend(
  transactions: Transaction[],
  period: Period,
  reference: Date = new Date(),
): TrendPoint[] {
  const buckets = buildBuckets(period, reference);
  const points = buckets.map((bucket) => ({
    label: bucket.label,
    income: 0,
    expense: 0,
  }));

  const parsed = transactions.map((tx) => ({ tx, date: parseISODate(tx.date) }));

  buckets.forEach((bucket, index) => {
    parsed.forEach(({ tx, date }) => {
      if (date < bucket.start || date >= bucket.end) return;
      if (tx.type === 'income') points[index].income += tx.amount;
      else points[index].expense += tx.amount;
    });
  });

  return points;
}

export interface BudgetStatus {
  id: string;
  name: string;
  color: string;
  budget: number;
  spent: number;
  ratio: number;
}

export interface BudgetSummary {
  items: BudgetStatus[];
  totalBudget: number;
  totalSpent: number;
  remaining: number;
}

export function buildBudgetSummary(
  transactions: Transaction[],
  budgets: Record<string, number>,
  reference: Date = new Date(),
): BudgetSummary {
  const monthStart = startOfMonth(reference);
  const monthEnd = addMonths(monthStart, 1);

  const spentByCategory = new Map<string, number>();
  transactions.forEach((tx) => {
    if (tx.type !== 'expense') return;
    const date = parseISODate(tx.date);
    if (date < monthStart || date >= monthEnd) return;
    spentByCategory.set(tx.category, (spentByCategory.get(tx.category) ?? 0) + tx.amount);
  });

  const items: BudgetStatus[] = Object.entries(budgets)
    .filter(([, budget]) => budget > 0)
    .map(([id, budget]) => {
      const category = getCategory(id);
      const spent = spentByCategory.get(id) ?? 0;
      return {
        id,
        name: category.name,
        color: category.color,
        budget,
        spent,
        ratio: budget > 0 ? (spent / budget) * 100 : 0,
      };
    })
    .sort((a, b) => b.ratio - a.ratio);

  const totalBudget = items.reduce((sum, item) => sum + item.budget, 0);
  const totalSpent = items.reduce((sum, item) => sum + item.spent, 0);

  return { items, totalBudget, totalSpent, remaining: totalBudget - totalSpent };
}
