import { api } from './client';
import type { Action, ActionQuery, CreateActionRequest, UpdateActionRequest } from './types';

export const actionsApi = {
  list: (q: ActionQuery = {}) =>
    api.get<Action[]>('/actions', {
      accountId: q.accountId,
      status: q.status,
      mine: q.mine ? true : undefined,
      overdue: q.overdue ? true : undefined,
    }),
  create: (accountId: string, body: CreateActionRequest) =>
    api.post<Action>(`/accounts/${encodeURIComponent(accountId)}/actions`, body),
  update: (id: string, body: UpdateActionRequest) =>
    api.patch<Action>(`/actions/${encodeURIComponent(id)}`, body),
};
