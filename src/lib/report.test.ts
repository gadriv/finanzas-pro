import { describe, expect, it } from 'vitest';
import type { Settings, Transaction } from '../types';
import {
  buildReport,
  buildReportCsv,
  reportFileName,
  reportNumber,
} from './report';
import { createReportPdf } from './reportPdf';

const SETTINGS: Settings = {
  currencyCode: 'CRC',
  savingsGoal: 20,
  budgets: { food: 300, transport: 100 },
};

function tx(
  id: string,
  type: Transaction['type'],
  amount: number,
  category: string,
  date: string,
  description = 'Movimiento',
): Transaction {
  return { id, type, amount, category, date, description, createdAt: 1 };
}

const TRANSACTIONS: Transaction[] = [
  tx('t1', 'income', 1000, 'salary', '2026-10-02', 'Nómina de octubre'),
  tx('t2', 'expense', 200, 'food', '2026-10-03', 'Almuerzo'),
  tx('t3', 'expense', 50, 'transport', '2026-10-04', 'Bus'),
  tx('t4', 'expense', 30, 'food', '2026-09-15', 'Café del mes pasado'),
  tx('t5', 'income', 500, 'freelance', '2025-12-01', 'Proyecto antiguo'),
];

const REFERENCE = new Date(2026, 9, 28, 12, 30);

function monthlyReport() {
  return buildReport({
    profileName: 'Ana María',
    username: 'ana.maria',
    period: 'month',
    transactions: TRANSACTIONS,
    settings: SETTINGS,
    generatedAt: REFERENCE,
  });
}

describe('buildReport', () => {
  it('resume solo el período seleccionado', () => {
    const report = monthlyReport();

    expect(report.totals).toEqual({
      income: 1000,
      expenses: 250,
      balance: 750,
      savingsRate: 75,
    });
    expect(report.counts).toEqual({ income: 1, expense: 2, total: 3 });
    expect(report.transactions.map((item) => item.id)).toEqual(['t3', 't2', 't1']);
    expect(report.savingsGoal).toBe(20);
  });

  it('describe el rango y la moneda', () => {
    const report = monthlyReport();

    expect(report.meta.periodLabel).toBe('Mensual');
    expect(report.meta.rangeLabel).toBe('01 oct 2026 – 31 oct 2026');
    expect(report.meta.startISO).toBe('2026-10-01');
    expect(report.meta.endISO).toBe('2026-10-31');
    expect(report.meta.currencyCode).toBe('CRC');
  });

  it('calcula categorías, presupuestos y tendencia', () => {
    const report = monthlyReport();

    expect(report.categories.map((item) => [item.name, item.value, item.share])).toEqual([
      ['Alimentación', 200, 80],
      ['Transporte', 50, 20],
    ]);

    expect(report.budgets.items.map((item) => item.name)).toEqual([
      'Alimentación',
      'Transporte',
    ]);
    expect(report.budgets.totalBudget).toBe(400);
    expect(report.budgets.totalSpent).toBe(250);
    expect(report.budgets.remaining).toBe(150);

    expect(report.trend).toHaveLength(6);
    const october = report.trend[report.trend.length - 1];
    expect(october.income).toBe(1000);
    expect(october.expense).toBe(250);
  });

  it('usa todo el historial cuando el período es histórico', () => {
    const report = buildReport({
      profileName: 'Ana',
      username: 'ana',
      period: 'all',
      transactions: TRANSACTIONS,
      settings: SETTINGS,
      generatedAt: REFERENCE,
    });

    expect(report.meta.rangeLabel).toBe('Todo el historial');
    expect(report.meta.startISO).toBeNull();
    expect(report.meta.endISO).toBeNull();
    expect(report.counts.total).toBe(5);
    expect(report.totals.expenses).toBe(280);
  });

  it('acepta un período sin movimientos', () => {
    const report = buildReport({
      profileName: 'Ana',
      username: 'ana',
      period: 'day',
      transactions: TRANSACTIONS,
      settings: SETTINGS,
      generatedAt: REFERENCE,
    });

    expect(report.counts.total).toBe(0);
    expect(report.categories).toEqual([]);
    expect(report.transactions).toEqual([]);
    expect(report.meta.rangeLabel).toBe('28 oct 2026');
  });
});

