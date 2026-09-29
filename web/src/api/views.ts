import { api } from './client';
import type { AccountSummary, EbdView, HealthStatus, MacView, NbdAccount, NbdView, Opportunity } from './types';

/**
 * The live API nests the summary: `{ account: AccountSummary, readiness, topOpportunities }`.
 * The contract (and the mock) flatten it. Accept both and hand the UI the flat shape.
 */
type RawNbdAccount = (AccountSummary | { account: AccountSummary }) & { readiness: number; topOpportunities: Opportunity[] };

export function normalizeNbd(raw: { accounts: RawNbdAccount[] }): NbdView {
  return {
    accounts: (raw.accounts ?? []).map((a): NbdAccount => {
      const summary = 'account' in a && a.account ? a.account : (a as AccountSummary);
      return { ...summary, readiness: a.readiness, topOpportunities: a.topOpportunities ?? [] };
    }),
  };
}

export const viewsApi = {
  mac: () => api.get<MacView>('/views/mac'),
  nbd: async () => normalizeNbd(await api.get<{ accounts: RawNbdAccount[] }>('/views/nbd')),
  ebd: () => api.get<EbdView>('/views/ebd'),
  health: () => api.get<HealthStatus>('/health'),
};
