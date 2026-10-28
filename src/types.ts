export type TransactionType = 'income' | 'expense';

export type Period = 'day' | 'week' | 'month' | 'year' | 'all';

/** Estado de la conexión con el backend SQLite. */
export type BackendStatus = 'connecting' | 'online' | 'offline';

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  /** Id de la categoría (ver data/categories.ts) */
  category: string;
  /** Fecha en formato YYYY-MM-DD (hora local, sin zona horaria) */
  date: string;
  description: string;
  /** Timestamp de creación, usado para ordenar movimientos del mismo día */
  createdAt: number;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  type: TransactionType;
}

export interface Currency {
  code: string;
  symbol: string;
  locale: string;
  label: string;
}

export interface Settings {
  currencyCode: string;
  /** Meta de ahorro como % de los ingresos (0 - 100) */
  savingsGoal: number;
  /** Presupuesto mensual por id de categoría de gasto */
  budgets: Record<string, number>;
}

/** Perfil local: cada usuario tiene sus propios movimientos y ajustes. */
export interface UserProfile {
  id: string;
  name: string;
  createdAt: number;
  /** Color del avatar (hex). */
  color: string;
}

/** Conjunto de datos que pertenece a un perfil. */
export interface UserData {
  transactions: Transaction[];
  settings: Settings;
}

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: number;
  kind: 'success' | 'error' | 'info';
  message: string;
  action?: ToastAction;
}
