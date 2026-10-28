import { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, FilterX, Pencil, Search, Tag, Trash2 } from 'lucide-react';
import type { Transaction } from '../types';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, getCategory } from '../data/categories';
import { formatDate } from '../lib/date';
import { formatMoney } from '../lib/format';

interface TransactionListProps {
  transactions: Transaction[];
  currencyCode: string;
  locale: string;
  onEdit: (transaction: Transaction) => void;
  onDelete: (transaction: Transaction) => void;
}

type TypeFilter = 'all' | 'income' | 'expense';

export function TransactionList({
  transactions,
  currencyCode,
  locale,
  onEdit,
  onDelete,
}: TransactionListProps) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return transactions
      .filter((tx) => {
        const category = getCategory(tx.category);
        const matchesTerm =
          !term ||
          tx.description.toLowerCase().includes(term) ||
          category.name.toLowerCase().includes(term);
        const matchesType = typeFilter === 'all' || tx.type === typeFilter;
        const matchesCategory = categoryFilter === 'all' || tx.category === categoryFilter;
        return matchesTerm && matchesType && matchesCategory;
      })
      .sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1));
  }, [transactions, search, typeFilter, categoryFilter]);

  const hasActiveFilters = search.trim() !== '' || typeFilter !== 'all' || categoryFilter !== 'all';

  const resetFilters = () => {
    setSearch('');
    setTypeFilter('all');
    setCategoryFilter('all');
  };

  return (
    <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm">
      <div className="p-5 sm:p-6 border-b border-slate-100 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-slate-900">Historial de transacciones</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Mostrando {filtered.length} de {transactions.length} movimientos del período
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              placeholder="Buscar concepto…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Buscar transacciones"
              className="pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-700 w-full sm:w-48"
            />
          </div>

          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value as TypeFilter)}
            aria-label="Filtrar por tipo"
            className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium text-slate-700"
          >
            <option value="all">Todos los tipos</option>
            <option value="income">Sólo ingresos</option>
            <option value="expense">Sólo gastos</option>
          </select>

          <select
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
            aria-label="Filtrar por categoría"
            className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium text-slate-700 max-w-[170px]"
          >
            <option value="all">Todas las categorías</option>
            <optgroup label="Ingresos">
              {INCOME_CATEGORIES.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="Gastos">
              {EXPENSE_CATEGORIES.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </optgroup>
          </select>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1.5 px-2.5 py-2 text-xs font-semibold text-slate-500 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 rounded-xl transition focus-ring"
              title="Limpiar filtros"
            >
              <FilterX className="w-4 h-4" />
              Limpiar
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="py-14 text-center text-slate-400 px-6">
          <Search className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">
            {transactions.length === 0
              ? 'Todavía no hay movimientos en este período.'
              : 'Ningún movimiento coincide con los filtros aplicados.'}
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="mt-3 text-xs font-bold text-emerald-700 hover:text-emerald-800 underline underline-offset-2"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Tabla escritorio */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <th scope="col" className="py-3 px-4">Fecha</th>
                  <th scope="col" className="py-3 px-4">Descripción</th>
                  <th scope="col" className="py-3 px-4">Categoría</th>
                  <th scope="col" className="py-3 px-4 text-right">Monto</th>
                  <th scope="col" className="py-3 px-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filtered.map((tx) => {
                  const isIncome = tx.type === 'income';
                  const category = getCategory(tx.category);
                  return (
                    <tr key={tx.id} className="hover:bg-slate-50/80 transition">
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <span
                            className={`p-2 rounded-xl text-white shrink-0 ${
                              isIncome ? 'bg-emerald-500' : 'bg-rose-500'
                            }`}
                          >
                            {isIncome ? (
                              <ArrowUpRight className="w-4 h-4" />
                            ) : (
                              <ArrowDownRight className="w-4 h-4" />
                            )}
                          </span>
                          <span className="text-xs font-semibold text-slate-500">
                            {formatDate(tx.date, locale)}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-800 max-w-xs">
                        <span className="line-clamp-1">{tx.description}</span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                          <Tag className="w-3 h-3 mr-1 text-slate-400" />
                          {category.name}
                        </span>
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-bold whitespace-nowrap tabular-nums ${
                          isIncome ? 'text-emerald-600' : 'text-slate-800'
                        }`}
                      >
                        {isIncome ? '+' : '−'} {formatMoney(tx.amount, currencyCode, locale)}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => onEdit(tx)}
                            title="Editar transacción"
                            aria-label={`Editar ${tx.description}`}
                            className="text-slate-400 hover:text-sky-600 p-1.5 rounded-lg hover:bg-sky-50 transition focus-ring"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDelete(tx)}
                            title="Eliminar transacción"
                            aria-label={`Eliminar ${tx.description}`}
                            className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition focus-ring"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Tarjetas móvil */}
          <ul className="md:hidden divide-y divide-slate-100">
            {filtered.map((tx) => {
              const isIncome = tx.type === 'income';
              const category = getCategory(tx.category);
              return (
                <li key={tx.id} className="p-4 flex items-start gap-3">
                  <span
                    className={`p-2 rounded-xl text-white shrink-0 mt-0.5 ${
                      isIncome ? 'bg-emerald-500' : 'bg-rose-500'
                    }`}
                  >
                    {isIncome ? (
                      <ArrowUpRight className="w-4 h-4" />
                    ) : (
                      <ArrowDownRight className="w-4 h-4" />
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-800 leading-snug break-words">
                        {tx.description}
                      </p>
                      <p
                        className={`text-sm font-bold whitespace-nowrap tabular-nums ${
                          isIncome ? 'text-emerald-600' : 'text-slate-800'
                        }`}
                      >
                        {isIncome ? '+' : '−'} {formatMoney(tx.amount, currencyCode, locale)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className="text-[11px] font-semibold text-slate-500">
                        {formatDate(tx.date, locale)}
                      </span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600">
                        <span
                          className="w-1.5 h-1.5 rounded-full mr-1.5"
                          style={{ backgroundColor: category.color }}
                        />
                        {category.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        type="button"
                        onClick={() => onEdit(tx)}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-sky-600 px-2 py-1 rounded-lg hover:bg-sky-50 transition focus-ring"
                      >
                        <Pencil className="w-3.5 h-3.5" /> Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(tx)}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-rose-600 px-2 py-1 rounded-lg hover:bg-rose-50 transition focus-ring"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Eliminar
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
