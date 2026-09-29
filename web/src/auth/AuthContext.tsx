import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { authApi } from '../api/auth';
import type { User } from '../api/types';
import { can as canFor, type Permission } from './permissions';
import { clearSession, getSession, setSession, subscribeSession, type Session } from './session';

interface AuthState {
  user: User | null;
  token: string | null;
  signIn: (email: string, password: string) => Promise<User>;
  signOut: () => void;
  can: (permission: Permission) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setState] = useState<Session | null>(() => getSession());
  const queryClient = useQueryClient();

  useEffect(() => subscribeSession(setState), []);

  // Expire the session in memory when the JWT runs out, even if the tab stays idle.
  useEffect(() => {
    if (!session?.expiresAt) return;
    const ms = Date.parse(session.expiresAt) - Date.now();
    if (!Number.isFinite(ms)) return;
    const t = window.setTimeout(() => clearSession(), Math.max(0, Math.min(ms, 2 ** 31 - 1)));
    return () => window.clearTimeout(t);
  }, [session?.expiresAt]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const res = await authApi.login({ email, password });
      queryClient.clear();
      setSession({ token: res.token, expiresAt: res.expiresAt, user: res.user });
      return res.user;
    },
    [queryClient],
  );

  const signOut = useCallback(() => {
    clearSession();
    queryClient.clear();
  }, [queryClient]);

  const value = useMemo<AuthState>(
    () => ({
      user: session?.user ?? null,
      token: session?.token ?? null,
      signIn,
      signOut,
      can: (p: Permission) => canFor(session?.user.role, p),
    }),
    [session, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** Signed-in user; only call below a RequireAuth guard. */
export function useUser(): User {
  const { user } = useAuth();
  if (!user) throw new Error('useUser called without a signed-in user');
  return user;
}
