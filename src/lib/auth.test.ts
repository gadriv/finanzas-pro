import { describe, expect, it } from 'vitest';
import {
  formatRecoveryCode,
  formatTotpInput,
  lockMinutes,
  passwordStrength,
  profileAccessLabel,
  sanitizeUsername,
  usernameKey,
  validatePassword,
} from './auth';

describe('usuario y contraseña', () => {
  it('limpia y valida el nombre de usuario', () => {
    expect(sanitizeUsername('  ana.maria_1 ')).toBe('ana.maria_1');
    expect(sanitizeUsername('ab')).toBeNull();
    expect(sanitizeUsername('ana maria')).toBeNull();
    expect(sanitizeUsername('a'.repeat(33))).toBeNull();
  });

  it('normaliza el usuario para comparar', () => {
    expect(usernameKey(' Ana.Maria ')).toBe('ana.maria');
  });

  it('aplica las mismas reglas que el servidor', () => {
    expect(validatePassword('Secreta123')).toBeNull();
    expect(validatePassword('corta1')).toMatch(/al menos 8/);
    expect(validatePassword('sinNumeros')).toMatch(/letra y un número/);
    expect(validatePassword('password1')).toMatch(/común/);
    expect(validatePassword('ana12345', 'ana')).toMatch(/nombre de usuario/);
  });

  it('calcula la fortaleza', () => {
    expect(passwordStrength('').score).toBe(0);
    expect(passwordStrength('abc').score).toBeLessThanOrEqual(1);
    expect(passwordStrength('Secreta123!Larga').score).toBe(4);
  });
});

describe('formatos de seguridad', () => {
  it('deja solo 6 dígitos en el código TOTP', () => {
    expect(formatTotpInput('12 34-56')).toBe('123456');
    expect(formatTotpInput('1234567')).toBe('123456');
    expect(formatTotpInput('abc')).toBe('');
  });

  it('normaliza los códigos de recuperación', () => {
    expect(formatRecoveryCode('abcde fghij')).toBe('ABCDE-FGHIJ');
    expect(formatRecoveryCode('ABCDE')).toBe('ABCDE');
    expect(formatRecoveryCode('abcde-fghij-extra')).toBe('ABCDE-FGHIJ');
  });

  it('calcula los minutos de bloqueo', () => {
    const now = 1_000_000;
    expect(lockMinutes(0, now)).toBe(0);
    expect(lockMinutes(now - 1, now)).toBe(0);
    expect(lockMinutes(now + 61_000, now)).toBe(2);
  });

  it('describe el estado de acceso de un perfil', () => {
    expect(profileAccessLabel({ hasPassword: false, totpEnabled: false })).toMatch(
      /Sin contraseña/,
    );
    expect(profileAccessLabel({ hasPassword: true, totpEnabled: false })).toBe(
      'Protegido con contraseña',
    );
    expect(profileAccessLabel({ hasPassword: true, totpEnabled: true })).toBe(
      'Protegido con contraseña y 2FA',
    );
  });
});
