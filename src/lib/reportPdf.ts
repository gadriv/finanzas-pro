import type { jsPDF } from 'jspdf';
import type { CellHookData } from 'jspdf-autotable';
import { getCategory } from '../data/categories';
import { formatDate } from './date';
import type { ReportData } from './report';
import { reportDate, reportMoney, reportNumber } from './report';

/**
 * Generación del reporte en PDF.
 *
 * jsPDF se carga de forma diferida para no aumentar el paquete inicial. Las
 * fuentes estándar de PDF solo cubren Latin-1, así que los importes se
 * escriben con el código ISO de la moneda (CRC, USD…) en lugar de símbolos
 * como ₡, que no existen en esa codificación.
 */

type RGB = readonly [number, number, number];

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 14;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const COLORS = {
  ink: [15, 23, 42] as RGB,
  slate: [71, 85, 105] as RGB,
  muted: [100, 116, 139] as RGB,
  line: [226, 232, 240] as RGB,
  emerald: [5, 150, 105] as RGB,
  emeraldDark: [4, 120, 87] as RGB,
  emeraldSoft: [236, 253, 245] as RGB,
  rose: [225, 29, 72] as RGB,
  roseSoft: [255, 241, 242] as RGB,
  sky: [2, 132, 199] as RGB,
  skySoft: [240, 249, 255] as RGB,
  amber: [180, 83, 9] as RGB,
};

