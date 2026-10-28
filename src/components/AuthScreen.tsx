import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Plus,
  ShieldCheck,
  Smartphone,
  User,
  Wallet,
} from 'lucide-react';
import type {
  AuthProfileSummary,
  ClaimInput,
  LoginInput,
  SetupInput,
} from '../lib/api';
import {
  formatRecoveryCode,
  formatTotpInput,
  lockMinutes,
  passwordStrength,
  profileAccessLabel,
  sanitizeUsername,
  validatePassword,
} from '../lib/auth';
import { DEFAULT_SETTINGS } from '../data/categories';
import { buildSeedTransactions } from '../data/seed';
import { ProfileAvatar } from './ProfileAvatar';

type Mode = 'list' | 'login' | 'claim' | 'setup';

interface AuthScreenProps {
  profiles: AuthProfileSummary[];
  needsSetup: boolean;
  busy: boolean;
  error: string | null;
  initialUsername?: string;
  onLogin: (input: LoginInput) => Promise<boolean>;
  onClaim: (input: ClaimInput) => Promise<boolean>;
  onSetup: (input: SetupInput) => Promise<boolean>;
  onClearError: () => void;
}

function suggestUsername(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '.')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 32);
}

export function AuthScreen({
  profiles,
  needsSetup,
  busy,
  error,
  initialUsername,
  onLogin,
  onClaim,
  onSetup,
  onClearError,
}: AuthScreenProps) {
  const [mode, setMode] = useState<Mode>(needsSetup ? 'setup' : 'list');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [username, setUsername] = useState(initialUsername ?? '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [remember, setRemember] = useState(true);
  const [withDemo, setWithDemo] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const selected = profiles.find((profile) => profile.id === selectedId) ?? null;

  useEffect(() => {
    if (needsSetup) setMode('setup');
  }, [needsSetup]);

  // Con un único perfil, va directo a la contraseña (o a configurar el acceso).
  useEffect(() => {
    if (mode !== 'list' || profiles.length !== 1) return;
    const only = profiles[0];
    setSelectedId(only.id);
    setMode(only.hasPassword ? 'login' : 'claim');
    if (!only.hasPassword) {
      setUsername(only.username ?? suggestUsername(only.name));
    }
  }, [mode, profiles]);

  // Al cambiar de perfil desde la app, deja listo el acceso de ese usuario.
  useEffect(() => {
    if (!initialUsername || mode !== 'list') return;
    const match = profiles.find(
      (profile) =>
        profile.username?.toLowerCase() === initialUsername.toLowerCase(),
    );
    if (match?.hasPassword) {
      setSelectedId(match.id);
      setMode('login');
    }
  }, [initialUsername, mode, profiles]);

  const strength = useMemo(() => passwordStrength(password), [password]);

  const resetForm = () => {
    setPassword('');
    setConfirmPassword('');
    setCode('');
    setRecoveryCode('');
    setUseRecovery(false);
    setLocalError(null);
    onClearError();
  };

  const backToList = () => {
    resetForm();
    setSelectedId(null);
    setMode('list');
  };

  const openProfile = (profile: AuthProfileSummary) => {
    resetForm();
    setSelectedId(profile.id);
    setMode(profile.hasPassword ? 'login' : 'claim');
    setUsername(profile.username ?? suggestUsername(profile.name));
  };

  const startCreate = () => {
    resetForm();
    setName('');
    setUsername('');
    setWithDemo(false);
    setMode('setup');
  };

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    setLocalError(null);
    await onLogin({
      username: selected.username ?? username,
      password,
      code: code || undefined,
      recoveryCode: useRecovery ? recoveryCode || undefined : undefined,
      remember,
    });
  };

  const handleClaim = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    setLocalError(null);

    const clean = sanitizeUsername(username);
    if (!clean) {
      setLocalError('El usuario debe tener entre 3 y 32 caracteres sin espacios.');
      return;
    }
    const passwordError = validatePassword(password, clean);
    if (passwordError) {
      setLocalError(passwordError);
      return;
    }
    if (password !== confirmPassword) {
      setLocalError('Las contraseñas no coinciden.');
      return;
    }

    await onClaim({ profileId: selected.id, username: clean, password });
  };

  const handleSetup = async (event: FormEvent) => {
    event.preventDefault();
    setLocalError(null);

    if (!name.trim()) {
      setLocalError('Escribe un nombre para el perfil.');
      return;
    }
    const clean = sanitizeUsername(username);
    if (!clean) {
      setLocalError('El usuario debe tener entre 3 y 32 caracteres sin espacios.');
      return;
    }
    const passwordError = validatePassword(password, clean);
    if (passwordError) {
      setLocalError(passwordError);
      return;
    }
    if (password !== confirmPassword) {
      setLocalError('Las contraseñas no coinciden.');
      return;
    }

    await onSetup({
      name: name.trim(),
      username: clean,
      password,
      data:
        needsSetup && withDemo
          ? { transactions: buildSeedTransactions(), settings: DEFAULT_SETTINGS }
          : undefined,
    });
  };

  const message = localError ?? error;
  const canSubmit = !busy;

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-5xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-900/5 grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        {/* Presentación */}
        <aside className="relative hidden lg:flex flex-col justify-between gap-10 bg-gradient-to-br from-emerald-700 via-emerald-600 to-teal-700 p-9 text-white">
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-2xl bg-white/15 backdrop-blur">
              <Wallet className="w-6 h-6" />
            </span>
            <div>
              <p className="text-lg font-extrabold tracking-tight">FinanzasPro</p>
              <p className="text-[11px] text-emerald-100/80">Control de finanzas personales</p>
            </div>
          </div>

          <div className="space-y-5">
            <h1 className="text-3xl font-extrabold leading-tight">
              Tus finanzas,
              <br />
              bajo llave.
            </h1>
            <p className="text-sm text-emerald-50/90 leading-relaxed">
              Cada perfil tiene su propio usuario y contraseña. Los movimientos se guardan
              en SQLite en este equipo y la sesión se cierra al salir.
            </p>
            <ul className="space-y-3 text-sm text-emerald-50/90">
              <li className="flex items-start gap-2.5">
                <Lock className="w-4 h-4 mt-0.5 shrink-0" />
                Contraseñas con scrypt y sesiones httpOnly
              </li>
              <li className="flex items-start gap-2.5">
                <Smartphone className="w-4 h-4 mt-0.5 shrink-0" />
                Doble factor opcional con aplicación autenticadora
              </li>
              <li className="flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" />
                Códigos de recuperación de un solo uso
              </li>
            </ul>
          </div>

          <p className="text-[11px] text-emerald-100/70">
            Los datos nunca salen de este equipo.
          </p>
        </aside>

        {/* Formulario */}
        <section className="p-6 sm:p-9">
          <div className="lg:hidden flex items-center gap-2.5 mb-6">
            <span className="p-2 rounded-xl bg-emerald-600 text-white">
              <Wallet className="w-5 h-5" />
            </span>
            <div>
              <p className="font-extrabold text-slate-900">FinanzasPro</p>
              <p className="text-[11px] text-slate-500">Acceso protegido</p>
            </div>
          </div>

          {message && (
            <div
              role="alert"
              className="mb-5 flex items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
            >
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <p className="flex-1">{message}</p>
            </div>
          )}

          {mode === 'list' && (
            <div className="space-y-5">
              <header>
                <h2 className="text-xl font-extrabold text-slate-900">¿Quién entra?</h2>
                <p className="text-sm text-slate-500 mt-1">
                  Elige un perfil e introduce su contraseña.
                </p>
              </header>

              <ul className="space-y-2.5">
                {profiles.map((profile) => {
                  const locked = lockMinutes(profile.lockedUntil) > 0;
                  return (
                    <li key={profile.id}>
                      <button
                        type="button"
                        onClick={() => openProfile(profile)}
                        className="w-full flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left hover:border-emerald-300 hover:bg-emerald-50/40 transition focus-ring"
                      >
                        <ProfileAvatar user={profile} size="lg" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-bold text-slate-900 truncate">
                            {profile.name}
                          </span>
                          <span className="block text-xs text-slate-500 truncate">
                            {profile.username ? `@${profile.username} · ` : ''}
                            {profileAccessLabel(profile)}
                          </span>
                          {locked && (
                            <span className="block text-xs font-semibold text-rose-600 mt-0.5">
                              Bloqueado {lockMinutes(profile.lockedUntil)} min
                            </span>
                          )}
                        </span>
                        <Lock className="w-4 h-4 text-slate-400 shrink-0" />
                      </button>
                    </li>
                  );
                })}
              </ul>

              <button
                type="button"
                onClick={startCreate}
                className="w-full inline-flex items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 px-4 py-3 text-sm font-semibold text-slate-600 hover:border-emerald-400 hover:text-emerald-700 hover:bg-emerald-50/40 transition focus-ring"
              >
                <Plus className="w-4 h-4" /> Crear otro perfil
              </button>
            </div>
          )}

          {mode === 'login' && selected && (
            <form onSubmit={handleLogin} className="space-y-5">
              <button
                type="button"
                onClick={backToList}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition focus-ring rounded-lg"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Elegir otro perfil
              </button>

              <header className="flex items-center gap-3">
                <ProfileAvatar user={selected} size="lg" />
                <div className="min-w-0">
                  <h2 className="text-lg font-extrabold text-slate-900 truncate">
                    {selected.name}
                  </h2>
                  <p className="text-xs text-slate-500 truncate">
                    @{selected.username}
                    {selected.totpEnabled ? ' · 2FA activo' : ''}
                  </p>
                </div>
              </header>

              {lockMinutes(selected.lockedUntil) > 0 && (
                <p className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700">
                  Demasiados intentos fallidos. Espera {lockMinutes(selected.lockedUntil)}{' '}
                  minuto(s) antes de reintentar.
                </p>
              )}

              <div>
                <label htmlFor="login-password" className="block text-xs font-bold text-slate-600 mb-1.5">
                  Contraseña
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoFocus
                    autoComplete="current-password"
                    required
                    className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-10 py-2.5 text-sm focus:border-emerald-400 focus-ring"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 focus-ring"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {selected.totpEnabled && (
                <div className="space-y-2">
                  <label htmlFor="login-code" className="block text-xs font-bold text-slate-600">
                    {useRecovery ? 'Código de recuperación' : 'Código de verificación'}
                  </label>
                  {useRecovery ? (
                    <input
                      id="login-code"
                      value={recoveryCode}
                      onChange={(event) => setRecoveryCode(formatRecoveryCode(event.target.value))}
                      placeholder="XXXXX-XXXXX"
                      autoComplete="one-time-code"
                      spellCheck={false}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-mono tracking-wider focus:border-emerald-400 focus-ring"
                    />
                  ) : (
                    <input
                      id="login-code"
                      value={code}
                      onChange={(event) => setCode(formatTotpInput(event.target.value))}
                      placeholder="000000"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-mono tracking-[0.35em] focus:border-emerald-400 focus-ring"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setUseRecovery((value) => !value);
                      setCode('');
                      setRecoveryCode('');
                    }}
                    className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 underline underline-offset-2"
                  >
                    {useRecovery
                      ? 'Usar código de la aplicación'
                      : 'Usar un código de recuperación'}
                  </button>
                </div>
              )}

              <label className="flex items-center gap-2 text-xs text-slate-600 select-none">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(event) => setRemember(event.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                Mantener la sesión en este equipo por 30 días
              </label>

              <button
                type="submit"
                disabled={!canSubmit}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed transition focus-ring"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                Entrar
              </button>
            </form>
          )}

          {mode === 'claim' && selected && (
            <form onSubmit={handleClaim} className="space-y-5">
              <button
                type="button"
                onClick={backToList}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition focus-ring rounded-lg"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Elegir otro perfil
              </button>

              <header className="flex items-center gap-3">
                <ProfileAvatar user={selected} size="lg" />
                <div className="min-w-0">
                  <h2 className="text-lg font-extrabold text-slate-900 truncate">
                    Proteger «{selected.name}»
                  </h2>
                  <p className="text-xs text-slate-500">
                    Este perfil aún no tiene contraseña. Tus datos se conservan.
                  </p>
                </div>
              </header>

              <div>
                <label htmlFor="claim-username" className="block text-xs font-bold text-slate-600 mb-1.5">
                  Nombre de usuario
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="claim-username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                    className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3.5 py-2.5 text-sm focus:border-emerald-400 focus-ring"
                  />
                </div>
              </div>

              <PasswordFields
                idPrefix="claim"
                password={password}
                confirmPassword={confirmPassword}
                showPassword={showPassword}
                strength={strength}
                onPassword={setPassword}
                onConfirm={setConfirmPassword}
                onToggle={() => setShowPassword((value) => !value)}
              />

              <button
                type="submit"
                disabled={!canSubmit}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed transition focus-ring"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                Crear acceso y entrar
              </button>
            </form>
          )}

          {mode === 'setup' && (
            <form onSubmit={handleSetup} className="space-y-5">
              {profiles.length > 0 && (
                <button
                  type="button"
                  onClick={backToList}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition focus-ring rounded-lg"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Volver
                </button>
              )}

              <header>
                <h2 className="text-xl font-extrabold text-slate-900">
                  {needsSetup ? 'Crea tu cuenta' : 'Nuevo perfil protegido'}
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  {needsSetup
                    ? 'Define el acceso del primer perfil. Después podrás añadir el doble factor.'
                    : 'Cada perfil tiene su propio usuario y contraseña.'}
                </p>
              </header>

              <div>
                <label htmlFor="setup-name" className="block text-xs font-bold text-slate-600 mb-1.5">
                  Nombre del perfil
                </label>
                <input
                  id="setup-name"
                  value={name}
                  onChange={(event) => {
                    const next = event.target.value;
                    setName(next);
                    if (!username || username === suggestUsername(name)) {
                      setUsername(suggestUsername(next));
                    }
                  }}
                  placeholder="Mi cuenta"
                  autoComplete="name"
                  required
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm focus:border-emerald-400 focus-ring"
                />
              </div>

              <div>
                <label htmlFor="setup-username" className="block text-xs font-bold text-slate-600 mb-1.5">
                  Nombre de usuario
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="setup-username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                    className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3.5 py-2.5 text-sm focus:border-emerald-400 focus-ring"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Letras, números, punto, guion o guion bajo. Sin espacios.
                </p>
              </div>

              <PasswordFields
                idPrefix="setup"
                password={password}
                confirmPassword={confirmPassword}
                showPassword={showPassword}
                strength={strength}
                onPassword={setPassword}
                onConfirm={setConfirmPassword}
                onToggle={() => setShowPassword((value) => !value)}
              />

              {needsSetup && (
                <label className="flex items-start gap-2 text-xs text-slate-600 select-none">
                  <input
                    type="checkbox"
                    checked={withDemo}
                    onChange={(event) => setWithDemo(event.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  Empezar con movimientos de ejemplo (puedes borrarlos después)
                </label>
              )}

              <button
                type="submit"
                disabled={!canSubmit}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed transition focus-ring"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                {needsSetup ? 'Crear cuenta y entrar' : 'Crear perfil y entrar'}
              </button>
            </form>
          )}

          <p className="mt-6 text-[11px] text-slate-400 flex items-start gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            La sesión se guarda en una cookie httpOnly. Los datos viven en SQLite en este
            equipo.
          </p>
        </section>
      </div>
    </div>
  );
}

interface PasswordFieldsProps {
  idPrefix: string;
  password: string;
  confirmPassword: string;
  showPassword: boolean;
  strength: ReturnType<typeof passwordStrength>;
  onPassword: (value: string) => void;
  onConfirm: (value: string) => void;
  onToggle: () => void;
}

function PasswordFields({
  idPrefix,
  password,
  confirmPassword,
  showPassword,
  strength,
  onPassword,
  onConfirm,
  onToggle,
}: PasswordFieldsProps) {
  return (
    <div className="space-y-3">
      <div>
        <label htmlFor={`${idPrefix}-password`} className="block text-xs font-bold text-slate-600 mb-1.5">
          Contraseña
        </label>
        <div className="relative">
          <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            id={`${idPrefix}-password`}
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(event) => onPassword(event.target.value)}
            autoComplete="new-password"
            required
            className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-10 py-2.5 text-sm focus:border-emerald-400 focus-ring"
          />
          <button
            type="button"
            onClick={onToggle}
            aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 focus-ring"
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>

        <div className="flex items-center gap-2 mt-2">
          <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${strength.barClass}`}
              style={{ width: `${Math.max(8, (strength.score / 4) * 100)}%` }}
            />
          </div>
          <span className={`text-[10px] font-bold ${strength.textClass}`}>
            {strength.label}
          </span>
        </div>
        <p className="text-[11px] text-slate-400 mt-1">
          Mínimo 8 caracteres, con al menos una letra y un número.
        </p>
      </div>

      <div>
        <label
          htmlFor={`${idPrefix}-confirm`}
          className="block text-xs font-bold text-slate-600 mb-1.5"
        >
          Repite la contraseña
        </label>
        <input
          id={`${idPrefix}-confirm`}
          type={showPassword ? 'text' : 'password'}
          value={confirmPassword}
          onChange={(event) => onConfirm(event.target.value)}
          autoComplete="new-password"
          required
          className={`w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm focus-ring ${
            confirmPassword && confirmPassword !== password
              ? 'border-rose-300 focus:border-rose-400'
              : 'border-slate-200 focus:border-emerald-400'
          }`}
        />
      </div>
    </div>
  );
}
