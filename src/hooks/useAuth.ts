import { useCallback, useEffect, useRef, useState } from 'react';
import * as api from '../lib/api';
import { describeApiError, isUnauthorized } from '../lib/api';

export type AuthStatus = 'loading' | 'anonymous' | 'authenticated';

export interface AuthController {
  status: AuthStatus;
  session: api.AuthSession | null;
  profiles: api.AuthProfileSummary[];
  needsSetup: boolean;
  error: string | null;
  busy: boolean;
  login: (input: api.LoginInput) => Promise<boolean>;
  claim: (input: api.ClaimInput) => Promise<boolean>;
  setup: (input: api.SetupInput) => Promise<boolean>;
  logout: () => Promise<void>;
  acceptSession: (session: api.AuthSession) => void;
  expireSession: () => void;
  refresh: () => Promise<void>;
  clearError: () => void;
}

/**
 * Estado de acceso de la aplicación.
 *
 * La sesión vive en una cookie httpOnly; aquí solo se guarda una copia en
 * memoria para renderizar. Al recargar se vuelve a preguntar al servidor, así
 * que cerrar el navegador no deja datos visibles sin autenticarse.
 */
export function useAuth(): AuthController {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [session, setSession] = useState<api.AuthSession | null>(null);
  const [profiles, setProfiles] = useState<api.AuthProfileSummary[]>([]);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  const loadProfiles = useCallback(async () => {
    try {
      const state = await api.getAuthState();
      if (!mountedRef.current) return;
      setProfiles(state.profiles);
      setNeedsSetup(state.needsSetup);
    } catch {
      // El listado es informativo: si falla, la pantalla de acceso lo reintenta.
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const current = await api.getAuthSession();
      if (!mountedRef.current) return;
      setSession(current);
      setStatus('authenticated');
      setError(null);
      void loadProfiles();
      return;
    } catch (cause) {
      if (!isUnauthorized(cause) && !api.isNetworkError(cause)) {
        if (mountedRef.current) setError(describeApiError(cause));
      } else if (api.isNetworkError(cause) && mountedRef.current) {
        setError(
          'No se pudo conectar con el servidor SQLite. Verifica que esté en ejecución.',
        );
      }
    }

    if (!mountedRef.current) return;
    setSession(null);
    setStatus('anonymous');
    await loadProfiles();
  }, [loadProfiles]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const acceptSession = useCallback(
    (next: api.AuthSession) => {
      setSession(next);
      setStatus('authenticated');
      setError(null);
      void loadProfiles();
    },
    [loadProfiles],
  );

  const expireSession = useCallback(() => {
    setSession(null);
    setStatus('anonymous');
    setError('Tu sesión expiró. Vuelve a iniciar sesión.');
    void loadProfiles();
  }, [loadProfiles]);

  const run = useCallback(
    async (action: () => Promise<api.AuthSession>): Promise<boolean> => {
      setBusy(true);
      setError(null);
      try {
        const next = await action();
        acceptSession(next);
        return true;
      } catch (cause) {
        if (mountedRef.current) setError(describeApiError(cause));
        void loadProfiles();
        return false;
      } finally {
        if (mountedRef.current) setBusy(false);
      }
    },
    [acceptSession, loadProfiles],
  );

  const login = useCallback(
    (input: api.LoginInput) => run(() => api.login(input)),
    [run],
  );

  const claim = useCallback(
    (input: api.ClaimInput) => run(() => api.claimProfile(input)),
    [run],
  );

  const setup = useCallback(
    (input: api.SetupInput) => run(() => api.setupAccount(input)),
    [run],
  );

  const logout = useCallback(async () => {
    setBusy(true);
    try {
      await api.logout();
    } catch {
      // Aunque el servidor no responda, cerramos la sesión local.
    } finally {
      if (mountedRef.current) {
        setSession(null);
        setStatus('anonymous');
        setBusy(false);
        setError(null);
      }
      await loadProfiles();
    }
  }, [loadProfiles]);

  const clearError = useCallback(() => setError(null), []);

  return {
    status,
    session,
    profiles,
    needsSetup,
    error,
    busy,
    login,
    claim,
    setup,
    logout,
    acceptSession,
    expireSession,
    refresh,
    clearError,
  };
}
