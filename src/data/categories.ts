import type { Category, Currency, Settings } from '../types';

export const INCOME_CATEGORIES: Category[] = [
  { id: 'salary', name: 'Salario', color: '#10B981', type: 'income' },
  { id: 'freelance', name: 'Negocio / Freelance', color: '#059669', type: 'income' },
  { id: 'investments', name: 'Inversiones', color: '#047857', type: 'income' },
  { id: 'sales', name: 'Ventas', color: '#34D399', type: 'income' },
  { id: 'refunds', name: 'Reembolsos', color: '#6EE7B7', type: 'income' },
  { id: 'other-income', name: 'Otros Ingresos', color: '#A7F3D0', type: 'income' },
];

export const EXPENSE_CATEGORIES: Category[] = [
  { id: 'food', name: 'Alimentación', color: '#EF4444', type: 'expense' },
  { id: 'housing', name: 'Vivienda', color: '#F97316', type: 'expense' },
  { id: 'transport', name: 'Transporte', color: '#F59E0B', type: 'expense' },
  { id: 'utilities', name: 'Servicios Básicos', color: '#8B5CF6', type: 'expense' },
  { id: 'health', name: 'Salud y Bienestar', color: '#EC4899', type: 'expense' },
  { id: 'entertainment', name: 'Entretenimiento / Ocio', color: '#3B82F6', type: 'expense' },
  { id: 'education', name: 'Educación', color: '#06B6D4', type: 'expense' },
  { id: 'personal', name: 'Ropa y Personal', color: '#14B8A6', type: 'expense' },
  { id: 'subscriptions', name: 'Suscripciones', color: '#0EA5E9', type: 'expense' },
  { id: 'debts', name: 'Deudas y Préstamos', color: '#6366F1', type: 'expense' },
  { id: 'other-expense', name: 'Otros Gastos', color: '#6B7280', type: 'expense' },
];

export const ALL_CATEGORIES: Category[] = [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES];

export function getCategory(id: string): Category {
  return (
    ALL_CATEGORIES.find((c) => c.id === id) ?? {
      id,
      name: 'Sin categoría',
      color: '#9CA3AF',
      type: 'expense',
    }
  );
}

export function categoriesFor(type: 'income' | 'expense'): Category[] {
  return type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
}

export const CURRENCIES: Currency[] = [
  { code: 'CRC', symbol: '₡', locale: 'es-CR', label: 'Colón costarricense' },
  { code: 'USD', symbol: '$', locale: 'en-US', label: 'Dólar estadounidense' },
  { code: 'MXN', symbol: '$', locale: 'es-MX', label: 'Peso mexicano' },
  { code: 'EUR', symbol: '€', locale: 'es-ES', label: 'Euro' },
  { code: 'COP', symbol: '$', locale: 'es-CO', label: 'Peso colombiano' },
  { code: 'ARS', symbol: '$', locale: 'es-AR', label: 'Peso argentino' },
  { code: 'CLP', symbol: '$', locale: 'es-CL', label: 'Peso chileno' },
  { code: 'PEN', symbol: 'S/', locale: 'es-PE', label: 'Sol peruano' },
  { code: 'GTQ', symbol: 'Q', locale: 'es-GT', label: 'Quetzal guatemalteco' },
  { code: 'HNL', symbol: 'L', locale: 'es-HN', label: 'Lempira hondureño' },
  { code: 'NIO', symbol: 'C$', locale: 'es-NI', label: 'Córdoba nicaragüense' },
  { code: 'DOP', symbol: 'RD$', locale: 'es-DO', label: 'Peso dominicano' },
];

export function getCurrency(code: string): Currency {
  return CURRENCIES.find((c) => c.code === code) ?? CURRENCIES[0];
}

export const DEFAULT_SETTINGS: Settings = {
  currencyCode: 'CRC',
  savingsGoal: 20,
  budgets: {
    food: 150000,
    housing: 300000,
    transport: 80000,
    utilities: 60000,
    entertainment: 50000,
  },
};
