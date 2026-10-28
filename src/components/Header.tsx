import {
  Database,
  HardDrive,
  Loader2,
  Settings as SettingsIcon,
  Wallet,
} from 'lucide-react';
import type { BackendStatus, UserProfile } from '../types';
import { CURRENCIES } from '../data/categories';
import { UserMenu } from './UserMenu';

interface HeaderProps {
  currencyCode: string;
  onCurrencyChange: (code: string) => void;
  onOpenSettings: () => void;
  users: UserProfile[];
  activeUser: UserProfile;
  onSwitchUser: (id: string) => void;
  onManageUsers: () => void;
  backendStatus: BackendStatus;
  syncPending: boolean;
}

export function Header({
  currencyCode,
  onCurrencyChange,
  onOpenSettings,
  users,
  activeUser,
  onSwitchUser,
  onManageUsers,
  backendStatus,
  syncPending,
}: HeaderProps) {
  const status =
    backendStatus === 'online'
      ? syncPending
        ? {
            label: 'Guardando',
            title: 'Guardando los últimos cambios en SQLite…',
            icon: Loader2,
            spin: true,
            classes: 'text-sky-700 bg-sky-50 border-sky-200',
          }
        : {
            label: 'SQLite',
            title: 'Conectado a SQLite',
            icon: Database,
            spin: false,
            classes: 'text-emerald-700 bg-emerald-50 border-emerald-200',
          }
      : backendStatus === 'connecting'
        ? {
            label: 'Conectando',
            title: 'Conectando con SQLite…',
            icon: Loader2,
            spin: true,
            classes: 'text-slate-500 bg-slate-50 border-slate-200',
          }
        : {
            label: 'Modo local',
            title: 'Sin conexión con SQLite: usando la copia local',
            icon: HardDrive,
            spin: false,
            classes: 'text-amber-700 bg-amber-50 border-amber-200',
          };

  const StatusIcon = status.icon;

  return (
    <header className="bg-white/90 backdrop-blur border-b border-slate-200 sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="bg-emerald-600 p-2 rounded-xl text-white shadow-md shadow-emerald-600/20 shrink-0">
            <Wallet className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-extrabold bg-gradient-to-r from-emerald-600 to-teal-700 bg-clip-text text-transparent leading-tight">
              FinanzasPro
            </h1>
            <p className="text-[11px] text-slate-500 hidden sm:block truncate">
              Control inteligente de gastos e ingresos
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <span
            title={status.title}
            aria-label={status.title}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-bold ${status.classes}`}
          >
            <StatusIcon
              className={`w-3.5 h-3.5 ${status.spin ? 'animate-spin' : ''}`}
            />
            <span className="hidden sm:inline">{status.label}</span>
          </span>

          <label className="sr-only" htmlFor="currency-select">
            Moneda
          </label>
          <select
            id="currency-select"
            value={currencyCode}
            onChange={(event) => onCurrencyChange(event.target.value)}
            className="hidden sm:block bg-slate-50 text-xs font-bold text-slate-700 py-2 pl-2.5 pr-7 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
            title="Moneda del perfil"
          >
            {CURRENCIES.map((currency) => (
              <option key={currency.code} value={currency.code}>
                {currency.symbol} {currency.code}
              </option>
            ))}
          </select>

          <UserMenu
            users={users}
            activeUser={activeUser}
            onSwitchUser={onSwitchUser}
            onManage={onManageUsers}
          />

          <button
            type="button"
            onClick={onOpenSettings}
            className="p-2.5 text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-xl border border-transparent hover:border-emerald-100 transition focus-ring"
            aria-label="Ajustes y datos"
            title="Ajustes y datos"
          >
            <SettingsIcon className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  );
}
