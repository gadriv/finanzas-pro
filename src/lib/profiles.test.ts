import { describe, expect, it } from 'vitest';
import {
  PROFILE_COLORS,
  isProfileNameTaken,
  nextProfileColor,
  profileInitials,
  sanitizeProfileName,
} from './profiles';
import type { UserProfile } from '../types';

const profile = (id: string, name: string, color = PROFILE_COLORS[0]): UserProfile => ({
  id,
  name,
  color,
  createdAt: 1,
});

describe('sanitizeProfileName', () => {
  it('recorta y colapsa espacios', () => {
    expect(sanitizeProfileName('  Ana   María  ')).toBe('Ana María');
  });

  it('convierte caracteres de control en espacios', () => {
    expect(sanitizeProfileName('Perso\u0000nal\n')).toBe('Perso nal');
  });

  it('limita el largo a 40 caracteres', () => {
    expect(sanitizeProfileName('a'.repeat(60))).toHaveLength(40);
  });

  it('devuelve null para nombres vacíos o no textuales', () => {
    expect(sanitizeProfileName('   ')).toBeNull();
    expect(sanitizeProfileName('\n\t')).toBeNull();
    expect(sanitizeProfileName(42)).toBeNull();
    expect(sanitizeProfileName(null)).toBeNull();
  });
});

describe('profileInitials', () => {
  it('usa las dos primeras letras de una sola palabra', () => {
    expect(profileInitials('Ana')).toBe('AN');
  });

  it('usa la inicial de las dos primeras palabras', () => {
    expect(profileInitials('Ana María')).toBe('AM');
    expect(profileInitials('  familia  pérez ')).toBe('FP');
  });

  it('devuelve un marcador para nombres vacíos', () => {
    expect(profileInitials('   ')).toBe('?');
  });
});

describe('nextProfileColor', () => {
  it('elige el primer color libre', () => {
    expect(nextProfileColor([])).toBe(PROFILE_COLORS[0]);
    expect(nextProfileColor([profile('a', 'Uno')])).toBe(PROFILE_COLORS[1]);
  });

  it('rota cuando todos los colores están usados', () => {
    const users = PROFILE_COLORS.map((color, index) =>
      profile(String(index), `Perfil ${index}`, color),
    );
    expect(nextProfileColor(users)).toBe(PROFILE_COLORS[0]);
  });
});

describe('isProfileNameTaken', () => {
  const users = [profile('a', 'Personal'), profile('b', 'Trabajo')];

  it('compara sin distinguir mayúsculas ni espacios externos', () => {
    expect(isProfileNameTaken(users, '  personal ')).toBe(true);
    expect(isProfileNameTaken(users, 'TRABAJO')).toBe(true);
  });

  it('permite el mismo nombre al renombrar el propio perfil', () => {
    expect(isProfileNameTaken(users, 'Personal', 'a')).toBe(false);
    expect(isProfileNameTaken(users, 'Trabajo', 'a')).toBe(true);
  });

  it('no marca nombres nuevos', () => {
    expect(isProfileNameTaken(users, 'Familia')).toBe(false);
  });
});
