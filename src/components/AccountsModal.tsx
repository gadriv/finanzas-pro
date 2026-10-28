import { useEffect, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  Check,
  KeyRound,
  Loader2,
  LogIn,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import type { AuthProfileSummary } from '../lib/api';
import { describeApiError } from '../lib/api';
import { passwordStrength, sanitizeUsername, validatePassword } from '../lib/auth';
import { Modal } from './Modal';
import { ProfileAvatar } from './ProfileAvatar';

interface AccountsModalProps {
  open: boolean;
  profiles: AuthProfileSummary[];
  currentUserId: string;
  onClose: () => void;
  onSwitch: (username: string) => void;
  onCreate: (input: {
    name: string;
    username: string;
    password: string;
  }) => Promise<boolean>;
  onRename: (name: string) => Promise<boolean>;
  onDelete: (password: string) => Promise<boolean>;
}

type Mode = 'list' | 'create' | 'rename' | 'delete';

export function AccountsModal({
  open,
  profiles,
  currentUserId,
  onClose,
  onSwitch,
  onCreate,
  onRename,
  onDelete,
}: AccountsModalProps) {
  const [mode, setMode] = useState<Mode>('list');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const current = profiles.find((profile) => profile.id === currentUserId) ?? null;
  const strength = passwordStrength(password);

  const reset = () => {
    setMode('list');
    setBusy(false);
    setError(null);
    setName('');
    setUsername('');
    setPassword('');
    setConfirmPassword('');
  };

  useEffect(() => {
    if (!open) reset();
  }, [open]);

  const run = async (action: () => Promise<boolean>) => {
    setBusy(true);
    setError(null);
    const ok = await action().catch((cause) => {
      setError(describeApiError(cause));
      return false;
    });
    setBusy(false);
    if (ok) reset();
    return ok;
  };

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    const clean = sanitizeUsername(username);
    if (!clean) {
      setError('El usuario debe tener entre 3 y 32 caracteres sin espacios.');
      return;
    }
    const passwordError = validatePassword(password, clean);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    await run(() => onCreate({ name: name.trim(), username: clean, password }));
  };

  const handleRename = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setError('Escribe un nombre para el perfil.');
      return;
    }
    await run(() => onRename(name.trim()));
  };

  const handleDelete = async (event: FormEvent) => {
    event.preventDefault();
    if (!password) {
      setError('Escribe tu contraseña para confirmar.');
      return;
    }
    await run(() => onDelete(password));
  };

  return (
    <Modal
      open={open}
      title={
        mode === 'create'
          ? 'Nuevo perfil'
          : mode === 'rename'
            ? 'Renombrar perfil'
            : mode === 'delete'
              ? 'Eliminar perfil'
              : 'Perfiles'
      }
      description={
        mode === 'list'
          ? 'Cada perfil tiene su propio usuario y contraseña.'
          : mode === 'delete'
            ? 'Se borrarán la cuenta, los movimientos y los presupuestos. No se puede deshacer.'
            : undefined
      }
      onClose={onClose}
      size="lg"
    >
      {error && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800"
        >
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {mode === 'list' && (
        <div className="space-y-4">
          <ul className="space-y-2.5">
            {profiles.map((profile) => {
              const isCurrent = profile.id === currentUserId;
              return (
                <li
                  key={profile.id}
                  className={`rounded-2xl border px-4 py-3 ${
                    isCurrent
                      ? 'border-emerald-200 bg-emerald-50/50'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <ProfileAvatar user={profile} size="lg" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-900 truncate flex items-center gap-1.5">
                        {profile.name}
                        {isCurrent && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[9px] font-bold text-white">
                            <Check className="w-2.5 h-2.5" /> Sesión actual
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-slate-500 truncate">
                        @{profile.username}
                        {profile.totpEnabled && (
                          <span className="inline-flex items-center gap-1 ml-1.5 text-emerald-700 font-semibold">
                            <ShieldCheck className="w-3 h-3" /> 2FA
                          </span>
                        )}
                      </p>
                    </div>

                    {isCurrent ? (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setName(profile.name);
                            setError(null);
                            setMode('rename');
                          }}
                          aria-label={`Renombrar ${profile.name}`}
                          className="p-2 rounded-lg text-slate-400 hover:text-sky-700 hover:bg-sky-50 transition focus-ring"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPassword('');
                            setError(null);
                            setMode('delete');
                          }}
                          aria-label={`Eliminar ${profile.name}`}
                          className="p-2 rounded-lg text-slate-400 hover:text-rose-700 hover:bg-rose-50 transition focus-ring"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onSwitch(profile.username ?? '')}
                        disabled={!profile.hasPassword}
                        className="shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition focus-ring"
                      >
                        <LogIn className="w-3.5 h-3.5" /> Entrar
                      </button>
                    )}
                  </div>

                  {!profile.hasPassword && (
                    <p className="mt-2 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
                      Este perfil aún no tiene contraseña. Inicia sesión con él para
                      configurarla.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>

          <button
            type="button"
            onClick={() => {
              setName('');
              setUsername('');
              setPassword('');
              setConfirmPassword('');
              setError(null);
              setMode('create');
            }}
            className="w-full inline-flex items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 px-4 py-3 text-sm font-semibold text-slate-600 hover:border-emerald-400 hover:text-emerald-700 hover:bg-emerald-50/40 transition focus-ring"
          >
            <UserPlus className="w-4 h-4" /> Crear perfil protegido
          </button>
        </div>
      )}

      {mode === 'create' && (
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label htmlFor="new-profile-name" className="block text-xs font-bold text-slate-600 mb-1">
              Nombre del perfil
            </label>
            <input
              id="new-profile-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Familia"
              autoFocus
              required
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-emerald-400 focus-ring"
            />
          </div>

          <div>
            <label htmlFor="new-profile-username" className="block text-xs font-bold text-slate-600 mb-1">
              Nombre de usuario
            </label>
            <input
              id="new-profile-username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              required
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-emerald-400 focus-ring"
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="new-profile-password" className="block text-xs font-bold text-slate-600 mb-1">
                Contraseña
              </label>
              <input
                id="new-profile-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                required
                minLength={8}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-emerald-400 focus-ring"
              />
            </div>
            <div>
              <label htmlFor="new-profile-confirm" className="block text-xs font-bold text-slate-600 mb-1">
                Repite la contraseña
              </label>
              <input
                id="new-profile-confirm"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                required
                className={`w-full rounded-xl border px-3 py-2 text-sm focus-ring ${
                  confirmPassword && confirmPassword !== password
                    ? 'border-rose-300'
                    : 'border-slate-200 focus:border-emerald-400'
                }`}
              />
            </div>
          </div>

          {password && (
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className={`h-full rounded-full ${strength.barClass}`}
                  style={{ width: `${Math.max(8, (strength.score / 4) * 100)}%` }}
                />
              </div>
              <span className={`text-[10px] font-bold ${strength.textClass}`}>
                {strength.label}
              </span>
            </div>
          )}

          <div className="flex justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={reset}
              className="rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition focus-ring"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60 transition focus-ring"
            >
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <Plus className="w-3.5 h-3.5" /> Crear y entrar
            </button>
          </div>
        </form>
      )}

      {mode === 'rename' && current && (
        <form onSubmit={handleRename} className="space-y-4">
          <div>
            <label htmlFor="rename-profile" className="block text-xs font-bold text-slate-600 mb-1">
              Nuevo nombre para «{current.name}»
            </label>
            <input
              id="rename-profile"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
              required
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-emerald-400 focus-ring"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              El nombre de usuario (@{current.username}) no cambia.
            </p>
          </div>
          <div className="flex justify-between gap-2">
            <button
              type="button"
              onClick={reset}
              className="rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition focus-ring"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-60 transition focus-ring"
            >
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Guardar nombre
            </button>
          </div>
        </form>
      )}

      {mode === 'delete' && current && (
        <form onSubmit={handleDelete} className="space-y-4">
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-800">
            Vas a eliminar «{current.name}» (@{current.username}) y todos sus movimientos.
          </div>
          <div>
            <label htmlFor="delete-profile-password" className="block text-xs font-bold text-slate-600 mb-1">
              Contraseña de @{current.username}
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="delete-profile-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                autoFocus
                required
                className="w-full rounded-xl border border-slate-200 pl-9 pr-3 py-2 text-sm focus:border-rose-400 focus-ring"
              />
            </div>
          </div>
          <div className="flex justify-between gap-2">
            <button
              type="button"
              onClick={reset}
              className="rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition focus-ring"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-60 transition focus-ring"
            >
              {busy ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <X className="w-3.5 h-3.5" />
              )}
              Eliminar definitivamente
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
