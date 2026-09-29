import { describe, expect, it } from 'vitest';
import { ApiError, fileNameFromDisposition } from '../api/client';
import { validateImportFile } from '../api/imports';
import { normalizeNbd } from '../api/views';
import { pickError } from '../components/Field';
import { errorMessage } from '../components/Toast';
import type { AccountSummary } from '../api/types';

const summary: AccountSummary = {
  id: 'a1', name: 'Harbourline Freight', industry: 'Logistics', region: 'UAE', type: 'NBD', groupId: 'g', groupName: 'NBD',
  captainId: 'u', captainName: 'Priya', health: 40.7, riskLevel: 'High', completion: 84.5, overdueActions: 1, staleSections: 6,
  lastReviewedAt: null, currentVersion: 3,
};

describe('normalizeNbd', () => {
  it('flattens the live API shape ({ account, readiness, topOpportunities })', () => {
    const v = normalizeNbd({ accounts: [{ account: summary, readiness: 72.7, topOpportunities: [] }] });
    expect(v.accounts[0]).toMatchObject({ id: 'a1', name: 'Harbourline Freight', readiness: 72.7, topOpportunities: [] });
  });
  it('keeps the contract (flat) shape as is', () => {
    const v = normalizeNbd({ accounts: [{ ...summary, readiness: 10, topOpportunities: [] }] });
    expect(v.accounts[0].id).toBe('a1');
    expect(v.accounts[0].readiness).toBe(10);
  });
});

describe('fileNameFromDisposition', () => {
  it('reads the filename* the API sends', () => {
    expect(
      fileNameFromDisposition("attachment; filename=Harbourline-Freight-KAM-v3.xlsx; filename*=UTF-8''Harbourline-Freight-KAM-v3.xlsx", 'x.xlsx'),
    ).toBe('Harbourline-Freight-KAM-v3.xlsx');
  });
  it('falls back when the header is missing', () => {
    expect(fileNameFromDisposition(null, 'fallback.xlsx')).toBe('fallback.xlsx');
  });
});

describe('validateImportFile', () => {
  const file = (name: string, size: number) => {
    const f = new File(['x'], name);
    Object.defineProperty(f, 'size', { value: size });
    return f;
  };
  it('accepts an .xlsx under 10 MB', () => expect(validateImportFile(file('plan.xlsx', 2048))).toBeNull());
  it('rejects other extensions', () => expect(validateImportFile(file('plan.xls', 2048))).toMatch(/xlsx/));
  it('rejects files over 10 MB', () => expect(validateImportFile(file('plan.xlsx', 10 * 1024 * 1024 + 1))).toMatch(/10 MB/));
});

describe('errors', () => {
  it('pickError matches field keys case-insensitively', () => {
    expect(pickError({ Title: ['Required'] }, 'title')).toBe('Required');
    expect(pickError({ 'items[0].title': ['Too long'] }, 'title')).toBe('Too long');
    expect(pickError(undefined, 'title')).toBeUndefined();
  });
  it('explains 503, 429 and 409 in plain words', () => {
    expect(errorMessage(new ApiError(503, { title: 'AI unavailable', detail: 'No AI provider is configured.' }))).toMatch(/AI is not available right now/);
    expect(errorMessage(new ApiError(429, {}))).toMatch(/Slow down/);
    expect(errorMessage(new ApiError(409, {}))).toMatch(/Someone else changed this/);
  });
});
