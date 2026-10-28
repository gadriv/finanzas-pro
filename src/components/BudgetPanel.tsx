import { Pencil, Target } from 'lucide-react';
import type { BudgetSummary } from '../lib/analytics';
import { clamp, formatMoney, formatPercent } from '../lib/format';

interface BudgetPanelProps {
  summary: BudgetSummary;
  currencyCode: string;
  onEdit: () => void;
}

function barColor(ratio: number): string {
  if (ratio >= 100) return 'bg-rose-500';
  if (ratio >= 80) return 'bg-amber-500';
  return 'bg-emerald-500';
}

export function BudgetPanel({ summary, currencyCode, onEdit }: BudgetPanelProps) {
  const { items, totalBudget, totalSpent, remaining } = summary;
  const totalRatio = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

  return (
    <section className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200/80 shadow-sm">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-base font-bold text-slate-900">Presupuesto mensual</h3>
          <p className="text-xs text-slate-500 mt-0.5">Consumo del mes en curso</p>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 border border-slate-200 rounded-xl px-2.5 py-1.5 transition focus-ring"
        >
          <Pencil className="w-3.5 h-3.5" />
          Editar
        </button>
      </div>

      {items.length === 0 ? (
        <div className="py-8 text-center">
          <Target className="w-10 h-10 mx-auto mb-2 text-slate-300" />
          <p className="text-sm text-slate-500">
            Aún no defines presupuestos por categoría.
          </p>
          <button
            type="button"
            onClick={onEdit}
            className="mt-3 text-xs font-bold text-emerald-700 hover:text-emerald-800 underline underline-offset-2"
          >
            Definir presupuestos
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <div className="flex items-baseline justify-between gap-2 mb-1.5">
              <span className="text-xs font-semibold text-slate-600">
                {formatMoney(totalSpent, currencyCode)}{' '}
                <span className="text-slate-400 font-medium">
                  de {formatMoney(totalBudget, currencyCode)}
                </span>
              </span>
              <span
                className={`text-xs font-bold tabular-nums ${
                  totalRatio >= 100 ? 'text-rose-600' : 'text-slate-700'
                }`}
              >
                {formatPercent(totalRatio, 0)}
              </span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
              <div
                className={`h-2 rounded-full transition-all duration-500 ${barColor(totalRatio)}`}
                style={{ width: `${clamp(totalRatio, 0, 100)}%` }}
              />
            </div>
            <p
              className={`text-[11px] mt-1.5 font-medium ${
                remaining >= 0 ? 'text-slate-500' : 'text-rose-600'
              }`}
            >
              {remaining >= 0
                ? `Te quedan ${formatMoney(remaining, currencyCode)} este mes`
                : `Excedido por ${formatMoney(Math.abs(remaining), currencyCode)}`}
            </p>
          </div>

          <ul className="space-y-3 max-h-64 overflow-y-auto pr-1">
            {items.map((item) => (
              <li key={item.id}>
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 min-w-0">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="truncate">{item.name}</span>
                  </span>
                  <span className="text-[11px] text-slate-500 whitespace-nowrap tabular-nums">
                    <span
                      className={
                        item.ratio >= 100 ? 'text-rose-600 font-bold' : 'text-slate-700 font-semibold'
                      }
                    >
                      {formatMoney(item.spent, currencyCode)}
                    </span>{' '}
                    / {formatMoney(item.budget, currencyCode)}
                  </span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`h-1.5 rounded-full transition-all duration-500 ${barColor(item.ratio)}`}
                    style={{ width: `${clamp(item.ratio, 0, 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
