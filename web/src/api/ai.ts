import { api } from './client';
import type {
  Action,
  AiEvaluation,
  AiUsage,
  CopilotRequest,
  CopilotResponse,
  ExecutiveBrief,
  Recommendation,
  RiskScan,
} from './types';

export const aiApi = {
  nextBestAction: (accountId: string) =>
    api.post<Recommendation>(`/accounts/${encodeURIComponent(accountId)}/ai/next-best-action`),
  recommendations: (accountId: string) =>
    api.get<Recommendation[]>(`/accounts/${encodeURIComponent(accountId)}/ai/recommendations`),
  accept: (rid: string, ownerId: string, dueDate: string) =>
    api.post<Action>(`/ai/recommendations/${encodeURIComponent(rid)}/accept`, { ownerId, dueDate }),
  dismiss: (rid: string, reason: string) =>
    api.post<void>(`/ai/recommendations/${encodeURIComponent(rid)}/dismiss`, { reason }),
  copilot: (accountId: string, body: CopilotRequest) =>
    api.post<CopilotResponse>(`/accounts/${encodeURIComponent(accountId)}/ai/copilot`, body),
  riskScan: () => api.post<RiskScan>('/ai/risk-scan'),
  executiveBrief: () => api.get<ExecutiveBrief>('/ai/executive-brief'),
  usage: () => api.get<AiUsage>('/ai/usage'),
  evaluations: () => api.get<AiEvaluation[]>('/ai/evaluations'),
  runEvaluations: () => api.post<AiEvaluation[]>('/ai/evaluations/run'),
};
