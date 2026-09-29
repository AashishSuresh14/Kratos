import { api, download } from './client';
import type {
  AccountPlan,
  AccountQuery,
  AccountSummary,
  BrickwallRating,
  CreateAccountRequest,
  Infobase,
  OpportunityInput,
  Profile,
  ResourceInput,
  ScoreTrend,
  StakeholderInput,
  TacticalItem,
  TeamMemberInput,
  Version,
  VersionDiff,
  Vision,
} from './types';

const base = (id: string) => `/accounts/${encodeURIComponent(id)}`;

export const accountsApi = {
  list: (q: AccountQuery = {}) => api.get<AccountSummary[]>('/accounts', { ...q }),
  create: (body: CreateAccountRequest) => api.post<AccountSummary>('/accounts', body),
  get: (id: string) => api.get<AccountPlan>(base(id)),

  // Section writes: every body carries the plan rowVersion for optimistic concurrency.
  saveProfile: (id: string, profile: Profile, rowVersion: string) =>
    api.put<AccountPlan>(`${base(id)}/profile`, { ...profile, rowVersion }),
  saveTeam: (id: string, members: TeamMemberInput[], rowVersion: string) =>
    api.put<AccountPlan>(`${base(id)}/team`, { members, rowVersion }),
  saveInfobase: (id: string, infobase: Infobase, rowVersion: string) =>
    api.put<AccountPlan>(`${base(id)}/infobase`, { ...infobase, rowVersion }),
  saveVision: (id: string, vision: Vision, rowVersion: string) =>
    api.put<AccountPlan>(`${base(id)}/vision`, { ...vision, rowVersion }),
  saveStrategies: (id: string, strategyIds: string[], rowVersion: string) =>
    api.put<AccountPlan>(`${base(id)}/strategies`, { strategyIds, rowVersion }),
  saveBrickwall: (id: string, ratings: BrickwallRating[], rowVersion: string) =>
    api.put<AccountPlan>(`${base(id)}/brickwall`, { ratings, rowVersion }),
  saveTactical: (id: string, items: TacticalItem[], rowVersion: string) =>
    api.put<AccountPlan>(`${base(id)}/tactical`, { items, rowVersion }),

  addStakeholder: (id: string, s: StakeholderInput, rowVersion: string) =>
    api.post<AccountPlan>(`${base(id)}/stakeholders`, { ...s, rowVersion }),
  updateStakeholder: (id: string, sid: string, s: StakeholderInput, rowVersion: string) =>
    api.put<AccountPlan>(`${base(id)}/stakeholders/${encodeURIComponent(sid)}`, { ...s, rowVersion }),
  deleteStakeholder: (id: string, sid: string, rowVersion: string) =>
    api.del<AccountPlan>(`${base(id)}/stakeholders/${encodeURIComponent(sid)}`, { rowVersion }),

  addOpportunity: (id: string, o: OpportunityInput, rowVersion: string) =>
    api.post<AccountPlan>(`${base(id)}/opportunities`, { ...o, rowVersion }),
  updateOpportunity: (id: string, oid: string, o: OpportunityInput, rowVersion: string) =>
    api.put<AccountPlan>(`${base(id)}/opportunities/${encodeURIComponent(oid)}`, { ...o, rowVersion }),
  deleteOpportunity: (id: string, oid: string, rowVersion: string) =>
    api.del<AccountPlan>(`${base(id)}/opportunities/${encodeURIComponent(oid)}`, { rowVersion }),

  addResource: (id: string, r: ResourceInput, rowVersion: string) =>
    api.post<AccountPlan>(`${base(id)}/resources`, { ...r, rowVersion }),
  updateResource: (id: string, rid: string, r: ResourceInput, rowVersion: string) =>
    api.put<AccountPlan>(`${base(id)}/resources/${encodeURIComponent(rid)}`, { ...r, rowVersion }),
  deleteResource: (id: string, rid: string, rowVersion: string) =>
    api.del<AccountPlan>(`${base(id)}/resources/${encodeURIComponent(rid)}`, { rowVersion }),

  // Versions and trends
  createVersion: (id: string, changeSummary: string) =>
    api.post<Version>(`${base(id)}/versions`, { changeSummary }),
  versions: (id: string) => api.get<Version[]>(`${base(id)}/versions`),
  diff: (id: string, number: number, against: number) =>
    api.get<VersionDiff>(`${base(id)}/versions/${number}/diff`, { against }),
  trend: (id: string) => api.get<ScoreTrend>(`${base(id)}/scores/trend`),

  exportWorkbook: (id: string, name: string) =>
    download(`${base(id)}/export`, `${name.replace(/[^\w.-]+/g, '_')}.xlsx`),
};
