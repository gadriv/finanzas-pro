import { useEffect, useState } from 'react';
import { ChevronDown, LogOut, ShieldCheck, Users } from 'lucide-react';
import type { UserProfile } from '../types';
import { ProfileAvatar } from './ProfileAvatar';

interface UserMenuProps {
  activeUser: UserProfile;
  username: string;
  onSecurity: () => void;
  onManageProfiles: () => void;
  onLogout: () => void;
}

export function UserMenu({
  activeUser,
  username,
  onSecurity,
  onManageProfiles,
  onLogout,
}: UserMenuProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Perfil activo: ${activeUser.name}. Abrir menú de cuenta`}
        title={`${activeUser.name} (@${username})`}
        className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-white hover:border-slate-300 pl-1 pr-2 py-1 transition focus-ring"
      >
        <ProfileAvatar user={activeUser} />
        <span className="hidden md:block text-xs font-semibold text-slate-700 max-w-[120px] truncate">
          {activeUser.name}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40 cursor-default"
            onMouseDown={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            role="menu"
            aria-label="Cuenta"
            className="absolute right-0 top-full mt-2 w-64 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 p-1.5 animate-fade-in"
          >
            <div className="flex items-center gap-2.5 px-2.5 py-2">
              <ProfileAvatar user={activeUser} size="lg" />
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-800 truncate">{activeUser.name}</p>
                <p className="text-[11px] text-slate-500 truncate">@{username}</p>
              </div>
            </div>

            <div className="border-t border-slate-100 mt-1 pt-1">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onSecurity();
                }}
                className="w-full flex items-center gap-2 px-2 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition"
              >
                <ShieldCheck className="w-4 h-4" /> Cuenta y seguridad
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onManageProfiles();
                }}
                className="w-full flex items-center gap-2 px-2 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition"
              >
                <Users className="w-4 h-4" /> Gestionar perfiles
              </button>
            </div>

            <div className="border-t border-slate-100 mt-1 pt-1">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onLogout();
                }}
                className="w-full flex items-center gap-2 px-2 py-2 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50 transition"
              >
                <LogOut className="w-4 h-4" /> Cerrar sesión
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
