import type { UserProfile } from '../types';

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

export const PROFILE_NAME_MAX = 40;

/** Normaliza un nombre de perfil. Devuelve null si queda vacío. */
export function sanitizeProfileName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, PROFILE_NAME_MAX);

  return cleaned.length > 0 ? cleaned : null;
}

/** Iniciales para el avatar: "Ana María" → "AM", "Ana" → "AN". */
export function profileInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

export function nextProfileColor(users: UserProfile[]): string {
  const used = new Set(users.map((user) => user.color));
  const available = PROFILE_COLORS.find((color) => !used.has(color));
  if (available) return available;
  return PROFILE_COLORS[users.length % PROFILE_COLORS.length];
}

export function isProfileNameTaken(
  users: UserProfile[],
  name: string,
  excludeId?: string,
): boolean {
  const normalized = name.trim().toLocaleLowerCase('es');
  return users.some(
    (user) => user.id !== excludeId && user.name.trim().toLocaleLowerCase('es') === normalized,
  );
}
