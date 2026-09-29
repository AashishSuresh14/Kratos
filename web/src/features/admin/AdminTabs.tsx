import { useMemo, useState } from 'react';
import { ApiError } from '../../api/client';
import {
  useAcknowledgeFinding,
  useAiEvaluations,
  useAiUsage,
  useAudit,
  useFindings,
  useMaster,
  useRunEvaluations,
  useSaveGroup,
  useSaveUser,
  useSaveWeights,
  useSecurityScan,
  useUsers,
} from '../../api/hooks';
import { ROLES, type AdminUser, type Group, type Role, type ScoringWeight, type SecuritySeverity } from '../../api/types';
import { ROLE_LABEL } from '../../auth/permissions';
import { AiTag } from '../../components/AiMeta';
import { DataTable } from '../../components/DataTable';
import { Field, pickError } from '../../components/Field';
import { Icon } from '../../components/Icon';
import { KpiTile } from '../../components/KpiTile';
import { Modal } from '../../components/Modal';
import { ScoreBar } from '../../components/ScoreBar';
import { EmptyState, ErrorState, SkeletonLines, SkeletonTable } from '../../components/States';
import { useToast } from '../../components/Toast';
import { formatDateTime, formatNumber } from '../../lib/format';

// ---------------- Scoring weights ----------------
const GROUP_LABEL: Record<string, string> = {
  health: 'Health score blend (should add to 100)',
  opp: 'Opportunity score blend (should add to 100)',
  checklist: 'Checklist question weights',
  importance: 'Stakeholder importance weights',
  penalty: 'Penalties (health points)',
  risk: 'Risk thresholds (health below)',
};
const maxFor = (key: string) => (/^(health|opp|risk)\./.test(key) ? 100 : 10);

export function WeightsTab() {
  const master = useMaster();
  if (master.isPending) return <SkeletonTable rows={8} cols={3} />;
  if (master.isError) return <ErrorState error={master.error} onRetry={() => void master.refetch()} />;
  return <WeightsForm key={JSON.stringify(master.data.scoringWeights)} weights={master.data.scoringWeights} />;
}

function WeightsForm({ weights }: { weights: ScoringWeight[] }) {
  const [draft, setDraft] = useState<Record<string, number>>(() => Object.fromEntries(weights.map((w) => [w.key, w.weight])));
  const save = useSaveWeights();
  const toast = useToast();
  const dirty = weights.some((w) => draft[w.key] !== w.weight);
  const groups = useMemo(() => {
    const m = new Map<string, ScoringWeight[]>();
    weights.forEach((w) => {
      const g = w.key.split('.')[0];
      m.set(g, [...(m.get(g) ?? []), w]);
    });
    return [...m.entries()];
  }, [weights]);
  const errors = save.error instanceof ApiError && save.error.isValidation ? save.error.errors : undefined;

  return (
    <section className="panel" aria-labelledby="w-title">
      <div className="panel__head">
        <div>
          <h2 id="w-title" className="panel__title">
            Scoring weights
          </h2>
          <span className="xsmall muted">Saving recalculates every account's scores.</span>
        </div>
        <div className="cluster">
          <button type="button" className="btn btn--sm" disabled={!dirty || save.isPending} onClick={() => setDraft(Object.fromEntries(weights.map((w) => [w.key, w.weight])))}>
            Discard
          </button>
          <button
            type="button"
            className="btn btn--primary btn--sm"
            disabled={!dirty || save.isPending}
            onClick={() =>
              save.mutate(
                weights.map((w) => ({ key: w.key, weight: draft[w.key] })),
                { onSuccess: () => toast.success('Weights saved. Scores recalculated.'), onError: (e) => toast.error(e) },
              )
            }
          >
            {save.isPending ? <span className="spinner" aria-hidden="true" /> : <Icon name="save" />} Save weights
          </button>
        </div>
      </div>
      <div className="panel__body weights">
        {groups.map(([g, items]) => {
          const sum = items.reduce((n, w) => n + (draft[w.key] ?? 0), 0);
          const sums = g === 'health' || g === 'opp';
          return (
            <fieldset key={g} className="weights__group">
              <legend>
                {GROUP_LABEL[g] ?? g}
                {sums && <span className={`mono small${Math.round(sum) !== 100 ? ' text-warn' : ' muted'}`}> · total {formatNumber(Math.round(sum * 10) / 10)}</span>}
              </legend>
              {items.map((w) => {
                const max = maxFor(w.key);
                const err = pickError(errors, w.key);
                return (
                  <div key={w.key} className="weights__row">
                    <label htmlFor={`w-${w.key}`} className="small">
                      {w.label}
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={max}
                      step={max === 100 ? 1 : 0.5}
                      value={draft[w.key] ?? 0}
                      aria-label={`${w.label} slider`}
                      onChange={(e) => setDraft((d) => ({ ...d, [w.key]: Number(e.target.value) }))}
                    />
                    <input
                      id={`w-${w.key}`}
                      type="number"
                      className="input input--sm mono"
                      min={0}
                      max={max}
                      step={max === 100 ? 1 : 0.5}
                      value={draft[w.key] ?? 0}
                      onChange={(e) => setDraft((d) => ({ ...d, [w.key]: Number(e.target.value) }))}
                    />
                    {err && <span className="field__error">{err}</span>}
                  </div>
                );
              })}
            </fieldset>
          );
        })}
      </div>
    </section>
  );
}

