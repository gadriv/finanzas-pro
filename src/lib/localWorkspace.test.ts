import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Transaction } from '../types';
import { DEFAULT_SETTINGS } from '../data/categories';
import {
  PENDING_KEY,
  addPendingProfile,
  clearAllPendingProfiles,
  clearPendingProfile,
  getPendingProfileIds,
  mirrorWorkspace,
  readLocalWorkspace,
} from './localWorkspace';
import { loadUserData, USERS_KEY } from './userStorage';

const transaction: Transaction = {
  id: 'tx-1',
  type: 'expense',
  amount: 10,
  category: 'food',
  date: '2026-10-28',
  description: 'Prueba',
  createdAt: 1,
};

function stubStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  });
  return store;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const profile = (id: string, name: string) => ({
  id,
  name,
  color: '#0D9488',
  createdAt: 1,
});

function userData(extra: Partial<Transaction> = {}) {
  return {
    transactions: [{ ...transaction, ...extra }],
    settings: DEFAULT_SETTINGS,
  };
}

describe('readLocalWorkspace', () => {
  it('crea datos demo en una instalación nueva', () => {
    stubStorage();
    const workspace = readLocalWorkspace();

    expect(workspace.source).toBe('seed');
    expect(workspace.users).toHaveLength(1);
    expect(workspace.users[0].name).toBe('Mi cuenta');
    expect(workspace.activeUserId).toBe(workspace.users[0].id);
    expect(workspace.data[workspace.activeUserId].transactions.length).toBeGreaterThan(0);
  });

  it('migra los datos v2 y lo reporta como legacy', () => {
    stubStorage({
      'finanzapro.v2.transactions': JSON.stringify([transaction]),
      'finanzapro.v2.settings': JSON.stringify({ currencyCode: 'USD' }),
    });

    const workspace = readLocalWorkspace();
    expect(workspace.source).toBe('legacy');
    expect(workspace.users).toHaveLength(1);
    expect(workspace.data[workspace.activeUserId].transactions).toHaveLength(1);
    expect(workspace.data[workspace.activeUserId].settings.currencyCode).toBe('USD');
  });

  it('reúne todos los perfiles v3 con sus datos', () => {
    stubStorage({
      [USERS_KEY]: JSON.stringify([profile('a', 'Personal'), profile('b', 'Trabajo')]),
      'finanzapro.v3.activeUser': 'b',
      'finanzapro.v3.user.a': JSON.stringify({
        transactions: [transaction],
        settings: { ...DEFAULT_SETTINGS, currencyCode: 'USD' },
      }),
      'finanzapro.v3.user.b': JSON.stringify({
        transactions: [],
        settings: { ...DEFAULT_SETTINGS, currencyCode: 'EUR' },
      }),
    });

    const workspace = readLocalWorkspace();
    expect(workspace.source).toBe('v3');
    expect(workspace.activeUserId).toBe('b');
    expect(workspace.users).toHaveLength(2);
    expect(workspace.data.a.transactions).toHaveLength(1);
    expect(workspace.data.b.settings.currencyCode).toBe('EUR');
  });
});

describe('mirrorWorkspace', () => {
  it('actualiza perfiles, elimina los ausentes y guarda el activo', () => {
    const store = stubStorage({
      [USERS_KEY]: JSON.stringify([profile('a', 'Viejo'), profile('b', 'Borrar')]),
      'finanzapro.v3.activeUser': 'b',
      'finanzapro.v3.user.b': JSON.stringify(userData()),
    });

    mirrorWorkspace({
      users: [profile('a', 'Personal'), profile('c', 'Nuevo')],
      activeUserId: 'c',
      data: {
        a: userData(),
        c: { transactions: [], settings: DEFAULT_SETTINGS },
      },
    });

    expect(JSON.parse(store.get(USERS_KEY) ?? '[]')).toHaveLength(2);
    expect(store.get('finanzapro.v3.activeUser')).toBe('c');
    expect(loadUserData('a')?.transactions).toHaveLength(1);
    expect(loadUserData('b')).toBeNull();
    expect(loadUserData('c')?.transactions).toEqual([]);
  });

  it('limpia los pendientes de los perfiles sincronizados', () => {
    stubStorage();
    addPendingProfile('a');
    addPendingProfile('b');

    mirrorWorkspace({
      users: [profile('a', 'Personal')],
      activeUserId: 'a',
      data: { a: userData() },
    });

    expect(getPendingProfileIds()).toEqual(['b']);
  });
});

describe('pendientes de sincronización', () => {
  it('guarda ids únicos y permite limpiarlos', () => {
    const store = stubStorage();
    addPendingProfile('a');
    addPendingProfile('a');
    addPendingProfile('b');

    expect(store.get(PENDING_KEY)).toBe(JSON.stringify(['a', 'b']));
    expect(getPendingProfileIds()).toEqual(['a', 'b']);

    clearPendingProfile('a');
    expect(getPendingProfileIds()).toEqual(['b']);

    clearAllPendingProfiles();
    expect(getPendingProfileIds()).toEqual([]);
    expect(store.has(PENDING_KEY)).toBe(false);
  });

  it('ignora contenido corrupto', () => {
    stubStorage({ [PENDING_KEY]: 'no-json' });
    expect(getPendingProfileIds()).toEqual([]);
  });
});