/** Quita caracteres que las fuentes estándar de PDF no pueden representar. */
function pdfSafe(value: string): string {
  return value
    .normalize('NFC')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u20AC/g, 'EUR')
    .replace(/[\u00A0\u202F]/g, ' ')
    .replace(/[^\x20-\x7E\xA1-\xFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function setColor(doc: jsPDF, method: 'text' | 'fill' | 'draw', color: RGB): void {
  if (method === 'text') doc.setTextColor(color[0], color[1], color[2]);
  else if (method === 'fill') doc.setFillColor(color[0], color[1], color[2]);
  else doc.setDrawColor(color[0], color[1], color[2]);
}

/**
 * autotable solo aplica `columnStyles` a las filas del cuerpo, así que los
 * encabezados y los totales numéricos se alinean a la derecha aquí.
 */
function alignNumericCells(
  numericColumns: readonly number[],
  apply?: (data: CellHookData) => void,
) {
  return (data: CellHookData) => {
    if (data.section !== 'body' && numericColumns.includes(data.column.index)) {
      data.cell.styles.halign = 'right';
    }
    apply?.(data);
  };
}

/** Alto aproximado de una tabla de autotable, para no dejar títulos huérfanos. */
const TABLE_ROW_HEIGHT = 7.4;

function tableHeight(rows: number, withFoot = false): number {
  return TABLE_ROW_HEIGHT * (rows + 1 + (withFoot ? 1 : 0));
}

function lastTableY(doc: jsPDF): number {
  const last = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable;
  return typeof last?.finalY === 'number' ? last.finalY : MARGIN;
}

function sectionTitle(doc: jsPDF, title: string, subtitle: string | null, y: number): number {
  setColor(doc, 'fill', COLORS.emerald);
  doc.rect(MARGIN, y - 3.4, 2.2, 4.4, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  setColor(doc, 'text', COLORS.ink);
  doc.text(pdfSafe(title), MARGIN + 5, y);

  if (subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    setColor(doc, 'text', COLORS.muted);
    doc.text(pdfSafe(subtitle), PAGE_WIDTH - MARGIN, y, { align: 'right' });
  }
  return y + 5;
}

function note(doc: jsPDF, text: string, y: number): number {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  setColor(doc, 'text', COLORS.muted);
  doc.text(pdfSafe(text), MARGIN, y);
  return y + 6;
}

function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  if (y + needed <= PAGE_HEIGHT - 24) return y;
  doc.addPage();
  return MARGIN + 4;
}

function drawKpis(doc: jsPDF, report: ReportData, y: number): number {
  const gap = 4;
  const width = (CONTENT_WIDTH - gap * 3) / 4;
  const height = 21;

  const cards = [
    {
      label: 'Ingresos',
      value: reportMoney(report.totals.income, report),
      color: COLORS.emerald,
      background: COLORS.emeraldSoft,
    },
    {
      label: 'Gastos',
      value: reportMoney(report.totals.expenses, report),
      color: COLORS.rose,
      background: COLORS.roseSoft,
    },
    {
      label: 'Balance',
      value: reportMoney(report.totals.balance, report),
      color: report.totals.balance >= 0 ? COLORS.emerald : COLORS.rose,
      background: report.totals.balance >= 0 ? COLORS.emeraldSoft : COLORS.roseSoft,
    },
    {
      label: 'Tasa de ahorro',
      value: `${report.totals.savingsRate.toFixed(1)} %`,
      color: COLORS.sky,
      background: COLORS.skySoft,
    },
  ];

  cards.forEach((card, index) => {
    const x = MARGIN + index * (width + gap);
    setColor(doc, 'fill', card.background);
    doc.roundedRect(x, y, width, height, 2.2, 2.2, 'F');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    setColor(doc, 'text', COLORS.muted);
    doc.text(pdfSafe(card.label), x + 3.5, y + 7);

    const label = pdfSafe(card.value);
    let size = 10.5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(size);
    while (size > 7 && doc.getTextWidth(label) > width - 7) {
      size -= 0.5;
      doc.setFontSize(size);
    }
    setColor(doc, 'text', card.color);
    doc.text(label, x + 3.5, y + 16);
  });

  const detail = `${report.counts.total} ${
    report.counts.total === 1 ? 'movimiento' : 'movimientos'
  } (${report.counts.income} de ingreso, ${report.counts.expense} de gasto) · Meta de ahorro ${
    report.savingsGoal
  } %`;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  setColor(doc, 'text', COLORS.slate);
  doc.text(pdfSafe(detail), MARGIN, y + height + 6);

  return y + height + 12;
}

function drawTrend(doc: jsPDF, report: ReportData, y: number): number {
  const { trend, meta } = report;
  if (trend.length === 0) return y;

  const chartHeight = 32;
  const baseY = y + chartHeight;
  const max = Math.max(...trend.map((point) => Math.max(point.income, point.expense)), 1);
  const slot = CONTENT_WIDTH / trend.length;
  const barWidth = Math.min(5.5, slot * 0.3);

  setColor(doc, 'draw', COLORS.line);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, baseY, PAGE_WIDTH - MARGIN, baseY);

  // Etiqueta con el valor máximo de la escala.
  setColor(doc, 'text', COLORS.muted);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.text(`Máx. ${reportNumber(max, meta.currencyLocale)}`, MARGIN, y + 2);

  trend.forEach((point, index) => {
    const center = MARGIN + slot * index + slot / 2;
    const incomeHeight = (point.income / max) * (chartHeight - 5);
    const expenseHeight = (point.expense / max) * (chartHeight - 5);

    if (incomeHeight > 0.3) {
      setColor(doc, 'fill', COLORS.emerald);
      doc.rect(center - barWidth - 0.5, baseY - incomeHeight, barWidth, incomeHeight, 'F');
    }
    if (expenseHeight > 0.3) {
      setColor(doc, 'fill', COLORS.rose);
      doc.rect(center + 0.5, baseY - expenseHeight, barWidth, expenseHeight, 'F');
    }

    setColor(doc, 'text', COLORS.muted);
    doc.setFontSize(6.5);
    doc.text(pdfSafe(point.label), center, baseY + 4, { align: 'center' });
  });

  // Leyenda
  const legendY = y - 4;
  setColor(doc, 'fill', COLORS.emerald);
  doc.rect(PAGE_WIDTH - MARGIN - 44, legendY - 2, 3, 3, 'F');
  setColor(doc, 'text', COLORS.slate);
  doc.setFontSize(7);
  doc.text('Ingresos', PAGE_WIDTH - MARGIN - 39, legendY);

  setColor(doc, 'fill', COLORS.rose);
  doc.rect(PAGE_WIDTH - MARGIN - 22, legendY - 2, 3, 3, 'F');
  setColor(doc, 'text', COLORS.slate);
  doc.text('Gastos', PAGE_WIDTH - MARGIN - 17, legendY);

  return baseY + 13;
}

export async function createReportPdf(report: ReportData): Promise<jsPDF> {
  const { jsPDF: JsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new JsPDF({ unit: 'mm', format: 'a4', compress: true });
  const { meta, totals, categories, budgets } = report;

  /* Portada / encabezado ------------------------------------------------ */
  setColor(doc, 'fill', COLORS.emeraldDark);
  doc.rect(0, 0, PAGE_WIDTH, 30, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(255, 255, 255);
  doc.text('FinanzasPro', MARGIN, 14);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text('Reporte financiero', MARGIN, 20.5);

  doc.setFontSize(8);
  doc.text(`Generado ${reportDate(meta.generatedAt)}`, PAGE_WIDTH - MARGIN, 14, {
    align: 'right',
  });
  doc.text(`Importes en ${meta.currencyCode}`, PAGE_WIDTH - MARGIN, 20, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  setColor(doc, 'text', COLORS.ink);
  doc.text(pdfSafe(meta.profileName), MARGIN, 42);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  setColor(doc, 'text', COLORS.muted);
  doc.text(pdfSafe(`@${meta.username} · Período ${meta.periodLabel.toLowerCase()}`), MARGIN, 48);
  doc.text(pdfSafe(meta.rangeLabel), MARGIN, 53);

  let y = drawKpis(doc, report, 60);

  /* Gastos por categoría ------------------------------------------------ */
  y = ensureSpace(doc, y, categories.length > 0 ? tableHeight(categories.length) + 14 : 24);
  y = sectionTitle(
    doc,
    'Gastos por categoría',
    categories.length > 0 ? `${categories.length} categorías` : null,
    y,
  );

  if (categories.length === 0) {
    y = note(doc, 'Sin gastos registrados en el período.', y + 2);
  } else {
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN, top: 20, bottom: 22 },
      // Son tablas cortas: mejor moverlas enteras a la página siguiente que partirlas.
      pageBreak: 'avoid',
      head: [['Categoría', `Monto (${meta.currencyCode})`, '% del gasto']],
      body: categories.map((category) => [
        pdfSafe(category.name),
        reportNumber(category.value, meta.currencyLocale),
        `${category.share.toFixed(1)} %`,
      ]),
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: 8.5,
        cellPadding: 2,
        textColor: [51, 65, 85],
        lineColor: [226, 232, 240],
        lineWidth: 0.1,
      },
      headStyles: {
        fillColor: [236, 253, 245],
        textColor: [6, 95, 70],
        fontStyle: 'bold',
        lineColor: [209, 250, 229],
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        1: { halign: 'right', cellWidth: 38 },
        2: { halign: 'right', cellWidth: 30 },
      },
      didParseCell: alignNumericCells([1, 2]),
    });
    y = lastTableY(doc) + 10;
  }

  /* Evolución ----------------------------------------------------------- */
  y = ensureSpace(doc, y, 50);
  y = sectionTitle(doc, 'Ingresos vs gastos', 'Evolución del período', y);
  y = drawTrend(doc, report, y + 2);

  /* Presupuestos -------------------------------------------------------- */
  y = ensureSpace(doc, y, budgets.items.length > 0 ? tableHeight(budgets.items.length, true) + 14 : 24);
  y = sectionTitle(doc, 'Presupuestos del mes', 'Presupuesto mensual por categoría', y);

  if (budgets.items.length === 0) {
    y = note(doc, 'No hay presupuestos configurados en este perfil.', y + 2);
  } else {
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN, top: 20, bottom: 22 },
      pageBreak: 'avoid',
      showFoot: 'lastPage',
      head: [
        [
          'Categoría',
          `Presupuesto (${meta.currencyCode})`,
          'Gastado',
          'Restante',
          '% usado',
        ],
      ],
      body: budgets.items.map((item) => [
        pdfSafe(item.name),
        reportNumber(item.budget, meta.currencyLocale),
        reportNumber(item.spent, meta.currencyLocale),
        reportNumber(item.budget - item.spent, meta.currencyLocale),
        `${item.ratio.toFixed(1)} %`,
      ]),
      foot: [
        [
          'Total',
          reportNumber(budgets.totalBudget, meta.currencyLocale),
          reportNumber(budgets.totalSpent, meta.currencyLocale),
          reportNumber(budgets.remaining, meta.currencyLocale),
          `${
            budgets.totalBudget > 0
              ? ((budgets.totalSpent / budgets.totalBudget) * 100).toFixed(1)
              : '0.0'
          } %`,
        ],
      ],
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: 8.5,
        cellPadding: 2,
        textColor: [51, 65, 85],
        lineColor: [226, 232, 240],
        lineWidth: 0.1,
      },
      headStyles: {
        fillColor: [240, 249, 255],
        textColor: [3, 105, 161],
        fontStyle: 'bold',
        lineColor: [224, 242, 254],
      },
      footStyles: {
        fillColor: [248, 250, 252],
        textColor: [15, 23, 42],
        fontStyle: 'bold',
        lineColor: [226, 232, 240],
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        1: { halign: 'right' },
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right', cellWidth: 20 },
      },
      didParseCell: alignNumericCells([1, 2, 3, 4], (data) => {
        if (data.section === 'body' && data.column.index === 4) {
          const ratio = Number.parseFloat(String(data.cell.raw));
          data.cell.styles.textColor =
            ratio > 100 ? [190, 18, 60] : ratio >= 80 ? [180, 83, 9] : [4, 120, 87];
        }
      }),
    });
    y = lastTableY(doc) + 10;
  }

  /* Movimientos --------------------------------------------------------- */
  y = ensureSpace(doc, y, 34);
  y = sectionTitle(
    doc,
    'Movimientos del período',
    report.counts.total === 1 ? '1 movimiento' : `${report.counts.total} movimientos`,
    y,
  );

  if (report.transactions.length === 0) {
    y = note(doc, 'No hay movimientos registrados en el período seleccionado.', y + 2);
  } else {
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN, top: 20, bottom: 22 },
      head: [['Fecha', 'Tipo', 'Categoría', 'Descripción', `Monto (${meta.currencyCode})`]],
      body: report.transactions.map((tx) => [
        formatDate(tx.date, meta.currencyLocale),
        tx.type === 'income' ? 'Ingreso' : 'Gasto',
        pdfSafe(getCategory(tx.category).name),
        pdfSafe(tx.description).slice(0, 90),
        `${tx.type === 'income' ? '+' : '-'} ${reportNumber(tx.amount, meta.currencyLocale)}`,
      ]),
      theme: 'striped',
      styles: {
        font: 'helvetica',
        fontSize: 8,
        cellPadding: 1.8,
        textColor: [51, 65, 85],
        lineColor: [241, 245, 249],
        lineWidth: 0.1,
        overflow: 'linebreak',
      },
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 17 },
        2: { cellWidth: 38 },
        4: { halign: 'right', cellWidth: 30 },
      },
      didParseCell: alignNumericCells([4], (data) => {
        if (data.section === 'body' && data.column.index === 4) {
          data.cell.styles.textColor = String(data.cell.raw).startsWith('+')
            ? [4, 120, 87]
            : [190, 18, 60];
          data.cell.styles.fontStyle = 'bold';
        }
      }),
    });
    y = lastTableY(doc) + 8;
  }

  /* Cierre -------------------------------------------------------------- */
  const closing = `Balance del período: ${reportMoney(totals.balance, report)} · Tasa de ahorro: ${totals.savingsRate.toFixed(1)} %`;
  // Si la tabla de movimientos llega al final de la página, el cierre pasa al pie
  // de la última página para no crear una página casi vacía.
  const closingInFooter = y + 16 > PAGE_HEIGHT - 24;

  if (!closingInFooter) {
    setColor(doc, 'draw', COLORS.line);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    setColor(doc, 'text', COLORS.muted);
    doc.text(pdfSafe(closing), MARGIN, y + 5);
  }

  /* Encabezado y pie en todas las páginas ------------------------------- */
  const totalPages = doc.getNumberOfPages();

  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);

    if (page > 1) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      setColor(doc, 'text', COLORS.muted);
      doc.text('FinanzasPro · Reporte financiero', MARGIN, 10);

      doc.setFont('helvetica', 'normal');
      doc.text(
        pdfSafe(`${meta.profileName} · ${meta.rangeLabel}`),
        PAGE_WIDTH - MARGIN,
        10,
        { align: 'right' },
      );

      setColor(doc, 'draw', COLORS.line);
      doc.setLineWidth(0.2);
      doc.line(MARGIN, 12.5, PAGE_WIDTH - MARGIN, 12.5);
    }

    // Resumen de cierre cuando la tabla no dejó espacio en el cuerpo.
    if (page === totalPages && closingInFooter) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      setColor(doc, 'text', COLORS.ink);
      doc.text(pdfSafe(closing), MARGIN, 283);
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    setColor(doc, 'text', COLORS.muted);
    doc.text(
      pdfSafe(
        `Generado el ${reportDate(meta.generatedAt)} · Importes en ${meta.currencyCode}`,
      ),
      MARGIN,
      290,
    );
    doc.text(`Página ${page} de ${totalPages}`, PAGE_WIDTH - MARGIN, 290, {
      align: 'right',
    });
  }

  return doc;
}

export async function exportReportPdf(report: ReportData, filename: string): Promise<void> {
  const doc = await createReportPdf(report);
  doc.save(filename);
}
