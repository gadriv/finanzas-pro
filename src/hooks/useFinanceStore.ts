import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  BackendStatus,
  Settings,
  Transaction,
  TransactionType,
  UserData,
  UserProfile,
} from '../types';
import { DEFAULT_SETTINGS } from '../data/categories';
import { buildSeedTransactions } from '../data/seed';
import { uid } from '../lib/format';
import { sanitizeProfileName } from '../lib/profiles';
import {
  loadUserData,
  saveActiveUserId,
  saveProfiles,
  saveUserData,
  serializeUserData,
  userDataKey,
} from '../lib/userStorage';
import * as api from '../lib/api';
import {
  PENDING_KEY,
  addPendingProfile,
  clearPendingProfile,
  getPendingProfileIds,
  mirrorWorkspace,
  readLocalWorkspace,
} from '../lib/localWorkspace';

export interface TransactionInput {
  type: TransactionType;
  amount: number;
  category: string;
  date: string;
  description: string;
}

const LOCAL_SAVE_ERROR =
  'No se pudieron guardar los cambios en este navegador. Exporta un respaldo desde Ajustes.';
const OFFLINE_MESSAGE =
  'No se pudo conectar con SQLite. La app usa la copia local y sincronizará los cambios al reconectar.';

interface StoreOptions {
  /** La sesión dejó de ser válida (expiró o se cerró en otro dispositivo). */
  onUnauthorized: () => void;
}

/**
 * Estado financiero del perfil autenticado.
 *
 * El servidor solo devuelve el perfil de la sesión, así que aquí siempre hay
 * un único usuario. La copia en localStorage sirve para seguir trabajando si
 * SQLite deja de responder durante la sesión.
 */
