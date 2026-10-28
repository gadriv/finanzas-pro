import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

/**
 * Capa de datos SQLite.
 *
 * El esquema está normalizado (perfiles, ajustes, presupuestos y movimientos),
 * pero la API trabaja con "snapshots" por perfil para que el frontend pueda
 * guardar movimientos + ajustes de forma atómica.
 */

export const CURRENCY_CODES = new Set([
  'CRC',
  'USD',
  'MXN',
  'EUR',
  'COP',
  'ARS',
  'CLP',
  'PEN',
  'GTQ',
  'HNL',
  'NIO',
  'DOP',
]);

export const EXPENSE_CATEGORY_IDS = new Set([
  'food',
  'housing',
  'transport',
  'utilities',
  'health',
  'entertainment',
  'education',
  'personal',
  'subscriptions',
  'debts',
  'other-expense',
]);

const INCOME_CATEGORY_IDS = new Set([
  'salary',
  'freelance',
  'investments',
  'sales',
  'refunds',
  'other-income',
]);

export const PROFILE_COLORS = [
  '#0D9488',
  '#2563EB',
  '#7C3AED',
  '#DB2777',
  '#EA580C',
  '#65A30D',
  '#0891B2',
  '#9333EA',
];

export const DEFAULT_SETTINGS = Object.freeze({
  currencyCode: 'CRC',
  savingsGoal: 20,
  budgets: Object.freeze({
    food: 150000,
    housing: 300000,
    transport: 80000,
    utilities: 60000,
    entertainment: 50000,
  }),
});

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    profile_id TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    currency_code TEXT NOT NULL,
    savings_goal REAL NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS budgets (
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    category_id TEXT NOT NULL,
    amount REAL NOT NULL,
    PRIMARY KEY (profile_id, category_id)
  );

  CREATE TABLE IF NOT EXISTS transactions (
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    amount REAL NOT NULL,
    category TEXT NOT NULL,
    date TEXT NOT NULL,
    description TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (profile_id, id)
  );

  CREATE INDEX IF NOT EXISTS idx_transactions_profile_date
    ON transactions(profile_id, date DESC, created_at DESC);

  CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`;

function cloneDefaultSettings() {
  return {
    currencyCode: DEFAULT_SETTINGS.currencyCode,
    savingsGoal: DEFAULT_SETTINGS.savingsGoal,
    budgets: { ...DEFAULT_SETTINGS.budgets },
  };
}

function todayISO() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function isValidISODate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

export function sanitizeName(raw) {
  if (typeof raw !== 'string') return null;
  const cleaned = raw
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40);
  return cleaned.length > 0 ? cleaned : null;
}

function sanitizeId(raw) {
  if (typeof raw !== 'string') return null;
  const id = raw.trim().slice(0, 120);
  return id.length > 0 ? id : null;
}

export function sanitizeTransaction(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw;
  const type = value.type === 'income' || value.type === 'expense' ? value.type : null;
  if (!type) return null;

  const amount = Number(value.amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const category =
    typeof value.category === 'string' && value.category.trim().length > 0
      ? value.category.trim().slice(0, 48)
      : '';
  const validCategory =
    type === 'income' ? INCOME_CATEGORY_IDS.has(category) : EXPENSE_CATEGORY_IDS.has(category);

  const description =
    typeof value.description === 'string'
      ? value.description.trim().slice(0, 160)
      : '';
  const createdAt =
    typeof value.createdAt === 'number' && Number.isFinite(value.createdAt)
      ? value.createdAt
      : Date.now();

  return {
    id: sanitizeId(value.id) ?? randomUUID(),
    type,
    amount: Math.round(amount * 100) / 100,
    category: validCategory ? category : type === 'income' ? 'other-income' : 'other-expense',
    date: isValidISODate(value.date) ? value.date : todayISO(),
    description,
    createdAt,
  };
}

export function sanitizeSettings(raw) {
  if (!raw || typeof raw !== 'object') return cloneDefaultSettings();
  const value = raw;

  const currencyCode =
    typeof value.currencyCode === 'string' && CURRENCY_CODES.has(value.currencyCode)
      ? value.currencyCode
      : DEFAULT_SETTINGS.currencyCode;

  const savingsGoal =
    typeof value.savingsGoal === 'number' && Number.isFinite(value.savingsGoal)
      ? Math.min(100, Math.max(0, value.savingsGoal))
      : DEFAULT_SETTINGS.savingsGoal;

  const budgets = {};
  if (value.budgets && typeof value.budgets === 'object' && !Array.isArray(value.budgets)) {
    for (const [categoryId, rawAmount] of Object.entries(value.budgets)) {
      if (!EXPENSE_CATEGORY_IDS.has(categoryId)) continue;
      const amount = Number(rawAmount);
      if (Number.isFinite(amount) && amount > 0) {
        budgets[categoryId] = Math.round(amount * 100) / 100;
      }
    }
  }

  return { currencyCode, savingsGoal, budgets };
}

export function sanitizeProfile(raw, index = 0) {
  if (!raw || typeof raw !== 'object') return null;
  const name = sanitizeName(raw.name);
  if (!name) return null;

  const createdAt =
    typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt) && raw.createdAt > 0
      ? raw.createdAt
      : Date.now();

  const color =
    typeof raw.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw.color)
      ? raw.color
      : PROFILE_COLORS[index % PROFILE_COLORS.length];

  return {
    id: sanitizeId(raw.id) ?? randomUUID(),
    name,
    color,
    createdAt,
  };
}

export function sanitizeProfileData(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const list = Array.isArray(source.transactions) ? source.transactions : [];
  const seen = new Set();
  const transactions = [];

  for (const item of list) {
    const transaction = sanitizeTransaction(item);
    if (!transaction) continue;
    if (seen.has(transaction.id)) transaction.id = randomUUID();
    seen.add(transaction.id);
    transactions.push(transaction);
  }

  return {
    transactions,
    settings: sanitizeSettings(source.settings),
  };
}

function rowToProfile(row) {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    createdAt: row.created_at,
  };
}

function rowToTransaction(row) {
  return {
    id: row.id,
    type: row.type,
    amount: row.amount,
    category: row.category,
    date: row.date,
    description: row.description,
    createdAt: row.created_at,
  };
}

export function createRepository(filePath) {
  const db = new DatabaseSync(filePath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);

  const statements = {
    listProfiles: db.prepare(
      'SELECT id, name, color, created_at FROM profiles ORDER BY created_at ASC',
    ),
    getProfile: db.prepare('SELECT id, name, color, created_at FROM profiles WHERE id = ?'),
    countProfiles: db.prepare('SELECT COUNT(*) AS total FROM profiles'),
    insertProfile: db.prepare(
      'INSERT INTO profiles (id, name, color, created_at) VALUES (?, ?, ?, ?)',
    ),
    renameProfile: db.prepare('UPDATE profiles SET name = ? WHERE id = ?'),
    deleteProfile: db.prepare('DELETE FROM profiles WHERE id = ?'),

    getMeta: db.prepare('SELECT value FROM app_meta WHERE key = ?'),
    setMeta: db.prepare(
      'INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    ),
    deleteMeta: db.prepare('DELETE FROM app_meta WHERE key = ?'),

    getSettings: db.prepare(
      'SELECT currency_code, savings_goal FROM settings WHERE profile_id = ?',
    ),
    upsertSettings: db.prepare(`
      INSERT INTO settings (profile_id, currency_code, savings_goal, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(profile_id) DO UPDATE SET
        currency_code = excluded.currency_code,
        savings_goal = excluded.savings_goal,
        updated_at = excluded.updated_at
    `),
    listBudgets: db.prepare(
      'SELECT category_id, amount FROM budgets WHERE profile_id = ? ORDER BY category_id ASC',
    ),
    deleteBudgets: db.prepare('DELETE FROM budgets WHERE profile_id = ?'),
    insertBudget: db.prepare(
      'INSERT INTO budgets (profile_id, category_id, amount) VALUES (?, ?, ?)',
    ),

    listTransactions: db.prepare(`
      SELECT id, type, amount, category, date, description, created_at
      FROM transactions
      WHERE profile_id = ?
      ORDER BY date DESC, created_at DESC
    `),
    deleteTransactions: db.prepare('DELETE FROM transactions WHERE profile_id = ?'),
    insertTransaction: db.prepare(`
      INSERT INTO transactions
        (profile_id, id, type, amount, category, date, description, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `),
  };

  function transaction(fn) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      try {
        db.exec('ROLLBACK');
      } catch {
        // Si el rollback falla, conservamos el error original.
      }
      throw error;
    }
  }

  function readSettings(profileId) {
    const row = statements.getSettings.get(profileId);
    if (!row) return cloneDefaultSettings();

    const budgets = {};
    for (const budget of statements.listBudgets.all(profileId)) {
      budgets[budget.category_id] = budget.amount;
    }

    return {
      currencyCode: row.currency_code,
      savingsGoal: row.savings_goal,
      budgets,
    };
  }

  function writeSettings(profileId, settings) {
    statements.upsertSettings.run(
      profileId,
      settings.currencyCode,
      settings.savingsGoal,
      Date.now(),
    );
    statements.deleteBudgets.run(profileId);
    for (const [categoryId, amount] of Object.entries(settings.budgets)) {
      statements.insertBudget.run(profileId, categoryId, amount);
    }
  }

  function writeDefaultSettings(profileId) {
    writeSettings(profileId, cloneDefaultSettings());
  }

  function readProfileData(profileId) {
    return {
      transactions: statements.listTransactions.all(profileId).map(rowToTransaction),
      settings: readSettings(profileId),
    };
  }

  function writeProfileData(profileId, rawData) {
    const data = sanitizeProfileData(rawData);
    statements.deleteTransactions.run(profileId);
    for (const tx of data.transactions) {
      statements.insertTransaction.run(
        profileId,
        tx.id,
        tx.type,
        tx.amount,
        tx.category,
        tx.date,
        tx.description,
        tx.createdAt,
      );
    }
    writeSettings(profileId, data.settings);
    return data;
  }

  function countProfiles() {
    return Number(statements.countProfiles.get().total);
  }

  function getActiveUserId() {
    const row = statements.getMeta.get('active_profile_id');
    if (row?.value && statements.getProfile.get(row.value)) return row.value;

    const first = statements.listProfiles.all()[0];
    if (!first) return null;

    statements.setMeta.run('active_profile_id', first.id);
    return first.id;
  }

  function setActiveUserId(userId) {
    if (!statements.getProfile.get(userId)) {
      throw new HttpError(404, 'Perfil no encontrado.');
    }
    statements.setMeta.run('active_profile_id', userId);
    return userId;
  }

  function getWorkspace() {
    const users = statements.listProfiles.all().map(rowToProfile);
    if (users.length === 0) {
      return { users: [], activeUserId: null, data: {} };
    }

    const activeUserId = getActiveUserId();
    const data = {};
    for (const user of users) {
      data[user.id] = readProfileData(user.id);
    }

    return { users, activeUserId, data };
  }

  function createProfile(input) {
    const profile = sanitizeProfile(
      {
        id: input?.id,
        name: input?.name,
        color: input?.color,
        createdAt: input?.createdAt,
      },
      countProfiles(),
    );
    if (!profile) {
      throw new HttpError(400, 'El nombre del perfil es obligatorio.');
    }
    if (statements.getProfile.get(profile.id)) {
      throw new HttpError(409, 'Ya existe un perfil con ese identificador.');
    }

    const normalized = profile.name.toLocaleLowerCase('es');
    if (
      statements.listProfiles
        .all()
        .some((user) => user.name.toLocaleLowerCase('es') === normalized)
    ) {
      throw new HttpError(409, 'Ya existe un perfil con ese nombre.');
    }

    return transaction(() => {
      statements.insertProfile.run(
        profile.id,
        profile.name,
        profile.color,
        profile.createdAt,
      );
      writeDefaultSettings(profile.id);
      if (!statements.getMeta.get('active_profile_id')) {
        statements.setMeta.run('active_profile_id', profile.id);
      }
      return profile;
    });
  }

  function renameProfile(userId, rawName) {
    const name = sanitizeName(rawName);
    if (!name) throw new HttpError(400, 'El nombre del perfil es obligatorio.');
    if (!statements.getProfile.get(userId)) {
      throw new HttpError(404, 'Perfil no encontrado.');
    }

    const normalized = name.toLocaleLowerCase('es');
    if (
      statements.listProfiles
        .all()
        .some((user) => user.id !== userId && user.name.toLocaleLowerCase('es') === normalized)
    ) {
      throw new HttpError(409, 'Ya existe un perfil con ese nombre.');
    }

    statements.renameProfile.run(name, userId);
    return rowToProfile(statements.getProfile.get(userId));
  }

  function deleteProfile(userId) {
    return transaction(() => {
      if (countProfiles() <= 1) {
        throw new HttpError(400, 'Debe existir al menos un perfil.');
      }
      if (!statements.getProfile.get(userId)) {
        throw new HttpError(404, 'Perfil no encontrado.');
      }

      statements.deleteProfile.run(userId);
      const active = statements.getMeta.get('active_profile_id')?.value;
      if (active === userId || !active || !statements.getProfile.get(active)) {
        const first = statements.listProfiles.all()[0];
        if (first) statements.setMeta.run('active_profile_id', first.id);
        else statements.deleteMeta.run('active_profile_id');
      }

      return getActiveUserId();
    });
  }

  function getProfileData(userId) {
    if (!statements.getProfile.get(userId)) {
      throw new HttpError(404, 'Perfil no encontrado.');
    }
    return readProfileData(userId);
  }

  function saveProfileData(userId, data) {
    if (!statements.getProfile.get(userId)) {
      throw new HttpError(404, 'Perfil no encontrado.');
    }
    transaction(() => writeProfileData(userId, data));
    return { updatedAt: Date.now() };
  }

  function importWorkspace(input) {
    if (countProfiles() > 0) {
      throw new HttpError(409, 'La base de datos ya contiene perfiles.');
    }

    const rawUsers = Array.isArray(input?.users) ? input.users : [];
    if (rawUsers.length === 0) {
      throw new HttpError(400, 'No hay perfiles para importar.');
    }

    const users = [];
    const seen = new Set();
    const names = new Set();
    rawUsers.forEach((raw, index) => {
      const profile = sanitizeProfile(raw, index);
      if (!profile) {
        throw new HttpError(400, `El perfil ${index + 1} no tiene un nombre válido.`);
      }
      if (seen.has(profile.id)) {
        throw new HttpError(400, 'Hay identificadores de perfil duplicados.');
      }
      const normalizedName = profile.name.toLocaleLowerCase('es');
      if (names.has(normalizedName)) {
        throw new HttpError(400, 'Hay nombres de perfil duplicados.');
      }
      seen.add(profile.id);
      names.add(normalizedName);
      users.push(profile);
    });

    const data =
      input?.data && typeof input.data === 'object' && !Array.isArray(input.data)
        ? input.data
        : {};

    const requestedActive =
      typeof input?.activeUserId === 'string' &&
      users.some((user) => user.id === input.activeUserId)
        ? input.activeUserId
        : users[0].id;

    transaction(() => {
      for (const user of users) {
        statements.insertProfile.run(user.id, user.name, user.color, user.createdAt);
        writeProfileData(user.id, data[user.id] ?? { transactions: [], settings: cloneDefaultSettings() });
      }
      statements.setMeta.run('active_profile_id', requestedActive);
    });

    return getWorkspace();
  }

  return {
    path: filePath,
    countProfiles,
    getActiveUserId,
    setActiveUserId,
    getWorkspace,
    createProfile,
    renameProfile,
    deleteProfile,
    getProfileData,
    saveProfileData,
    importWorkspace,
    close() {
      db.close();
    },
  };
}
