import { useState } from 'react';
import { accountsApi } from '../../../api/accounts';
import type { Importance, Knowledge, Stakeholder, StakeholderInput, StakeholderRole } from '../../../api/types';
import { useConfirm } from '../../../components/ConfirmDialog';
import { Field, RatingInput } from '../../../components/Field';
import { Icon } from '../../../components/Icon';
import { Modal } from '../../../components/Modal';
import { EmptyState } from '../../../components/States';
import { KNOWLEDGE_LABEL, STAKEHOLDER_ROLE_LABEL } from '../../../lib/format';
import { usePlan, useSectionSave } from '../planContext';
import { SectionFrame } from '../SectionFrame';

const ROLES: StakeholderRole[] = ['DecisionMaker', 'Influencer', 'User', 'Gatekeeper'];
const KNOWLEDGE: Knowledge[] = ['Unknown', 'KnownUnconfirmed', 'Confirmed'];
const blank: StakeholderInput = {
  name: '',
  title: '',
  role: 'Influencer',
  importance: 'B',
  buyingMotive: '',
  perception: null,
  perceptionVsCompetitors: '',
  knowledge: 'Unknown',
  notes: '',
};

export function StakeholdersEditor() {
  const { plan, canEdit, accountId } = usePlan();
  const { save, saving, fieldErrors } = useSectionSave('stakeholders');
  const confirm = useConfirm();
  const [editing, setEditing] = useState<{ id: string | null; value: StakeholderInput } | null>(null);

  const open = (s?: Stakeholder) => {
    if (s) {
      const { id, ...rest } = s;
      setEditing({ id, value: rest });
    } else setEditing({ id: null, value: { ...blank } });
  };

  const submit = async () => {
    if (!editing) return;
    const ok = editing.id
      ? await save((rv) => accountsApi.updateStakeholder(accountId, editing.id as string, editing.value, rv), 'Stakeholder saved')
      : await save((rv) => accountsApi.addStakeholder(accountId, editing.value, rv), 'Stakeholder added');
    if (ok) setEditing(null);
  };

  const remove = async (s: Stakeholder) => {
    if (!(await confirm({ title: 'Remove stakeholder?', message: `${s.name} will be removed from the account map.`, confirmLabel: 'Remove', danger: true }))) return;
    await save((rv) => accountsApi.deleteStakeholder(accountId, s.id, rv), 'Stakeholder removed');
  };

  const v = editing?.value;
  const set = (p: Partial<StakeholderInput>) => setEditing((e) => (e ? { ...e, value: { ...e.value, ...p } } : e));

  return (
    <SectionFrame
      section="stakeholders"
      description="Who decides, who influences, and how each person sees us. Importance A is critical to the account."
      errors={editing ? undefined : fieldErrors}
      headExtra={
        canEdit ? (
          <button type="button" className="btn btn--sm" onClick={() => open()}>
            <Icon name="plus" /> Add stakeholder
          </button>
        ) : undefined
      }
    >
      {plan.stakeholders.length === 0 ? (
        <EmptyState title="No stakeholders mapped yet" icon="users">
          Start with the decision makers and the people who influence them.
        </EmptyState>
      ) : (
        <div className="stack" style={{ ['--gap' as string]: '18px' }}>
          <InfluenceMap stakeholders={plan.stakeholders} onPick={canEdit ? open : undefined} />
          <div className="table-wrap panel">
            <table className="table">
              <caption className="sr-only">Stakeholders</caption>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Role</th>
                  <th scope="col" className="is-center">Importance</th>
                  <th scope="col" className="is-center">Perception</th>
                  <th scope="col">Knowledge</th>
                  <th scope="col">Buying motive</th>
                  <th scope="col">Versus competitors</th>
                  {canEdit && (
                    <th scope="col">
                      <span className="sr-only">Row actions</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {plan.stakeholders.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <span className="strong">{s.name}</span>
                      <span className="xsmall muted" style={{ display: 'block' }}>
                        {s.title}
                      </span>
                    </td>
                    <td className="small">{STAKEHOLDER_ROLE_LABEL[s.role]}</td>
                    <td className="is-center">
                      <span className={`imp imp--${s.importance}`}>{s.importance}</span>
                    </td>
                    <td className="is-center num">{s.perception ?? <span className="muted">–</span>}</td>
                    <td className="small">{KNOWLEDGE_LABEL[s.knowledge]}</td>
                    <td className="small" style={{ maxWidth: 220 }}>
                      {s.buyingMotive}
                    </td>
                    <td className="small muted" style={{ maxWidth: 200 }}>
                      {s.perceptionVsCompetitors}
                    </td>
                    {canEdit && (
                      <td className="nowrap">
                        <button type="button" className="btn btn--ghost btn--icon btn--sm" aria-label={`Edit ${s.name}`} onClick={() => open(s)}>
                          <Icon name="edit" />
                        </button>
                        <button type="button" className="btn btn--ghost btn--icon btn--sm" aria-label={`Remove ${s.name}`} disabled={saving} onClick={() => void remove(s)}>
                          <Icon name="trash" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal
        open={!!editing}
        wide
        busy={saving}
        title={editing?.id ? 'Edit stakeholder' : 'Add stakeholder'}
        onClose={() => setEditing(null)}
        footer={
          <>
            <button type="button" className="btn" onClick={() => setEditing(null)} disabled={saving}>
              Cancel
            </button>
            <button type="button" className="btn btn--primary" onClick={() => void submit()} disabled={saving || !v?.name.trim()}>
              {saving && <span className="spinner" aria-hidden="true" />} Save stakeholder
            </button>
          </>
        }
      >
        {v && (
          <div className="stack" style={{ ['--gap' as string]: '14px' }}>
            <div className="grid-2">
              <Field label="Name" error={fieldErrors.name?.[0]}>
                {(a) => <input {...a} className="input" value={v.name} onChange={(e) => set({ name: e.target.value })} data-autofocus maxLength={120} />}
              </Field>
              <Field label="Title">
                {(a) => <input {...a} className="input" value={v.title} onChange={(e) => set({ title: e.target.value })} maxLength={120} />}
              </Field>
              <Field label="Role">
                {(a) => (
                  <select {...a} className="select" value={v.role} onChange={(e) => set({ role: e.target.value as StakeholderRole })}>
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {STAKEHOLDER_ROLE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <Field label="Knowledge">
                {(a) => (
                  <select {...a} className="select" value={v.knowledge} onChange={(e) => set({ knowledge: e.target.value as Knowledge })}>
                    {KNOWLEDGE.map((k) => (
                      <option key={k} value={k}>
                        {KNOWLEDGE_LABEL[k]}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            </div>
            <div className="grid-2">
              <div className="field">
                <span className="field__label">Importance</span>
                <div className="seg" role="radiogroup" aria-label="Importance">
                  {(['A', 'B', 'C'] as Importance[]).map((i) => (
                    <button key={i} type="button" role="radio" aria-checked={v.importance === i} className="seg__btn" onClick={() => set({ importance: i })}>
                      {i}
                    </button>
                  ))}
                </div>
              </div>
              <div className="field">
                <span className="field__label">Perception of Psiog (1 poor – 5 strong)</span>
                <RatingInput label="Perception of Psiog" value={v.perception} onChange={(n) => set({ perception: n })} allowClear />
              </div>
            </div>
            <Field label="Buying motive">
              {(a) => <input {...a} className="input" value={v.buyingMotive} onChange={(e) => set({ buyingMotive: e.target.value })} />}
            </Field>
            <Field label="Perception versus competitors">
              {(a) => <input {...a} className="input" value={v.perceptionVsCompetitors} onChange={(e) => set({ perceptionVsCompetitors: e.target.value })} />}
            </Field>
            <Field label="Notes">
              {(a) => <textarea {...a} className="textarea" rows={3} value={v.notes} onChange={(e) => set({ notes: e.target.value })} />}
            </Field>
          </div>
        )}
      </Modal>
    </SectionFrame>
  );
}

const HIGH_INFLUENCE: StakeholderRole[] = ['DecisionMaker', 'Influencer'];

/** 2×2: influence (role) on the vertical axis, perception of Psiog on the horizontal. */
export function InfluenceMap({ stakeholders, onPick }: { stakeholders: Stakeholder[]; onPick?: (s: Stakeholder) => void }) {
  const rated = stakeholders.filter((s) => s.perception !== null);
  const unrated = stakeholders.filter((s) => s.perception === null);
  // Spread people who share a cell so their dots do not overlap.
  const slot = new Map<string, number>();
  const pos = (s: Stakeholder) => {
    const high = HIGH_INFLUENCE.includes(s.role);
    const key = `${high}-${s.perception}`;
    const n = slot.get(key) ?? 0;
    slot.set(key, n + 1);
    const x = (((s.perception as number) - 0.5) / 5) * 100;
    const yBase = high ? 25 : 75;
    const y = yBase + ((n % 3) - 1) * 14 + (s.role === 'DecisionMaker' || s.role === 'User' ? -4 : 4);
    return { left: `${x}%`, top: `${y}%` };
  };
  return (
    <div className="imap-wrap">
      <div className="spread">
        <h3>Influence map</h3>
        <div className="legend">
          {(['A', 'B', 'C'] as const).map((i) => (
            <span key={i} className="legend__item">
              <span className={`imap-dot imap-dot--${i} imap-dot--legend`} aria-hidden="true" />
              Importance {i}
            </span>
          ))}
        </div>
      </div>
      <div className="imap" role="group" aria-label="Influence map: role against perception of Psiog">
        <div className="imap__ylabel" aria-hidden="true">
          <span>High influence</span>
          <span>Lower influence</span>
        </div>
        <div className="imap__plot">
          <div className="imap__q imap__q--tl">
            <span>Win over</span>
          </div>
          <div className="imap__q imap__q--tr">
            <span>Sponsors</span>
          </div>
          <div className="imap__q imap__q--bl">
            <span>Monitor</span>
          </div>
          <div className="imap__q imap__q--br">
            <span>Supporters</span>
          </div>
          {rated.map((s) => {
            const label = `${s.name}, ${STAKEHOLDER_ROLE_LABEL[s.role]}, importance ${s.importance}, perception ${s.perception} of 5`;
            return (
              <button
                key={s.id}
                type="button"
                className={`imap-dot imap-dot--${s.importance}`}
                style={pos(s)}
                aria-label={label}
                title={label}
                onClick={onPick ? () => onPick(s) : undefined}
                disabled={!onPick}
              >
                <span className="imap-dot__name">{s.name.split(' ')[0]}</span>
              </button>
            );
          })}
        </div>
        <div className="imap__xlabel" aria-hidden="true">
          <span>Unfavourable</span>
          <span className="mono xsmall">perception 1 → 5</span>
          <span>Favourable</span>
        </div>
      </div>
      {unrated.length > 0 && (
        <p className="small muted">
          Not yet rated: {unrated.map((s) => s.name).join(', ')}. Rate their perception to place them on the map.
        </p>
      )}
    </div>
  );
}
