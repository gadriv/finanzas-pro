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
import { isProfileNameTaken, sanitizeProfileName } from '../lib/profiles';
import {
  ACTIVE_USER_KEY,
  USERS_KEY,
  buildProfile,
  initSession,
  loadActiveUserId,
  loadProfiles,
  loadUserData,
  removeUserData,
  saveActiveUserId,
  saveProfiles,
  saveUserData,
  serializeUserData,
  userDataKey,
  type Session,
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

let cachedSession: Session | null = null;

/** La sesión local se calcula una sola vez para evitar dobles migraciones. */
function getInitialSession(): Session {
  if (!cachedSession) cachedSession = initSession();
  return cachedSession;
}

const LOCAL_SAVE_ERROR =
  'No se pudieron guardar los cambios en este navegador. Exporta un respaldo desde Ajustes.';
const OFFLINE_MESSAGE =
  'No se pudo conectar con SQLite. La app usa la copia local y sincronizará los cambios al reconectar.';
const PROFILE_OFFLINE_ERROR =
  'Gestionar perfiles requiere conexión con SQLite. Reintenta cuando el servidor esté disponible.';

export function useFinanceStore() {
  const boot = getInitialSession();

  const [users, setUsers] = useState<UserProfile[]>(boot.users);
  const [activeUserId, setActiveUserId] = useState<string>(boot.activeUserId);
  const [transactions, setTransactions] = useState<Transaction[]>(boot.transactions);
  const [settings, setSettings] = useState<Settings>(boot.settings);
  const [backendStatus, setBackendStatus] = useState<BackendStatus>('connecting');
  const [syncPending, setSyncPending] = useState(
    () => getPendingProfileIds().length > 0,
  );
  const [storageError, setStorageError] = useState<string | null>(null);
  const [bootNotice, setBootNotice] = useState<string | undefined>(boot.notice);

  const dataOwnerRef = useRef<string>(boot.activeUserId);
  const localSnapshotRef = useRef<string>(
    serializeUserData({ transactions: boot.transactions, settings: boot.settings }),
  );
  const serverSnapshotRef = useRef<string>('');
  const usersRef = useRef<UserProfile[]>(users);
  const activeUserIdRef = useRef<string>(activeUserId);
  const backendStatusRef = useRef<BackendStatus>('connecting');
  const pendingRef = useRef<Set<string>>(new Set(getPendingProfileIds()));
  const connectingRef = useRef(false);
  const epochRef = useRef(0);
  const saveSeqRef = useRef<Record<string, number>>({});
  /** Sube con cada cambio local para no pisarlo con una lectura antigua de SQLite. */
  const dataVersionRef = useRef(0);

  // Mantener refs sincronizadas para usarlas dentro de callbacks asíncronos.
  usersRef.current = users;
  activeUserIdRef.current = activeUserId;
  backendStatusRef.current = backendStatus;

  const updateBackendStatus = useCallback((status: BackendStatus) => {
    backendStatusRef.current = status;
    setBackendStatus(status);
  }, []);

  const reportApiFailure = useCallback(
    (error: unknown) => {
      setStorageError(api.describeApiError(error));
      if (api.isNetworkError(error)) updateBackendStatus('offline');
    },
    [updateBackendStatus],
  );

  /** Aplica en React y en localStorage un workspace confirmado por SQLite. */
  const hydrate = useCallback(
    (workspace: api.Workspace, options?: { notice?: string }): boolean => {
      const active =
        workspace.users.find((user) => user.id === workspace.activeUserId) ??
        workspace.users[0];
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
      if (options?.notice) setBootNotice(options.notice);
      return true;
    },
    [],
  );

  /** Guarda un perfil en SQLite, manteniendo el orden de escrituras por perfil. */
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

          setSyncPending(true);
          setStorageError(api.describeApiError(error));
          if (api.isNetworkError(error)) updateBackendStatus('offline');
        }
      })();
    },
    [updateBackendStatus],
  );

  /** Carga un perfil desde el espejo local sin tocar SQLite. */
  const applyLocalUser = useCallback(
    (userId: string, options?: { persistActive?: boolean }) => {
      const stored = loadUserData(userId);
      const data: UserData = stored ?? {
        transactions: [],
        settings: DEFAULT_SETTINGS,
      };
      const snapshot = serializeUserData(data);

      dataOwnerRef.current = userId;
      localSnapshotRef.current = snapshot;
      serverSnapshotRef.current = snapshot;
      activeUserIdRef.current = userId;

      setActiveUserId(userId);
      setTransactions(data.transactions);
      setSettings(data.settings);
      if (options?.persistActive !== false) saveActiveUserId(userId);

      return { data, snapshot };
    },
    [],
  );

  /** Conecta con SQLite, importa el workspace local o sincroniza pendientes. */
  const connect = useCallback(async () => {
    if (connectingRef.current) return;
    connectingRef.current = true;
    const epoch = ++epochRef.current;
    updateBackendStatus('connecting');

    try {
      const versionAtStart = dataVersionRef.current;
      let workspace = await api.getSession();
      let notice: string | undefined;

      if (workspace.users.length === 0) {
        const local = readLocalWorkspace();
        if (local.users.length === 0) {
          throw new api.ApiError('No hay perfiles locales para importar.');
        }

        try {
          workspace = await api.importWorkspace({
            users: local.users,
            activeUserId: local.activeUserId,
            data: local.data,
          });
        } catch (error) {
          // Otra pestaña pudo importar primero.
          if (error instanceof api.ApiError && error.status === 409) {
            workspace = await api.getSession();
          } else {
            throw error;
          }
        }

        notice =
          local.source === 'legacy'
            ? 'Tus datos anteriores se migraron de localStorage a SQLite.'
            : local.source === 'v3'
              ? 'Tus perfiles locales se migraron a SQLite.'
              : 'Base de datos SQLite creada con datos de ejemplo.';
      } else {
        const pending = getPendingProfileIds();
        if (pending.length > 0) {
          const local = readLocalWorkspace();

          for (const userId of pending) {
            const user = local.users.find((item) => item.id === userId);
            const data = local.data[userId];
            if (!user || !data) {
              clearPendingProfile(userId);
              continue;
            }

            if (!workspace.users.some((item) => item.id === userId)) {
              await api.createProfile({
                id: user.id,
                name: user.name,
                color: user.color,
                createdAt: user.createdAt,
              });
            }

            await api.saveProfileData(userId, data);
            clearPendingProfile(userId);
            pendingRef.current.delete(userId);
          }

          notice = 'Se sincronizaron los cambios guardados sin conexión con SQLite.';
        }

        const localActive = activeUserIdRef.current;
        if (localActive && workspace.users.some((user) => user.id === localActive)) {
          try {
            await api.setActiveProfile(localActive);
          } catch {
            // El perfil activo es una preferencia; no bloquea la carga.
          }
        }

        workspace = await api.getSession();
      }

      if (epoch !== epochRef.current) return;

      // Vaciar cambios locales que hayan llegado mientras se consultaba el servidor.
      // Si el usuario sigue editando, se repite con un límite para no bloquear.
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
            await api.saveProfileData(userId, data);
            clearPendingProfile(userId);
            pendingRef.current.delete(userId);
          }
        }

        workspace = await api.getSession();
        if (epoch !== epochRef.current) return;
        observedVersion = dataVersionRef.current;
      }

      if (
        getPendingProfileIds().length > 0 ||
        dataVersionRef.current !== observedVersion
      ) {
        // No se pudo estabilizar la cola: conserva los datos locales.
        updateBackendStatus('online');
        setSyncPending(getPendingProfileIds().length > 0);
        return;
      }

      if (epoch !== epochRef.current) return;
      if (!hydrate(workspace, { notice })) {
        throw new api.ApiError('SQLite no devolvió ningún perfil.');
      }

      updateBackendStatus('online');
      setStorageError(null);
      setSyncPending(getPendingProfileIds().length > 0);
    } catch (error) {
      if (epoch !== epochRef.current) return;

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
  }, [hydrate, updateBackendStatus]);

  // Conexión inicial y reintentos cuando el servidor aún no está listo.
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

  // Espejo local de la lista de perfiles y del perfil activo.
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

  // Sincronización entre pestañas del mismo navegador.
  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (!event.key) return;

      if (event.key === USERS_KEY) {
        const nextUsers = loadProfiles();
        if (!nextUsers) return;
        usersRef.current = nextUsers;
        setUsers(nextUsers);
        if (!nextUsers.some((user) => user.id === activeUserIdRef.current)) {
          const first = nextUsers[0];
          if (first) applyLocalUser(first.id);
        }
        return;
      }

      if (event.key === ACTIVE_USER_KEY) {
        const nextId = loadActiveUserId();
        if (!nextId || nextId === activeUserIdRef.current) return;
        const nextUsers = loadProfiles();
        if (!nextUsers?.some((user) => user.id === nextId)) return;
        usersRef.current = nextUsers;
        setUsers(nextUsers);
        applyLocalUser(nextId, { persistActive: false });
        return;
      }

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
  }, [applyLocalUser, queueSave]);

  const switchUser = useCallback(
    (userId: string): boolean => {
      if (userId === activeUserIdRef.current) return false;
      if (!usersRef.current.some((user) => user.id === userId)) return false;

      const { data, snapshot } = applyLocalUser(userId);

      if (backendStatusRef.current === 'online') {
        void api.setActiveProfile(userId).catch(reportApiFailure);

        if (pendingRef.current.has(userId)) {
          queueSave(userId, data, snapshot);
        } else {
          const requestSnapshot = snapshot;
          void (async () => {
            try {
              const remote = await api.getProfileData(userId);
              if (activeUserIdRef.current !== userId) return;
              if (
                localSnapshotRef.current !== requestSnapshot ||
                pendingRef.current.has(userId)
              ) {
                return;
              }

              const remoteData: UserData = {
                transactions: remote.transactions,
                settings: remote.settings,
              };
              const remoteSnapshot = serializeUserData(remoteData);

              dataOwnerRef.current = userId;
              localSnapshotRef.current = remoteSnapshot;
              serverSnapshotRef.current = remoteSnapshot;
              saveUserData(userId, remoteData);
              setTransactions(remote.transactions);
              setSettings(remote.settings);
            } catch (error) {
              reportApiFailure(error);
            }
          })();
        }
      }

      return true;
    },
    [applyLocalUser, queueSave, reportApiFailure],
  );

  const createUser = useCallback(
    async (name: string): Promise<UserProfile | null> => {
      const candidate = buildProfile(name, usersRef.current);
      if (
        !candidate ||
        isProfileNameTaken(usersRef.current, candidate.name)
      ) {
        return null;
      }
      if (backendStatusRef.current !== 'online') {
        setStorageError(PROFILE_OFFLINE_ERROR);
        return null;
      }

      try {
        const { user } = await api.createProfile({
          name: candidate.name,
          color: candidate.color,
        });
        const nextUsers = [...usersRef.current, user];
        usersRef.current = nextUsers;
        setUsers(nextUsers);
        saveProfiles(nextUsers);
        saveUserData(user.id, {
          transactions: [],
          settings: DEFAULT_SETTINGS,
        });
        applyLocalUser(user.id);

        try {
          await api.setActiveProfile(user.id);
        } catch (error) {
          reportApiFailure(error);
        }
        return user;
      } catch (error) {
        reportApiFailure(error);
        return null;
      }
    },
    [applyLocalUser, reportApiFailure],
  );

  const renameUser = useCallback(
    async (userId: string, name: string): Promise<boolean> => {
      const cleanName = sanitizeProfileName(name);
      if (!cleanName) return false;
      if (!usersRef.current.some((user) => user.id === userId)) return false;
      if (isProfileNameTaken(usersRef.current, cleanName, userId)) return false;
      if (backendStatusRef.current !== 'online') {
        setStorageError(PROFILE_OFFLINE_ERROR);
        return false;
      }

      try {
        const { user } = await api.renameProfile(userId, cleanName);
        const nextUsers = usersRef.current.map((item) =>
          item.id === userId ? user : item,
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

  const deleteUser = useCallback(
    async (userId: string): Promise<boolean> => {
      if (usersRef.current.length <= 1) return false;
      if (!usersRef.current.some((user) => user.id === userId)) return false;
      if (backendStatusRef.current !== 'online') {
        setStorageError(PROFILE_OFFLINE_ERROR);
        return false;
      }

      try {
        const workspace = await api.deleteProfile(userId);
        removeUserData(userId);
        pendingRef.current.delete(userId);
        clearPendingProfile(userId);
        hydrate(workspace);
        return true;
      } catch (error) {
        reportApiFailure(error);
        return false;
      }
    },
    [hydrate, reportApiFailure],
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

  const activeUser =
    users.find((user) => user.id === activeUserId) ?? users[0];

  return {
    users,
    activeUser,
    activeUserId,
    switchUser,
    createUser,
    renameUser,
    deleteUser,
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
