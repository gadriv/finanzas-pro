import {
  createHash,
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';

/**
 * Utilidades de seguridad del servidor.
 *
 * - Contraseñas con scrypt (sal aleatoria por cuenta).
 * - 2FA TOTP compatible con Google Authenticator, Authy, 1Password, etc.
 * - Códigos de recuperación de un solo uso.
 * - Tokens de sesión opacos: en la base de datos solo se guarda su hash.
 */

const scrypt = promisify(scryptCallback);

export const SCRYPT_PARAMS = Object.freeze({
  N: 16384,
  r: 8,
  p: 1,
  keylen: 64,
  maxmem: 64 * 1024 * 1024,
});

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 32;
export const TOTP_ISSUER = 'FinanzasPro';
export const TOTP_DIGITS = 6;
export const TOTP_PERIOD = 30;
export const SESSION_COOKIE = 'finanzas_session';
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
export const REMEMBER_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

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

/* ------------------------------------------------------------------ */
/* Contraseñas                                                         */
/* ------------------------------------------------------------------ */

/** Valida la forma de una contraseña. Devuelve un mensaje o null si es válida. */
export function validatePassword(password, username = '') {
  if (typeof password !== 'string') {
    return 'La contraseña es obligatoria.';
  }
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
  if (username && password.toLowerCase().includes(String(username).toLowerCase())) {
    return 'La contraseña no puede contener el nombre de usuario.';
  }
  return null;
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = await scrypt(password.normalize('NFKC'), salt, SCRYPT_PARAMS.keylen, {
    N: SCRYPT_PARAMS.N,
    r: SCRYPT_PARAMS.r,
    p: SCRYPT_PARAMS.p,
    maxmem: SCRYPT_PARAMS.maxmem,
  });
  return [
    'scrypt',
    SCRYPT_PARAMS.N,
    SCRYPT_PARAMS.r,
    SCRYPT_PARAMS.p,
    salt.toString('base64'),
    Buffer.from(derived).toString('base64'),
  ].join('$');
}

/** Compara una contraseña con el hash almacenado en tiempo constante. */
export async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false;

  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (![N, r, p].every((value) => Number.isInteger(value) && value > 0)) return false;

  let salt;
  let expected;
  try {
    salt = Buffer.from(parts[4], 'base64');
    expected = Buffer.from(parts[5], 'base64');
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;

  try {
    const derived = await scrypt(password.normalize('NFKC'), salt, expected.length, {
      N,
      r,
      p,
      maxmem: SCRYPT_PARAMS.maxmem,
    });
    return timingSafeEqual(Buffer.from(derived), expected);
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Nombres de usuario                                                  */
/* ------------------------------------------------------------------ */

export function sanitizeUsername(raw) {
  if (typeof raw !== 'string') return null;
  const value = raw.normalize('NFKC').trim();
  if (value.length < USERNAME_MIN || value.length > USERNAME_MAX) return null;
  if (!/^[a-zA-Z0-9._-]+$/.test(value)) return null;
  return value;
}

/** Clave normalizada para comparar usuarios sin distinguir mayúsculas. */
export function usernameKey(raw) {
  if (typeof raw !== 'string') return '';
  return raw.normalize('NFKC').trim().toLowerCase();
}

/* ------------------------------------------------------------------ */
/* Base32 + TOTP (RFC 6238)                                            */
/* ------------------------------------------------------------------ */

export function base32Encode(buffer) {
  const bytes = Buffer.from(buffer);
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

export function base32Decode(input) {
  if (typeof input !== 'string') return Buffer.alloc(0);
  const clean = input.toUpperCase().replace(/[\s=]/g, '');
  let bits = 0;
  let value = 0;
  const bytes = [];

  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) return Buffer.alloc(0);
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret() {
  return base32Encode(randomBytes(20));
}

/** Código TOTP de 6 dígitos para un instante dado. */
export function totpCode(secret, now = Date.now(), step = TOTP_PERIOD) {
  const key = base32Decode(secret);
  if (key.length === 0) return '';

  const counter = Math.floor(now / 1000 / step);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));

  const digest = createHmac('sha1', key).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3];

  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
}

/** Verifica un código TOTP aceptando el intervalo actual y uno anterior/posterior. */
export function verifyTotp(secret, code, options = {}) {
  if (typeof code !== 'string') return false;
  const clean = code.replace(/\s+/g, '');
  if (!new RegExp(`^\\d{${TOTP_DIGITS}}$`).test(clean)) return false;
  if (!secret) return false;

  const now = options.now ?? Date.now();
  const step = options.step ?? TOTP_PERIOD;
  const window = options.window ?? 1;

  for (let offset = -window; offset <= window; offset += 1) {
    const candidate = totpCode(secret, now + offset * step * 1000, step);
    if (candidate && timingSafeEqual(Buffer.from(candidate), Buffer.from(clean))) {
      return true;
    }
  }
  return false;
}

export function otpauthUrl({ secret, username, issuer = TOTP_ISSUER }) {
  const label = encodeURIComponent(`${issuer}:${username ?? 'cuenta'}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/* ------------------------------------------------------------------ */
/* Códigos de recuperación                                             */
/* ------------------------------------------------------------------ */

function normalizeRecovery(raw) {
  return String(raw ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

export function hashRecoveryCode(code) {
  return createHash('sha256').update(normalizeRecovery(code)).digest('hex');
}

export function generateRecoveryCodes(count = 8) {
  const codes = [];
  for (let index = 0; index < count; index += 1) {
    let raw = '';
    const bytes = randomBytes(10);
    for (let position = 0; position < 10; position += 1) {
      raw += RECOVERY_ALPHABET[bytes[position] % RECOVERY_ALPHABET.length];
    }
    const code = `${raw.slice(0, 5)}-${raw.slice(5)}`;
    codes.push({ code, hash: hashRecoveryCode(code) });
  }
  return codes;
}

/* ------------------------------------------------------------------ */
/* Sesiones                                                            */
/* ------------------------------------------------------------------ */

export function generateSessionToken() {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token) {
  return createHash('sha256').update(String(token ?? '')).digest('hex');
}

/** Retardo mínimo para igualar tiempos entre usuario inexistente y existente. */
export function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
