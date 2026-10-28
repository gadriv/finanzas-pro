import { describe, expect, it } from 'vitest';
import { ALL_CATEGORIES } from './categories';
import { buildSeedTransactions } from './seed';
import { isValidISODate } from '../lib/date';

describe('datos de ejemplo', () => {
  const transactions = buildSeedTransactions();

  it('genera movimientos con identificadores únicos', () => {
    const ids = new Set(transactions.map((tx) => tx.id));
    expect(ids.size).toBe(transactions.length);
  });

  it('usa categorías, fechas y montos válidos', () => {
    const categoryIds = new Set(ALL_CATEGORIES.map((category) => category.id));
    transactions.forEach((tx) => {
      expect(categoryIds.has(tx.category)).toBe(true);
      expect(isValidISODate(tx.date)).toBe(true);
      expect(Number.isFinite(tx.amount)).toBe(true);
      expect(tx.amount).toBeGreaterThan(0);
      expect(tx.description.length).toBeGreaterThan(0);
    });
  });

  it('incluye ingresos y gastos del mes en curso', () => {
    const now = new Date();
    const currentMonth = transactions.filter((tx) => {
      const [year, month] = tx.date.split('-').map(Number);
      return year === now.getFullYear() && month === now.getMonth() + 1;
    });

    expect(currentMonth.some((tx) => tx.type === 'income')).toBe(true);
    expect(currentMonth.some((tx) => tx.type === 'expense')).toBe(true);
  });
});
