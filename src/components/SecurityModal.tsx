import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  Check,
  Copy,
  Download,
  KeyRound,
  Loader2,
  LogOut,
  ShieldCheck,
  ShieldOff,
  Smartphone,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import type { UserProfile } from '../types';
import * as api from '../lib/api';
import { describeApiError } from '../lib/api';
import { formatTotpInput, passwordStrength, validatePassword } from '../lib/auth';
import { Modal } from './Modal';

type View =
  | 'main'
  | 'totp-start'
  | 'totp-scan'
  | 'totp-codes'
  | 'totp-disable'
  | 'regen'
  | 'regen-codes';

interface SecurityModalProps {
  open: boolean;
  user: UserProfile;
  username: string;
  totpEnabled: boolean;
  onClose: () => void;
  onLogout: () => void;
  onChanged: () => void;
  onNotify: (message: string, kind?: 'success' | 'error' | 'info') => void;
}

export function SecurityModal({
  open,
  user,
  username,
  totpEnabled,
  onClose,
  onLogout,
  onChanged,
  onNotify,
}: SecurityModalProps) {
  const [view, setView] = useState<View>('main');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');

  const [totp, setTotp] = useState<api.TotpSetupResponse | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const strength = useMemo(() => passwordStrength(newPassword), [newPassword]);

  const reset = () => {
    setView('main');
    setBusy(false);
    setError(null);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPassword('');
    setCode('');
    setTotp(null);
    setRecoveryCodes([]);
    setCopied(false);
  };

  useEffect(() => {
    if (!open) reset();
  }, [open]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(describeApiError(cause));
    } finally {
      setBusy(false);
    }
  };

  const handleChangePassword = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    const passwordError = validatePassword(newPassword, username);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Las contraseñas nuevas no coinciden.');
      return;
    }
    if (newPassword === currentPassword) {
      setError('La nueva contraseña debe ser diferente a la actual.');
      return;
    }

    await run(async () => {
      await api.changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      onNotify('Contraseña actualizada. Se cerraron las demás sesiones.');
    });
  };

  const handleStartTotp = async (event: FormEvent) => {
    event.preventDefault();
    await run(async () => {
      const response = await api.startTotpSetup(password);
      setTotp(response);
      setPassword('');
      setCode('');
      setView('totp-scan');
    });
  };

  const handleEnableTotp = async (event: FormEvent) => {
    event.preventDefault();
    await run(async () => {
      const response = await api.enableTotp(code);
      setRecoveryCodes(response.recoveryCodes);
      setCode('');
      setView('totp-codes');
      onChanged();
      onNotify('Doble factor activado.');
    });
  };

  const handleDisableTotp = async (event: FormEvent) => {
    event.preventDefault();
    await run(async () => {
      await api.disableTotp(password, code);
      setPassword('');
      setCode('');
      setView('main');
      onChanged();
      onNotify('Doble factor desactivado.', 'info');
    });
  };

  const handleRegenerate = async (event: FormEvent) => {
    event.preventDefault();
    await run(async () => {
      const response = await api.regenerateRecoveryCodes(password);
      setRecoveryCodes(response.recoveryCodes);
      setPassword('');
      setView('regen-codes');
    });
  };

  const copyCodes = async () => {
    const text = recoveryCodes.join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError('No se pudo copiar al portapapeles. Selecciona los códigos manualmente.');
    }
  };

  const downloadCodes = () => {
    const text = [
      `FinanzasPro — códigos de recuperación`,
      `Perfil: ${user.name} (@${username})`,
      `Generados: ${new Date().toLocaleString('es-CR')}`,
      '',
      ...recoveryCodes,
      '',
      'Cada código se puede usar una sola vez si pierdes el acceso a la app autenticadora.',
    ].join('\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `finanzapro_codigos_${username}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const title =
    view === 'main'
      ? 'Cuenta y seguridad'
      : view === 'totp-start'
        ? 'Activar doble factor'
        : view === 'totp-scan'
          ? 'Escanea el código'
          : view === 'totp-codes'
            ? 'Códigos de recuperación'
            : view === 'totp-disable'
              ? 'Desactivar doble factor'
              : view === 'regen'
                ? 'Regenerar códigos de recuperación'
                : 'Tus nuevos códigos de recuperación';

  return (
    <Modal
      open={open}
      title={title}
      description={
        view === 'main'
          ? `Sesión iniciada como @${username}`
          : view === 'totp-codes' || view === 'regen-codes'
            ? 'Guárdalos en un lugar seguro. No se volverán a mostrar.'
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

      {view === 'main' && (
        <div className="space-y-6">
          {/* Contraseña */}
          <section className="rounded-2xl border border-slate-200 p-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-emerald-600" /> Cambiar contraseña
            </h3>
            <form onSubmit={handleChangePassword} className="mt-3 space-y-3">
              <div>
                <label htmlFor="current-password" className="block text-xs font-bold text-slate-600 mb-1">
                  Contraseña actual
                </label>
                <input
                  id="current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-emerald-400 focus-ring"
                />
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="new-password" className="block text-xs font-bold text-slate-600 mb-1">
                    Nueva contraseña
                  </label>
                  <input
                    id="new-password"
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    autoComplete="new-password"
                    required
                    minLength={8}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-emerald-400 focus-ring"
                  />
                </div>
                <div>
                  <label htmlFor="confirm-password" className="block text-xs font-bold text-slate-600 mb-1">
                    Repite la nueva
                  </label>
                  <input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    autoComplete="new-password"
                    required
                    className={`w-full rounded-xl border px-3 py-2 text-sm focus-ring ${
                      confirmPassword && confirmPassword !== newPassword
                        ? 'border-rose-300'
                        : 'border-slate-200 focus:border-emerald-400'
                    }`}
                  />
                </div>
              </div>

              {newPassword && (
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

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-60 transition focus-ring"
                >
                  {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Actualizar contraseña
                </button>
              </div>
            </form>
          </section>

          {/* 2FA */}
          <section className="rounded-2xl border border-slate-200 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-emerald-600" />
                  Verificación en dos pasos
                </h3>
                <p className="text-xs text-slate-500 mt-1 max-w-md">
                  Añade un código de 6 dígitos de tu aplicación autenticadora al iniciar
                  sesión.
                </p>
              </div>
              <span
                className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold ${
                  totpEnabled
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-slate-100 text-slate-500 border border-slate-200'
                }`}
              >
                {totpEnabled ? (
                  <>
                    <ShieldCheck className="w-3 h-3" /> Activo
                  </>
                ) : (
                  <>
                    <ShieldOff className="w-3 h-3" /> Inactivo
                  </>
                )}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {totpEnabled ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setPassword('');
                      setView('regen');
                    }}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition focus-ring"
                  >
                    Regenerar códigos
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setPassword('');
                      setCode('');
                      setView('totp-disable');
                    }}
                    className="rounded-xl border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50 transition focus-ring"
                  >
                    Desactivar
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setPassword('');
                    setView('totp-start');
                  }}
                  className="rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition focus-ring"
                >
                  Activar doble factor
                </button>
              )}
            </div>
          </section>

          {/* Sesión */}
          <section className="rounded-2xl border border-slate-200 p-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <LogOut className="w-4 h-4 text-slate-500" /> Sesión actual
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Al cerrar sesión se borra la copia local y se pide la contraseña de nuevo.
            </p>
            <button
              type="button"
              onClick={() => {
                onClose();
                onLogout();
              }}
              className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition focus-ring"
            >
              <LogOut className="w-3.5 h-3.5" /> Cerrar sesión
            </button>
          </section>
        </div>
      )}

      {view === 'totp-start' && (
        <form onSubmit={handleStartTotp} className="space-y-4">
          <p className="text-sm text-slate-600">
            Confirma tu contraseña para generar un secreto nuevo. Después escanearás un
            código QR con Google Authenticator, Authy, 1Password o similar.
          </p>
          <div>
            <label htmlFor="totp-password" className="block text-xs font-bold text-slate-600 mb-1">
              Contraseña
            </label>
            <input
              id="totp-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              autoFocus
              required
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-emerald-400 focus-ring"
            />
          </div>
          <div className="flex justify-between gap-2">
            <button
              type="button"
              onClick={() => setView('main')}
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
              Continuar
            </button>
          </div>
        </form>
      )}

      {view === 'totp-scan' && totp && (
        <form onSubmit={handleEnableTotp} className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-5 items-center sm:items-start">
            <div className="p-3 bg-white border border-slate-200 rounded-2xl shrink-0">
              <QRCodeSVG value={totp.otpauthUrl} size={168} level="M" />
            </div>
            <div className="space-y-3 min-w-0 flex-1">
              <p className="text-sm text-slate-600">
                1. Abre tu aplicación autenticadora y escanea el QR.
                <br />
                2. Si no puedes escanear, introduce esta clave:
              </p>
              <code className="block break-all rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-xs font-mono text-slate-700">
                {totp.secret}
              </code>
              <div>
                <label htmlFor="totp-code" className="block text-xs font-bold text-slate-600 mb-1">
                  3. Escribe el código de 6 dígitos
                </label>
                <input
                  id="totp-code"
                  value={code}
                  onChange={(event) => setCode(formatTotpInput(event.target.value))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  autoFocus
                  required
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono tracking-[0.35em] focus:border-emerald-400 focus-ring"
                />
              </div>
            </div>
          </div>
          <div className="flex justify-between gap-2">
            <button
              type="button"
              onClick={() => setView('main')}
              className="rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition focus-ring"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={busy || code.length !== 6}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60 transition focus-ring"
            >
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Activar 2FA
            </button>
          </div>
        </form>
      )}

      {(view === 'totp-codes' || view === 'regen-codes') && (
        <div className="space-y-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Estos códigos sustituyen a los anteriores. Cada uno sirve una sola vez si
            pierdes el acceso a tu aplicación autenticadora.
          </div>

          <div className="grid grid-cols-2 gap-2">
            {recoveryCodes.map((item) => (
              <code
                key={item}
                className="rounded-lg bg-slate-50 border border-slate-200 px-2.5 py-2 text-center text-xs font-mono text-slate-700"
              >
                {item}
              </code>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={copyCodes}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition focus-ring"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copiado' : 'Copiar códigos'}
            </button>
            <button
              type="button"
              onClick={downloadCodes}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition focus-ring"
            >
              <Download className="w-3.5 h-3.5" /> Descargar .txt
            </button>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                setRecoveryCodes([]);
                setView('main');
              }}
              className="rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white hover:bg-slate-800 transition focus-ring"
            >
              Ya los guardé
            </button>
          </div>
        </div>
      )}

      {view === 'totp-disable' && (
        <form onSubmit={handleDisableTotp} className="space-y-4">
          <p className="text-sm text-slate-600">
            Para desactivar el doble factor confirma tu contraseña y un código actual.
          </p>
          <div>
            <label htmlFor="disable-password" className="block text-xs font-bold text-slate-600 mb-1">
              Contraseña
            </label>
            <input
              id="disable-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-emerald-400 focus-ring"
            />
          </div>
          <div>
            <label htmlFor="disable-code" className="block text-xs font-bold text-slate-600 mb-1">
              Código de 6 dígitos
            </label>
            <input
              id="disable-code"
              value={code}
              onChange={(event) => setCode(formatTotpInput(event.target.value))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              required
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono tracking-[0.35em] focus:border-emerald-400 focus-ring"
            />
          </div>
          <div className="flex justify-between gap-2">
            <button
              type="button"
              onClick={() => setView('main')}
              className="rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition focus-ring"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-60 transition focus-ring"
            >
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Desactivar 2FA
            </button>
          </div>
        </form>
      )}

      {view === 'regen' && (
        <form onSubmit={handleRegenerate} className="space-y-4">
          <p className="text-sm text-slate-600">
            Se generarán 8 códigos nuevos y los anteriores dejarán de funcionar.
          </p>
          <div>
            <label htmlFor="regen-password" className="block text-xs font-bold text-slate-600 mb-1">
              Contraseña
            </label>
            <input
              id="regen-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              autoFocus
              required
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-emerald-400 focus-ring"
            />
          </div>
          <div className="flex justify-between gap-2">
            <button
              type="button"
              onClick={() => setView('main')}
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
              Generar códigos
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
