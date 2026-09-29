import { useState } from 'react';
import { accountsApi } from '../../../api/accounts';
import type { Resource, ResourceInput, ResourceType } from '../../../api/types';
import { useConfirm } from '../../../components/ConfirmDialog';
import { pickError } from '../../../components/Field';
import { Icon } from '../../../components/Icon';
import { EmptyState } from '../../../components/States';
import { formatMoney, RESOURCE_LABEL } from '../../../lib/format';
import { usePlan, useSectionSave } from '../planContext';
import { SectionFrame } from '../SectionFrame';

const TYPES: ResourceType[] = ['Money', 'Expertise', 'ManagementTime', 'Travel'];
const NEW = '__new__';
const toInput = (r: Resource): ResourceInput => ({ type: r.type, description: r.description, amount: r.amount });

/** S12: what we need from Psiog to execute the plan. */
export function ResourcesEditor() {
  const { plan, canEdit, accountId } = usePlan();
  const { save, saving, fieldErrors } = useSectionSave('resources');
  const confirm = useConfirm();
  const [drafts, setDrafts] = useState<Record<string, ResourceInput>>({});
  const [busyRow, setBusyRow] = useState<string | null>(null);

  const rows: { id: string; server?: Resource; value: ResourceInput }[] = [
    ...plan.resources.map((r) => ({ id: r.id, server: r, value: drafts[r.id] ?? toInput(r) })),
    ...(drafts[NEW] ? [{ id: NEW, value: drafts[NEW] }] : []),
  ];
  const edit = (id: string, base: ResourceInput, p: Partial<ResourceInput>) => setDrafts((d) => ({ ...d, [id]: { ...base, ...p } }));
  const drop = (id: string) =>
    setDrafts((d) => {
      const next = { ...d };
      delete next[id];
      return next;
    });
  const isDirty = (r: (typeof rows)[number]) =>
    r.id === NEW || (!!drafts[r.id] && JSON.stringify(drafts[r.id]) !== JSON.stringify(toInput(r.server as Resource)));

  const saveRow = async (r: (typeof rows)[number]) => {
    setBusyRow(r.id);
    const ok =
      r.id === NEW
        ? await save((rv) => accountsApi.addResource(accountId, r.value, rv), 'Resource added')
        : await save((rv) => accountsApi.updateResource(accountId, r.id, r.value, rv), 'Resource saved');
    if (ok) drop(r.id);
    setBusyRow(null);
  };
  const remove = async (r: Resource) => {
    if (!(await confirm({ title: 'Remove resource?', message: `"${r.description}" will be removed from S12.`, confirmLabel: 'Remove', danger: true }))) return;
    setBusyRow(r.id);
    await save((rv) => accountsApi.deleteResource(accountId, r.id, rv), 'Resource removed');
    drop(r.id);
    setBusyRow(null);
  };

  const total = plan.resources.reduce((n, r) => n + (r.type === 'Money' || r.type === 'Travel' ? (r.amount ?? 0) : 0), 0);

  return (
    <SectionFrame
      section="resources"
      description="Money, expertise, management time and travel the plan needs. Amounts are in USD."
      errors={fieldErrors}
      headExtra={
        canEdit && !drafts[NEW] ? (
          <button type="button" className="btn btn--sm" onClick={() => setDrafts((d) => ({ ...d, [NEW]: { type: 'Expertise', description: '', amount: null } }))}>
            <Icon name="plus" /> Add resource
          </button>
        ) : undefined
      }
    >
      {rows.length === 0 ? (
        <EmptyState title="No resources listed" icon="inbox">
          List what you need from Psiog to deliver the priority actions.
        </EmptyState>
      ) : (
        <div className="table-wrap panel">
          <table className="table table--edit">
            <caption className="sr-only">Resources needed</caption>
            <thead>
              <tr>
                <th scope="col" style={{ width: 190 }}>
                  Type
                </th>
                <th scope="col">Description</th>
                <th scope="col" className="is-right" style={{ width: 150 }}>
                  Amount (USD)
                </th>
                {canEdit && (
                  <th scope="col" style={{ width: 130 }}>
                    <span className="sr-only">Row actions</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const v = r.value;
                const dirty = isDirty(r);
                const label = v.description || 'new resource';
                return (
                  <tr key={r.id} className={dirty ? 'is-dirty' : undefined}>
                    <td>
                      <select className="select select--sm" aria-label={`Type of ${label}`} disabled={!canEdit} value={v.type} onChange={(e) => edit(r.id, v, { type: e.target.value as ResourceType })}>
                        {TYPES.map((t) => (
                          <option key={t} value={t}>
                            {RESOURCE_LABEL[t]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        className="input input--sm"
                        aria-label="Resource description"
                        aria-invalid={dirty && !!pickError(fieldErrors, 'description')}
                        readOnly={!canEdit}
                        value={v.description}
                        placeholder="What is needed, and for what"
                        onChange={(e) => edit(r.id, v, { description: e.target.value })}
                      />
                      {dirty && pickError(fieldErrors, 'description') && <span className="field__error">{pickError(fieldErrors, 'description')}</span>}
                    </td>
                    <td className="is-right">
                      <input
                        className="input input--sm mono"
                        style={{ textAlign: 'right' }}
                        type="number"
                        min={0}
                        step={500}
                        aria-label={`Amount for ${label}`}
                        readOnly={!canEdit}
                        value={v.amount ?? ''}
                        onChange={(e) => edit(r.id, v, { amount: e.target.value === '' ? null : Number(e.target.value) })}
                      />
                    </td>
                    {canEdit && (
                      <td className="nowrap">
                        {dirty ? (
                          <span className="cluster" style={{ ['--gap' as string]: '4px', flexWrap: 'nowrap' }}>
                            <button type="button" className="btn btn--primary btn--sm" disabled={saving || !v.description.trim()} onClick={() => void saveRow(r)}>
                              {busyRow === r.id ? <span className="spinner" aria-hidden="true" /> : 'Save'}
                            </button>
                            <button type="button" className="btn btn--ghost btn--sm" onClick={() => drop(r.id)} disabled={saving}>
                              Cancel
                            </button>
                          </span>
                        ) : (
                          r.server && (
                            <button type="button" className="btn btn--ghost btn--icon btn--sm" aria-label={`Remove ${label}`} disabled={saving} onClick={() => void remove(r.server as Resource)}>
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
      {plan.resources.length > 0 && (
        <p className="xsmall muted" style={{ marginTop: 8 }}>
          Budget asked for (money and travel): <span className="mono strong">{formatMoney(total)}</span>
        </p>
      )}
    </SectionFrame>
  );
}
