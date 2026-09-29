import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { setFetchImplementation, type FetchLike } from '../api/client';
import { mockFetch, resetMockDb } from '../api/mocks/mockFetch';
import type { LoginResponse } from '../api/types';
import { AuthProvider } from '../auth/AuthContext';
import { resetSessionCache, setSession } from '../auth/session';
import { ConfirmProvider } from '../components/ConfirmDialog';
import { ToastProvider } from '../components/Toast';

/** Sign in against the in-memory mock API and store the session. */
export async function signInAs(email: string, fetchImpl: FetchLike = mockFetch): Promise<LoginResponse> {
  resetMockDb();
  resetSessionCache();
  setFetchImplementation(fetchImpl);
  const res = await mockFetch('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'x' }),
  });
  const login = (await res.json()) as LoginResponse;
  setSession({ token: login.token, expiresAt: login.expiresAt, user: login.user });
  return login;
}

export function renderRoute(path: string, routePattern: string, element: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <ToastProvider>
            <ConfirmProvider>
              <Routes>
                <Route path={routePattern} element={element} />
              </Routes>
            </ConfirmProvider>
          </ToastProvider>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

export const problem = (status: number, title: string, detail: string, errors?: Record<string, string[]>) =>
  new Response(JSON.stringify({ type: `https://httpstatuses.io/${status}`, title, status, detail, errors }), {
    status,
    headers: { 'Content-Type': 'application/problem+json' },
  });
