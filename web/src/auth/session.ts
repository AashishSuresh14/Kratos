import type { User } from '../api/types';

/**
 * Session store. The JWT lives in memory and is mirrored to sessionStorage so a
 * page refresh keeps the user signed in for this tab only. Never localStorage.
 */
export interface Session {
  token: string;
  expiresAt: string;
  user: User;
}

const KEY = 'kratos.session';
let current: Session | null = null;
let loaded = false;
const listeners = new Set<(s: Session | null) => void>();

function readStorage(): Session | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    if (!parsed?.token || !parsed.user) return null;
    if (parsed.expiresAt && Date.parse(parsed.expiresAt) <= Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function getSession(): Session | null {
  if (!loaded) {
    current = readStorage();
    loaded = true;
  }
  if (current && current.expiresAt && Date.parse(current.expiresAt) <= Date.now()) {
    clearSession();
  }
  return current;
}

export function getToken(): string | null {
  return getSession()?.token ?? null;
}

export function setSession(s: Session): void {
  current = s;
  loaded = true;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: memory only */
  }
  listeners.forEach((l) => l(s));
}

export function clearSession(): void {
  const had = current !== null;
  current = null;
  loaded = true;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  if (had) listeners.forEach((l) => l(null));
}

export function subscribeSession(listener: (s: Session | null) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Test helper: forget the in-memory copy so the next read goes to storage. */
export function resetSessionCache(): void {
  current = null;
  loaded = false;
}
