import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { ApiError } from '../api/client';

type Kind = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  kind: Kind;
  text: string;
}
interface ToastApi {
  success: (text: string) => void;
  error: (textOrError: unknown) => void;
  info: (text: string) => void;
}

const Ctx = createContext<ToastApi | null>(null);

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 503) return `AI is not available right now. ${e.detail ?? ''}`.trim();
    if (e.status === 429) return 'Slow down: too many requests. Wait a moment and try again.';
    if (e.status === 409) return 'Someone else changed this since you opened it. Reload to see the latest version.';
    const fields = e.fieldMessages();
    return fields.length ? `${e.title}: ${fields.join('; ')}` : e.detail ? `${e.title}. ${e.detail}` : e.title;
  }
  if (e instanceof Error) return e.message;
  return typeof e === 'string' ? e : 'Something went wrong.';
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (kind: Kind, text: string) => {
      const id = ++seq.current;
      setItems((xs) => [...xs.slice(-3), { id, kind, text }]);
      window.setTimeout(() => dismiss(id), kind === 'error' ? 8000 : 4500);
    },
    [dismiss],
  );
  const api = useMemo<ToastApi>(
    () => ({
      success: (t) => push('success', t),
      info: (t) => push('info', t),
      error: (e) => push('error', errorMessage(e)),
    }),
    [push],
  );
  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="toasts" aria-live="polite" aria-relevant="additions">
        {items.map((t) => (
          <div key={t.id} className={`toast toast--${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
            <span className="toast__bar" aria-hidden="true" />
            <span>{t.text}</span>
            <button type="button" className="toast__close" onClick={() => dismiss(t.id)} aria-label="Dismiss notification">
              ×
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
