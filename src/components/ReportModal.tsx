import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  FileSpreadsheet,
  FileText,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import type { Period, Settings, Transaction } from '../types';
import { getCurrency } from '../data/categories';
import { formatMoney, formatPercent } from '../lib/format';
import {
  buildReport,
  exportReportCsv,
  reportFileName,
} from '../lib/report';
import { exportReportPdf } from '../lib/reportPdf';
import { Modal } from './Modal';

interface ReportModalProps {
  open: boolean;
  profileName: string;
  username: string;
  period: Period;
  transactions: Transaction[];
  settings: Settings;
  onClose: () => void;
  onNotify: (message: string, kind?: 'success' | 'error' | 'info') => void;
}

type Busy = 'pdf' | 'csv' | null;

export function ReportModal({
  open,
  profileName,
  username,
  period,
  transactions,
  settings,
  onClose,
  onNotify,
}: ReportModalProps) {
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);

  const report = useMemo(() => {
    if (!open) return null;
    return buildReport({ profileName, username, period, transactions, settings });
  }, [open, profileName, username, period, transactions, settings]);

  useEffect(() => {
    if (!open) {
      setBusy(null);
      setError(null);
    }
  }, [open]);

  const handleCsv = () => {
    if (!report) return;
    setError(null);
    setBusy('csv');
    try {
      const filename = exportReportCsv(report);
      onNotify(`Reporte CSV descargado (${filename})`);
    } catch {
      setError('No se pudo generar el CSV. Revisa los permisos de descarga del navegador.');
    } finally {
      setBusy(null);
    }
  };

  const handlePdf = async () => {
    if (!report) return;
    setError(null);
    setBusy('pdf');
    try {
      await exportReportPdf(report, reportFileName(report, 'pdf'));
      onNotify('Reporte PDF descargado');
    } catch {
      setError('No se pudo generar el PDF. Inténtalo de nuevo o usa el formato CSV.');
    } finally {
      setBusy(null);
    }
  };

  const currency = getCurrency(settings.currencyCode);
  const disabled = busy !== null || !report;

  return (
    <Modal
      open={open}
      title="Exportar reporte"
      description="Descarga el análisis del período seleccionado."
      onClose={onClose}
      size="lg"
    >
      {report && (
        <div className="space-y-5">
          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800"
            >
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
            <p className="text-sm font-bold text-slate-900">
              {report.meta.profileName}{' '}
              <span className="font-medium text-slate-500">@{report.meta.username}</span>
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              Período {report.meta.periodLabel.toLowerCase()} · {report.meta.rangeLabel}
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <Stat label="Ingresos" value={formatMoney(report.totals.income, currency.code)} tone="emerald" />
            <Stat label="Gastos" value={formatMoney(report.totals.expenses, currency.code)} tone="rose" />
            <Stat
              label="Balance"
              value={formatMoney(report.totals.balance, currency.code)}
              tone={report.totals.balance >= 0 ? 'emerald' : 'rose'}
            />
            <Stat
              label="Tasa de ahorro"
              value={formatPercent(report.totals.savingsRate)}
              tone="sky"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={handlePdf}
              disabled={disabled}
              className="group text-left rounded-2xl border border-slate-200 bg-white p-4 hover:border-emerald-300 hover:bg-emerald-50/40 disabled:opacity-60 disabled:cursor-not-allowed transition focus-ring"
            >
              <span className="inline-flex items-center gap-2 text-sm font-bold text-slate-900">
                {busy === 'pdf' ? (
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                ) : (
                  <FileText className="w-4 h-4 text-emerald-600" />
                )}
                Documento PDF
              </span>
              <span className="mt-1.5 block text-xs text-slate-500 leading-relaxed">
                Resumen, gastos por categoría, presupuestos, gráfico de evolución y todos los
                movimientos. Listo para imprimir o compartir.
              </span>
              <span className="mt-2.5 block text-[11px] font-semibold text-emerald-700">
                {busy === 'pdf' ? 'Generando…' : 'Descargar PDF'}
              </span>
            </button>

            <button
              type="button"
              onClick={handleCsv}
              disabled={disabled}
              className="group text-left rounded-2xl border border-slate-200 bg-white p-4 hover:border-sky-300 hover:bg-sky-50/40 disabled:opacity-60 disabled:cursor-not-allowed transition focus-ring"
            >
              <span className="inline-flex items-center gap-2 text-sm font-bold text-slate-900">
                {busy === 'csv' ? (
                  <Loader2 className="w-4 h-4 animate-spin text-sky-600" />
                ) : (
                  <FileSpreadsheet className="w-4 h-4 text-sky-600" />
                )}
                Hoja de cálculo (CSV)
              </span>
              <span className="mt-1.5 block text-xs text-slate-500 leading-relaxed">
                Las mismas secciones en filas y columnas, con coma decimal y separador «;»
                para abrir directamente en Excel o Google Sheets.
              </span>
              <span className="mt-2.5 block text-[11px] font-semibold text-sky-700">
                {busy === 'csv' ? 'Generando…' : 'Descargar CSV'}
              </span>
            </button>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 space-y-1.5">
            <p className="text-[11px] font-bold text-slate-600 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Qué incluye
            </p>
            <ul className="text-[11px] text-slate-500 leading-relaxed list-disc pl-4 space-y-0.5">
              <li>
                Resumen: ingresos, gastos, balance, tasa de ahorro y número de movimientos
                ({report.counts.total}).
              </li>
              <li>
                Gastos por categoría, presupuestos del mes y evolución de ingresos y gastos.
              </li>
              <li>
                Movimientos del período ({report.meta.rangeLabel}) con fecha, tipo, categoría,
                descripción y monto.
              </li>
              <li>El archivo se genera en tu navegador: los datos no se envían a ningún servidor.</li>
            </ul>
          </div>
        </div>
      )}
    </Modal>
  );
}

interface StatProps {
  label: string;
  value: string;
  tone: 'emerald' | 'rose' | 'sky';
}

const TONES: Record<StatProps['tone'], string> = {
  emerald: 'border-emerald-100 bg-emerald-50 text-emerald-700',
  rose: 'border-rose-100 bg-rose-50 text-rose-700',
  sky: 'border-sky-100 bg-sky-50 text-sky-700',
};

function Stat({ label, value, tone }: StatProps) {
  return (
    <div className={`rounded-xl border px-3 py-2 ${TONES[tone]}`}>
      <p className="text-[10px] font-bold uppercase tracking-wide opacity-80">{label}</p>
      <p className="text-sm font-extrabold tabular-nums truncate" title={value}>
        {value}
      </p>
    </div>
  );
}
