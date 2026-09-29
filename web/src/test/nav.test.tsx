import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { setFetchImplementation } from '../api/client';
import { AppShell } from '../components/AppShell';
import { renderRoute, signInAs } from './utils';

afterEach(() => setFetchImplementation(null));

const navLabels = () =>
  within(screen.getByRole('complementary', { name: 'Main navigation' }))
    .getAllByRole('link')
    .map((a) => a.textContent?.trim())
    .filter((t) => t !== 'KratosDigital KAM');

describe('AppShell navigation by role', () => {
  it('AccountManager: portfolio, NBD, EBD, actions, import, exports', async () => {
    await signInAs('priya.am@kratos.demo');
    renderRoute('/', '/', <AppShell />);
    expect(navLabels()).toEqual(['MAC view', 'New business', 'Existing business', 'Actions', 'Import workbook', 'Exports']);
  });
  it('GroupLead: same as AccountManager', async () => {
    await signInAs('nbd.lead@kratos.demo');
    renderRoute('/', '/', <AppShell />);
    expect(navLabels()).toEqual(['MAC view', 'New business', 'Existing business', 'Actions', 'Import workbook', 'Exports']);
  });
  it('Executive: portfolio, NBD, EBD, brief, exports', async () => {
    await signInAs('exec@kratos.demo');
    renderRoute('/', '/', <AppShell />);
    expect(navLabels()).toEqual(['MAC view', 'New business', 'Existing business', 'Executive brief', 'Exports']);
  });
  it('Admin: admin console only', async () => {
    await signInAs('admin@kratos.demo');
    renderRoute('/', '/', <AppShell />);
    expect(navLabels()).toEqual(['Admin console']);
  });
});