// ---------------- Users and groups ----------------
type UserForm = { id?: string; email: string; displayName: string; role: Role; password: string; isActive: boolean };

export function UsersTab() {
  const users = useUsers();
  const master = useMaster();
  const [editing, setEditing] = useState<UserForm | null>(null);
  const [group, setGroup] = useState<{ id?: string; name: string; leadUserId: string } | null>(null);

  return (
    <div className="stack" style={{ ['--gap' as string]: '18px' }}>
      <section className="panel" aria-labelledby="u-title">
        <div className="panel__head">
          <h2 id="u-title" className="panel__title">
            Users <span className="muted mono small">{users.data?.length ?? ''}</span>
          </h2>
          <button type="button" className="btn btn--sm" onClick={() => setEditing({ email: '', displayName: '', role: 'AccountManager', password: '', isActive: true })}>
            <Icon name="plus" /> New user
          </button>
        </div>
        {users.isPending ? (
          <SkeletonTable rows={6} cols={4} />
        ) : users.isError ? (
          <ErrorState error={users.error} onRetry={() => void users.refetch()} />
        ) : (
          <DataTable
            caption="Users"
            rows={users.data}
            rowKey={(u) => u.id}
            initialSort={{ key: 'name', dir: 'asc' }}
            columns={[
              {
                key: 'name',
                header: 'Name',
                sortValue: (u) => u.displayName,
                render: (u) => (
                  <div>
                    <span className="strong small">{u.displayName}</span>
                    <span className="xsmall muted mono" style={{ display: 'block' }}>
                      {u.email}
                    </span>
                  </div>
                ),
              },
              { key: 'role', header: 'Role', sortValue: (u) => u.role, render: (u) => <span className="chip chip--role">{ROLE_LABEL[u.role]}</span> },
              {
                key: 'groups',
                header: 'Groups',
                render: (u) => <span className="small">{u.groupIds.map((g) => master.data?.groups.find((x) => x.id === g)?.name ?? '').filter(Boolean).join(', ') || <span className="muted">–</span>}</span>,
              },
              {
                key: 'active',
                header: 'Status',
                sortValue: (u) => (u.isActive ? 1 : 0),
                render: (u) => <span className={`status-pill status-pill--${u.isActive ? 'Done' : 'Blocked'}`}>{u.isActive ? 'Active' : 'Disabled'}</span>,
              },
              {
                key: 'edit',
                header: <span className="sr-only">Edit</span>,
                render: (u: AdminUser) => (
                  <button type="button" className="btn btn--ghost btn--icon btn--sm" aria-label={`Edit ${u.displayName}`} onClick={() => setEditing({ ...u, password: '' })}>
                    <Icon name="edit" />
                  </button>
                ),
              },
            ]}
          />
        )}
      </section>

      <section className="panel" aria-labelledby="g-title">
        <div className="panel__head">
          <h2 id="g-title" className="panel__title">
            Groups
          </h2>
          <button type="button" className="btn btn--sm" onClick={() => setGroup({ name: '', leadUserId: '' })}>
            <Icon name="plus" /> New group
          </button>
        </div>
        {master.isPending ? (
          <SkeletonTable rows={2} cols={3} />
        ) : master.isError ? (
          <ErrorState error={master.error} onRetry={() => void master.refetch()} />
        ) : (
          <DataTable
            caption="Groups"
            rows={master.data.groups}
            rowKey={(g) => g.id}
            empty={<span className="small muted">No groups yet.</span>}
            columns={[
              { key: 'name', header: 'Group', render: (g) => <span className="strong small">{g.name}</span> },
              { key: 'lead', header: 'Lead', render: (g) => <span className="small">{g.leadName}</span> },
              {
                key: 'edit',
                header: <span className="sr-only">Edit</span>,
                render: (g: Group) => (
                  <button type="button" className="btn btn--ghost btn--icon btn--sm" aria-label={`Edit ${g.name}`} onClick={() => setGroup({ id: g.id, name: g.name, leadUserId: g.leadUserId })}>
                    <Icon name="edit" />
                  </button>
                ),
              },
            ]}
          />
        )}
      </section>

      {editing && <UserModal value={editing} onClose={() => setEditing(null)} />}
      {group && <GroupModal value={group} users={users.data ?? []} onClose={() => setGroup(null)} />}
    </div>
  );
}

