import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { setFetchImplementation, type FetchLike } from '../api/client';
import { mockFetch } from '../api/mocks/mockFetch';
import AccountPage from '../features/account/AccountPage';
import ActionsPage from '../features/actions/ActionsPage';
import { problem, renderRoute, signInAs } from './utils';

vi.mock('../components/charts/Chart', async () => (await import('./chartMock')).chartModuleMock());

beforeAll(() => {
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});
afterEach(() => setFetchImplementation(null));

const T = { timeout: 5000 };
const openAccount = () => renderRoute('/accounts/acc-halvorsen', '/accounts/:id', <AccountPage />);

describe('Account workspace', () => {
  it('lists all 11 sections S1 to S12 with code badges and completion', async () => {
    await signInAs('priya.am@kratos.demo');
    openAccount();
    const stepper = await screen.findByRole('navigation', { name: 'Plan sections' }, T);
    const items = within(stepper).getAllByRole('button');
    expect(items).toHaveLength(11);
    const codes = items.map((b) => b.querySelector('.code-badge')?.textContent);
    expect(codes).toEqual(['S1', 'S2', 'S3–S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10', 'S11', 'S12']);
    // Every section has an editor.
    for (const title of ['Priority actions', 'Time-bound action plan', 'Resources needed']) {
      fireEvent.click(within(stepper).getByText(title));
      expect(await screen.findByRole('heading', { level: 2, name: title }, T)).toBeInTheDocument();
    }
  });

  it('is read-only for an Executive', async () => {
    await signInAs('exec@kratos.demo');
    openAccount();
    expect(await screen.findByText('Read only', undefined, T)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Save section/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Save version/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Suggest next best action/ })).not.toBeInTheDocument();
  });

  it('shows a friendly conflict banner when a save returns 409', async () => {
    const f: FetchLike = (url, init) =>
      /\/infobase$/.test(url) && init?.method === 'PUT'
        ? Promise.resolve(problem(409, 'Conflict', 'Someone else changed this plan since you opened it.'))
        : mockFetch(url, init);
    await signInAs('priya.am@kratos.demo', f);
    renderRoute('/accounts/acc-halvorsen?section=infobase', '/accounts/:id', <AccountPage />);
    const box = await screen.findByLabelText('What we do not know', undefined, T);
    fireEvent.change(box, { target: { value: 'Edited while someone else saved' } });
    fireEvent.click(screen.getByRole('button', { name: /Save section/ }));
    expect(await screen.findByText(/Someone else changed this plan while you were editing/, undefined, T)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reload plan/ })).toBeInTheDocument();
  });

  it('shows a calm state when next best action returns 503', async () => {
    const f: FetchLike = (url, init) =>
      /next-best-action$/.test(url)
        ? Promise.resolve(problem(503, 'AI unavailable', 'No AI provider is configured for this feature. Add an API key to enable it.'))
        : mockFetch(url, init);
    await signInAs('priya.am@kratos.demo', f);
    openAccount();
    fireEvent.click(await screen.findByRole('button', { name: /Suggest next best action|Suggest another/ }, T));
    expect(await screen.findByText('AI is not available right now', undefined, T)).toBeInTheDocument();
    expect(screen.getByText(/Add an API key to enable it/)).toBeInTheDocument();
  });
});

describe('Actions page', () => {
  it('changes status inline with PATCH /actions/{id}', async () => {
    const calls: { url: string; method?: string; body?: string }[] = [];
    const f: FetchLike = (url, init) => {
      calls.push({ url, method: init?.method, body: typeof init?.body === 'string' ? init.body : undefined });
      return mockFetch(url, init);
    };
    await signInAs('priya.am@kratos.demo', f);
    renderRoute('/actions?scope=all', '/actions', <ActionsPage />);
    const selects = await screen.findAllByRole('combobox', { name: /^Status of / }, T);
    const target = selects.find((s) => (s as HTMLSelectElement).value !== 'Done') as HTMLSelectElement;
    fireEvent.change(target, { target: { value: 'Done' } });
    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH' && /\/actions\/[^/]+$/.test(c.url) && c.body === '{"status":"Done"}')).toBe(true), T);
  });
});
