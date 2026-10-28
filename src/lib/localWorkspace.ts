import type { UserData, UserProfile } from '../types';
import { DEFAULT_SETTINGS } from '../data/categories';
import { hasLegacyData } from './storage';
import {
  ACTIVE_USER_KEY,
  USERS_KEY,
  USER_DATA_PREFIX,
  initSession,
  loadActiveUserId,
  loadProfiles,
  loadUserData,
  removeUserData,
  saveActiveUserId,
  saveProfiles,
  saveUserData,
} from './userStorage';

/**
 * localStorage ya no es la fuente principal: es un espejo de SQLite y el
 * fallback cuando el servidor no está disponible. También guarda la lista de
 * perfiles con cambios pendientes de sincronizar.
 */
export const PENDING_KEY = 'finanzapro.v3.pendingSync';

export interface LocalWorkspace {
  users: UserProfile[];
  activeUserId: string;
  data: Record<string, UserData>;
  source: 'v3' | 'legacy' | 'seed';
}

export interface MirrorWorkspace {
  users: UserProfile[];
  activeUserId: string | null;
  data: Record<string, UserData>;
}

function emptyData(): UserData {
  return { transactions: [], settings: DEFAULT_SETTINGS };
}

export function getPendingProfileIds(): string[] {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((item): item is string => typeof item === 'string'))];
  } catch {
    return [];
  }
}

function writePending(ids: string[]): void {
  try {
    const unique = [...new Set(ids.filter(Boolean))];
    if (unique.length === 0) localStorage.removeItem(PENDING_KEY);
    else localStorage.setItem(PENDING_KEY, JSON.stringify(unique));
  } catch {
    // Sin almacenamiento local no podemos recordar pendientes.
  }
}

export function addPendingProfile(userId: string): void {
  writePending([...getPendingProfileIds(), userId]);
}

export function clearPendingProfile(userId: string): void {
  writePending(getPendingProfileIds().filter((id) => id !== userId));
}

export function clearAllPendingProfiles(): void {
  writePending([]);
}

/**
 * Reúne todos los perfiles y datos del espejo local. Si aún no existe el
 * formato v3, aprovecha `initSession` para migrar v2 o crear los datos demo.
 */
export function readLocalWorkspace(): LocalWorkspace {
  const hadV3 = loadProfiles() !== null;
  const hadLegacy = !hadV3 && hasLegacyData();

  let users: UserProfile[];
  if (hadV3) {
    users = loadProfiles() ?? [];
  } else {
    users = initSession().users;
  }

  const storedActive = loadActiveUserId();
  const activeUserId =
    users.find((user) => user.id === storedActive)?.id ?? users[0]?.id ?? '';

  const data: Record<string, UserData> = {};
  users.forEach((user) => {
    data[user.id] = loadUserData(user.id) ?? emptyData();
  });

  return {
    users,
    activeUserId,
    data,
    source: hadV3 ? 'v3' : hadLegacy ? 'legacy' : 'seed',
  };
}

/** Escribe en localStorage el estado que acaba de confirmar SQLite. */
export function mirrorWorkspace(workspace: MirrorWorkspace): void {
  const previous = loadProfiles() ?? [];
  const keep = new Set(workspace.users.map((user) => user.id));

  saveProfiles(workspace.users);
  if (workspace.activeUserId) saveActiveUserId(workspace.activeUserId);

  previous.forEach((user) => {
    if (!keep.has(user.id)) removeUserData(user.id);
  });

  workspace.users.forEach((user) => {
    saveUserData(user.id, workspace.data[user.id] ?? emptyData());
    clearPendingProfile(user.id);
  });
}

/**
 * Borra la copia local (perfiles, datos y cola de pendientes).
 * Se usa al cerrar sesión para que los datos no queden visibles sin acceso.
 */
export function clearLocalWorkspace(): void {
  try {
    const keys: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key) continue;
      if (
        key === USERS_KEY ||
        key === ACTIVE_USER_KEY ||
        key === PENDING_KEY ||
        key.startsWith(USER_DATA_PREFIX)
      ) {
        keys.push(key);
      }
    }
    keys.forEach((key) => localStorage.removeItem(key));
  } catch {
    // Sin almacenamiento disponible no hay nada que borrar.
  }
}