describe('CSV del reporte', () => {
  it('incluye metadatos, secciones y totales', () => {
    const csv = buildReportCsv(monthlyReport());

    expect(csv.startsWith('sep=;')).toBe(true);
    expect(csv).toContain('"Perfil";"Ana María"');
    expect(csv).toContain('"Usuario";"@ana.maria"');
    expect(csv).toContain('"Período";"Mensual"');
    expect(csv).toContain('"Desde";"2026-10-01"');
    expect(csv).toContain('"Hasta";"2026-10-31"');
    expect(csv).toContain('"Moneda";"CRC"');
    expect(csv).toContain('"Ingresos";"1000,00"');
    expect(csv).toContain('"Gastos";"250,00"');
    expect(csv).toContain('"Balance";"750,00"');
    expect(csv).toContain('"Tasa de ahorro";"75,0 %"');
    expect(csv).toContain('"Gastos por categoría"');
    expect(csv).toContain('"Alimentación";"200,00";"80,0 %"');
    expect(csv).toContain('"Presupuestos del mes"');
    expect(csv).toContain('"Movimientos del período"');
    expect(csv).toContain('"2026-10-03";"Gasto";"Alimentación";"Almuerzo";"200,00"');
  });

  it('escapa comillas y punto y coma en las descripciones', () => {
    const report = buildReport({
      profileName: 'Ana',
      username: 'ana',
      period: 'month',
      transactions: [
        tx('x1', 'expense', 10, 'food', '2026-10-05', 'Compra "especial"; con ; y comillas'),
      ],
      settings: SETTINGS,
      generatedAt: REFERENCE,
    });

    const csv = buildReportCsv(report);
    expect(csv).toContain('"Compra ""especial""; con ; y comillas"');
  });

  it('marca las secciones vacías', () => {
    const report = buildReport({
      profileName: 'Ana',
      username: 'ana',
      period: 'day',
      transactions: [],
      settings: SETTINGS,
      generatedAt: REFERENCE,
    });

    const csv = buildReportCsv(report);
    expect(csv).toContain('"Sin gastos en el período"');
    expect(csv).toContain('"Sin movimientos en el período"');
  });
});

describe('formato de importes y nombre del archivo', () => {
  it('usa los separadores de la moneda', () => {
    expect(reportNumber(1234.56, 'es-CR')).toBe('1 234,56');
    expect(reportNumber(1234.56, 'en-US')).toBe('1,234.56');
    expect(reportNumber(0, 'es-CR')).toBe('0,00');
  });

  it('genera un nombre estable y sin acentos', () => {
    expect(reportFileName(monthlyReport(), 'pdf')).toBe(
      'finanzapro_ana_maria_reporte_month_2026-10-28.pdf',
    );
    expect(reportFileName(monthlyReport(), 'csv')).toMatch(/\.csv$/);
  });
});

describe('PDF del reporte', () => {
  it('genera un documento PDF válido con varias secciones', async () => {
    const doc = await createReportPdf(monthlyReport());
    const bytes = new Uint8Array(doc.output('arraybuffer') as ArrayBuffer);

    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(4000);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    expect(doc.getNumberOfPages()).toBeLessThanOrEqual(4);
  });

  it('funciona con un período sin movimientos', async () => {
    const report = buildReport({
      profileName: 'Perfil vacío',
      username: 'vacio',
      period: 'month',
      transactions: [],
      settings: SETTINGS,
      generatedAt: REFERENCE,
    });
    const doc = await createReportPdf(report);
    const bytes = new Uint8Array(doc.output('arraybuffer') as ArrayBuffer);

    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe('%PDF-');
  });
});
