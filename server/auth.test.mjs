import { describe, expect, it } from 'vitest';
import {
  base32Decode,
  base32Encode,
  generateRecoveryCodes,
  generateSessionToken,
  generateTotpSecret,
  hashPassword,
  hashRecoveryCode,
  hashSessionToken,
  otpauthUrl,
  sanitizeUsername,
  totpCode,
  usernameKey,
  validatePassword,
  verifyPassword,
  verifyTotp,
} from './auth.mjs';

// Vector de prueba de la RFC 6238 (SHA-1, secreto "12345678901234567890").
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('contraseñas', () => {
  it('valida la forma de la contraseña', () => {
    expect(validatePassword('Secreta123')).toBeNull();
    expect(validatePassword('corta1')).toMatch(/al menos 8/);
    expect(validatePassword('sololetras')).toMatch(/letra y un número/);
    expect(validatePassword('123456789')).toMatch(/letra y un número/);
    expect(validatePassword('password1')).toMatch(/común/);
    expect(validatePassword('ana12345', 'ana')).toMatch(/nombre de usuario/);
    expect(validatePassword('a'.repeat(200) + '1')).toMatch(/no puede superar/);
  });

  it('genera hashes con sal y verifica en tiempo constante', async () => {
    const first = await hashPassword('Secreta123');
    const second = await hashPassword('Secreta123');

    expect(first).toMatch(/^scrypt\$\d+\$\d+\$\d+\$/);
    expect(first).not.toBe(second);
    await expect(verifyPassword('Secreta123', first)).resolves.toBe(true);
    await expect(verifyPassword('Secreta124', first)).resolves.toBe(false);
    await expect(verifyPassword('Secreta123', 'texto-invalido')).resolves.toBe(false);
    await expect(verifyPassword('Secreta123', 'scrypt$1$2$3$abc$def')).resolves.toBe(
      false,
    );
  });
});

describe('nombres de usuario', () => {
  it('acepta letras, números y separadores', () => {
    expect(sanitizeUsername('  ana.maria_1 ')).toBe('ana.maria_1');
    expect(sanitizeUsername('ab')).toBeNull();
    expect(sanitizeUsername('con espacios')).toBeNull();
    expect(sanitizeUsername('a'.repeat(33))).toBeNull();
    expect(sanitizeUsername('ana@casa')).toBeNull();
  });

  it('normaliza para comparar sin distinguir mayúsculas', () => {
    expect(usernameKey('  Ana.Maria ')).toBe('ana.maria');
  });
});

describe('TOTP', () => {
  it('codifica y decodifica base32', () => {
    const original = Buffer.from('12345678901234567890', 'utf8');
    const encoded = base32Encode(original);
    expect(encoded).toBe(RFC_SECRET);
    expect(base32Decode(encoded).equals(original)).toBe(true);
    expect(base32Decode('no-es-base32!').length).toBe(0);
  });

  it('genera códigos compatibles con la RFC 6238', () => {
    expect(totpCode(RFC_SECRET, 59_000)).toBe('287082');
    expect(totpCode(RFC_SECRET, 1_111_111_109_000)).toBe('081804');
    expect(totpCode(RFC_SECRET, 1_111_111_111_000)).toBe('050471');
    expect(totpCode(RFC_SECRET, 1_234_567_890_000)).toBe('005924');
  });

  it('acepta el intervalo actual y los adyacentes, no más', () => {
    expect(verifyTotp(RFC_SECRET, '287082', { now: 59_000 })).toBe(true);
    expect(verifyTotp(RFC_SECRET, '287082', { now: 89_000 })).toBe(true);
    expect(verifyTotp(RFC_SECRET, '287082', { now: 119_000 })).toBe(false);
    expect(verifyTotp(RFC_SECRET, '000000', { now: 59_000 })).toBe(false);
    expect(verifyTotp(RFC_SECRET, '28708', { now: 59_000 })).toBe(false);
    expect(verifyTotp('', '287082', { now: 59_000 })).toBe(false);
  });

  it('genera secretos únicos y una URL otpauth válida', () => {
    const first = generateTotpSecret();
    const second = generateTotpSecret();
    expect(first).not.toBe(second);
    expect(base32Decode(first).length).toBe(20);

    const url = otpauthUrl({ secret: first, username: 'ana.maria' });
    expect(url).toContain('otpauth://totp/');
    expect(url).toContain(`secret=${first}`);
    expect(url).toContain('issuer=FinanzasPro');
    expect(url).toContain('digits=6');
  });
});

describe('códigos de recuperación', () => {
  it('genera códigos legibles y únicos', () => {
    const codes = generateRecoveryCodes(8);
    expect(codes).toHaveLength(8);
    expect(new Set(codes.map((item) => item.code)).size).toBe(8);

    for (const item of codes) {
      expect(item.code).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
      expect(item.hash).toMatch(/^[0-9a-f]{64}$/);
      expect(item.hash).toBe(hashRecoveryCode(item.code));
    }
  });

  it('normaliza mayúsculas, guiones y espacios', () => {
    expect(hashRecoveryCode('abcde-fghij')).toBe(hashRecoveryCode('ABCDE FGHIJ'));
    expect(hashRecoveryCode('ABCDE-FGHIJ')).not.toBe(hashRecoveryCode('ABCDE-FGHIK'));
  });
});

describe('sesiones', () => {
  it('genera tokens opacos y hashes estables', () => {
    const token = generateSessionToken();
    expect(token).toHaveLength(43);
    expect(token).not.toBe(generateSessionToken());
    expect(hashSessionToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
    expect(hashSessionToken(token)).not.toBe(hashSessionToken(`${token}x`));
  });
});
