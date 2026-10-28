import { describe, expect, it } from 'vitest';
import type { Transaction } from '../types';
import {
  buildBudgetSummary,
  buildExpenseBreakdown,
  buildTrend,
  computeTotals,
} from './analytics';

function tx(partial: Partial<Transaction> & Pick<Transaction, 'type' | 'amount'>): Transaction {
  return {
    id: Math.random().toString(36).slice(2),
    category: partial.type === 'income' ? 'salary' : 'food',
    date: '2026-10-15',
    description: 'Prueba',
    createdAt: 1,
    ...partial,
  };
}

describe('computeTotals', () => {
  it('suma ingresos y gastos y calcula el balance', () => {
    const totals = computeTotals([
      tx({ type: 'income', amount: 1000 }),
      tx({ type: 'income', amount: 500 }),
      tx({ type: 'expense', amount: 300 }),
      tx({ type: 'expense', amount: 200 }),
    ]);

    expect(totals.income).toBe(1500);
    expect(totals.expenses).toBe(500);
    expect(totals.balance).toBe(1000);
    expect(totals.savingsRate).toBeCloseTo(66.666, 2);
  });

  it('no divide por cero cuando no hay ingresos', () => {
    const totals = computeTotals([tx({ type: 'expense', amount: 100 })]);
    expect(totals.savingsRate).toBe(0);
    expect(totals.balance).toBe(-100);
  });
});

describe('buildExpenseBreakdown', () => {
  it('agrupa solo gastos por categoría y calcula su participación', () => {
    const breakdown = buildExpenseBreakdown([
      tx({ type: 'expense', amount: 300, category: 'food' }),
      tx({ type: 'expense', amount: 100, category: 'housing' }),
      tx({ type: 'expense', amount: 100, category: 'food' }),
      tx({ type: 'income', amount: 9999, category: 'salary' }),
    ]);

    expect(breakdown).toHaveLength(2);
    expect(breakdown[0]).toMatchObject({ id: 'food', value: 400, share: 80 });
    expect(breakdown[1]).toMatchObject({ id: 'housing', value: 100, share: 20 });
  });

  it('devuelve una lista vacía sin gastos', () => {
    expect(buildExpenseBreakdown([])).toEqual([]);
  });
});

describe('buildBudgetSummary', () => {
  const reference = new Date(2026, 9, 15);

  it('solo considera los gastos del mes en curso', () => {
    const summary = buildBudgetSummary(
      [
        tx({ type: 'expense', amount: 100, category: 'food', date: '2026-10-02' }),
        tx({ type: 'expense', amount: 50, category: 'food', date: '2026-09-30' }),
        tx({ type: 'expense', amount: 25, category: 'food', date: '2026-11-01' }),
        tx({ type: 'income', amount: 500, category: 'salary', date: '2026-10-05' }),
      ],
      { food: 200, housing: 0 },
      reference,
    );

    expect(summary.items).toHaveLength(1);
    expect(summary.items[0]).toMatchObject({ id: 'food', budget: 200, spent: 100, ratio: 50 });
    expect(summary.totalBudget).toBe(200);
    expect(summary.totalSpent).toBe(100);
    expect(summary.remaining).toBe(100);
  });

  it('ordena por porcentaje de consumo y marca el exceso', () => {
    const summary = buildBudgetSummary(
      [
        tx({ type: 'expense', amount: 150, category: 'housing' }),
        tx({ type: 'expense', amount: 100, category: 'food' }),
      ],
      { food: 100, housing: 100 },
      reference,
    );

    expect(summary.items.map((item) => item.id)).toEqual(['housing', 'food']);
    expect(summary.items[0].ratio).toBe(150);
    expect(summary.remaining).toBe(-50);
  });
});

describe('buildTrend', () => {
  const reference = new Date(2026, 9, 15);

  it('crea seis cubos mensuales y suma los movimientos correspondientes', () => {
    const trend = buildTrend(
      [
        tx({ type: 'income', amount: 1000, date: '2026-10-01' }),
        tx({ type: 'expense', amount: 400, date: '2026-10-31' }),
        tx({ type: 'expense', amount: 999, date: '2026-11-01' }),
        tx({ type: 'income', amount: 700, date: '2026-05-10' }),
      ],
      'month',
      reference,
    );

    expect(trend).toHaveLength(6);
    expect(trend[trend.length - 1]).toMatchObject({ income: 1000, expense: 400 });
    expect(trend[0]).toMatchObject({ income: 700, expense: 0 });
  });

  it('agrupa por año en la vista anual', () => {
    const trend = buildTrend(
      [
        tx({ type: 'income', amount: 500, date: '2026-01-01' }),
        tx({ type: 'expense', amount: 200, date: '2026-12-31' }),
        tx({ type: 'income', amount: 100, date: '2025-06-01' }),
      ],
      'year',
      reference,
    );

    expect(trend).toHaveLength(5);
    expect(trend[trend.length - 1]).toMatchObject({ income: 500, expense: 200 });
    expect(trend[trend.length - 2]).toMatchObject({ income: 100, expense: 0 });
  });

  it('devuelve siete días y ocho semanas', () => {
    expect(buildTrend([], 'day', reference)).toHaveLength(7);
    expect(buildTrend([], 'week', reference)).toHaveLength(8);
    expect(buildTrend([], 'all', reference)).toHaveLength(12);
  });
});
