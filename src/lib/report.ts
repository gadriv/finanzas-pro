import type { Period, Settings, Transaction } from '../types';
import { getCategory, getCurrency } from '../data/categories';
import {
  buildBudgetSummary,
  buildExpenseBreakdown,
  buildTrend,
  computeTotals,
  type BudgetSummary,
  type CategoryTotal,
  type Totals,
  type TrendPoint,
} from './analytics';
import { addDays, getPeriodRange, isWithinRange, toISODate } from './date';
import { downloadFile, fileSlug } from './storage';

/**
 * Datos del reporte financiero que se exporta a PDF o CSV.
 *
 * El reporte siempre corresponde al período seleccionado en el panel, salvo
 * los presupuestos, que son mensuales por definición de la app.
 */

export const PERIOD_LABELS: Record<Period, string> = {
  day: 'Diario',
  week: 'Semanal',
  month: 'Mensual',
  year: 'Anual',
  all: 'Histórico',
};

const DATE_FULL = new Intl.DateTimeFormat('es-CR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});
const DATE_TIME = new Intl.DateTimeFormat('es-CR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export interface ReportMeta {
  profileName: string;
  username: string;
  period: Period;
  periodLabel: string;
  /** Texto legible del rango: «01 oct 2026 – 31 oct 2026». */
  rangeLabel: string;
  /** Límites ISO del período, o null en el histórico. */
  startISO: string | null;
  endISO: string | null;
  generatedAt: Date;
  currencyCode: string;
  currencyLocale: string;
}

export interface ReportData {
  meta: ReportMeta;
  totals: Totals;
  savingsGoal: number;
  counts: { income: number; expense: number; total: number };
  categories: CategoryTotal[];
  trend: TrendPoint[];
  budgets: BudgetSummary;
  transactions: Transaction[];
}

export interface ReportInput {
  profileName: string;
  username: string;
  period: Period;
  transactions: Transaction[];
  settings: Settings;
  generatedAt?: Date;
}

function describeRange(period: Period, reference: Date): string {
  const range = getPeriodRange(period, reference);
  if (!range) return 'Todo el historial';
  if (period === 'day') return DATE_FULL.format(range.start);
  if (period === 'year') return String(range.start.getFullYear());
  return `${DATE_FULL.format(range.start)} – ${DATE_FULL.format(addDays(range.end, -1))}`;
}

function sortTransactions(transactions: Transaction[]): Transaction[] {
  return transactions
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt));
}

export function buildReport(input: ReportInput): ReportData {
  const generatedAt = input.generatedAt ?? new Date();
  const currency = getCurrency(input.settings.currencyCode);
  const range = getPeriodRange(input.period, generatedAt);

  const periodTransactions = sortTransactions(
    input.transactions.filter((tx) => isWithinRange(tx.date, range)),
  );

  const income = periodTransactions.filter((tx) => tx.type === 'income').length;
  const expense = periodTransactions.length - income;

  return {
    meta: {
      profileName: input.profileName,
      username: input.username,
      period: input.period,
      periodLabel: PERIOD_LABELS[input.period],
      rangeLabel: describeRange(input.period, generatedAt),
      startISO: range ? toISODate(range.start) : null,
      endISO: range ? toISODate(addDays(range.end, -1)) : null,
      generatedAt,
      currencyCode: currency.code,
      currencyLocale: currency.locale,
    },
    totals: computeTotals(periodTransactions),
    savingsGoal: input.settings.savingsGoal,
    counts: { income, expense, total: periodTransactions.length },
    categories: buildExpenseBreakdown(periodTransactions),
    trend: buildTrend(input.transactions, input.period, generatedAt),
    budgets: buildBudgetSummary(input.transactions, input.settings.budgets, generatedAt),
    transactions: periodTransactions,
  };
}

/** Número con separadores del locale de la moneda, sin símbolo (el PDF usa fuentes Latin-1). */
export function reportNumber(value: number, locale: string): string {
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
  // Los separadores de miles pueden ser espacios duros; jsPDF los maneja mejor como espacio normal.
  return formatted.replace(/[\u00A0\u202F]/g, ' ');
}

export function reportDate(value: Date): string {
  return DATE_TIME.format(value);
}

/** Importe completo para encabezados y totales: «CRC 1 234,56». */
export function reportMoney(value: number, report: ReportData): string {
  return `${report.meta.currencyCode} ${reportNumber(value, report.meta.currencyLocale)}`;
}

/* ------------------------------------------------------------------ */
/* CSV                                                                 */
/* ------------------------------------------------------------------ */

const SEPARATOR = ';';

function csvCell(value: string | number): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function csvRow(cells: (string | number)[]): string {
  return cells.map(csvCell).join(SEPARATOR);
}

