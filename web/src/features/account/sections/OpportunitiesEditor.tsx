import { useState } from 'react';
import { accountsApi } from '../../../api/accounts';
import type { Opportunity, OpportunityInput, Rating } from '../../../api/types';
import { useConfirm } from '../../../components/ConfirmDialog';
import { Icon } from '../../../components/Icon';
import { EmptyState } from '../../../components/States';
import { usePlan, useSectionSave } from '../planContext';
import { SectionFrame } from '../SectionFrame';

/** Client-side preview only; the server's score is authoritative once saved. */
export function previewScore(o: { potential: number; effort: number; complexity: number }) {
  return Math.round(((o.potential * 0.5 + (6 - o.effort) * 0.3 + (6 - o.complexity) * 0.2) / 5) * 100);
}

const toInput = (o: Opportunity): OpportunityInput => ({
  title: o.title,
  offeringId: o.offeringId,
  potential: o.potential,
  effort: o.effort,
  complexity: o.complexity,
  estimatedValue: o.estimatedValue,
  isPriority: o.isPriority,
});

const NEW = '__new__';

export function OpportunitiesEditor() {
  const { plan, master, canEdit, accountId } = usePlan();
  const { save, saving, fieldErrors } = useSectionSave('opportunities');
  const confirm = useConfirm();
  const [drafts, setDrafts] = useState<Record<string, OpportunityInput>>({});
  const [busyRow, setBusyRow] = useState<string | null>(null);
  const offerings = master.offerings.filter((o) => o.isActive);

  const rows: { id: string; server?: Opportunity; value: OpportunityInput }[] = [
    ...plan.opportunities.map((o) => ({ id: o.id, server: o, value: drafts[o.id] ?? toInput(o) })),
    ...(drafts[NEW] ? [{ id: NEW, value: drafts[NEW] }] : []),
  ];

  const edit = (id: string, base: OpportunityInput, p: Partial<OpportunityInput>) => setDrafts((d) => ({ ...d, [id]: { ...base, ...p } }));
  const drop = (id: string) =>
    setDrafts((d) => {
      const { [id]: _removed, ...rest } = d;
      return rest;
    });
  const isDirty = (r: (typeof rows)[number]) => r.id === NEW || (!!drafts[r.id] && JSON.stringify(drafts[r.id]) !== JSON.stringify(toInput(r.server as Opportunity)));

  const saveRow = async (r: (typeof rows)[number]) => {
    setBusyRow(r.id);
    const ok =
      r.id === NEW
        ? await save((rv) => accountsApi.addOpportunity(accountId, r.value, rv), 'Opportunity added')
        : await save((rv) => accountsApi.updateOpportunity(accountId, r.id, r.value, rv), 'Opportunity saved');
    if (ok) drop(r.id);
    setBusyRow(null);
  };

  const remove = async (o: Opportunity) => {
    const yes = await confirm({
      title: 'Delete opportunity?',
      message: `"${o.title}" and its tactical checklist answers will be removed from this plan.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!yes) return;
    setBusyRow(o.id);
    await save((rv) => accountsApi.deleteOpportunity(accountId, o.id, rv), 'Opportunity deleted');
    drop(o.id);
    setBusyRow(null);
  };

  return (
    <SectionFrame
      section="opportunities"
      description="Rate each opportunity on potential, effort and complexity (1–5). Mark the ones we will pursue now as priority; they drive the tactical checklist and priority actions."
      errors={fieldErrors}
      headExtra={
        canEdit && !drafts[NEW] ? (
          <button
            type="button"
            className="btn btn--sm"
            onClick={() =>
              setDrafts((d) => ({
                ...d,
                [NEW]: { title: '', offeringId: offerings[0]?.id ?? '', potential: 3, effort: 3, complexity: 3, estimatedValue: null, isPriority: false },
              }))
            }
          >
            <Icon name="plus" /> Add opportunity
          </button>
        ) : undefined
      }
    >
      {rows.length === 0 ? (
        <EmptyState title="No opportunities yet" icon="target">
          Add the opportunities you see on this account to build the matrix.
        </EmptyState>
      ) : (
        <div className="table-wrap panel">
          <table className="table table--edit opp-grid">
            <caption className="sr-only">Opportunity matrix</caption>
            <thead>
              <tr>
                <th scope="col">Opportunity</th>
                <th scope="col">Offering</th>
                <th scope="col" className="is-center">Potential</th>
                <th scope="col" className="is-center">Effort</th>
                <th scope="col" className="is-center">Complexity</th>
                <th scope="col" className="is-right">Value (USD)</th>
                <th scope="col" className="is-center">Priority</th>
                <th scope="col" className="is-right">Score</th>
                {canEdit && (
                  <th scope="col">
                    <span className="sr-only">Row actions</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const v = r.value;
                const dirty = isDirty(r);
                const score = dirty || !r.server ? previewScore(v) : r.server.score;
                const label = v.title || 'new opportunity';
                return (
                  <tr key={r.id} className={dirty ? 'is-dirty' : undefined}>
                    <td style={{ minWidth: 200 }}>
                      <input className="input input--sm" aria-label="Opportunity title" readOnly={!canEdit} value={v.title} onChange={(e) => edit(r.id, v, { title: e.target.value })} placeholder="Title" />
                    </td>
                    <td style={{ minWidth: 150 }}>
                      <select className="select select--sm" aria-label={`Offering for ${label}`} disabled={!canEdit} value={v.offeringId} onChange={(e) => edit(r.id, v, { offeringId: e.target.value })}>
                        {master.offerings
                          .filter((o) => o.isActive || o.id === v.offeringId)
                          .map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.name}
                            </option>
                          ))}
                      </select>
                    </td>
                    {(['potential', 'effort', 'complexity'] as const).map((k) => (
                      <td key={k} className="is-center">
                        <select
                          className="select select--sm mono rating-select"
                          aria-label={`${k} for ${label}`}
                          disabled={!canEdit}
                          value={v[k]}
                          onChange={(e) => edit(r.id, v, { [k]: Number(e.target.value) as Rating })}
                        >
                          {[1, 2, 3, 4, 5].map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </select>
                      </td>
                    ))}
                    <td className="is-right" style={{ width: 120 }}>
                      <input
                        className="input input--sm mono"
                        style={{ textAlign: 'right' }}
                        type="number"
                        min={0}
                        step={10000}
                        aria-label={`Estimated value for ${label}`}
                        readOnly={!canEdit}
                        value={v.estimatedValue ?? ''}
                        onChange={(e) => edit(r.id, v, { estimatedValue: e.target.value === '' ? null : Number(e.target.value) })}
                      />
                    </td>
                    <td className="is-center">
                      <button
                        type="button"
                        className={`priority-toggle${v.isPriority ? ' is-on' : ''}`}
                        aria-pressed={v.isPriority}
                        aria-label={`Priority: ${label}`}
                        disabled={!canEdit}
                        onClick={() => edit(r.id, v, { isPriority: !v.isPriority })}
                      >
                        {v.isPriority ? 'Priority' : 'No'}
                      </button>
                    </td>
                    <td className="is-right">
                      <span className="score-cell" title={dirty ? 'Estimated until saved' : 'Server score'}>
                        <span className="num strong">{Math.round(score)}</span>
                        {dirty && <span className="xsmall muted"> est.</span>}
                      </span>
                    </td>
                    {canEdit && (
                      <td className="nowrap">
                        {dirty ? (
                          <span className="cluster" style={{ ['--gap' as string]: '4px', flexWrap: 'nowrap' }}>
                            <button type="button" className="btn btn--primary btn--sm" disabled={saving || !v.title.trim()} onClick={() => void saveRow(r)}>
                              {busyRow === r.id ? <span className="spinner" aria-hidden="true" /> : 'Save'}
                            </button>
                            <button type="button" className="btn btn--ghost btn--sm" onClick={() => drop(r.id)} disabled={saving}>
                              Cancel
                            </button>
                          </span>
                        ) : (
                          r.server && (
                            <button
                              type="button"
                              className="btn btn--ghost btn--icon btn--sm"
                              aria-label={`Delete ${label}`}
                              disabled={saving}
                              onClick={() => void remove(r.server as Opportunity)}
                            >
                              <Icon name="trash" />
                            </button>
                          )
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="xsmall muted" style={{ marginTop: 8 }}>
        Score rewards high potential and low effort and complexity. Unsaved rows show an estimate; the saved score comes from the server.
      </p>
    </SectionFrame>
  );
}
