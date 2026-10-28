import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { PieChart as PieChartIcon } from 'lucide-react';
import type { CategoryTotal } from '../lib/analytics';
import { formatMoney, formatPercent } from '../lib/format';

interface ExpensePieProps {
  data: CategoryTotal[];
  totalExpenses: number;
  currencyCode: string;
}

export function ExpensePie({ data, totalExpenses, currencyCode }: ExpensePieProps) {
  return (
    <section className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200/80 shadow-sm">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-base font-bold text-slate-900">Gastos por categoría</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {data.length === 0
              ? 'Sin gastos en el período'
              : `${data.length} ${data.length === 1 ? 'categoría' : 'categorías'} con movimiento`}
          </p>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="py-12 text-center text-slate-400">
          <PieChartIcon className="w-12 h-12 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No hay gastos registrados en este período.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-center">
          <div className="relative h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={58}
                  outerRadius={90}
                  paddingAngle={3}
                  stroke="none"
                  isAnimationActive={false}
                >
                  {data.map((entry) => (
                    <Cell key={entry.id} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => [formatMoney(Number(value), currencyCode), 'Monto']}
                  contentStyle={{
                    borderRadius: 12,
                    border: '1px solid #E2E8F0',
                    boxShadow: '0 8px 24px rgba(15, 23, 42, 0.08)',
                    fontSize: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">
                Total
              </span>
              <span className="text-sm font-black text-slate-800 tabular-nums px-6 text-center">
                {formatMoney(totalExpenses, currencyCode)}
              </span>
            </div>
          </div>

          <div className="space-y-3 max-h-72 overflow-y-auto pr-2">
            {data.map((category) => (
              <div key={category.id} className="text-xs">
                <div className="flex justify-between items-center gap-2 mb-1 font-semibold">
                  <span className="flex items-center text-slate-700 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full mr-2 shrink-0"
                      style={{ backgroundColor: category.color }}
                    />
                    <span className="truncate">{category.name}</span>
                  </span>
                  <span className="text-slate-900 font-bold whitespace-nowrap tabular-nums">
                    {formatMoney(category.value, currencyCode)}
                    <span className="text-slate-400 font-medium ml-1">
                      {formatPercent(category.share, 0)}
                    </span>
                  </span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="h-1.5 rounded-full transition-all duration-500"
                    style={{ width: `${category.share}%`, backgroundColor: category.color }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
