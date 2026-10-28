import type { UserData, UserProfile } from '../types';

/** Contrato de la API SQLite (server/index.mjs). */
export interface Workspace {
  users: UserProfile[];
  activeUserId: string | null;
  data: Record<string, UserData>;
}

export interface CreateProfileInput {
  id?: string;
  name: string;
  color?: string;
  createdAt?: number;
}

export interface HealthResponse {
  status: string;
  database: string;
  file: string;
  profiles: number;
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

export function getSession(): Promise<Workspace> {
  return request<Workspace>('/session');
}

export function createProfile(input: CreateProfileInput): Promise<{ user: UserProfile }> {
  return request<{ user: UserProfile }>('/profiles', {
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

export function deleteProfile(userId: string): Promise<Workspace> {
  return request<Workspace>(`/profiles/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
  });
}

export function setActiveProfile(userId: string): Promise<{ activeUserId: string }> {
  return request<{ activeUserId: string }>('/active-profile', {
    method: 'PUT',
    body: JSON.stringify({ userId }),
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

export function importWorkspace(workspace: {
  users: UserProfile[];
  activeUserId: string;
  data: Record<string, UserData>;
}): Promise<Workspace> {
  return request<Workspace>('/import', {
    method: 'POST',
    body: JSON.stringify(workspace),
  });
}
