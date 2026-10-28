import { useEffect, useState } from 'react';
import { Check, ChevronDown, Users } from 'lucide-react';
import type { UserProfile } from '../types';
import { ProfileAvatar } from './ProfileAvatar';

interface UserMenuProps {
  users: UserProfile[];
  activeUser: UserProfile;
  onSwitchUser: (id: string) => void;
  onManage: () => void;
}

export function UserMenu({ users, activeUser, onSwitchUser, onManage }: UserMenuProps) {
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
        aria-label={`Perfil activo: ${activeUser.name}. Cambiar de perfil`}
        title={`Perfil: ${activeUser.name}`}
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
            aria-label="Perfiles"
            className="absolute right-0 top-full mt-2 w-64 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 p-1.5 animate-fade-in"
          >
            <p className="px-2.5 pt-1.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Perfiles
            </p>

            <div className="max-h-64 overflow-y-auto">
              {users.map((user) => {
                const isActive = user.id === activeUser.id;
                return (
                  <button
                    key={user.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={isActive}
                    onClick={() => {
                      setOpen(false);
                      if (!isActive) onSwitchUser(user.id);
                    }}
                    className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-xl text-left transition ${
                      isActive ? 'bg-emerald-50/70' : 'hover:bg-slate-50'
                    }`}
                  >
                    <ProfileAvatar user={user} size="sm" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-xs font-semibold text-slate-700 truncate">
                        {user.name}
                      </span>
                      {isActive && (
                        <span className="block text-[10px] font-medium text-emerald-600">
                          Perfil activo
                        </span>
                      )}
                    </span>
                    {isActive && <Check className="w-4 h-4 text-emerald-600 shrink-0" />}
                  </button>
                );
              })}
            </div>

            <div className="border-t border-slate-100 mt-1 pt-1">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onManage();
                }}
                className="w-full flex items-center gap-2 px-2 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition"
              >
                <Users className="w-4 h-4" /> Gestionar perfiles
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
