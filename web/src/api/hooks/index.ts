import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { accountsApi } from '../accounts';
import { actionsApi } from '../actions';
import { adminApi, masterApi } from '../admin';
import { aiApi } from '../ai';
import { securityApi } from '../security';
import { viewsApi } from '../views';
import type {
  AccountPlan,
  AccountQuery,
  ActionQuery,
  CreateAccountRequest,
  CreateActionRequest,
  CreateUserRequest,
  GroupInput,
  MasterItemInput,
  MasterKind,
  UpdateActionRequest,
  UpdateUserRequest,
} from '../types';
import { qk } from './keys';

export { qk };

// ---------- Reads ----------
export const useMaster = () => useQuery({ queryKey: qk.master, queryFn: masterApi.get, staleTime: 5 * 60_000 });
export const useAccounts = (q: AccountQuery = {}, enabled = true) =>
  useQuery({ queryKey: qk.accounts(q), queryFn: () => accountsApi.list(q), enabled });
export const useAccountPlan = (id: string) =>
  useQuery({ queryKey: qk.account(id), queryFn: () => accountsApi.get(id), enabled: !!id });
export const useVersions = (id: string) => useQuery({ queryKey: qk.versions(id), queryFn: () => accountsApi.versions(id) });
export const useTrend = (id: string) => useQuery({ queryKey: qk.trend(id), queryFn: () => accountsApi.trend(id) });
export const useDiff = (id: string, a: number | null, b: number | null) =>
  useQuery({
    queryKey: qk.diff(id, a ?? 0, b ?? 0),
    queryFn: () => accountsApi.diff(id, a as number, b as number),
    enabled: a !== null && b !== null && a !== b,
  });
export const useRecommendations = (id: string, enabled = true) =>
  useQuery({ queryKey: qk.recommendations(id), queryFn: () => aiApi.recommendations(id), enabled });
export const useActions = (q: ActionQuery = {}, enabled = true) =>
  useQuery({ queryKey: qk.actions(q), queryFn: () => actionsApi.list(q), enabled });
export const useMacView = () => useQuery({ queryKey: qk.mac, queryFn: viewsApi.mac });
export const useNbdView = () => useQuery({ queryKey: qk.nbd, queryFn: viewsApi.nbd });
export const useEbdView = () => useQuery({ queryKey: qk.ebd, queryFn: viewsApi.ebd });
export const useExecutiveBrief = () =>
  useQuery({ queryKey: qk.brief, queryFn: aiApi.executiveBrief, staleTime: 10 * 60_000 });
export const useAiUsage = (enabled = true) => useQuery({ queryKey: qk.usage, queryFn: aiApi.usage, enabled });
export const useAiEvaluations = (enabled = true) =>
  useQuery({ queryKey: qk.evaluations, queryFn: aiApi.evaluations, enabled });
export const useUsers = (enabled = true) => useQuery({ queryKey: qk.users, queryFn: adminApi.users, enabled });
export const useFindings = () => useQuery({ queryKey: qk.findings, queryFn: securityApi.findings });
export const useAudit = () => useQuery({ queryKey: qk.audit, queryFn: () => securityApi.audit(100) });

// ---------- Plan writes ----------
function afterPlanWrite(qc: QueryClient, id: string, plan: AccountPlan) {
  qc.setQueryData(qk.account(id), plan);
  void qc.invalidateQueries({ queryKey: qk.views });
  void qc.invalidateQueries({ queryKey: ['accounts'] });
}

/**
 * Wraps any section write. The caller supplies the call with the current rowVersion;
 * on success the cached plan is replaced by the server's copy (new rowVersion + scores).
 */
export function usePlanWrite<TVars>(accountId: string, fn: (vars: TVars) => Promise<AccountPlan>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (plan) => afterPlanWrite(qc, accountId, plan),
  });
}

export function useSaveVersion(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (changeSummary: string) => accountsApi.createVersion(accountId, changeSummary),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.account(accountId) });
      void qc.invalidateQueries({ queryKey: qk.views });
    },
  });
}

export function useCreateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateAccountRequest) => accountsApi.create(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['accounts'] });
      void qc.invalidateQueries({ queryKey: qk.views });
    },
  });
}

// ---------- Actions ----------
function invalidateActions(qc: QueryClient, accountId?: string) {
  void qc.invalidateQueries({ queryKey: qk.actionsAll });
  void qc.invalidateQueries({ queryKey: qk.views });
  if (accountId) void qc.invalidateQueries({ queryKey: qk.account(accountId) });
}

export function useCreateAction(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateActionRequest) => actionsApi.create(accountId, body),
    onSuccess: () => invalidateActions(qc, accountId),
  });
}

export function useUpdateAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateActionRequest }) => actionsApi.update(id, body),
    onSuccess: (action) => invalidateActions(qc, action.accountId),
  });
}

// ---------- AI ----------
export function useNextBestAction(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => aiApi.nextBestAction(accountId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.recommendations(accountId) }),
  });
}

export function useAcceptRecommendation(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ rid, ownerId, dueDate }: { rid: string; ownerId: string; dueDate: string }) =>
      aiApi.accept(rid, ownerId, dueDate),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.recommendations(accountId) });
      invalidateActions(qc, accountId);
    },
  });
}

export function useDismissRecommendation(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ rid, reason }: { rid: string; reason: string }) => aiApi.dismiss(rid, reason),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.recommendations(accountId) }),
  });
}

export const useCopilot = (accountId: string) =>
  useMutation({
    mutationFn: (body: { section: Parameters<typeof aiApi.copilot>[1]['section']; instruction: string }) =>
      aiApi.copilot(accountId, body),
  });

export const useRiskScan = () => useMutation({ mutationFn: aiApi.riskScan });

// ---------- Admin ----------
export function useSaveMaster<K extends MasterKind>(kind: K) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, item }: { id?: string; item: MasterItemInput<K> }) =>
      id ? adminApi.updateMaster(kind, id, item) : adminApi.createMaster(kind, item),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.master }),
  });
}

export function useSaveWeights() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: adminApi.saveScoringWeights,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.master });
      void qc.invalidateQueries({ queryKey: qk.views });
      void qc.invalidateQueries({ queryKey: ['account'] });
    },
  });
}

export function useSaveUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; body: UpdateUserRequest } | { id?: undefined; body: CreateUserRequest }) =>
      v.id ? adminApi.updateUser(v.id, v.body) : adminApi.createUser(v.body as CreateUserRequest),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.users }),
  });
}

export function useSaveGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: GroupInput }) =>
      id ? adminApi.updateGroup(id, body) : adminApi.createGroup(body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.master }),
  });
}

export function useRunEvaluations() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: aiApi.runEvaluations,
    onSuccess: (rows) => {
      qc.setQueryData(qk.evaluations, rows);
      void qc.invalidateQueries({ queryKey: qk.evaluations });
      void qc.invalidateQueries({ queryKey: qk.usage });
    },
  });
}

export function useSecurityScan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: securityApi.scan,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.findings });
      void qc.invalidateQueries({ queryKey: qk.audit });
    },
  });
}

export function useAcknowledgeFinding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: securityApi.acknowledge,
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.findings }),
  });
}
