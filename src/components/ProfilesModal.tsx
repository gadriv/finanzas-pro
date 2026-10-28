import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Loader2,
  Pencil,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import type { UserProfile } from '../types';
import { isProfileNameTaken, sanitizeProfileName } from '../lib/profiles';
import { loadUserData } from '../lib/userStorage';
import { Modal } from './Modal';
import { ProfileAvatar } from './ProfileAvatar';

interface ProfilesModalProps {
  open: boolean;
  users: UserProfile[];
  activeUserId: string;
  onClose: () => void;
  onSwitch: (id: string) => void;
  onCreate: (name: string) => Promise<boolean>;
  onRename: (id: string, name: string) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}

const DATE_FORMAT = new Intl.DateTimeFormat('es-CR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

export function ProfilesModal({
  open,
  users,
  activeUserId,
  onClose,
  onSwitch,
  onCreate,
  onRename,
  onDelete,
}: ProfilesModalProps) {
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setNewName('');
      setEditingId(null);
      setEditName('');
      setConfirmDeleteId(null);
      setError('');
      setPendingAction(null);
    }
  }, [open]);

  const counts = useMemo(() => {
    if (!open) return {} as Record<string, number>;
    const result: Record<string, number> = {};
    users.forEach((user) => {
      result[user.id] = loadUserData(user.id)?.transactions.length ?? 0;
    });
    return result;
  }, [open, users]);

  const handleCreate = async () => {
    if (pendingAction) return;
    const cleanName = sanitizeProfileName(newName);
    if (!cleanName) {
      setError('Escribe un nombre para el perfil.');
      return;
    }
    if (isProfileNameTaken(users, cleanName)) {
      setError('Ya existe un perfil con ese nombre.');
      return;
    }

    setPendingAction('create');
    try {
      if (!(await onCreate(cleanName))) {
        setError('No se pudo crear el perfil. Revisa la conexión con SQLite.');
        return;
      }
      setNewName('');
      setError('');
    } finally {
      setPendingAction(null);
    }
  };

  const startEditing = (user: UserProfile) => {
    if (pendingAction) return;
    setEditingId(user.id);
    setEditName(user.name);
    setConfirmDeleteId(null);
    setError('');
  };

  const saveEditing = async () => {
    if (!editingId || pendingAction) return;
    const cleanName = sanitizeProfileName(editName);
    if (!cleanName) {
      setError('El nombre no puede estar vacío.');
      return;
    }
    if (isProfileNameTaken(users, cleanName, editingId)) {
      setError('Ya existe un perfil con ese nombre.');
      return;
    }

    const action = `rename:${editingId}`;
    setPendingAction(action);
    try {
      if (!(await onRename(editingId, cleanName))) {
        setError('No se pudo renombrar el perfil.');
        return;
      }
      setEditingId(null);
      setError('');
    } finally {
      setPendingAction(null);
    }
  };

  const handleDelete = async (userId: string) => {
    if (pendingAction) return;
    const action = `delete:${userId}`;
    setPendingAction(action);
    try {
      if (!(await onDelete(userId))) {
        setError('No se pudo eliminar el perfil. Debe existir al menos uno.');
        return;
      }
      setConfirmDeleteId(null);
      setError('');
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <Modal
      open={open}
      title="Perfiles"
      description="Cada perfil guarda sus movimientos, moneda y presupuestos en SQLite."
      onClose={onClose}
      size="lg"
      footer={
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition focus-ring"
        >
          Cerrar
        </button>
      }
    >
      <div className="space-y-6">
        <section>
          <label
            htmlFor="new-profile-name"
            className="block text-xs font-semibold text-slate-600 mb-1.5"
          >
            Crear perfil
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              id="new-profile-name"
              type="text"
              maxLength={40}
              placeholder="ej. Personal, Trabajo, Familia…"
              value={newName}
              onChange={(event) => {
                setNewName(event.target.value);
                if (error) setError('');
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void handleCreate();
                }
              }}
              className="flex-1 px-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium text-slate-700"
            />
            <button
              type="button"
              onClick={handleCreate}
              disabled={!newName.trim() || pendingAction !== null}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm transition focus-ring"
            >
              {pendingAction === 'create' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <UserPlus className="w-4 h-4" />
              )}
              {pendingAction === 'create' ? 'Creando…' : 'Crear'}
            </button>
          </div>
          <p className="text-[11px] text-slate-500 mt-1.5">
            El perfil nuevo empieza vacío, con la moneda y los presupuestos por defecto.
          </p>
        </section>

        {error && (
          <p
            role="alert"
            className="text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2"
          >
            {error}
          </p>
        )}

        <section>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2.5 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" /> Tus perfiles ({users.length})
          </h3>

          <ul className="space-y-2">
            {users.map((user) => {
              const isActive = user.id === activeUserId;
              const isEditing = editingId === user.id;
              const isConfirming = confirmDeleteId === user.id;
              const isRenaming = pendingAction === `rename:${user.id}`;
              const isDeleting = pendingAction === `delete:${user.id}`;
              const count = counts[user.id] ?? 0;

              return (
                <li
                  key={user.id}
                  className={`flex items-start gap-3 p-3 rounded-2xl border transition ${
                    isActive
                      ? 'border-emerald-200 bg-emerald-50/50'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <ProfileAvatar user={user} size="lg" />

                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          autoFocus
                          type="text"
                          maxLength={40}
                          value={editName}
                          disabled={pendingAction !== null}
                          onChange={(event) => setEditName(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              void saveEditing();
                            }
                            if (event.key === 'Escape' && pendingAction === null) {
                              setEditingId(null);
                            }
                          }}
                          aria-label={`Nuevo nombre para ${user.name}`}
                          className="flex-1 min-w-0 px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-semibold text-slate-700 disabled:opacity-60"
                        />
                        <button
                          type="button"
                          onClick={saveEditing}
                          disabled={pendingAction !== null}
                          aria-label="Guardar nombre"
                          className="p-1.5 text-emerald-700 hover:bg-emerald-100 rounded-lg transition focus-ring disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {isRenaming ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Check className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          disabled={pendingAction !== null}
                          aria-label="Cancelar edición"
                          className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg transition focus-ring disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm font-bold text-slate-800 flex items-center gap-2 min-w-0">
                          <span className="truncate">{user.name}</span>
                          {isActive && (
                            <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full">
                              Activo
                            </span>
                          )}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {count} {count === 1 ? 'movimiento' : 'movimientos'} · Creado el{' '}
                          {DATE_FORMAT.format(new Date(user.createdAt))}
                        </p>
                      </>
                    )}

                    {isConfirming && (
                      <p className="text-[11px] font-semibold text-rose-600 mt-1.5">
                        Se borrarán todos sus movimientos y ajustes. Esta acción no se puede
                        deshacer.
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {isConfirming ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleDelete(user.id)}
                          disabled={pendingAction !== null}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition focus-ring disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isDeleting && <Loader2 className="w-3 h-3 animate-spin" />}
                          {isDeleting ? 'Eliminando…' : 'Eliminar'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          disabled={pendingAction !== null}
                          className="px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition focus-ring disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <>
                        {!isActive && !isEditing && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(null);
                              setConfirmDeleteId(null);
                              onSwitch(user.id);
                            }}
                            disabled={pendingAction !== null}
                            className="px-2.5 py-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 hover:bg-emerald-100 rounded-lg transition focus-ring disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            Usar
                          </button>
                        )}
                        {!isEditing && (
                          <button
                            type="button"
                            onClick={() => startEditing(user)}
                            disabled={pendingAction !== null}
                            aria-label={`Renombrar ${user.name}`}
                            title="Renombrar perfil"
                            className="p-1.5 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition focus-ring disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                        )}
                        {!isEditing && (
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmDeleteId(user.id);
                              setEditingId(null);
                              setError('');
                            }}
                            disabled={users.length <= 1 || pendingAction !== null}
                            aria-label={`Eliminar ${user.name}`}
                            title={
                              users.length <= 1
                                ? 'Debe existir al menos un perfil'
                                : 'Eliminar perfil y sus datos'
                            }
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition focus-ring disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-slate-400"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <p className="flex items-start gap-2 text-[11px] text-slate-500 bg-slate-50 border border-slate-200/70 rounded-xl px-3 py-2.5">
          <ShieldCheck className="w-4 h-4 shrink-0 text-slate-400" />
          <span>
            Los perfiles viven en SQLite en este equipo y no tienen contraseña: cualquiera con
            acceso al servidor local puede verlos. Exporta un respaldo desde Ajustes para cada
            perfil que quieras conservar.
          </span>
        </p>
      </div>
    </Modal>
  );
}
