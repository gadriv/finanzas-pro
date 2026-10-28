import type { UserData, UserProfile } from '../types';

/** Contrato de la API SQLite (server/index.mjs). */
export interface Workspace {
  users: UserProfile[];
  activeUserId: string | null;
  data: Record<string, UserData>;
}

export interface CreateProfileInput {
  name: string;
  color?: string;
  username: string;
  password: string;
}

export interface HealthResponse {
  status: string;
  database: string;
  file: string;
  profiles: number;
  auth: string;
}

/** Perfil visible en la pantalla de acceso (sin datos financieros). */
export interface AuthProfileSummary {
  id: string;
  name: string;
  color: string;
  username: string | null;
  hasPassword: boolean;
  totpEnabled: boolean;
  lockedUntil: number;
}

export interface AuthStateResponse {
  needsSetup: boolean;
  profiles: AuthProfileSummary[];
}

export interface AuthSession {
  user: UserProfile;
  workspace: Workspace;
  account: {
    username: string;
    totpEnabled: boolean;
  };
}

export interface LoginInput {
  username: string;
  password: string;
  code?: string;
  recoveryCode?: string;
  remember?: boolean;
}

export interface SetupInput {
  name: string;
  username: string;
  password: string;
  data?: UserData;
}

export interface ClaimInput {
  profileId: string;
  username: string;
  password: string;
}

export interface TotpSetupResponse {
  secret: string;
  otpauthUrl: string;
}

export interface RecoveryCodesResponse {
  recoveryCodes: string[];
}

const BASE = (import.meta.env.VITE_API_URL ?? '/api').replace(/\/+$/, '');
const TIMEOUT_MS = 8000;

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function isNetworkError(error: unknown): boolean {
  return (
    error instanceof ApiError && (error.status === 0 || error.status >= 500)
  );
}

export function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

export function describeApiError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Error inesperado al comunicarse con SQLite.';
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    const headers = new Headers(init.headers);
    if (init.body !== undefined && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    response = await fetch(`${BASE}${path}`, {
      ...init,
      headers,
      credentials: 'same-origin',
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(
      'No se pudo conectar con el servidor SQLite. Verifica que esté en ejecución.',
      0,
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    let message = `El servidor SQLite respondió con error ${response.status}.`;
    try {
      const body = (await response.json()) as { error?: unknown };
      if (typeof body?.error === 'string' && body.error.trim()) {
        message = body.error;
      }
    } catch {
      // Si el cuerpo no es JSON, conservamos el mensaje genérico.
    }
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>('/health');
}

/* ------------------------------------------------------------------ */
/* Autenticación                                                       */
/* ------------------------------------------------------------------ */

export function getAuthState(): Promise<AuthStateResponse> {
  return request<AuthStateResponse>('/auth/state');
}

export function login(input: LoginInput): Promise<AuthSession> {
  return request<AuthSession>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function setupAccount(input: SetupInput): Promise<AuthSession> {
  return request<AuthSession>('/auth/setup', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function claimProfile(input: ClaimInput): Promise<AuthSession> {
  return request<AuthSession>('/auth/claim', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function logout(): Promise<void> {
  return request<void>('/auth/logout', { method: 'POST' });
}

export function getAuthSession(): Promise<AuthSession> {
  return request<AuthSession>('/auth/session');
}

export function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>('/auth/password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

export function startTotpSetup(password: string): Promise<TotpSetupResponse> {
  return request<TotpSetupResponse>('/auth/totp/setup', {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
}

export function enableTotp(code: string): Promise<RecoveryCodesResponse> {
  return request<RecoveryCodesResponse>('/auth/totp/enable', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

export function disableTotp(
  password: string,
  code: string,
): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>('/auth/totp/disable', {
    method: 'POST',
    body: JSON.stringify({ password, code }),
  });
}

export function regenerateRecoveryCodes(
  password: string,
): Promise<RecoveryCodesResponse> {
  return request<RecoveryCodesResponse>('/auth/recovery-codes', {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
}

/* ------------------------------------------------------------------ */
/* Perfiles y datos                                                    */
/* ------------------------------------------------------------------ */

export function createProfile(input: CreateProfileInput): Promise<AuthSession> {
  return request<AuthSession>('/profiles', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function renameProfile(
  userId: string,
  name: string,
): Promise<{ user: UserProfile }> {
  return request<{ user: UserProfile }>(`/profiles/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
}

export function deleteProfile(userId: string, password: string): Promise<void> {
  return request<void>(`/profiles/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    body: JSON.stringify({ password }),
  });
}

export function getProfileData(userId: string): Promise<UserData> {
  return request<UserData>(`/profiles/${encodeURIComponent(userId)}/data`);
}

export function saveProfileData(
  userId: string,
  data: UserData,
): Promise<{ updatedAt: number }> {
  return request<{ updatedAt: number }>(`/profiles/${encodeURIComponent(userId)}/data`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}