export function useFinanceStore(session: api.AuthSession, options: StoreOptions) {
  const initialUser = session.user;
  const initialData: UserData = session.workspace.data[initialUser.id] ?? {
    transactions: [],
    settings: DEFAULT_SETTINGS,
  };

  const [users, setUsers] = useState<UserProfile[]>([initialUser]);
  const [activeUserId, setActiveUserId] = useState<string>(initialUser.id);
  const [transactions, setTransactions] = useState<Transaction[]>(
    initialData.transactions,
  );
  const [settings, setSettings] = useState<Settings>(initialData.settings);
  const [backendStatus, setBackendStatus] = useState<BackendStatus>('connecting');
  const [syncPending, setSyncPending] = useState(
    () => getPendingProfileIds().length > 0,
  );
  const [storageError, setStorageError] = useState<string | null>(null);
  const [bootNotice, setBootNotice] = useState<string | undefined>(undefined);

  const dataOwnerRef = useRef<string>(initialUser.id);
  const localSnapshotRef = useRef<string>(serializeUserData(initialData));
  const serverSnapshotRef = useRef<string>(serializeUserData(initialData));
  const usersRef = useRef<UserProfile[]>([initialUser]);
  const activeUserIdRef = useRef<string>(initialUser.id);
  const backendStatusRef = useRef<BackendStatus>('connecting');
  const pendingRef = useRef<Set<string>>(new Set(getPendingProfileIds()));
  const connectingRef = useRef(false);
  const epochRef = useRef(0);
  const saveSeqRef = useRef<Record<string, number>>({});
  /** Sube con cada cambio local para no pisarlo con una lectura antigua de SQLite. */
  const dataVersionRef = useRef(0);

  const unauthorizedRef = useRef(options.onUnauthorized);
  unauthorizedRef.current = options.onUnauthorized;

  usersRef.current = users;
  activeUserIdRef.current = activeUserId;
  backendStatusRef.current = backendStatus;

  const updateBackendStatus = useCallback((status: BackendStatus) => {
    backendStatusRef.current = status;
    setBackendStatus(status);
  }, []);

  const handleAuthError = useCallback((error: unknown): boolean => {
    if (!api.isUnauthorized(error)) return false;
    unauthorizedRef.current();
    return true;
  }, []);

  const reportApiFailure = useCallback(
    (error: unknown) => {
      if (handleAuthError(error)) return;
      setStorageError(api.describeApiError(error));
      if (api.isNetworkError(error)) updateBackendStatus('offline');
    },
    [handleAuthError, updateBackendStatus],
  );

  /** Aplica un workspace confirmado por SQLite (un solo perfil). */
  const hydrate = useCallback((workspace: api.Workspace): boolean => {
    const active = workspace.users[0];
    if (!active) return false;

    const data = workspace.data[active.id] ?? {
      transactions: [],
      settings: DEFAULT_SETTINGS,
    };
    const snapshot = serializeUserData(data);

    dataOwnerRef.current = active.id;
    localSnapshotRef.current = snapshot;
    serverSnapshotRef.current = snapshot;
    usersRef.current = workspace.users;
    activeUserIdRef.current = active.id;

    setUsers(workspace.users);
    setActiveUserId(active.id);
    setTransactions(data.transactions);
    setSettings(data.settings);

    mirrorWorkspace({
      users: workspace.users,
      activeUserId: active.id,
      data: workspace.data,
    });

    pendingRef.current.clear();
    setSyncPending(false);
    return true;
  }, []);

  /** Guarda un perfil en SQLite, manteniendo el orden de escrituras. */
  const queueSave = useCallback(
    (userId: string, data: UserData, snapshot: string) => {
      const seq = (saveSeqRef.current[userId] ?? 0) + 1;
      saveSeqRef.current[userId] = seq;

      addPendingProfile(userId);
      pendingRef.current.add(userId);
      setSyncPending(true);

      void (async () => {
        try {
          await api.saveProfileData(userId, data);
          if (saveSeqRef.current[userId] !== seq) return;

          pendingRef.current.delete(userId);
          clearPendingProfile(userId);
          if (dataOwnerRef.current === userId) serverSnapshotRef.current = snapshot;
          if (pendingRef.current.size === 0) setSyncPending(false);
          setStorageError(null);
        } catch (error) {
          if (saveSeqRef.current[userId] !== seq) return;
          if (handleAuthError(error)) return;

          setSyncPending(true);
          setStorageError(api.describeApiError(error));
          if (api.isNetworkError(error)) updateBackendStatus('offline');
        }
      })();
    },
    [handleAuthError, updateBackendStatus],
  );

  /** Reconecta con SQLite, sube pendientes y refresca los datos del servidor. */
  const connect = useCallback(async () => {
    if (connectingRef.current) return;
    connectingRef.current = true;
    const epoch = ++epochRef.current;
    updateBackendStatus('connecting');

    try {
      const versionAtStart = dataVersionRef.current;

      const pending = getPendingProfileIds();
      if (pending.length > 0) {
        const local = readLocalWorkspace();
        for (const userId of pending) {
          const data = local.data[userId];
          if (!data || userId !== activeUserIdRef.current) {
            clearPendingProfile(userId);
            pendingRef.current.delete(userId);
            continue;
          }
          try {
            await api.saveProfileData(userId, data);
            clearPendingProfile(userId);
            pendingRef.current.delete(userId);
          } catch (error) {
            if (handleAuthError(error)) return;
            if (error instanceof api.ApiError && error.status === 404) {
              clearPendingProfile(userId);
              pendingRef.current.delete(userId);
              continue;
            }
            throw error;
          }
        }
      }

      let workspace = (await api.getAuthSession()).workspace;
      if (epoch !== epochRef.current) return;

      // Si el usuario editó mientras se consultaba, reintenta con los datos nuevos.
      let observedVersion = versionAtStart;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const racePending = getPendingProfileIds();
        const changed = dataVersionRef.current !== observedVersion;
        if (racePending.length === 0 && !changed) break;

        if (racePending.length > 0) {
          const local = readLocalWorkspace();
          for (const userId of racePending) {
            const data = local.data[userId];
            if (!data) {
              clearPendingProfile(userId);
              continue;
            }
            try {
              await api.saveProfileData(userId, data);
              clearPendingProfile(userId);
              pendingRef.current.delete(userId);
            } catch (error) {
              if (handleAuthError(error)) return;
              if (error instanceof api.ApiError && error.status === 404) {
                clearPendingProfile(userId);
                continue;
              }
              throw error;
            }
          }
        }

        workspace = (await api.getAuthSession()).workspace;
        if (epoch !== epochRef.current) return;
        observedVersion = dataVersionRef.current;
      }

      if (getPendingProfileIds().length > 0 || dataVersionRef.current !== observedVersion) {
        updateBackendStatus('online');
        setSyncPending(getPendingProfileIds().length > 0);
        return;
      }

      if (epoch !== epochRef.current) return;
      if (!hydrate(workspace)) {
        throw new api.ApiError('SQLite no devolvió el perfil de la sesión.');
      }

      updateBackendStatus('online');
      setStorageError(null);
      setSyncPending(getPendingProfileIds().length > 0);
    } catch (error) {
      if (epoch !== epochRef.current) return;
      if (handleAuthError(error)) return;

      if (api.isNetworkError(error)) {
        updateBackendStatus('offline');
        setBootNotice(OFFLINE_MESSAGE);
      } else {
        updateBackendStatus('online');
        setStorageError(api.describeApiError(error));
      }
    } finally {
      connectingRef.current = false;
    }
  }, [handleAuthError, hydrate, updateBackendStatus]);

  // Espejo inicial: deja la copia local lista para el modo sin conexión.
  useEffect(() => {
    mirrorWorkspace({
      users: [initialUser],
      activeUserId: initialUser.id,
      data: { [initialUser.id]: initialData },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Conexión inicial y reintentos cuando el servidor no está listo.
  useEffect(() => {
    void connect();

    const retry = () => {
      if (backendStatusRef.current !== 'online') void connect();
    };
    const interval = window.setInterval(retry, 15000);
    window.addEventListener('focus', retry);
    window.addEventListener('online', retry);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', retry);
      window.removeEventListener('online', retry);
    };
  }, [connect]);

  // Espejo local del perfil.
  useEffect(() => {
    saveProfiles(users);
  }, [users]);

  useEffect(() => {
    saveActiveUserId(activeUserId);
  }, [activeUserId]);

  // Guarda cambios localmente al instante y en SQLite cuando está disponible.
  useEffect(() => {
    if (dataOwnerRef.current !== activeUserId) return;

    const data: UserData = { transactions, settings };
    const snapshot = serializeUserData(data);
    if (snapshot === localSnapshotRef.current) return;

    if (saveUserData(activeUserId, data)) {
      localSnapshotRef.current = snapshot;
      dataVersionRef.current += 1;
    } else {
      setStorageError(LOCAL_SAVE_ERROR);
    }

    if (snapshot === serverSnapshotRef.current) return;

    if (backendStatusRef.current !== 'online') {
      addPendingProfile(activeUserId);
      pendingRef.current.add(activeUserId);
      setSyncPending(true);
      return;
    }

    queueSave(activeUserId, data, snapshot);
  }, [activeUserId, transactions, settings, queueSave]);

  // Sincronización entre pestañas del mismo perfil.
  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (!event.key) return;

      if (event.key === userDataKey(activeUserIdRef.current)) {
        const stored = loadUserData(activeUserIdRef.current);
        if (!stored) return;
        const snapshot = serializeUserData(stored);
        dataOwnerRef.current = activeUserIdRef.current;
        localSnapshotRef.current = snapshot;
        serverSnapshotRef.current = snapshot;
        setTransactions(stored.transactions);
        setSettings(stored.settings);
        return;
      }

      if (event.key === PENDING_KEY) {
        const ids = getPendingProfileIds();
        pendingRef.current = new Set(ids);
        setSyncPending(ids.length > 0);

        if (ids.length > 0 && backendStatusRef.current === 'online') {
          const local = readLocalWorkspace();
          ids.forEach((userId) => {
            const data = local.data[userId];
            if (data) queueSave(userId, data, serializeUserData(data));
          });
        }
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [queueSave]);

  const renameUser = useCallback(
    async (name: string): Promise<boolean> => {
      const cleanName = sanitizeProfileName(name);
      if (!cleanName) return false;
      if (backendStatusRef.current !== 'online') {
        setStorageError(
          'Cambiar el nombre del perfil requiere conexión con SQLite.',
        );
        return false;
      }

      try {
        const { user } = await api.renameProfile(activeUserIdRef.current, cleanName);
        const nextUsers = usersRef.current.map((item) =>
          item.id === user.id ? user : item,
        );
        usersRef.current = nextUsers;
        setUsers(nextUsers);
        saveProfiles(nextUsers);
        return true;
      } catch (error) {
        reportApiFailure(error);
        return false;
      }
    },
    [reportApiFailure],
  );

  const addTransaction = useCallback((input: TransactionInput) => {
    const transaction: Transaction = {
      ...input,
      id: uid(),
      description: input.description.trim() || 'Sin descripción',
      createdAt: Date.now(),
    };
    setTransactions((current) => [transaction, ...current]);
    return transaction;
  }, []);

  const updateTransaction = useCallback((id: string, input: TransactionInput) => {
    setTransactions((current) =>
      current.map((tx) =>
        tx.id === id
          ? {
              ...tx,
              ...input,
              description: input.description.trim() || 'Sin descripción',
            }
          : tx,
      ),
    );
  }, []);

  const deleteTransaction = useCallback(
    (id: string): Transaction | null => {
      const target = transactions.find((tx) => tx.id === id) ?? null;
      setTransactions((current) => current.filter((tx) => tx.id !== id));
      return target;
    },
    [transactions],
  );

  const restoreTransaction = useCallback((transaction: Transaction) => {
    setTransactions((current) =>
      current.some((tx) => tx.id === transaction.id)
        ? current
        : [transaction, ...current].sort((a, b) => b.createdAt - a.createdAt),
    );
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((current) => ({ ...current, ...patch }));
  }, []);

  const resetDemo = useCallback(() => {
    setTransactions(buildSeedTransactions());
  }, []);

  const clearAll = useCallback(() => {
    setTransactions([]);
  }, []);

  const replaceData = useCallback(
    (next: Transaction[], nextSettings?: Settings) => {
      setTransactions(next);
      if (nextSettings) setSettings(nextSettings);
    },
    [],
  );

  const retryConnection = useCallback(() => {
    void connect();
  }, [connect]);

  const activeUser = users.find((user) => user.id === activeUserId) ?? users[0];

  return {
    users,
    activeUser,
    activeUserId,
    renameUser,
    transactions,
    settings,
    backendStatus,
    syncPending,
    storageError,
    bootNotice,
    retryConnection,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    restoreTransaction,
    updateSettings,
    resetDemo,
    clearAll,
    replaceData,
  };
}
