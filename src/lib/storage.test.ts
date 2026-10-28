import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  loadSettings,
  loadTransactions,
  parseBackup,
  sanitizeSettings,
  sanitizeTransaction,
} from './storage';

const validTransaction = {
  id: 'abc',
  type: 'expense',
  amount: 12.345,
  category: 'food',
  date: '2026-10-28',
  description: '  Almuerzo  ',
  createdAt: 123,
};

describe('sanitizeTransaction', () => {
  it('normaliza una transacción válida', () => {
    expect(sanitizeTransaction(validTransaction)).toEqual({
      id: 'abc',
      type: 'expense',
      amount: 12.35,
      category: 'food',
      date: '2026-10-28',
      description: 'Almuerzo',
      createdAt: 123,
    });
  });

  it('resuelve categorías por nombre y aplica una categoría por defecto', () => {
    expect(sanitizeTransaction({ ...validTransaction, category: 'alimentación' })?.category).toBe(
      'food',
    );
    expect(sanitizeTransaction({ ...validTransaction, category: 'inexistente' })?.category).toBe(
      'other-expense',
    );
    expect(
      sanitizeTransaction({ ...validTransaction, type: 'income', category: 'inexistente' })
        ?.category,
    ).toBe('other-income');
  });

  it('rechaza registros inválidos', () => {
    expect(sanitizeTransaction(null)).toBeNull();
    expect(sanitizeTransaction({ ...validTransaction, type: 'otro' })).toBeNull();
    expect(sanitizeTransaction({ ...validTransaction, amount: 0 })).toBeNull();
    expect(sanitizeTransaction({ ...validTransaction, amount: 'abc' })).toBeNull();
  });

  it('reemplaza fechas inválidas por la fecha actual', () => {
    const result = sanitizeTransaction({ ...validTransaction, date: '2026-02-30' });
    expect(result?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('sanitizeSettings', () => {
  it('aplica valores por defecto y límites', () => {
    const settings = sanitizeSettings({ currencyCode: 'USD', savingsGoal: 150, budgets: {} });
    expect(settings.currencyCode).toBe('USD');
    expect(settings.savingsGoal).toBe(100);
    expect(sanitizeSettings({ savingsGoal: -5 }).savingsGoal).toBe(0);
  });

  it('descarta monedas y presupuestos inválidos', () => {
    const settings = sanitizeSettings({
      currencyCode: 'XXX',
      budgets: { food: 100, housing: -1, transport: 'mucho', invented: 500 },
    });

    expect(settings.currencyCode).toBe('CRC');
    expect(settings.budgets).toEqual({ food: 100 });
  });
});

describe('parseBackup', () => {
  it('acepta un arreglo simple de transacciones', () => {
    const backup = parseBackup(JSON.stringify([validTransaction]));
    expect(backup.transactions).toHaveLength(1);
    expect(backup.settings).toBeUndefined();
  });

  it('acepta el formato de respaldo con ajustes', () => {
    const backup = parseBackup(
      JSON.stringify({
        app: 'FinanzasPro',
        version: 2,
        transactions: [validTransaction],
        settings: { currencyCode: 'USD', savingsGoal: 30, budgets: { food: 50 } },
      }),
    );

    expect(backup.transactions).toHaveLength(1);
    expect(backup.settings).toMatchObject({ currencyCode: 'USD', savingsGoal: 30 });
  });

  it('regenera identificadores duplicados', () => {
    const backup = parseBackup(
      JSON.stringify([validTransaction, { ...validTransaction, amount: 20 }]),
    );
    expect(backup.transactions).toHaveLength(2);
    expect(backup.transactions[0].id).not.toBe(backup.transactions[1].id);
  });

  it('rechaza JSON inválido, listas ausentes y datos sin movimientos válidos', () => {
    expect(() => parseBackup('{')).toThrow('JSON válido');
    expect(() => parseBackup('{"transactions": {}}')).toThrow('lista de transacciones');
    expect(() => parseBackup('[]')).toThrow('transacciones válidas');
    expect(() => parseBackup('[{"type":"otro"}]')).toThrow('transacciones válidas');
  });
});

describe('persistencia local', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubStorage(initial: Record<string, string>) {
    const store = new Map(Object.entries(initial));
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    });
    return store;
  }

  it('devuelve null si no hay transacciones guardadas', () => {
    stubStorage({});
    expect(loadTransactions()).toBeNull();
  });

  it('ignora datos corruptos y filtra registros inválidos', () => {
    stubStorage({ 'finanzapro.v2.transactions': 'no-json' });
    expect(loadTransactions()).toBeNull();

    stubStorage({
      'finanzapro.v2.transactions': JSON.stringify([validTransaction, { type: 'otro' }]),
    });
    expect(loadTransactions()).toHaveLength(1);
  });

  it('devuelve ajustes por defecto ante datos corruptos', () => {
    stubStorage({ 'finanzapro.v2.settings': 'no-json' });
    expect(loadSettings().currencyCode).toBe('CRC');
  });
});
