import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import type { Toast } from '../types';

interface ToastViewProps {
  toast: Toast | null;
  onDismiss: () => void;
}

const VARIANTS = {
  success: {
    icon: CheckCircle2,
    accent: 'text-emerald-400',
    ring: 'border-emerald-500/40',
  },
  error: {
    icon: XCircle,
    accent: 'text-rose-400',
    ring: 'border-rose-500/40',
  },
  info: {
    icon: Info,
    accent: 'text-sky-400',
    ring: 'border-sky-500/40',
  },
};

export function ToastView({ toast, onDismiss }: ToastViewProps) {
  if (!toast) return null;
  const variant = VARIANTS[toast.kind];
  const Icon = variant.icon;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-20 sm:bottom-4 right-4 left-4 sm:left-auto z-[60] sm:max-w-sm bg-slate-900 text-white rounded-2xl shadow-2xl border ${variant.ring} px-4 py-3 flex items-start gap-3 animate-slide-in`}
    >
      <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${variant.accent}`} />
      <p className="text-sm font-medium flex-1 leading-snug">{toast.message}</p>
      {toast.action && (
        <button
          type="button"
          onClick={() => {
            toast.action?.onClick();
            onDismiss();
          }}
          className="text-xs font-bold text-emerald-400 hover:text-emerald-300 uppercase tracking-wide px-1 py-0.5 rounded focus-ring"
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Cerrar notificación"
        className="text-slate-400 hover:text-white p-0.5 rounded focus-ring"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
