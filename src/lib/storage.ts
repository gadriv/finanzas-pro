import type { Settings, Transaction, TransactionType } from '../types';
import {
  ALL_CATEGORIES,
  DEFAULT_SETTINGS,
  EXPENSE_CATEGORIES,
  getCurrency,
} from '../data/categories';
import { isValidISODate, todayISO } from './date';
import { uid } from './format';

const TRANSACTIONS_KEY = 'finanzapro.v2.transactions';
const SETTINGS_KEY = 'finanzapro.v2.settings';

/** Claves del formato anterior (v2). Se conservan solo para migrar datos. */
export const LEGACY_TRANSACTIONS_KEY = TRANSACTIONS_KEY;
export const LEGACY_SETTINGS_KEY = SETTINGS_KEY;

export function hasLegacyData(): boolean {
  try {
    return (
      localStorage.getItem(TRANSACTIONS_KEY) !== null ||
      localStorage.getItem(SETTINGS_KEY) !== null
    );
  } catch {
    return false;
  }
}

export function clearLegacyData(): void {
  try {
    localStorage.removeItem(TRANSACTIONS_KEY);
    localStorage.removeItem(SETTINGS_KEY);
  } catch {
    // Si el almacenamiento no está disponible, no hay nada que limpiar.
  }
}

/** @deprecated Usar loadUserData(userId) del nuevo almacenamiento por perfil. */
export function loadTransactions(): Transaction[] | null {
  try {
    const raw = localStorage.getItem(TRANSACTIONS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.map(sanitizeTransaction).filter((tx): tx is Transaction => tx !== null);
  } catch {
    return null;
  }
}

/** @deprecated Usar loadUserData(userId) del nuevo almacenamiento por perfil. */
export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return sanitizeSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function resolveCategoryId(value: unknown, type: TransactionType): string {
  const text = typeof value === 'string' ? value.trim().toLowerCase() : '';
  const byId = ALL_CATEGORIES.find((c) => c.id === text);
  const byName = ALL_CATEGORIES.find(
    (c) => c.name.toLowerCase() === text && c.type === type,
  );
  if (byId && byId.type === type) return byId.id;
  if (byName) return byName.id;
  return type === 'income' ? 'other-income' : 'other-expense';
}

export function sanitizeTransaction(raw: unknown): Transaction | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const type: TransactionType | null =
    value.type === 'income' || value.type === 'expense' ? value.type : null;
  if (!type) return null;

  const amount = Number(value.amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const category = resolveCategoryId(value.category, type);
  const date = isValidISODate(value.date) ? value.date : todayISO();
  const description =
    typeof value.description === 'string' && value.description.trim()
      ? value.description.trim().slice(0, 160)
      : '';
  const createdAt =
    typeof value.createdAt === 'number' && Number.isFinite(value.createdAt)
      ? value.createdAt
      : Date.now();

  return {
    id: typeof value.id === 'string' && value.id ? value.id : uid(),
    type,
    amount: Math.round(amount * 100) / 100,
    category,
    date,
    description,
    createdAt,
  };
}

export function sanitizeSettings(raw: unknown): Settings {
  if (!raw || typeof raw !== 'object') return DEFAULT_SETTINGS;
  const value = raw as Record<string, unknown>;

  const currencyCode =
    typeof value.currencyCode === 'string' ? getCurrency(value.currencyCode).code : DEFAULT_SETTINGS.currencyCode;

  const savingsGoal =
    typeof value.savingsGoal === 'number' && Number.isFinite(value.savingsGoal)
      ? Math.min(100, Math.max(0, value.savingsGoal))
      : DEFAULT_SETTINGS.savingsGoal;

  const expenseIds = new Set(EXPENSE_CATEGORIES.map((category) => category.id));
  const budgets: Record<string, number> = {};
  if (value.budgets && typeof value.budgets === 'object') {
    Object.entries(value.budgets as Record<string, unknown>).forEach(([key, amount]) => {
      if (!expenseIds.has(key)) return;
      const parsed = Number(amount);
      if (Number.isFinite(parsed) && parsed > 0) budgets[key] = parsed;
    });
  }

  return { currencyCode, savingsGoal, budgets };
}

export interface BackupData {
  transactions: Transaction[];
  settings?: Settings;
}

export function parseBackup(raw: string): BackupData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('El archivo no es un JSON válido.');
  }

  const isEnvelope = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed);
  const list = Array.isArray(parsed)
    ? parsed
    : isEnvelope
      ? (parsed as Record<string, unknown>).transactions
      : null;

  if (!Array.isArray(list)) {
    throw new Error('El archivo no contiene una lista de transacciones.');
  }

  const seen = new Set<string>();
  const transactions: Transaction[] = [];
  list.forEach((item) => {
    const tx = sanitizeTransaction(item);
    if (!tx) return;
    if (seen.has(tx.id)) tx.id = uid();
    seen.add(tx.id);
    transactions.push(tx);
  });

  if (transactions.length === 0) {
    throw new Error('No se encontraron transacciones válidas en el archivo.');
  }

  let settings: Settings | undefined;
  if (isEnvelope) {
    const candidate = (parsed as Record<string, unknown>).settings;
    if (candidate) settings = sanitizeSettings(candidate);
  }

  return { transactions, settings };
}

export function exportBackup(
  transactions: Transaction[],
  settings: Settings,
  profileName?: string,
): void {
  const payload = {
    app: 'FinanzasPro',
    version: 3,
    exportedAt: new Date().toISOString(),
    profile: profileName ? { name: profileName } : undefined,
    transactions,
    settings,
  };
  downloadFile(
    JSON.stringify(payload, null, 2),
    `finanzapro_${fileSlug(profileName)}respaldo_${todayISO()}.json`,
    'application/json',
  );
}

function fileSlug(name?: string): string {
  if (!name) return '';
  const slug = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
    .slice(0, 30);
  return slug ? `${slug}_` : '';
}

export function exportCSV(transactions: Transaction[]): void {
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const header = ['Fecha', 'Tipo', 'Categoria', 'Descripcion', 'Monto'];
  const rows = transactions
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt))
    .map((tx) => [
      tx.date,
      tx.type === 'income' ? 'Ingreso' : 'Gasto',
      ALL_CATEGORIES.find((c) => c.id === tx.category)?.name ?? tx.category,
      tx.description,
      tx.amount.toFixed(2),
    ]);

  const csv = [header, ...rows]
    .map((row) => row.map((cell) => escape(String(cell))).join(','))
    .join('\r\n');

  // BOM para que Excel respete los acentos
  downloadFile(`\uFEFF${csv}`, `finanzapro_transacciones_${todayISO()}.csv`, 'text/csv;charset=utf-8');
}

function downloadFile(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
