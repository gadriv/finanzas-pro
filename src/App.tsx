import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { HardDrive, Plus, RefreshCw, ShieldCheck } from 'lucide-react';
import type { Period, Settings, Toast, Transaction } from './types';
import { getCurrency } from './data/categories';
import { useFinanceStore } from './hooks/useFinanceStore';
import type { TransactionInput } from './hooks/useFinanceStore';
import { getPeriodRange, isWithinRange } from './lib/date';
import {
  buildBudgetSummary,
  buildExpenseBreakdown,
  buildTrend,
  computeTotals,
} from './lib/analytics';
import {
  exportBackup,
  exportCSV,
  parseBackup,
} from './lib/storage';
import { Header } from './components/Header';
import { PeriodFilter } from './components/PeriodFilter';
import { KpiCards } from './components/KpiCards';
import { TransactionForm } from './components/TransactionForm';
import { ExpensePie } from './components/ExpensePie';
import { TrendChart } from './components/TrendChart';
import { BudgetPanel } from './components/BudgetPanel';
import { TransactionList } from './components/TransactionList';
import { SettingsModal } from './components/SettingsModal';
import { ProfilesModal } from './components/ProfilesModal';
import { Modal } from './components/Modal';
import { ConfirmDialog } from './components/ConfirmDialog';
import { ToastView } from './components/Toast';

type ConfirmKind = 'reset' | 'clear' | null;

