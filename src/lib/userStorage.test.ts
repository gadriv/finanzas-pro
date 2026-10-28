import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ACTIVE_USER_KEY,
  USERS_KEY,
  USER_DATA_PREFIX,
  buildProfile,
  initSession,
  loadActiveUserId,
  loadProfiles,
  loadUserData,
  removeUserData,
  saveProfiles,
  saveUserData,
  userDataKey,
} from './userStorage';
import { DEFAULT_SETTINGS } from '../data/categories';
import type { Transaction } from '../types';

const validTransaction: Transaction = {
  id: 'abc',
  type: 'expense',
  amount: 12.345,
  category: 'food',
  date: '2026-10-28',
  description: '  Almuerzo  ',
  createdAt: 123,
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

describe('initSession', () => {
  it('crea el primer perfil con datos de ejemplo en una instalación nueva', () => {
    const store = stubStorage();
    const session = initSession();

    expect(session.users).toHaveLength(1);
    expect(session.users[0].name).toBe('Mi cuenta');
    expect(session.activeUserId).toBe(session.users[0].id);
    expect(session.transactions.length).toBeGreaterThan(0);
    expect(session.settings).toEqual(DEFAULT_SETTINGS);
    expect(session.notice).toBeUndefined();

    expect(store.has(USERS_KEY)).toBe(true);
    expect(store.get(ACTIVE_USER_KEY)).toBe(session.users[0].id);
    expect(store.has(userDataKey(session.activeUserId))).toBe(true);
  });

  it('migra los datos v2 al primer perfil y borra las claves anteriores', () => {
    const store = stubStorage({
      'finanzapro.v2.transactions': JSON.stringify([validTransaction]),
      'finanzapro.v2.settings': JSON.stringify({ currencyCode: 'USD', savingsGoal: 40 }),
    });

    const session = initSession();

    expect(session.users).toHaveLength(1);
    expect(session.users[0].name).toBe('Mi cuenta');
    expect(session.transactions).toHaveLength(1);
    expect(session.transactions[0].description).toBe('Almuerzo');
    expect(session.settings.currencyCode).toBe('USD');
    expect(session.settings.savingsGoal).toBe(40);
    expect(session.notice).toMatch(/migraron/i);

    expect(store.has('finanzapro.v2.transactions')).toBe(false);
    expect(store.has('finanzapro.v2.settings')).toBe(false);
    expect(store.has(userDataKey(session.activeUserId))).toBe(true);
  });

  it('respeta el perfil activo guardado y cae al primero si ya no existe', () => {
    stubStorage({
      [USERS_KEY]: JSON.stringify([
        { id: 'uno', name: 'Personal', createdAt: 1, color: '#0D9488' },
        { id: 'dos', name: 'Trabajo', createdAt: 2, color: '#2563EB' },
      ]),
      [ACTIVE_USER_KEY]: 'dos',
    });

    expect(initSession().activeUserId).toBe('dos');

    stubStorage({
      [USERS_KEY]: JSON.stringify([
        { id: 'uno', name: 'Personal', createdAt: 1, color: '#0D9488' },
        { id: 'dos', name: 'Trabajo', createdAt: 2, color: '#2563EB' },
      ]),
      [ACTIVE_USER_KEY]: 'fantasma',
    });

    const session = initSession();
    expect(session.activeUserId).toBe('uno');
    expect(loadActiveUserId()).toBe('uno');
  });

  it('inicia vacío y avisa cuando el perfil activo perdió sus datos', () => {
    stubStorage({
      [USERS_KEY]: JSON.stringify([
        { id: 'uno', name: 'Personal', createdAt: 1, color: '#0D9488' },
      ]),
      [ACTIVE_USER_KEY]: 'uno',
    });

    const session = initSession();

    expect(session.transactions).toEqual([]);
    expect(session.settings).toEqual(DEFAULT_SETTINGS);
    expect(session.notice).toMatch(/cuenta vacía/i);
    expect(loadUserData('uno')?.transactions).toEqual([]);
  });
});

describe('datos por perfil', () => {
  it('guarda y carga cada perfil en su propia clave sin mezclar datos', () => {
    stubStorage();

    saveUserData('personal', {
      transactions: [validTransaction],
      settings: { ...DEFAULT_SETTINGS, currencyCode: 'USD' },
    });
    saveUserData('trabajo', {
      transactions: [],
      settings: { ...DEFAULT_SETTINGS, currencyCode: 'EUR' },
    });

    const personal = loadUserData('personal');
    const trabajo = loadUserData('trabajo');

    expect(personal?.transactions).toHaveLength(1);
    expect(personal?.settings.currencyCode).toBe('USD');
    expect(trabajo?.transactions).toHaveLength(0);
    expect(trabajo?.settings.currencyCode).toBe('EUR');

    removeUserData('personal');
    expect(loadUserData('personal')).toBeNull();
    expect(loadUserData('trabajo')?.settings.currencyCode).toBe('EUR');
  });

  it('sanea movimientos inválidos y aplica ajustes por defecto', () => {
    stubStorage({
      [userDataKey('perfil')]: JSON.stringify({
        version: 3,
        updatedAt: 999,
        transactions: [validTransaction, { type: 'otro' }],
        settings: { currencyCode: 'XXX' },
      }),
    });

    const stored = loadUserData('perfil');
    expect(stored?.transactions).toHaveLength(1);
    expect(stored?.settings.currencyCode).toBe('CRC');
    expect(stored?.updatedAt).toBe(999);
  });

  it('pone en cuarentena los datos corruptos en lugar de perderlos', () => {
    const store = stubStorage({ [userDataKey('roto')]: 'no-json' });

    expect(loadUserData('roto')).toBeNull();

    const quarantineKey = [...store.keys()].find((key) =>
      key.startsWith(`${userDataKey('roto')}.corrupt.`),
    );
    expect(quarantineKey).toBeDefined();
    expect(store.get(quarantineKey!)).toBe('no-json');
  });
});

describe('perfiles', () => {
  it('crea perfiles con el siguiente color disponible', () => {
    const first = buildProfile('  Personal  ', []);
    expect(first?.name).toBe('Personal');
    expect(first?.color).toBe('#0D9488');

    const second = buildProfile('Trabajo', [first!]);
    expect(second?.color).toBe('#2563EB');
    expect(second?.id).not.toBe(first?.id);
  });

  it('rechaza nombres vacíos', () => {
    expect(buildProfile('   ', [])).toBeNull();
  });

  it('descarta entradas inválidas del índice y mantiene ids únicos', () => {
    stubStorage({
      [USERS_KEY]: JSON.stringify([
        { id: 'a', name: 'Personal', createdAt: 1, color: '#0D9488' },
        { id: 'a', name: 'Duplicado', createdAt: 2, color: '#2563EB' },
        { id: '', name: 'Sin id', createdAt: 3 },
        { name: '' },
        'basura',
      ]),
    });

    const users = loadProfiles();
    expect(users).toHaveLength(2);
    expect(users?.[0].name).toBe('Personal');
    expect(users?.[1].name).toBe('Sin id');
    expect(users?.[1].id.length).toBeGreaterThan(0);
    expect(users?.[1].id).not.toBe('a');

    expect(saveProfiles(users!)).toBe(true);
    expect(loadProfiles()).toEqual(users);
  });

  it('devuelve null cuando no hay perfiles guardados', () => {
    stubStorage();
    expect(loadProfiles()).toBeNull();
  });
});

describe('claves de almacenamiento', () => {
  it('usa prefijos v3 y conserva el identificador del perfil', () => {
    expect(USERS_KEY).toBe('finanzapro.v3.users');
    expect(ACTIVE_USER_KEY).toBe('finanzapro.v3.activeUser');
    expect(userDataKey('abc')).toBe(`${USER_DATA_PREFIX}abc`);
  });
});