function UserModal({ value, onClose }: { value: UserForm; onClose: () => void }) {
  const [v, setV] = useState(value);
  const save = useSaveUser();
  const toast = useToast();
  const isNew = !v.id;
  const errs = save.error instanceof ApiError && save.error.isValidation ? save.error.errors : undefined;
  const submit = () =>
    save.mutate(
      isNew
        ? { body: { email: v.email.trim(), displayName: v.displayName.trim(), role: v.role, password: v.password } }
        : { id: v.id as string, body: { displayName: v.displayName.trim(), role: v.role, isActive: v.isActive } },
      {
        onSuccess: () => {
          toast.success(isNew ? `Created ${v.displayName}` : `Saved ${v.displayName}`);
          onClose();
        },
        onError: (e) => {
          if (!(e instanceof ApiError && e.isValidation)) toast.error(e);
        },
      },
    );
  return (
    <Modal
      open
      onClose={onClose}
      busy={save.isPending}
      title={isNew ? 'New user' : `Edit ${value.displayName}`}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose} disabled={save.isPending}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary" onClick={submit} disabled={save.isPending || !v.displayName.trim() || (isNew && (!v.email.trim() || !v.password))}>
            {save.isPending && <span className="spinner" aria-hidden="true" />} {isNew ? 'Create user' : 'Save'}
          </button>
        </>
      }
    >
      <div className="stack" style={{ ['--gap' as string]: '14px' }}>
        {errs && !Object.keys(errs).length && save.error instanceof ApiError && <p className="field__error">{save.error.detail}</p>}
        <Field label="Email" error={pickError(errs, 'email')} hint={isNew ? undefined : 'Email cannot be changed.'}>
          {(a) => <input {...a} className="input" type="email" value={v.email} readOnly={!isNew} onChange={(e) => setV({ ...v, email: e.target.value })} data-autofocus={isNew || undefined} autoComplete="off" />}
        </Field>
        <Field label="Display name" error={pickError(errs, 'displayName')}>
          {(a) => <input {...a} className="input" value={v.displayName} onChange={(e) => setV({ ...v, displayName: e.target.value })} data-autofocus={!isNew || undefined} />}
        </Field>
        <Field label="Role" error={pickError(errs, 'role')}>
          {(a) => (
            <select {...a} className="select" value={v.role} onChange={(e) => setV({ ...v, role: e.target.value as Role })}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          )}
        </Field>
        {isNew ? (
          <Field label="Initial password" hint="Share it securely; the user should change it." error={pickError(errs, 'password')}>
            {(a) => <input {...a} className="input" type="password" autoComplete="new-password" value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} />}
          </Field>
        ) : (
          <label className="check">
            <input type="checkbox" checked={v.isActive} onChange={(e) => setV({ ...v, isActive: e.target.checked })} /> Active (can sign in)
          </label>
        )}
      </div>
    </Modal>
  );
}

