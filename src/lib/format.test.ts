import { describe, expect, it } from 'vitest';
import { clamp, formatMoney, formatPercent, uid } from './format';

describe('format', () => {
  it('formatea montos con la moneda y el locale indicados', () => {
    expect(formatMoney(1000, 'USD', 'en-US')).toContain('1,000');
    expect(formatMoney(10.5, 'USD', 'en-US')).toContain('10.50');
    expect(formatMoney(1000, 'CRC', 'es-CR')).toMatch(/₡/);
  });

  it('formatea porcentajes y valores no finitos', () => {
    expect(formatPercent(12.345)).toBe('12.3%');
    expect(formatPercent(12.345, 0)).toBe('12%');
    expect(formatPercent(Number.NaN)).toBe('0%');
  });

  it('limita valores a un rango', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });

  it('genera identificadores únicos', () => {
    const ids = new Set(Array.from({ length: 50 }, () => uid()));
    expect(ids.size).toBe(50);
  });
});