/** Número para hojas de cálculo en español: coma decimal y sin separador de miles. */
function csvNumber(value: number): string {
  return value.toFixed(2).replace('.', ',');
}

function csvPercent(value: number): string {
  return `${value.toFixed(1).replace('.', ',')} %`;
}

export function buildReportCsv(report: ReportData): string {
  const { meta, totals, counts, categories, budgets } = report;
  const lines: string[] = [];

  // Ayuda a Excel a separar por «;» aunque el sistema esté en inglés.
  lines.push(`sep=${SEPARATOR}`);
  lines.push(csvRow(['FinanzasPro — Reporte financiero']));
  lines.push(csvRow(['Perfil', meta.profileName]));
  lines.push(csvRow(['Usuario', `@${meta.username}`]));
  lines.push(csvRow(['Período', meta.periodLabel]));
  lines.push(csvRow(['Desde', meta.startISO ?? 'Inicio del historial']));
  lines.push(csvRow(['Hasta', meta.endISO ?? toISODate(meta.generatedAt)]));
  lines.push(csvRow(['Generado', reportDate(meta.generatedAt)]));
  lines.push(csvRow(['Moneda', meta.currencyCode]));
  lines.push('');

  lines.push(csvRow(['Resumen', '']));
  lines.push(csvRow(['Concepto', 'Valor']));
  lines.push(csvRow(['Ingresos', csvNumber(totals.income)]));
  lines.push(csvRow(['Gastos', csvNumber(totals.expenses)]));
  lines.push(csvRow(['Balance', csvNumber(totals.balance)]));
  lines.push(csvRow(['Tasa de ahorro', csvPercent(totals.savingsRate)]));
  lines.push(csvRow(['Meta de ahorro', csvPercent(report.savingsGoal)]));
  lines.push(csvRow(['Movimientos', counts.total]));
  lines.push(csvRow(['Ingresos registrados', counts.income]));
  lines.push(csvRow(['Gastos registrados', counts.expense]));
  lines.push('');

  lines.push(csvRow(['Gastos por categoría', '', '']));
  lines.push(csvRow(['Categoría', 'Monto', '% del gasto']));
  if (categories.length === 0) {
    lines.push(csvRow(['Sin gastos en el período', '', '']));
  } else {
    categories.forEach((category) => {
      lines.push(csvRow([category.name, csvNumber(category.value), csvPercent(category.share)]));
    });
  }
  lines.push('');

  lines.push(csvRow(['Presupuestos del mes', '', '', '', '']));
  lines.push(csvRow(['Categoría', 'Presupuesto', 'Gastado', 'Restante', '% usado']));
  if (budgets.items.length === 0) {
    lines.push(csvRow(['Sin presupuestos configurados', '', '', '', '']));
  } else {
    budgets.items.forEach((item) => {
      lines.push(
        csvRow([
          item.name,
          csvNumber(item.budget),
          csvNumber(item.spent),
          csvNumber(item.budget - item.spent),
          csvPercent(item.ratio),
        ]),
      );
    });
    lines.push(
      csvRow([
        'Total',
        csvNumber(budgets.totalBudget),
        csvNumber(budgets.totalSpent),
        csvNumber(budgets.remaining),
        csvPercent(
          budgets.totalBudget > 0 ? (budgets.totalSpent / budgets.totalBudget) * 100 : 0,
        ),
      ]),
    );
  }
  lines.push('');

  lines.push(csvRow(['Movimientos del período', '', '', '', '']));
  lines.push(csvRow(['Fecha', 'Tipo', 'Categoría', 'Descripción', 'Monto']));
  if (report.transactions.length === 0) {
    lines.push(csvRow(['Sin movimientos en el período', '', '', '', '']));
  } else {
    report.transactions.forEach((tx) => {
      lines.push(
        csvRow([
          tx.date,
          tx.type === 'income' ? 'Ingreso' : 'Gasto',
          getCategory(tx.category).name,
          tx.description,
          csvNumber(tx.amount),
        ]),
      );
    });
  }

  return lines.join('\r\n');
}

export function reportFileName(report: ReportData, extension: 'pdf' | 'csv'): string {
  const profile = fileSlug(report.meta.profileName);
  const period = report.meta.period;
  return `finanzapro_${profile}reporte_${period}_${toISODate(report.meta.generatedAt)}.${extension}`;
}

export function exportReportCsv(report: ReportData): string {
  const filename = reportFileName(report, 'csv');
  // BOM para que Excel respete los acentos.
  downloadFile(`\uFEFF${buildReportCsv(report)}`, filename, 'text/csv;charset=utf-8');
  return filename;
}