function GroupModal({ value, users, onClose }: { value: { id?: string; name: string; leadUserId: string }; users: AdminUser[]; onClose: () => void }) {
  const [v, setV] = useState(value);
  const save = useSaveGroup();
  const toast = useToast();
  const errs = save.error instanceof ApiError && save.error.isValidation ? save.error.errors : undefined;
  const leads = users.filter((u) => u.role === 'GroupLead' || u.id === v.leadUserId);
  return (
    <Modal
      open
      onClose={onClose}
      busy={save.isPending}
      title={v.id ? 'Edit group' : 'New group'}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose} disabled={save.isPending}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={save.isPending || !v.name.trim() || !v.leadUserId}
            onClick={() =>
              save.mutate(
                { id: v.id, body: { name: v.name.trim(), leadUserId: v.leadUserId } },
                {
                  onSuccess: () => {
                    toast.success('Group saved');
                    onClose();
                  },
                  onError: (e) => {
                    if (!(e instanceof ApiError && e.isValidation)) toast.error(e);
                  },
                },
              )
            }
          >
            {save.isPending && <span className="spinner" aria-hidden="true" />} Save group
          </button>
        </>
      }
    >
      <div className="stack" style={{ ['--gap' as string]: '14px' }}>
        <Field label="Name" error={pickError(errs, 'name')}>
          {(a) => <input {...a} className="input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} data-autofocus />}
        </Field>
        <Field label="Group lead" hint="Only users with the Group lead role are listed." error={pickError(errs, 'leadUserId')}>
          {(a) => (
            <select {...a} className="select" value={v.leadUserId} onChange={(e) => setV({ ...v, leadUserId: e.target.value })}>
              <option value="">Choose a lead</option>
              {leads.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
    </Modal>
  );
}

// ---------------- AI ----------------
export function AiTab() {
  const usage = useAiUsage();
  const evals = useAiEvaluations();
  const run = useRunEvaluations();
  const toast = useToast();

  return (
    <div className="stack" style={{ ['--gap' as string]: '18px' }}>
      <section className="panel" aria-labelledby="ai-u-title">
        <div className="panel__head">
          <div className="section-title">
            <h2 id="ai-u-title" className="panel__title">
              Token budget and usage
            </h2>
            <AiTag />
          </div>
        </div>
        <div className="panel__body stack">
          {usage.isPending ? (
            <SkeletonLines lines={4} />
          ) : usage.isError ? (
            <ErrorState error={usage.error} onRetry={() => void usage.refetch()} />
          ) : (
            <>
              <BudgetMeter used={usage.data.usedTokens} budget={usage.data.budgetTokens} />
              {usage.data.byAgent.length === 0 ? (
                <EmptyState title="No AI calls yet" icon="sparkle">
                  Usage appears here once an agent runs.
                </EmptyState>
              ) : (
                <DataTable
                  caption="AI usage by agent"
                  compact
                  rows={usage.data.byAgent}
                  rowKey={(r) => r.agent}
                  initialSort={{ key: 'tokens', dir: 'desc' }}
                  columns={[
                    { key: 'agent', header: 'Agent', sortValue: (r) => r.agent, render: (r) => <span className="mono small">{r.agent}</span> },
                    { key: 'calls', header: 'Calls', align: 'right', sortValue: (r) => r.calls, render: (r) => <span className="num">{formatNumber(r.calls)}</span> },
                    { key: 'in', header: 'Input tokens', align: 'right', sortValue: (r) => r.inputTokens, render: (r) => <span className="num">{formatNumber(r.inputTokens)}</span> },
                    { key: 'out', header: 'Output tokens', align: 'right', sortValue: (r) => r.outputTokens, render: (r) => <span className="num">{formatNumber(r.outputTokens)}</span> },
                    { key: 'tokens', header: 'Total', align: 'right', sortValue: (r) => r.inputTokens + r.outputTokens, render: (r) => <span className="num strong">{formatNumber(r.inputTokens + r.outputTokens)}</span> },
                    {
                      key: 'fail',
                      header: 'Failures',
                      align: 'right',
                      sortValue: (r) => r.failures,
                      render: (r) => <span className={`num${r.failures ? ' text-crit' : ' muted'}`}>{r.failures}</span>,
                    },
                  ]}
                />
              )}
            </>
          )}
        </div>
      </section>

      <section className="panel" aria-labelledby="ai-e-title">
        <div className="panel__head">
          <div>
            <h2 id="ai-e-title" className="panel__title">
              Agent evaluations
            </h2>
            <span className="xsmall muted">Golden-set checks for grounding, safety and accuracy.</span>
          </div>
          <button
            type="button"
            className="btn btn--ai btn--sm"
            disabled={run.isPending}
            onClick={() => run.mutate(undefined, { onSuccess: (r) => toast.success(`Evaluation finished: ${r.length} agent${r.length === 1 ? '' : 's'} checked`), onError: (e) => toast.error(e) })}
          >
            {run.isPending ? <span className="spinner" aria-hidden="true" /> : <Icon name="sparkle" />} {run.isPending ? 'Running' : 'Run evaluation'}
          </button>
        </div>
        {evals.isPending ? (
          <SkeletonTable rows={4} cols={4} />
        ) : evals.isError ? (
          <div className="panel__body">
            <ErrorState error={evals.error} onRetry={() => void evals.refetch()} />
          </div>
        ) : evals.data.length === 0 ? (
          <EmptyState title="No evaluation results yet" icon="sparkle">
            Run an evaluation to score each agent against its golden set.
          </EmptyState>
        ) : (
          <DataTable
            caption="Agent evaluation results"
            rows={evals.data}
            rowKey={(r) => `${r.agent}-${r.at}`}
            columns={[
              { key: 'agent', header: 'Agent', render: (r) => <span className="mono small">{r.agent}</span> },
              { key: 'score', header: 'Score', width: 180, render: (r) => <ScoreBar value={r.score <= 1 ? r.score : r.score / 100} max={1} tone="auto" suffix="%" label={`${r.agent} score`} /> },
              { key: 'pass', header: 'Result', render: (r) => <span className={`status-pill status-pill--${r.passed ? 'Done' : 'Blocked'}`}>{r.passed ? 'Passed' : 'Failed'}</span> },
              { key: 'notes', header: 'Notes', render: (r) => <span className="small">{r.notes}</span> },
              { key: 'at', header: 'When', render: (r) => <span className="small nowrap">{formatDateTime(r.at)}</span> },
            ]}
          />
        )}
      </section>
    </div>
  );
}

function BudgetMeter({ used, budget }: { used: number; budget: number }) {
  const pct = budget > 0 ? Math.min(100, (used / budget) * 100) : 0;
  const tone = pct >= 90 ? 'crit' : pct >= 70 ? 'warn' : 'ai';
  return (
    <div className="budget">
      <div className="kpis">
        <KpiTile label="Tokens used" value={formatNumber(used)} />
        <KpiTile label="Monthly budget" value={formatNumber(budget)} />
        <KpiTile label="Remaining" value={formatNumber(Math.max(0, budget - used))} tone={pct >= 90 ? 'crit' : pct >= 70 ? 'warn' : undefined} />
      </div>
      <div className="budget__bar">
        <span className="small">Budget used</span>
        <ScoreBar value={pct} tone={tone} suffix="%" label={`AI token budget used: ${Math.round(pct)} percent`} />
      </div>
    </div>
  );
}

// ---------------- Security ----------------
const SEV_ORDER: Record<SecuritySeverity, number> = { Critical: 4, High: 3, Medium: 2, Low: 1 };

export function SecurityTab() {
  const findings = useFindings();
  const audit = useAudit();
  const scan = useSecurityScan();
  const ack = useAcknowledgeFinding();
  const toast = useToast();
  const open = findings.data?.filter((f) => f.status === 'Open').length ?? 0;

  return (
    <div className="stack" style={{ ['--gap' as string]: '18px' }}>
      <section className="panel" aria-labelledby="sec-f-title">
        <div className="panel__head">
          <div>
            <h2 id="sec-f-title" className="panel__title">
              Security findings <span className="muted mono small">{open} open</span>
            </h2>
            <span className="xsmall muted">From the Security Sentinel: sign-in abuse, access denials, prompt-injection attempts.</span>
          </div>
          <button
            type="button"
            className="btn btn--sm"
            disabled={scan.isPending}
            onClick={() => scan.mutate(undefined, { onSuccess: (r) => toast.success(r.length ? `Scan finished: ${r.length} new finding${r.length === 1 ? '' : 's'}` : 'Scan finished: nothing new'), onError: (e) => toast.error(e) })}
          >
            {scan.isPending ? <span className="spinner" aria-hidden="true" /> : <Icon name="shield" />} {scan.isPending ? 'Scanning' : 'Run scan now'}
          </button>
        </div>
        {findings.isPending ? (
          <SkeletonTable rows={4} cols={5} />
        ) : findings.isError ? (
          <div className="panel__body">
            <ErrorState error={findings.error} onRetry={() => void findings.refetch()} />
          </div>
        ) : findings.data.length === 0 ? (
          <EmptyState title="No findings" icon="shield">
            Nothing suspicious so far. Run a scan to check again.
          </EmptyState>
        ) : (
          <DataTable
            caption="Security findings"
            rows={findings.data}
            rowKey={(f) => f.id}
            initialSort={{ key: 'sev', dir: 'desc' }}
            rowClassName={(f) => (f.status === 'Acknowledged' ? 'is-muted' : undefined)}
            columns={[
              { key: 'sev', header: 'Severity', sortValue: (f) => SEV_ORDER[f.severity] ?? 0, render: (f) => <span className={`sev sev--${f.severity}`}>{f.severity}</span> },
              {
                key: 'rule',
                header: 'Finding',
                render: (f) => (
                  <div className="stack" style={{ ['--gap' as string]: '2px' }}>
                    <span className="mono xsmall strong">{f.rule}</span>
                    <span className="small">{f.detail}</span>
                    {f.explanation && (
                      <span className="small ai-text">
                        <AiTag /> {f.explanation}
                      </span>
                    )}
                  </div>
                ),
              },
              { key: 'at', header: 'When', sortValue: (f) => f.at, render: (f) => <span className="small nowrap">{formatDateTime(f.at)}</span> },
              {
                key: 'status',
                header: 'Status',
                sortValue: (f) => f.status,
                render: (f) =>
                  f.status === 'Open' ? (
                    <button
                      type="button"
                      className="btn btn--sm"
                      disabled={ack.isPending && ack.variables === f.id}
                      aria-label={`Acknowledge ${f.rule}`}
                      onClick={() => ack.mutate(f.id, { onSuccess: () => toast.success('Finding acknowledged'), onError: (e) => toast.error(e) })}
                    >
                      <Icon name="check" /> Acknowledge
                    </button>
                  ) : (
                    <span className="status-pill status-pill--Done">Acknowledged</span>
                  ),
              },
            ]}
          />
        )}
      </section>

      <section className="panel" aria-labelledby="sec-a-title">
        <div className="panel__head">
          <h2 id="sec-a-title" className="panel__title">
            Audit log
          </h2>
          <span className="xsmall muted">Latest 100 events</span>
        </div>
        {audit.isPending ? (
          <SkeletonTable rows={6} cols={5} />
        ) : audit.isError ? (
          <div className="panel__body">
            <ErrorState error={audit.error} onRetry={() => void audit.refetch()} />
          </div>
        ) : (
          <DataTable
            caption="Audit log"
            compact
            rows={audit.data.map((a, i) => ({ ...a, i }))}
            rowKey={(a) => String(a.i)}
            empty={<span className="small muted">No events recorded.</span>}
            columns={[
              { key: 'at', header: 'When', sortValue: (a) => a.at, render: (a) => <span className="small nowrap mono">{formatDateTime(a.at)}</span> },
              { key: 'user', header: 'User', sortValue: (a) => a.userEmail, render: (a) => <span className="small mono">{a.userEmail || '–'}</span> },
              { key: 'action', header: 'Action', sortValue: (a) => a.action, render: (a) => <span className="small">{a.action}</span> },
              { key: 'res', header: 'Resource', render: (a) => <span className="small muted truncate" style={{ maxWidth: 260, display: 'inline-block' }}>{a.resource}</span> },
              { key: 'out', header: 'Outcome', sortValue: (a) => a.outcome, render: (a) => <span className={`outcome outcome--${a.outcome}`}>{a.outcome}</span> },
              { key: 'ip', header: 'IP', render: (a) => <span className="xsmall mono muted">{a.ip}</span> },
            ]}
          />
        )}
      </section>
    </div>
  );
}
