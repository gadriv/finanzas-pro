import { getCurrency } from '../data/categories';

export function formatMoney(value: number, currencyCode = 'CRC', locale?: string): string {
  const currency = getCurrency(currencyCode);
  const resolvedLocale = locale ?? currency.locale;
  const hasDecimals = Math.abs(value % 1) > 0.004;

  try {
    return new Intl.NumberFormat(resolvedLocale, {
      style: 'currency',
      currency: currency.code,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: hasDecimals ? 2 : 0,
      maximumFractionDigits: hasDecimals ? 2 : 0,
    }).format(value);
  } catch {
    return `${currency.symbol} ${value.toFixed(hasDecimals ? 2 : 0)}`;
  }
}

/** Versión abreviada para espacios reducidos: ₡1,7 M · $250 K */
export function formatMoneyCompact(value: number, currencyCode = 'CRC'): string {
  const currency = getCurrency(currencyCode);
  try {
    return new Intl.NumberFormat(currency.locale, {
      style: 'currency',
      currency: currency.code,
      currencyDisplay: 'narrowSymbol',
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value);
  } catch {
    return formatMoney(value, currencyCode);
  }
}

/** Formato abreviado sin símbolo de moneda, para ejes de gráficos. */
export function formatCompact(value: number, currencyCode = 'CRC'): string {
  const currency = getCurrency(currencyCode);
  try {
    return new Intl.NumberFormat(currency.locale, {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value);
  } catch {
    return String(Math.round(value));
  }
}

export function formatPercent(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '0%';
  return `${value.toFixed(digits)}%`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
