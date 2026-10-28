/**
 * Reglas de acceso compartidas por la interfaz.
 *
 * El servidor vuelve a validar todo: esto solo da mensajes inmediatos al
 * usuario mientras escribe.
 */

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 32;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

const WEAK_PASSWORDS = new Set([
  '12345678',
  '123456789',
  '1234567890',
  'password',
  'password1',
  'contrasena',
  'contraseña',
  'qwertyui',
  'iloveyou',
  'admin123',
  'finanzas',
]);

/** Devuelve el usuario limpio o null si no cumple el formato. */
export function sanitizeUsername(raw: string): string | null {
  const value = raw.normalize('NFKC').trim();
  if (value.length < USERNAME_MIN || value.length > USERNAME_MAX) return null;
  if (!/^[a-zA-Z0-9._-]+$/.test(value)) return null;
  return value;
}

export function usernameKey(raw: string): string {
  return raw.normalize('NFKC').trim().toLowerCase();
}

/** Mensaje de error de la contraseña, o null si es válida. */
export function validatePassword(password: string, username = ''): string | null {
  if (password.length < PASSWORD_MIN) {
    return `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres.`;
  }
  if (password.length > PASSWORD_MAX) {
    return `La contraseña no puede superar ${PASSWORD_MAX} caracteres.`;
  }
  if (!/[a-zA-ZáéíóúÁÉÍÓÚñÑ]/.test(password) || !/\d/.test(password)) {
    return 'La contraseña debe incluir al menos una letra y un número.';
  }
  if (WEAK_PASSWORDS.has(password.toLowerCase())) {
    return 'Esa contraseña es demasiado común. Elige otra.';
  }
  if (username && password.toLowerCase().includes(username.toLowerCase())) {
    return 'La contraseña no puede contener el nombre de usuario.';
  }
  return null;
}

export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  barClass: string;
  textClass: string;
}

/** Estimación visual de la fortaleza (no sustituye la validación). */
export function passwordStrength(password: string): PasswordStrength {
  if (!password) {
    return {
      score: 0,
      label: 'Sin contraseña',
      barClass: 'bg-slate-200',
      textClass: 'text-slate-400',
    };
  }

  let score = 0;
  if (password.length >= PASSWORD_MIN) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password) && /[^a-zA-Z0-9]/.test(password)) score += 1;

  if (validatePassword(password)) score = Math.min(score, 1);

  const table = [
    { label: 'Muy débil', barClass: 'bg-rose-500', textClass: 'text-rose-600' },
    { label: 'Débil', barClass: 'bg-orange-500', textClass: 'text-orange-600' },
    { label: 'Aceptable', barClass: 'bg-amber-500', textClass: 'text-amber-600' },
    { label: 'Buena', barClass: 'bg-lime-500', textClass: 'text-lime-700' },
    { label: 'Fuerte', barClass: 'bg-emerald-500', textClass: 'text-emerald-700' },
  ] as const;

  const level = table[Math.min(score, 4)];
  return { score: Math.min(score, 4) as PasswordStrength['score'], ...level };
}

/** Deja solo los 6 dígitos del código TOTP. */
export function formatTotpInput(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 6);
}

/** Normaliza un código de recuperación: "abcde fghij" → "ABCDE-FGHIJ". */
export function formatRecoveryCode(raw: string): string {
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
  if (clean.length <= 5) return clean;
  return `${clean.slice(0, 5)}-${clean.slice(5)}`;
}

/** Minutos restantes de bloqueo (0 si no está bloqueado). */
export function lockMinutes(lockedUntil: number, now = Date.now()): number {
  if (!lockedUntil || lockedUntil <= now) return 0;
  return Math.ceil((lockedUntil - now) / 60000);
}

/** Texto amigable para el estado de un perfil en la pantalla de acceso. */
export function profileAccessLabel(profile: {
  hasPassword: boolean;
  totpEnabled: boolean;
}): string {
  if (!profile.hasPassword) return 'Sin contraseña · configurar acceso';
  return profile.totpEnabled ? 'Protegido con contraseña y 2FA' : 'Protegido con contraseña';
}
