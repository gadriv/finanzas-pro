import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRepository, HttpError, sanitizeTransaction } from './db.mjs';

const validTransaction = {
  id: 'tx-1',
  type: 'expense',
  amount: 12.345,
  category: 'food',
  date: '2026-10-28',
  description: '  Almuerzo  ',
  createdAt: 123,
};

const repositories = [];

function makeRepo(filePath = ':memory:') {
  const repo = createRepository(filePath);
  repositories.push(repo);
  return repo;
}

function expectHttpError(fn, status) {
  try {
    fn();
    throw new Error('Se esperaba un error HTTP');
  } catch (error) {
    expect(error).toBeInstanceOf(HttpError);
    expect(error.status).toBe(status);
  }
}

afterEach(() => {
  while (repositories.length > 0) {
    const repo = repositories.pop();
    try {
      repo.close();
    } catch {
      // Algunas pruebas cierran el repositorio antes.
    }
  }
});

describe('repositorio SQLite', () => {
  it('arranca vacío', () => {
    const repo = makeRepo();
    expect(repo.countProfiles()).toBe(0);
    expect(repo.getWorkspace()).toEqual({ users: [], activeUserId: null, data: {} });
  });

  it('crea un perfil con ajustes por defecto y lo marca activo', () => {
    const repo = makeRepo();
    const user = repo.createProfile({ name: '  Personal  ' });

    expect(user.name).toBe('Personal');
    expect(repo.countProfiles()).toBe(1);

    const workspace = repo.getWorkspace();
    expect(workspace.activeUserId).toBe(user.id);
    expect(workspace.data[user.id].transactions).toEqual([]);
    expect(workspace.data[user.id].settings.currencyCode).toBe('CRC');
    expect(workspace.data[user.id].settings.budgets).toMatchObject({
      food: 150000,
      housing: 300000,
    });
  });

  it('rechaza nombres duplicados e identificadores repetidos', () => {
    const repo = makeRepo();
    const first = repo.createProfile({ id: 'perfil-1', name: 'Personal' });

    expectHttpError(() => repo.createProfile({ name: 'personal' }), 409);
    expectHttpError(() => repo.createProfile({ id: 'perfil-1', name: 'Otro' }), 409);

    const renamed = repo.renameProfile(first.id, '  Casa  ');
    expect(renamed.name).toBe('Casa');
    expectHttpError(() => repo.renameProfile('inexistente', 'X'), 404);
  });

  it('aísla movimientos y ajustes por perfil, incluso con ids repetidos', () => {
    const repo = makeRepo();
    const personal = repo.createProfile({ name: 'Personal' });
    const trabajo = repo.createProfile({ name: 'Trabajo' });

    repo.saveProfileData(personal.id, {
      transactions: [validTransaction],
      settings: { currencyCode: 'USD', savingsGoal: 30, budgets: { food: 100 } },
    });
    repo.saveProfileData(trabajo.id, {
      transactions: [{ ...validTransaction, amount: 50 }],
      settings: { currencyCode: 'EUR', savingsGoal: 10, budgets: {} },
    });

    const workspace = repo.getWorkspace();
    expect(workspace.data[personal.id].transactions).toHaveLength(1);
    expect(workspace.data[personal.id].transactions[0].amount).toBe(12.35);
    expect(workspace.data[personal.id].transactions[0].description).toBe('Almuerzo');
    expect(workspace.data[personal.id].settings.currencyCode).toBe('USD');

    expect(workspace.data[trabajo.id].transactions).toHaveLength(1);
    expect(workspace.data[trabajo.id].transactions[0].id).toBe('tx-1');
    expect(workspace.data[trabajo.id].settings.currencyCode).toBe('EUR');
  });

  it('sanea movimientos y ajustes antes de guardar', () => {
    const repo = makeRepo();
    const user = repo.createProfile({ name: 'Personal' });

    repo.saveProfileData(user.id, {
      transactions: [validTransaction, { type: 'otro' }],
      settings: {
        currencyCode: 'XXX',
        savingsGoal: 150,
        budgets: { food: 10, invented: 5, housing: -2 },
      },
    });

    const data = repo.getProfileData(user.id);
    expect(data.transactions).toHaveLength(1);
    expect(data.settings.currencyCode).toBe('CRC');
    expect(data.settings.savingsGoal).toBe(100);
    expect(data.settings.budgets).toEqual({ food: 10 });
  });

  it('regenera identificadores duplicados dentro de un perfil', () => {
    const repo = makeRepo();
    const user = repo.createProfile({ name: 'Personal' });

    repo.saveProfileData(user.id, {
      transactions: [validTransaction, { ...validTransaction, amount: 99 }],
      settings: { currencyCode: 'CRC', savingsGoal: 20, budgets: {} },
    });

    const data = repo.getProfileData(user.id);
    expect(data.transactions).toHaveLength(2);
    expect(data.transactions[0].id).not.toBe(data.transactions[1].id);
  });

  it('cambia de perfil activo y protege el último perfil', () => {
    const repo = makeRepo();
    const personal = repo.createProfile({ name: 'Personal' });
    const trabajo = repo.createProfile({ name: 'Trabajo' });

    repo.setActiveUserId(trabajo.id);
    expect(repo.getActiveUserId()).toBe(trabajo.id);

    repo.deleteProfile(trabajo.id);
    expect(repo.getActiveUserId()).toBe(personal.id);
    expect(repo.getWorkspace().users).toHaveLength(1);

    expectHttpError(() => repo.deleteProfile(personal.id), 400);
    expectHttpError(() => repo.setActiveUserId('fantasma'), 404);
  });

  it('importa un workspace solo cuando la base está vacía', () => {
    const repo = makeRepo();

    const workspace = repo.importWorkspace({
      users: [
        { id: 'p1', name: 'Personal', color: '#0D9488', createdAt: 1 },
        { id: 'p2', name: 'Trabajo', color: '#2563EB', createdAt: 2 },
      ],
      activeUserId: 'p2',
      data: {
        p1: {
          transactions: [validTransaction],
          settings: { currencyCode: 'USD', savingsGoal: 40, budgets: { food: 200 } },
        },
      },
    });

    expect(workspace.users).toHaveLength(2);
    expect(workspace.activeUserId).toBe('p2');
    expect(workspace.data.p1.transactions).toHaveLength(1);
    expect(workspace.data.p2.transactions).toEqual([]);
    expect(workspace.data.p2.settings.currencyCode).toBe('CRC');

    expectHttpError(
      () =>
        repo.importWorkspace({
          users: [{ id: 'p3', name: 'Otro' }],
          activeUserId: 'p3',
          data: {},
        }),
      409,
    );
  });

  it('rechaza nombres de perfil duplicados al importar', () => {
    const repo = makeRepo();

    expectHttpError(
      () =>
        repo.importWorkspace({
          users: [
            { id: 'p1', name: 'Personal' },
            { id: 'p2', name: ' personal ' },
          ],
          activeUserId: 'p1',
          data: {},
        }),
      400,
    );
    expect(repo.countProfiles()).toBe(0);
  });

  it('persiste en un archivo y sobrevive a reabrir la base', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'finanzapro-test-'));
    const file = path.join(directory, 'test.db');

    try {
      const first = makeRepo(file);
      const user = first.createProfile({ name: 'Persistente' });
      first.saveProfileData(user.id, {
        transactions: [validTransaction],
        settings: { currencyCode: 'USD', savingsGoal: 25, budgets: { food: 500 } },
      });
      first.close();
      repositories.pop();

      const second = makeRepo(file);
      const workspace = second.getWorkspace();
      expect(workspace.users[0].name).toBe('Persistente');
      expect(workspace.data[user.id].transactions).toHaveLength(1);
      expect(workspace.data[user.id].settings.currencyCode).toBe('USD');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe('sanitizeTransaction', () => {
  it('normaliza montos, descripciones y fechas', () => {
    expect(sanitizeTransaction(validTransaction)).toMatchObject({
      amount: 12.35,
      description: 'Almuerzo',
      date: '2026-10-28',
    });
  });

  it('resuelve categorías inválidas y fechas imposibles', () => {
    const result = sanitizeTransaction({
      ...validTransaction,
      category: 'inexistente',
      date: '2026-02-30',
      type: 'income',
    });
    expect(result.category).toBe('other-income');
    expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('rechaza montos y tipos inválidos', () => {
    expect(sanitizeTransaction(null)).toBeNull();
    expect(sanitizeTransaction({ ...validTransaction, amount: 0 })).toBeNull();
    expect(sanitizeTransaction({ ...validTransaction, type: 'otro' })).toBeNull();
  });
});
