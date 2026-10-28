import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BarChart3 } from 'lucide-react';
import type { Period } from '../types';
import type { TrendPoint } from '../lib/analytics';
import { formatCompact, formatMoney } from '../lib/format';

const SUBTITLES: Record<Period, string> = {
  day: 'Últimos 7 días',
  week: 'Últimas 8 semanas',
  month: 'Últimos 6 meses',
  year: 'Últimos 5 años',
  all: 'Últimos 12 meses',
};

interface TrendChartProps {
  data: TrendPoint[];
  currencyCode: string;
  period: Period;
}

export function TrendChart({ data, currencyCode, period }: TrendChartProps) {
  const hasData = data.some((point) => point.income > 0 || point.expense > 0);

  return (
    <section className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200/80 shadow-sm">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-base font-bold text-slate-900">Flujo de efectivo</h3>
          <p className="text-xs text-slate-500 mt-0.5">{SUBTITLES[period]}</p>
        </div>
        <span className="p-2 bg-slate-100 text-slate-500 rounded-xl">
          <BarChart3 className="w-4 h-4" />
        </span>
      </div>

      {!hasData ? (
        <div className="py-12 text-center text-slate-400">
          <BarChart3 className="w-12 h-12 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Aún no hay movimientos suficientes para graficar.</p>
        </div>
      ) : (
        <div className="h-60 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }} barGap={3}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: '#94A3B8' }}
                interval="preserveStartEnd"
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: '#94A3B8' }}
                tickFormatter={(value: number) => formatCompact(value, currencyCode)}
                width={48}
              />
              <Tooltip
                cursor={{ fill: '#F1F5F9' }}
                formatter={(value, name) => [
                  formatMoney(Number(value), currencyCode),
                  name,
                ]}
                labelStyle={{ fontSize: 12, fontWeight: 700, color: '#0F172A' }}
                contentStyle={{
                  borderRadius: 12,
                  border: '1px solid #E2E8F0',
                  boxShadow: '0 8px 24px rgba(15, 23, 42, 0.08)',
                  fontSize: 12,
                }}
              />
              <Legend
                verticalAlign="top"
                align="right"
                height={28}
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: 11, fontWeight: 600, color: '#64748B' }}
              />
              <Bar dataKey="income" name="Ingresos" fill="#10B981" radius={[6, 6, 0, 0]} maxBarSize={26} isAnimationActive={false} />
              <Bar dataKey="expense" name="Gastos" fill="#F43F5E" radius={[6, 6, 0, 0]} maxBarSize={26} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
