import { useId, useState, type FormEvent } from 'react';
import { Check, Plus, X } from 'lucide-react';
import type { Transaction, TransactionType } from '../types';
import { categoriesFor, getCurrency } from '../data/categories';
import { isValidISODate, todayISO } from '../lib/date';
import type { TransactionInput } from '../hooks/useFinanceStore';

interface TransactionFormProps {
  currencyCode: string;
  initial?: Transaction | null;
  onSubmit: (input: TransactionInput) => void;
  onCancel?: () => void;
}

export function TransactionForm({
  currencyCode,
  initial,
  onSubmit,
  onCancel,
}: TransactionFormProps) {
  const isEditing = Boolean(initial);
  const [type, setType] = useState<TransactionType>(initial?.type ?? 'expense');
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '');
  const [category, setCategory] = useState(
    initial?.category ?? categoriesFor('expense')[0].id,
  );
  const [date, setDate] = useState(initial?.date ?? todayISO());
  const [description, setDescription] = useState(initial?.description ?? '');
  const [error, setError] = useState('');

  const formId = useId();
  const amountId = `${formId}-amount`;
  const categoryId = `${formId}-category`;
  const dateId = `${formId}-date`;
  const descriptionId = `${formId}-description`;

  const symbol = getCurrency(currencyCode).symbol;
  const categories = categoriesFor(type);

  const handleTypeChange = (nextType: TransactionType) => {
    setType(nextType);
    const stillValid = categoriesFor(nextType).some((item) => item.id === category);
    if (!stillValid) setCategory(categoriesFor(nextType)[0].id);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const parsedAmount = Number(amount.replace(',', '.'));

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError('Ingresa un monto mayor a cero.');
      return;
    }
    if (parsedAmount > 1_000_000_000) {
      setError('El monto es demasiado grande.');
      return;
    }
    if (!isValidISODate(date)) {
      setError('Selecciona una fecha válida.');
      return;
    }
    if (!categories.some((item) => item.id === category)) {
      setError('Selecciona una categoría válida.');
      return;
    }

    setError('');
    onSubmit({
      type,
      amount: Math.round(parsedAmount * 100) / 100,
      category,
      date,
      description,
    });

    if (!isEditing) {
      setAmount('');
      setDescription('');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div>
        <span className="block text-xs font-semibold text-slate-600 mb-1.5">
          Tipo de movimiento
        </span>
        <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
          <button
            type="button"
            onClick={() => handleTypeChange('expense')}
            aria-pressed={type === 'expense'}
            className={`py-2 text-xs font-bold rounded-lg transition focus-ring ${
              type === 'expense'
                ? 'bg-rose-500 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Gasto
          </button>
          <button
            type="button"
            onClick={() => handleTypeChange('income')}
            aria-pressed={type === 'income'}
            className={`py-2 text-xs font-bold rounded-lg transition focus-ring ${
              type === 'income'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Ingreso
          </button>
        </div>
      </div>

      <div>
        <label htmlFor={amountId} className="block text-xs font-semibold text-slate-600 mb-1.5">
          Monto ({symbol})
        </label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm pointer-events-none">
            {symbol}
          </span>
          <input
            id={amountId}
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            placeholder="0.00"
            value={amount}
            onChange={(event) => {
              setAmount(event.target.value);
              if (error) setError('');
            }}
            autoComplete="off"
            className="w-full pl-9 pr-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-semibold text-slate-800 tabular-nums"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
        <div>
          <label htmlFor={categoryId} className="block text-xs font-semibold text-slate-600 mb-1.5">
            Categoría
          </label>
          <select
            id={categoryId}
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="w-full px-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium text-slate-700"
          >
            {categories.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={dateId} className="block text-xs font-semibold text-slate-600 mb-1.5">
            Fecha
          </label>
          <input
            id={dateId}
            type="date"
            value={date}
            max="2100-12-31"
            onChange={(event) => setDate(event.target.value)}
            className="w-full px-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium text-slate-700"
          />
        </div>
      </div>

      <div>
        <label htmlFor={descriptionId} className="block text-xs font-semibold text-slate-600 mb-1.5">
          Descripción / nota
        </label>
        <input
          id={descriptionId}
          type="text"
          maxLength={160}
          placeholder="ej. Compras del mes, pago de agua…"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          className="w-full px-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium text-slate-700"
        />
      </div>

      {error && (
        <p role="alert" className="text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <button
          type="submit"
          className={`w-full py-2.5 rounded-xl text-white font-bold text-sm shadow-md transition active:scale-[0.99] focus-ring ${
            type === 'income'
              ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
              : 'bg-rose-500 hover:bg-rose-600 shadow-rose-500/20'
          }`}
        >
          <span className="inline-flex items-center gap-1.5">
            {isEditing ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {isEditing ? 'Guardar cambios' : `Registrar ${type === 'income' ? 'ingreso' : 'gasto'}`}
          </span>
        </button>

        {isEditing && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="w-full py-2 rounded-xl text-slate-600 font-semibold text-xs hover:bg-slate-100 transition focus-ring inline-flex items-center justify-center gap-1.5"
          >
            <X className="w-4 h-4" /> Cancelar edición
          </button>
        )}
      </div>
    </form>
  );
}
