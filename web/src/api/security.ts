import { api } from './client';
import type { AuditEntry, SecurityFinding } from './types';

export const securityApi = {
  findings: () => api.get<SecurityFinding[]>('/security/findings'),
  scan: () => api.post<SecurityFinding[]>('/security/scan'),
  acknowledge: (id: string) => api.post<void>(`/security/findings/${encodeURIComponent(id)}/acknowledge`),
  audit: (take = 100) => api.get<AuditEntry[]>('/security/audit', { take }),
};
