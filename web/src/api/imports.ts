import { api, download } from './client';
import type { AccountPlan, CommitImportRequest, ImportReport } from './types';

export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

/** Client-side pre-check. The API validates again; this only saves a round trip. */
export function validateImportFile(file: File): string | null {
  if (!/\.xlsx$/i.test(file.name)) return 'Only .xlsx workbooks can be imported.';
  if (file.size === 0) return 'The file is empty.';
  if (file.size > MAX_IMPORT_BYTES) return 'The file is larger than 10 MB.';
  return null;
}

export const importsApi = {
  upload: (file: File) => {
    const fd = new FormData();
    fd.append('file', file, file.name);
    return api.upload<ImportReport>('/imports', fd);
  },
  /** Existing account: `{ accountId }`. New account: optional `groupId` and `type`. The API wants all three keys (null when unused). */
  commit: (importId: string, body: CommitImportRequest = {}) =>
    api.post<AccountPlan>(`/imports/${encodeURIComponent(importId)}/commit`, {
      accountId: body.accountId ?? null,
      groupId: body.accountId ? null : (body.groupId ?? null),
      type: body.accountId ? null : (body.type ?? null),
    }),
};

export const exportsApi = {
  bdPack: () => download('/exports/bd-pack', 'kratos-bd-pack.xlsx'),
  executivePack: () => download('/exports/executive-pack', 'kratos-executive-pack.xlsx'),
};
