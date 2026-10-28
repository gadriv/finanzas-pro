import type { Settings, Transaction, UserData, UserProfile } from '../types';
import { DEFAULT_SETTINGS } from '../data/categories';
import { buildSeedTransactions } from '../data/seed';
import { uid } from './format';
import { PROFILE_COLORS, nextProfileColor, sanitizeProfileName } from './profiles';
import {
  clearLegacyData,
  hasLegacyData,
  loadSettings,
  loadTransactions,
  sanitizeSettings,
  sanitizeTransaction,
} from './storage';

/**
 * Persistencia por perfil.
 *
 * - Cada usuario guarda sus movimientos y ajustes en una única clave atómica
 *   (`finanzapro.v3.user.<id>`), evitando que transacciones y ajustes queden
 *   desincronizados.
 * - El índice de perfiles y el perfil activo viven en claves separadas.
 * - Los datos del formato v2 se migran automáticamente al primer arranque.
 */
export const USERS_KEY = 'finanzapro.v3.users';
export const ACTIVE_USER_KEY = 'finanzapro.v3.activeUser';
export const USER_DATA_PREFIX = 'finanzapro.v3.user.';

const DATA_VERSION = 3;

export const userDataKey = (userId: string): string => `${USER_DATA_PREFIX}${userId}`;

export interface StoredUserData extends UserData {
  updatedAt: number;
}

export interface Session extends UserData {
  users: UserProfile[];
  activeUserId: string;
  notice?: string;
}

export function sanitizeProfile(raw: unknown, index = 0): UserProfile | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const name = sanitizeProfileName(value.name);
  if (!name) return null;

  const id =
    typeof value.id === 'string' && value.id.trim().length > 0 ? value.id.trim() : uid();
  const createdAt =
    typeof value.createdAt === 'number' && Number.isFinite(value.createdAt)
      ? value.createdAt
      : Date.now();
  const color =
    typeof value.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(value.color)
      ? value.color
      : PROFILE_COLORS[index % PROFILE_COLORS.length];

  return { id, name, createdAt, color };
}

export function loadProfiles(): UserProfile[] | null {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;

    const seen = new Set<string>();
    const users: UserProfile[] = [];
    parsed.forEach((item, index) => {
      const profile = sanitizeProfile(item, index);
      if (!profile || seen.has(profile.id)) return;
      seen.add(profile.id);
      users.push(profile);
    });

    return users.length > 0 ? users : null;
  } catch {
    return null;
  }
}

export function saveProfiles(users: UserProfile[]): boolean {
  try {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
    return true;
  } catch (error) {
    console.error('No se pudo guardar la lista de perfiles', error);
    return false;
  }
}

export function loadActiveUserId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_USER_KEY);
  } catch {
    return null;
  }
}

export function saveActiveUserId(userId: string): boolean {
  try {
    localStorage.setItem(ACTIVE_USER_KEY, userId);
    return true;
  } catch (error) {
    console.error('No se pudo guardar el perfil activo', error);
    return false;
  }
}

/** Serializa solo lo que define el contenido, para comparar sin ruido. */
export function serializeUserData(data: UserData): string {
  return JSON.stringify({ transactions: data.transactions, settings: data.settings });
}

function quarantineCorruptData(key: string, raw: string): void {
  try {
    localStorage.setItem(`${key}.corrupt.${Date.now()}`, raw);
  } catch {
    // Si no cabe una copia, descartamos la cuarentena.
  }
}

export function loadUserData(userId: string): StoredUserData | null {
  const key = userDataKey(userId);
  let raw: string | null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    const envelope = Array.isArray(parsed)
      ? { transactions: parsed }
      : (parsed as Record<string, unknown> | null);

    if (!envelope || !Array.isArray(envelope.transactions)) {
      quarantineCorruptData(key, raw);
      return null;
    }

    const transactions = envelope.transactions
      .map(sanitizeTransaction)
      .filter((tx): tx is Transaction => tx !== null);
    const settings = sanitizeSettings(envelope.settings);
    const updatedAt =
      typeof envelope.updatedAt === 'number' && Number.isFinite(envelope.updatedAt)
        ? envelope.updatedAt
        : Date.now();

    return { transactions, settings, updatedAt };
  } catch {
    quarantineCorruptData(key, raw);
    return null;
  }
}

export function saveUserData(userId: string, data: UserData): boolean {
  const payload = {
    version: DATA_VERSION,
    updatedAt: Date.now(),
    transactions: data.transactions,
    settings: data.settings,
  };

  try {
    localStorage.setItem(userDataKey(userId), JSON.stringify(payload));
    return true;
  } catch (error) {
    console.error(`No se pudieron guardar los datos del perfil ${userId}`, error);
    return false;
  }
}

export function removeUserData(userId: string): void {
  try {
    localStorage.removeItem(userDataKey(userId));
  } catch {
    // Sin almacenamiento no hay nada que borrar.
  }
}

export function buildProfile(name: string, users: UserProfile[]): UserProfile | null {
  const cleanName = sanitizeProfileName(name);
  if (!cleanName) return null;
  return {
    id: uid(),
    name: cleanName,
    createdAt: Date.now(),
    color: nextProfileColor(users),
  };
}

function defaultProfile(name: string): UserProfile {
  return {
    id: uid(),
    name: sanitizeProfileName(name) ?? 'Mi cuenta',
    createdAt: Date.now(),
    color: PROFILE_COLORS[0],
  };
}

/**
 * Prepara la sesión inicial: carga perfiles existentes, migra los datos v2 o
 * crea el primer perfil con datos de ejemplo.
 */
export function initSession(): Session {
  const storedUsers = loadProfiles();

  if (storedUsers) {
    const storedActiveId = loadActiveUserId();
    const activeUserId =
      storedUsers.find((user) => user.id === storedActiveId)?.id ?? storedUsers[0].id;
    if (storedActiveId !== activeUserId) saveActiveUserId(activeUserId);

    const data = loadUserData(activeUserId);
    if (data) {
      return {
        users: storedUsers,
        activeUserId,
        transactions: data.transactions,
        settings: data.settings,
      };
    }

    const empty: UserData = { transactions: [], settings: DEFAULT_SETTINGS };
    saveUserData(activeUserId, empty);
    return {
      users: storedUsers,
      activeUserId,
      ...empty,
      notice: 'No se encontraron los datos de este perfil; se inició con una cuenta vacía.',
    };
  }

  if (hasLegacyData()) {
    const transactions = loadTransactions() ?? [];
    const settings = loadSettings();
    const profile = defaultProfile('Mi cuenta');
    const users = [profile];

    const saved =
      saveUserData(profile.id, { transactions, settings }) &&
      saveProfiles(users) &&
      saveActiveUserId(profile.id);
    if (saved) clearLegacyData();

    return {
      users,
      activeUserId: profile.id,
      transactions,
      settings,
      notice: saved
        ? 'Tus datos anteriores se migraron a tu perfil local.'
        : 'Cargamos tus datos anteriores, pero no se pudieron guardar en este navegador.',
    };
  }

  const profile = defaultProfile('Mi cuenta');
  const transactions = buildSeedTransactions();
  const settings: Settings = DEFAULT_SETTINGS;
  const users = [profile];

  saveProfiles(users);
  saveActiveUserId(profile.id);
  saveUserData(profile.id, { transactions, settings });

  return { users, activeUserId: profile.id, transactions, settings };
}
