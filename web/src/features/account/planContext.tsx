import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../../api/client';
import { qk } from '../../api/hooks';
import type { AccountPlan, MasterData, SectionKey } from '../../api/types';
import { useToast } from '../../components/Toast';
import { SECTION_INFO } from '../../lib/format';

export interface Owner {
  id: string;
  name: string;
}

interface PlanCtx {
  plan: AccountPlan;
  master: MasterData;
  accountId: string;
  canEdit: boolean;
  canSuggest: boolean;
  owners: Owner[];
  goToSection: (k: SectionKey) => void;
  conflict: boolean;
  setConflict: (v: boolean) => void;
}

const Ctx = createContext<PlanCtx | null>(null);

export function PlanProvider({ value, children }: { value: Omit<PlanCtx, 'conflict' | 'setConflict'>; children: ReactNode }) {
  const [conflict, setConflict] = useState(false);
  return <Ctx.Provider value={{ ...value, conflict, setConflict }}>{children}</Ctx.Provider>;
}

export function usePlan(): PlanCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('usePlan must be used inside <PlanProvider>');
  return c;
}

/** People who can own actions on this account: the account team, captain first. */
export function ownersOf(plan: AccountPlan): Owner[] {
  const list: Owner[] = [{ id: plan.summary.captainId, name: plan.summary.captainName }];
  for (const m of plan.team) if (!list.some((o) => o.id === m.userId)) list.push({ id: m.userId, name: m.displayName });
  return list;
}

/**
 * Section save. The caller passes a function that receives the *latest* rowVersion
 * from the cache. 409 raises the shared conflict banner; other errors toast.
 */
export function useSectionSave(section: SectionKey) {
  const { accountId, setConflict } = usePlan();
  const qc = useQueryClient();
  const toast = useToast();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const m = useMutation({
    mutationFn: (call: (rowVersion: string) => Promise<AccountPlan>) => {
      const current = qc.getQueryData<AccountPlan>(qk.account(accountId));
      return call(current?.rowVersion ?? '');
    },
    onSuccess: (plan) => {
      qc.setQueryData(qk.account(accountId), plan);
      void qc.invalidateQueries({ queryKey: qk.views });
      void qc.invalidateQueries({ queryKey: ['accounts'] });
      setFieldErrors({});
    },
    onError: (e) => {
      if (e instanceof ApiError && e.isConflict) {
        setConflict(true);
        return;
      }
      if (e instanceof ApiError && e.isValidation) setFieldErrors(e.errors);
      toast.error(e);
    },
  });

  const save = useCallback(
    async (call: (rowVersion: string) => Promise<AccountPlan>, successText?: string) => {
      try {
        await m.mutateAsync(call);
        toast.success(successText ?? `Saved ${SECTION_INFO[section].code} ${SECTION_INFO[section].title}`);
        return true;
      } catch {
        return false;
      }
    },
    [m, toast, section],
  );

  return { save, saving: m.isPending, fieldErrors };
}
