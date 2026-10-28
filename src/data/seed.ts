import type { Transaction, TransactionType } from '../types';
import { addDays, toISODate } from '../lib/date';

function make(
  daysAgo: number,
  type: TransactionType,
  amount: number,
  category: string,
  description: string,
  id: string,
): Transaction {
  const date = addDays(new Date(), -daysAgo);
  return {
    id,
    type,
    amount,
    category,
    description,
    date: toISODate(date),
    createdAt: date.getTime(),
  };
}

function monthDate(monthsAgo: number, day: number): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() - monthsAgo, day);
}

/** Datos de ejemplo distribuidos en los últimos meses para que las gráficas tengan contexto. */
export function buildSeedTransactions(): Transaction[] {
  const rows: Transaction[] = [
    make(0, 'income', 1500000, 'salary', 'Pago de nómina', 'seed-1'),
    make(0, 'expense', 120000, 'food', 'Supermercado quincenal', 'seed-2'),
    make(1, 'expense', 45000, 'transport', 'Recarga de combustible', 'seed-3'),
    make(2, 'expense', 85000, 'utilities', 'Electricidad e Internet', 'seed-4'),
    make(3, 'income', 150000, 'freelance', 'Proyecto web independiente', 'seed-5'),
    make(4, 'expense', 32000, 'entertainment', 'Cine y cena', 'seed-6'),
    make(5, 'expense', 250000, 'housing', 'Alquiler', 'seed-7'),
    make(6, 'expense', 21000, 'subscriptions', 'Streaming y música', 'seed-8'),
    make(8, 'expense', 18000, 'health', 'Farmacia', 'seed-9'),
    make(10, 'income', 40000, 'investments', 'Dividendos', 'seed-10'),
  ];

  // Historial de meses anteriores
  const previous: Transaction[] = [];
  for (let i = 1; i <= 4; i += 1) {
    const monthKey = `${monthDate(i, 1).getFullYear()}-${monthDate(i, 1).getMonth()}`;
    const createdAt = monthDate(i, 1).getTime();

    previous.push(
      {
        id: `seed-inc-${monthKey}`,
        type: 'income',
        amount: 1450000 + i * 25000,
        category: 'salary',
        description: 'Pago de nómina',
        date: toISODate(monthDate(i, 3)),
        createdAt,
      },
      {
        id: `seed-rent-${monthKey}`,
        type: 'expense',
        amount: 250000,
        category: 'housing',
        description: 'Alquiler',
        date: toISODate(monthDate(i, 5)),
        createdAt,
      },
      {
        id: `seed-food-${monthKey}`,
        type: 'expense',
        amount: 260000 + i * 12000,
        category: 'food',
        description: 'Compras del mes',
        date: toISODate(monthDate(i, 12)),
        createdAt,
      },
      {
        id: `seed-fun-${monthKey}`,
        type: 'expense',
        amount: 70000 + i * 5000,
        category: 'entertainment',
        description: 'Salidas y ocio',
        date: toISODate(monthDate(i, 12)),
        createdAt,
      },
    );
  }

  return [...rows, ...previous];
}
