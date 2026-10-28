import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  getPeriodRange,
  isWithinRange,
  isValidISODate,
  parseISODate,
  startOfWeek,
  toISODate,
} from './date';

describe('date helpers', () => {
  it('convierte fechas locales a ISO y de vuelta sin desfase', () => {
    const date = new Date(2026, 9, 28, 23, 30);
    expect(toISODate(date)).toBe('2026-10-28');
    expect(parseISODate('2026-10-28').getTime()).toBe(
      new Date(2026, 9, 28).getTime(),
    );
  });

  it('valida fechas ISO reales y rechaza días inexistentes', () => {
    expect(isValidISODate('2024-02-29')).toBe(true);
    expect(isValidISODate('2026-02-29')).toBe(false);
    expect(isValidISODate('2026-04-31')).toBe(false);
    expect(isValidISODate('28/10/2026')).toBe(false);
    expect(isValidISODate(20261028)).toBe(false);
  });

  it('calcula el inicio de semana con lunes como primer día', () => {
    expect(toISODate(startOfWeek(new Date(2026, 9, 28)))).toBe('2026-10-26');
    expect(toISODate(startOfWeek(new Date(2026, 10, 1)))).toBe('2026-10-26');
    expect(toISODate(startOfWeek(new Date(2026, 10, 2)))).toBe('2026-11-02');
  });

  it('suma días y meses respetando el calendario', () => {
    expect(toISODate(addDays(new Date(2026, 9, 31), 1))).toBe('2026-11-01');
    expect(toISODate(addMonths(new Date(2026, 0, 1), 1))).toBe('2026-02-01');
    expect(toISODate(addMonths(new Date(2026, 11, 1), 1))).toBe('2027-01-01');
  });

  it('genera rangos inclusivos al inicio y exclusivos al final', () => {
    const reference = new Date(2026, 9, 15);
    const month = getPeriodRange('month', reference)!;
    expect(toISODate(month.start)).toBe('2026-10-01');
    expect(toISODate(month.end)).toBe('2026-11-01');
    expect(isWithinRange('2026-10-31', month)).toBe(true);
    expect(isWithinRange('2026-11-01', month)).toBe(false);

    const day = getPeriodRange('day', reference)!;
    expect(isWithinRange('2026-10-15', day)).toBe(true);
    expect(isWithinRange('2026-10-16', day)).toBe(false);

    const year = getPeriodRange('year', reference)!;
    expect(toISODate(year.start)).toBe('2026-01-01');
    expect(toISODate(year.end)).toBe('2027-01-01');

    expect(getPeriodRange('all', reference)).toBeNull();
    expect(isWithinRange('1999-01-01', null)).toBe(true);
  });
});
