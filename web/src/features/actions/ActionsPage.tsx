import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useActions } from '../../api/hooks';
import { ACTION_STATUSES, type Action, type ActionStatus } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { KpiTile } from '../../components/KpiTile';
import { PageHeader, useDocumentTitle } from '../../components/PageHeader';
import { EmptyState, ErrorState, SkeletonTable } from '../../components/States';
import { SECTION_INFO, STATUS_LABEL } from '../../lib/format';
import { ActionStatusSelect, DueDate, OriginTag, StatusPill } from './ActionParts';

export default function ActionsPage() {
  useDocumentTitle('Actions');
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const scope = params.get('scope') === 'all' ? 'all' : 'mine';
  const statusParam = params.get('status');
  const status = (ACTION_STATUSES as readonly string[]).includes(statusParam ?? '') ? (statusParam as ActionStatus) : undefined;
  const overdue = params.get('overdue') === '1';
  const q = useActions({ mine: scope === 'mine', status, overdue });
  const canManage = can('actions.manage');

  const set = (k: string, v: string | null) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (v === null) n.delete(k);
        else n.set(k, v);
        return n;
      },
      { replace: true },
    );

  const groups = useMemo(() => {
    const m = new Map<string, { id: string; name: string; actions: Action[] }>();
    for (const a of q.data ?? []) {
      const g = m.get(a.accountId) ?? { id: a.accountId, name: a.accountName, actions: [] };
      g.actions.push(a);
      m.set(a.accountId, g);
    }
    const list = [...m.values()];
    list.forEach((g) => g.actions.sort((x, y) => Number(y.isOverdue) - Number(x.isOverdue) || x.dueDate.localeCompare(y.dueDate)));
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [q.data]);

  const all = q.data ?? [];
  const openCount = all.filter((a) => a.status !== 'Done').length;
  const overdueCount = all.filter((a) => a.isOverdue && a.status !== 'Done').length;
  const blocked = all.filter((a) => a.status === 'Blocked').length;

  return (
    <div className="page">
      <PageHeader eyebrow="S10 · S11" title="Actions" subtitle="Priority and time-bound actions across your accounts. Status changes save straight away." />

      <div className="filters panel">
        <div className="seg" role="radiogroup" aria-label="Whose actions">
          <button type="button" role="radio" aria-checked={scope === 'mine'} className="seg__btn seg__btn--text" onClick={() => set('scope', null)}>
            My actions
          </button>
          <button type="button" role="radio" aria-checked={scope === 'all'} className="seg__btn seg__btn--text" onClick={() => set('scope', 'all')}>
            All in my scope
          </button>
        </div>
        <label className="cluster small" style={{ ['--gap' as string]: '6px' }}>
          <span className="muted">Status</span>
          <select className="select select--sm" style={{ width: 140 }} value={status ?? ''} onChange={(e) => set('status', e.target.value || null)}>
            <option value="">Any status</option>
            {ACTION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="check small">
          <input type="checkbox" checked={overdue} onChange={(e) => set('overdue', e.target.checked ? '1' : null)} /> Overdue only
        </label>
      </div>

      {q.isPending ? (
        <div className="panel">
          <SkeletonTable rows={6} cols={5} />
        </div>
      ) : q.isError ? (
        <div className="panel">
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        </div>
      ) : (
        <>
          <div className="kpis">
            <KpiTile label="Shown" value={all.length} hint={`${groups.length} account${groups.length === 1 ? '' : 's'}`} />
            <KpiTile label="Open" value={openCount} />
            <KpiTile label="Overdue" value={overdueCount} tone={overdueCount ? 'crit' : undefined} />
            <KpiTile label="Blocked" value={blocked} tone={blocked ? 'warn' : undefined} />
          </div>
          {groups.length === 0 ? (
            <div className="panel">
              <EmptyState title={overdue ? 'Nothing overdue' : 'No actions match'} icon="check">
                {scope === 'mine' ? 'Try "All in my scope" to see actions owned by others.' : 'Change the filters to see more.'}
              </EmptyState>
            </div>
          ) : (
            groups.map((g) => (
              <section key={g.id} className="panel" aria-labelledby={`ag-${g.id}`}>
                <div className="panel__head">
                  <h2 id={`ag-${g.id}`} className="panel__title">
                    <Link to={`/accounts/${g.id}?tab=actions`} className="row-link">
                      {g.name}
                    </Link>{' '}
                    <span className="muted mono small">{g.actions.length}</span>
                  </h2>
                  <Link className="small" to={`/accounts/${g.id}?section=actionPlan`}>
                    Open S11 plan
                  </Link>
                </div>
                <div className="table-wrap">
                  <table className="table">
                    <caption className="sr-only">Actions on {g.name}</caption>
                    <thead>
                      <tr>
                        <th scope="col">Action</th>
                        <th scope="col" style={{ width: 70 }}>
                          Section
                        </th>
                        <th scope="col" style={{ width: 170 }}>
                          Owner
                        </th>
                        <th scope="col" style={{ width: 210 }}>
                          Due
                        </th>
                        <th scope="col" style={{ width: 170 }}>
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.actions.map((a) => (
                        <tr key={a.id} className={a.isOverdue && a.status !== 'Done' ? 'is-overdue' : undefined}>
                          <td>
                            <span className="cluster" style={{ ['--gap' as string]: '6px' }}>
                              <span className="small strong">{a.title}</span>
                              <OriginTag action={a} />
                            </span>
                            {a.parentId && <span className="xsmall muted">Sub-action</span>}
                          </td>
                          <td>
                            <span className="code-badge" title={SECTION_INFO[a.sourceSection]?.title}>
                              {SECTION_INFO[a.sourceSection]?.code ?? a.sourceSection}
                            </span>
                          </td>
                          <td className="small">{a.ownerName}</td>
                          <td>
                            <DueDate action={a} />
                          </td>
                          <td>{canManage ? <ActionStatusSelect action={a} /> : <StatusPill status={a.status} />}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))
          )}
        </>
      )}
    </div>
  );
}
