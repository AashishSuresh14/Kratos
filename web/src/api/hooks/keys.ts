import type { AccountQuery, ActionQuery } from '../types';

export const qk = {
  me: ['me'] as const,
  master: ['master'] as const,
  accounts: (q: AccountQuery = {}) => ['accounts', q] as const,
  account: (id: string) => ['account', id] as const,
  versions: (id: string) => ['account', id, 'versions'] as const,
  trend: (id: string) => ['account', id, 'trend'] as const,
  diff: (id: string, a: number, b: number) => ['account', id, 'diff', a, b] as const,
  recommendations: (id: string) => ['account', id, 'recommendations'] as const,
  actions: (q: ActionQuery = {}) => ['actions', q] as const,
  actionsAll: ['actions'] as const,
  mac: ['views', 'mac'] as const,
  nbd: ['views', 'nbd'] as const,
  ebd: ['views', 'ebd'] as const,
  views: ['views'] as const,
  brief: ['ai', 'brief'] as const,
  usage: ['ai', 'usage'] as const,
  evaluations: ['ai', 'evaluations'] as const,
  users: ['admin', 'users'] as const,
  findings: ['security', 'findings'] as const,
  audit: ['security', 'audit'] as const,
};
