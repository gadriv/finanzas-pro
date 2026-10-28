import { CalendarDays, FileDown } from 'lucide-react';
import type { Period } from '../types';
import { addDays, getPeriodRange } from '../lib/date';

const OPTIONS: { id: Period; label: string }[] = [
  { id: 'day', label: 'Diario' },
  { id: 'week', label: 'Semanal' },
  { id: 'month', label: 'Mensual' },
  { id: 'year', label: 'Anual' },
  { id: 'all', label: 'Histórico' },
];

const FULL = new Intl.DateTimeFormat('es-CR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});
const SHORT = new Intl.DateTimeFormat('es-CR', { day: '2-digit', month: 'short' });

function describePeriod(period: Period): string {
  const range = getPeriodRange(period);
  if (!range) return 'Todo el historial';

  if (period === 'day') return FULL.format(range.start);
  if (period === 'year') return String(range.start.getFullYear());

  const endInclusive = addDays(range.end, -1);
  return `${SHORT.format(range.start)} – ${FULL.format(endInclusive)}`;
}

interface PeriodFilterProps {
  value: Period;
  onChange: (period: Period) => void;
  onExportReport?: () => void;
}

export function PeriodFilter({ value, onChange, onExportReport }: PeriodFilterProps) {
  return (
    <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="p-2 bg-emerald-50 text-emerald-700 rounded-xl">
          <CalendarDays className="w-4 h-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-800 leading-tight">Período de análisis</p>
          <p className="text-[11px] text-slate-500 truncate">{describePeriod(value)}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 w-full sm:w-auto">
        <div
          className="grid grid-cols-5 gap-1 bg-slate-100 p-1 rounded-xl flex-1 sm:flex-none"
          role="group"
          aria-label="Seleccionar período"
        >
          {OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => onChange(option.id)}
              aria-pressed={value === option.id}
              className={`px-1 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-semibold transition focus-ring ${
                value === option.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {onExportReport && (
          <button
            type="button"
            onClick={onExportReport}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800 transition focus-ring"
            title="Exportar el reporte del período en PDF o CSV"
            aria-label="Exportar reporte del período"
          >
            <FileDown className="w-4 h-4" />
            <span className="hidden sm:inline">Reporte</span>
          </button>
        )}
      </div>
    </div>
  );
}
