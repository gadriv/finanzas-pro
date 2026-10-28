import { ArrowDownRight, ArrowUpRight, PiggyBank, Target, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import type { Totals } from '../lib/analytics';
import { formatMoney, formatMoneyCompact, formatPercent } from '../lib/format';

interface KpiCardsProps {
  totals: Totals;
  currencyCode: string;
  savingsGoal: number;
  incomeCount: number;
  expenseCount: number;
}

export function KpiCards({
  totals,
  currencyCode,
  savingsGoal,
  incomeCount,
  expenseCount,
}: KpiCardsProps) {
  const { income, expenses, balance, savingsRate } = totals;
  const goalReached = savingsRate >= savingsGoal;
  const progress = Math.min(100, Math.max(0, savingsRate));

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {/* Ingresos */}
      <article className="bg-white p-4 sm:p-5 rounded-2xl border border-emerald-100 shadow-sm relative overflow-hidden">
        <div className="absolute -right-4 -bottom-4 bg-emerald-50 w-24 h-24 rounded-full pointer-events-none" />
        <div className="flex items-start justify-between gap-2">
          <span className="text-[10px] sm:text-xs font-bold text-emerald-700 tracking-wider uppercase">
            Ingresos
          </span>
          <span className="p-1.5 sm:p-2 bg-emerald-100 text-emerald-700 rounded-xl">
            <ArrowUpRight className="w-4 h-4 sm:w-5 sm:h-5" />
          </span>
        </div>
        <h2 className="mt-2 text-lg sm:text-xl lg:text-2xl font-black text-slate-900 tabular-nums leading-tight">
          <span className="sm:hidden">{formatMoneyCompact(income, currencyCode)}</span>
          <span className="hidden sm:inline">{formatMoney(income, currencyCode)}</span>
        </h2>
        <p className="text-[11px] text-emerald-600 mt-1 font-medium flex items-center gap-1">
          <TrendingUp className="w-3.5 h-3.5" />
          {incomeCount} {incomeCount === 1 ? 'entrada' : 'entradas'}
        </p>
      </article>

      {/* Gastos */}
      <article className="bg-white p-4 sm:p-5 rounded-2xl border border-rose-100 shadow-sm relative overflow-hidden">
        <div className="absolute -right-4 -bottom-4 bg-rose-50 w-24 h-24 rounded-full pointer-events-none" />
        <div className="flex items-start justify-between gap-2">
          <span className="text-[10px] sm:text-xs font-bold text-rose-700 tracking-wider uppercase">
            Gastos
          </span>
          <span className="p-1.5 sm:p-2 bg-rose-100 text-rose-700 rounded-xl">
            <ArrowDownRight className="w-4 h-4 sm:w-5 sm:h-5" />
          </span>
        </div>
        <h2 className="mt-2 text-lg sm:text-xl lg:text-2xl font-black text-slate-900 tabular-nums leading-tight">
          <span className="sm:hidden">{formatMoneyCompact(expenses, currencyCode)}</span>
          <span className="hidden sm:inline">{formatMoney(expenses, currencyCode)}</span>
        </h2>
        <p className="text-[11px] text-rose-600 mt-1 font-medium flex items-center gap-1">
          <TrendingDown className="w-3.5 h-3.5" />
          {expenseCount} {expenseCount === 1 ? 'salida' : 'salidas'}
        </p>
      </article>

      {/* Balance */}
      <article
        className={`p-4 sm:p-5 rounded-2xl border shadow-sm relative overflow-hidden ${
          balance >= 0 ? 'bg-white border-sky-100' : 'bg-rose-50/70 border-rose-200'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="text-[10px] sm:text-xs font-bold text-slate-600 tracking-wider uppercase">
            Balance neto
          </span>
          <span
            className={`p-1.5 sm:p-2 rounded-xl ${
              balance >= 0 ? 'bg-sky-100 text-sky-700' : 'bg-rose-200 text-rose-800'
            }`}
          >
            <Wallet className="w-4 h-4 sm:w-5 sm:h-5" />
          </span>
        </div>
        <h2
          className={`mt-2 text-lg sm:text-xl lg:text-2xl font-black tabular-nums leading-tight ${
            balance >= 0 ? 'text-slate-900' : 'text-rose-700'
          }`}
        >
          <span className="sm:hidden">{formatMoneyCompact(balance, currencyCode)}</span>
          <span className="hidden sm:inline">{formatMoney(balance, currencyCode)}</span>
        </h2>
        <p className="text-[11px] text-slate-500 mt-1 font-medium">
          {balance >= 0 ? 'Disponible para ahorrar' : 'Gastaste más de lo que ingresó'}
        </p>
      </article>

      {/* Tasa de ahorro */}
      <article className="bg-white p-4 sm:p-5 rounded-2xl border border-indigo-100 shadow-sm relative overflow-hidden">
        <div className="flex items-start justify-between gap-2">
          <span className="text-[10px] sm:text-xs font-bold text-indigo-700 tracking-wider uppercase">
            Tasa de ahorro
          </span>
          <span className="p-1.5 sm:p-2 bg-indigo-100 text-indigo-700 rounded-xl">
            <PiggyBank className="w-4 h-4 sm:w-5 sm:h-5" />
          </span>
        </div>
        <h2 className="mt-2 text-base sm:text-xl lg:text-2xl font-black text-indigo-950 tabular-nums">
          {formatPercent(savingsRate)}
        </h2>
        <div className="w-full bg-indigo-100 rounded-full h-1.5 mt-2 overflow-hidden">
          <div
            className={`h-1.5 rounded-full transition-all duration-500 ${
              goalReached ? 'bg-emerald-500' : 'bg-indigo-500'
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <p
          className={`text-[11px] mt-1.5 font-medium flex items-center gap-1 ${
            goalReached ? 'text-emerald-600' : 'text-indigo-600'
          }`}
        >
          <Target className="w-3.5 h-3.5" />
          Meta {formatPercent(savingsGoal, 0)} {goalReached ? '· ¡Lograda!' : ''}
        </p>
      </article>
    </div>
  );
}