export default function App() {
  const {
    users,
    activeUser,
    activeUserId,
    switchUser,
    createUser,
    renameUser,
    deleteUser,
    transactions,
    settings,
    backendStatus,
    syncPending,
    storageError,
    bootNotice,
    retryConnection,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    restoreTransaction,
    updateSettings,
    resetDemo,
    clearAll,
    replaceData,
  } = useFinanceStore();

  const [period, setPeriod] = useState<Period>('month');
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [showFab, setShowFab] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profilesOpen, setProfilesOpen] = useState(false);
  const [confirmKind, setConfirmKind] = useState<ConfirmKind>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLElement>(null);

  const currency = getCurrency(settings.currencyCode);

  const dismissToast = useCallback(() => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(null);
  }, []);

  const showToast = useCallback(
    (message: string, kind: Toast['kind'] = 'success', action?: Toast['action']) => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      setToast({ id: Date.now(), kind, message, action });
      toastTimer.current = setTimeout(
        () => setToast(null),
        action ? 7000 : 4500,
      );
    },
    [],
  );

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  // Avisos de la sesión: migración de datos y errores de almacenamiento.
  useEffect(() => {
    if (bootNotice) showToast(bootNotice, 'info');
  }, [bootNotice, showToast]);

  useEffect(() => {
    if (storageError) showToast(storageError, 'error');
  }, [storageError, showToast]);

  // Muestra el botón flotante sólo cuando el formulario no está a la vista.
  useEffect(() => {
    const element = formRef.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      ([entry]) => setShowFab(!entry.isIntersecting),
      { threshold: 0.25 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const range = useMemo(() => getPeriodRange(period), [period]);

  const periodTransactions = useMemo(
    () => transactions.filter((tx) => isWithinRange(tx.date, range)),
    [transactions, range],
  );

  const totals = useMemo(() => computeTotals(periodTransactions), [periodTransactions]);
  const breakdown = useMemo(
    () => buildExpenseBreakdown(periodTransactions),
    [periodTransactions],
  );
  const trend = useMemo(() => buildTrend(transactions, period), [transactions, period]);
  const budgetSummary = useMemo(
    () => buildBudgetSummary(transactions, settings.budgets),
    [transactions, settings.budgets],
  );

  const incomeCount = periodTransactions.filter((tx) => tx.type === 'income').length;
  const expenseCount = periodTransactions.length - incomeCount;

  const handleAdd = (input: TransactionInput) => {
    addTransaction(input);
    setQuickAddOpen(false);
    showToast('Movimiento registrado correctamente');
  };

  const handleUpdate = (input: TransactionInput) => {
    if (!editing) return;
    updateTransaction(editing.id, input);
    setEditing(null);
    showToast('Cambios guardados');
  };

  const handleDelete = (transaction: Transaction) => {
    const removed = deleteTransaction(transaction.id);
    if (!removed) return;
    showToast('Transacción eliminada', 'info', {
      label: 'Deshacer',
      onClick: () => restoreTransaction(removed),
    });
  };

  const handleSaveSettings = (next: Settings) => {
    updateSettings(next);
    setSettingsOpen(false);
    showToast('Ajustes guardados');
  };

  const handleExportJSON = () => {
    if (transactions.length === 0) {
      showToast('No hay transacciones para exportar', 'info');
      return;
    }
    exportBackup(transactions, settings, activeUser.name);
    showToast(`Respaldo de «${activeUser.name}» descargado`);
  };

  const handleExportCSV = () => {
    if (transactions.length === 0) {
      showToast('No hay transacciones para exportar', 'info');
      return;
    }
    exportCSV(transactions);
    showToast('Archivo CSV descargado');
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      const backup = parseBackup(text);
      replaceData(backup.transactions, backup.settings);
      setSettingsOpen(false);
      showToast(`Se importaron ${backup.transactions.length} movimientos`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No se pudo importar el archivo.';
      showToast(message, 'error');
    }
  };

  const handleReset = () => {
    resetDemo();
    setConfirmKind(null);
    setSettingsOpen(false);
    showToast('Datos de ejemplo restaurados');
  };

  const handleClear = () => {
    clearAll();
    setConfirmKind(null);
    setSettingsOpen(false);
    showToast('Se borraron todas las transacciones', 'info');
  };

  const handleSwitchUser = (userId: string) => {
    const target = users.find((user) => user.id === userId);
    if (!switchUser(userId)) return;
    setEditing(null);
    setQuickAddOpen(false);
    setSettingsOpen(false);
    if (target) showToast(`Perfil activo: ${target.name}`, 'info');
  };

  const handleCreateUser = async (name: string): Promise<boolean> => {
    const profile = await createUser(name);
    if (!profile) return false;
    setEditing(null);
    setQuickAddOpen(false);
    showToast(`Perfil "${profile.name}" creado`);
    return true;
  };

  const handleRenameUser = async (
    userId: string,
    name: string,
  ): Promise<boolean> => {
    if (!(await renameUser(userId, name))) return false;
    showToast('Perfil renombrado');
    return true;
  };

  const handleDeleteUser = async (userId: string): Promise<boolean> => {
    const target = users.find((user) => user.id === userId);
    const wasActive = userId === activeUserId;
    if (!(await deleteUser(userId))) return false;
    if (wasActive) {
      setEditing(null);
      setQuickAddOpen(false);
      setSettingsOpen(false);
    }
    showToast(
      target ? `Perfil "${target.name}" eliminado` : 'Perfil eliminado',
      'info',
    );
    return true;
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans pb-24 sm:pb-10">
      <ToastView toast={toast} onDismiss={dismissToast} />

      <Header
        currencyCode={settings.currencyCode}
        onCurrencyChange={(code) => updateSettings({ currencyCode: code })}
        onOpenSettings={() => setSettingsOpen(true)}
        users={users}
        activeUser={activeUser}
        onSwitchUser={handleSwitchUser}
        onManageUsers={() => setProfilesOpen(true)}
        backendStatus={backendStatus}
        syncPending={syncPending}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-5 space-y-5">
        {backendStatus === 'offline' && (
          <div
            role="status"
            className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3"
          >
            <div className="flex items-start gap-2.5 flex-1 min-w-0">
              <HardDrive className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-amber-900">
                  Sin conexión con SQLite
                </p>
                <p className="text-xs text-amber-800 mt-0.5">
                  Los cambios se guardan en la copia local de este navegador y se
                  sincronizarán al reconectar. Revisa que el servidor esté en ejecución.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={retryConnection}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold text-amber-900 bg-white border border-amber-300 rounded-xl hover:bg-amber-100 transition focus-ring shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Reintentar
            </button>
          </div>
        )}

        <PeriodFilter value={period} onChange={setPeriod} />

        <KpiCards
          totals={totals}
          currencyCode={settings.currencyCode}
          savingsGoal={settings.savingsGoal}
          incomeCount={incomeCount}
          expenseCount={expenseCount}
        />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-4 space-y-5">
            <section
              ref={formRef}
              className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200/80 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Plus className="w-5 h-5 text-emerald-600" />
                    Nuevo movimiento
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Registra un ingreso o gasto en segundos.
                  </p>
                </div>
              </div>

              <TransactionForm
                currencyCode={settings.currencyCode}
                onSubmit={handleAdd}
              />
            </section>

            <BudgetPanel
              summary={budgetSummary}
              currencyCode={settings.currencyCode}
              onEdit={() => setSettingsOpen(true)}
            />
          </div>

          <div className="lg:col-span-8 space-y-5">
            <ExpensePie
              data={breakdown}
              totalExpenses={totals.expenses}
              currencyCode={settings.currencyCode}
            />
            <TrendChart
              data={trend}
              currencyCode={settings.currencyCode}
              period={period}
            />
          </div>
        </div>

        <TransactionList
          transactions={periodTransactions}
          currencyCode={settings.currencyCode}
          locale={currency.locale}
          onEdit={setEditing}
          onDelete={handleDelete}
        />

        <footer className="flex items-start gap-2 text-[11px] text-slate-400 px-1 pt-2">
          <ShieldCheck className="w-4 h-4 shrink-0" />
          <p>
            El perfil <span className="font-semibold text-slate-500">{activeUser.name}</span>{' '}
            se guarda en SQLite en este equipo y mantiene una copia local en el navegador.
            Exporta un respaldo periódicamente desde Ajustes para conservar tu historial.
          </p>
        </footer>
      </main>

      {/* Edición de transacción */}
      <Modal
        open={editing !== null}
        title="Editar movimiento"
        description="Actualiza los datos y guarda los cambios."
        onClose={() => setEditing(null)}
        size="md"
      >
        {editing && (
          <TransactionForm
            key={editing.id}
            currencyCode={settings.currencyCode}
            initial={editing}
            onSubmit={handleUpdate}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>

      {/* Alta rápida en móvil */}
      <Modal
        open={quickAddOpen}
        title="Nuevo movimiento"
        description="Registra un ingreso o gasto."
        onClose={() => setQuickAddOpen(false)}
        size="md"
      >
        <TransactionForm
          key="quick-add"
          currencyCode={settings.currencyCode}
          onSubmit={handleAdd}
        />
      </Modal>

      <ProfilesModal
        open={profilesOpen}
        users={users}
        activeUserId={activeUserId}
        onClose={() => setProfilesOpen(false)}
        onSwitch={handleSwitchUser}
        onCreate={handleCreateUser}
        onRename={handleRenameUser}
        onDelete={handleDeleteUser}
      />

      <SettingsModal
        open={settingsOpen}
        settings={settings}
        transactionCount={transactions.length}
        profileName={activeUser.name}
        backendStatus={backendStatus}
        onClose={() => setSettingsOpen(false)}
        onSave={handleSaveSettings}
        onExportJSON={handleExportJSON}
        onExportCSV={handleExportCSV}
        onImportClick={handleImportClick}
        onResetDemo={() => {
          setSettingsOpen(false);
          setConfirmKind('reset');
        }}
        onClearAll={() => {
          setSettingsOpen(false);
          setConfirmKind('clear');
        }}
      />

      <ConfirmDialog
        open={confirmKind !== null}
        title={confirmKind === 'clear' ? 'Borrar todas las transacciones' : 'Restaurar datos demo'}
        message={
          confirmKind === 'clear'
            ? 'Se eliminarán todas tus transacciones de forma permanente. Te recomendamos exportar un respaldo antes de continuar.'
            : 'Se reemplazarán tus movimientos actuales por los datos de ejemplo. Esta acción no se puede deshacer.'
        }
        confirmLabel={confirmKind === 'clear' ? 'Sí, borrar todo' : 'Restaurar demo'}
        destructive={confirmKind === 'clear'}
        onConfirm={confirmKind === 'clear' ? handleClear : handleReset}
        onCancel={() => setConfirmKind(null)}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        onChange={handleFileChange}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      />

      {/* Acción rápida en móvil (sólo cuando el formulario no está visible) */}
      {showFab && (
        <button
          type="button"
          onClick={() => setQuickAddOpen(true)}
          aria-label="Registrar nuevo movimiento"
          className="lg:hidden fixed bottom-5 right-4 z-40 p-4 rounded-full bg-emerald-600 text-white shadow-xl shadow-emerald-600/30 hover:bg-emerald-700 active:scale-95 transition focus-ring animate-fade-in"
        >
          <Plus className="w-6 h-6" />
        </button>
      )}
    </div>
  );
}
