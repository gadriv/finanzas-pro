import { useEffect, useState } from 'react';
import { Download, FileSpreadsheet, RotateCcw, Trash2, Upload } from 'lucide-react';
import type { BackendStatus, Settings } from '../types';
import { CURRENCIES, EXPENSE_CATEGORIES, getCategory } from '../data/categories';
import { Modal } from './Modal';

interface SettingsModalProps {
  open: boolean;
  settings: Settings;
  transactionCount: number;
  profileName: string;
  backendStatus: BackendStatus;
  onClose: () => void;
  onSave: (settings: Settings) => void;
  onExportJSON: () => void;
  onExportCSV: () => void;
  onImportClick: () => void;
  onResetDemo: () => void;
  onClearAll: () => void;
}

export function SettingsModal({
  open,
  settings,
  transactionCount,
  profileName,
  backendStatus,
  onClose,
  onSave,
  onExportJSON,
  onExportCSV,
  onImportClick,
  onResetDemo,
  onClearAll,
}: SettingsModalProps) {
  const [currencyCode, setCurrencyCode] = useState(settings.currencyCode);
  const [savingsGoal, setSavingsGoal] = useState(String(settings.savingsGoal));
  const [budgets, setBudgets] = useState<Record<string, string>>({});
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setCurrencyCode(settings.currencyCode);
    setSavingsGoal(String(settings.savingsGoal));
    setError('');
    const next: Record<string, string> = {};
    EXPENSE_CATEGORIES.forEach((category) => {
      const value = settings.budgets[category.id];
      next[category.id] = value ? String(value) : '';
    });
    setBudgets(next);
  }, [open, settings]);

  const handleSave = () => {
    const goal = Number(savingsGoal);
    if (!Number.isFinite(goal) || goal < 0 || goal > 100) {
      setError('La meta de ahorro debe estar entre 0 y 100 %.');
      return;
    }

    const nextBudgets: Record<string, number> = {};
    for (const category of EXPENSE_CATEGORIES) {
      const raw = budgets[category.id];
      if (!raw) continue;
      const value = Number(raw);
      if (!Number.isFinite(value) || value < 0) {
        setError(`El presupuesto de "${category.name}" no es válido.`);
        return;
      }
      if (value > 0) nextBudgets[category.id] = Math.round(value * 100) / 100;
    }

    onSave({ currencyCode, savingsGoal: goal, budgets: nextBudgets });
  };

  return (
    <Modal
      open={open}
      title="Ajustes y datos"
      description={`Ajustes del perfil «${profileName}»: moneda, metas y respaldos.`}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition focus-ring"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 shadow-sm transition focus-ring"
          >
            Guardar ajustes
          </button>
        </>
      }
    >
      <div className="space-y-7">
        {error && (
          <p role="alert" className="text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
            {error}
          </p>
        )}

        <section className="space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Preferencias
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="settings-currency" className="block text-xs font-semibold text-slate-600 mb-1.5">
                Moneda
              </label>
              <select
                id="settings-currency"
                value={currencyCode}
                onChange={(event) => setCurrencyCode(event.target.value)}
                className="w-full px-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium text-slate-700"
              >
                {CURRENCIES.map((currency) => (
                  <option key={currency.code} value={currency.code}>
                    {currency.symbol} · {currency.code} — {currency.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="settings-goal" className="block text-xs font-semibold text-slate-600 mb-1.5">
                Meta de ahorro (% de ingresos)
              </label>
              <div className="relative">
                <input
                  id="settings-goal"
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={savingsGoal}
                  onChange={(event) => setSavingsGoal(event.target.value)}
                  className="w-full px-3 pr-8 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-semibold text-slate-800 tabular-nums"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">
                  %
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Presupuesto mensual por categoría
            </h3>
            <p className="text-[11px] text-slate-500 mt-1">
              Deja el campo vacío para no asignar presupuesto a esa categoría.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {EXPENSE_CATEGORIES.map((category) => {
              const color = getCategory(category.id).color;
              return (
                <div
                  key={category.id}
                  className="flex items-center gap-2 bg-slate-50/70 border border-slate-200/70 rounded-xl px-3 py-2"
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <label
                    htmlFor={`budget-${category.id}`}
                    className="text-xs font-medium text-slate-600 flex-1 truncate"
                  >
                    {category.name}
                  </label>
                  <input
                    id={`budget-${category.id}`}
                    type="number"
                    min="0"
                    step="any"
                    placeholder="0"
                    value={budgets[category.id] ?? ''}
                    onChange={(event) =>
                      setBudgets((current) => ({ ...current, [category.id]: event.target.value }))
                    }
                    className="w-24 px-2 py-1.5 text-xs text-right bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-semibold text-slate-700 tabular-nums"
                  />
                </div>
              );
            })}
          </div>
        </section>

        <section className="space-y-3">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Datos</h3>
            <p className="text-[11px] text-slate-500 mt-1">
              {transactionCount}{' '}
              {transactionCount === 1 ? 'movimiento guardado' : 'movimientos guardados'} en el
              perfil «{profileName}». Las acciones siguientes aplican solo a este perfil.
            </p>
            <p className="text-[11px] text-slate-500 mt-1.5">
              {backendStatus === 'online'
                ? 'Guardado en SQLite en este equipo (data/finanzapro.db), con copia local en el navegador.'
                : backendStatus === 'connecting'
                  ? 'Conectando con SQLite…'
                  : 'Sin conexión con SQLite: los cambios se guardan solo en este navegador y se sincronizarán al reconectar.'}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={onExportJSON}
              className="inline-flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition focus-ring"
            >
              <Download className="w-4 h-4" /> Exportar respaldo (JSON)
            </button>
            <button
              type="button"
              onClick={onExportCSV}
              className="inline-flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition focus-ring"
            >
              <FileSpreadsheet className="w-4 h-4" /> Exportar a Excel (CSV)
            </button>
            <button
              type="button"
              onClick={onImportClick}
              className="inline-flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition focus-ring"
            >
              <Upload className="w-4 h-4" /> Importar respaldo
            </button>
            <button
              type="button"
              onClick={onResetDemo}
              className="inline-flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl hover:bg-amber-100 transition focus-ring"
            >
              <RotateCcw className="w-4 h-4" /> Restaurar datos demo
            </button>
            <button
              type="button"
              onClick={onClearAll}
              className="inline-flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl hover:bg-rose-100 transition focus-ring sm:col-span-2"
            >
              <Trash2 className="w-4 h-4" /> Borrar todas las transacciones
            </button>
          </div>
        </section>
      </div>
    </Modal>
  );
}
