import { api } from './client';
import type {
  AdminUser,
  CreateUserRequest,
  Group,
  GroupInput,
  MasterData,
  MasterItemByKind,
  MasterItemInput,
  MasterKind,
  UpdateUserRequest,
} from './types';

export const masterApi = {
  get: () => api.get<MasterData>('/master'),
};

export const adminApi = {
  createMaster: <K extends MasterKind>(kind: K, item: MasterItemInput<K>) =>
    api.post<MasterItemByKind[K]>(`/admin/master/${kind}`, item),
  updateMaster: <K extends MasterKind>(kind: K, id: string, item: MasterItemInput<K>) =>
    api.put<MasterItemByKind[K]>(`/admin/master/${kind}/${encodeURIComponent(id)}`, item),
  saveScoringWeights: (weights: { key: string; weight: number }[]) =>
    api.put<void>('/admin/scoring-weights', { weights }),
  users: () => api.get<AdminUser[]>('/admin/users'),
  createUser: (body: CreateUserRequest) => api.post<AdminUser>('/admin/users', body),
  updateUser: (id: string, body: UpdateUserRequest) =>
    api.put<AdminUser>(`/admin/users/${encodeURIComponent(id)}`, body),
  createGroup: (body: GroupInput) => api.post<Group>('/admin/groups', body),
  updateGroup: (id: string, body: GroupInput) => api.put<Group>(`/admin/groups/${encodeURIComponent(id)}`, body),
};
