import { accountsApi } from '../../../api/accounts';
import type { Infobase, Vision } from '../../../api/types';
import { Field } from '../../../components/Field';
import { Icon } from '../../../components/Icon';
import { CopilotButton } from '../Copilot';
import { usePlan, useSectionSave } from '../planContext';
import { SectionFrame } from '../SectionFrame';
import { useDraft } from '../useDraft';

const append = (current: string, text: string) => (current.trim() ? `${current}\n\n${text}` : text);

export function InfobaseEditor() {
  const { plan, canEdit, accountId } = usePlan();
  const { draft, patch, dirty, reset } = useDraft<Infobase>(plan.infobase);
  const { save, saving, fieldErrors } = useSectionSave('infobase');
  const ro = !canEdit;
  const fields: { key: keyof Infobase; label: string; hint: string; instruction: string }[] = [
    { key: 'unknowns', label: 'What we do not know', hint: 'Gaps that could change the plan.', instruction: 'List the most important unknowns we should close next, based on the plan.' },
    { key: 'knownUnconfirmed', label: 'Known but unconfirmed', hint: 'Heard informally; needs verification.', instruction: 'List what we believe but have not confirmed, and how to confirm each.' },
    { key: 'growthLevers', label: 'Growth levers', hint: 'Events and pressures that create demand.', instruction: 'Suggest growth levers for this account from its challenges and opportunities.' },
  ];
  return (
    <SectionFrame
      section="infobase"
      description="What we know, what we think we know, and what could make this account grow."
      dirty={dirty}
      saving={saving}
      onReset={reset}
      errors={fieldErrors}
      onSave={() => void save((rv) => accountsApi.saveInfobase(accountId, draft, rv))}
    >
      <div className="stack" style={{ ['--gap' as string]: '18px' }}>
        {fields.map((f) => (
          <Field
            key={f.key}
            label={f.label}
            hint={f.hint}
            extra={<CopilotButton section="infobase" fieldLabel={f.label} defaultInstruction={f.instruction} onInsert={(t) => patch({ [f.key]: append(draft[f.key], t) } as Partial<Infobase>)} />}
          >
            {(a) => <textarea {...a} className="textarea" rows={4} readOnly={ro} value={draft[f.key]} onChange={(e) => patch({ [f.key]: e.target.value } as Partial<Infobase>)} />}
          </Field>
        ))}
      </div>
    </SectionFrame>
  );
}

export function VisionEditor() {
  const { plan, canEdit, accountId } = usePlan();
  const { draft, patch, dirty, reset } = useDraft<Vision>(plan.vision);
  const { save, saving, fieldErrors } = useSectionSave('vision');
  const ro = !canEdit;
  return (
    <SectionFrame
      section="vision"
      description="Where we want to be with this account in three years, what that means this year, and the objectives that get us there."
      dirty={dirty}
      saving={saving}
      onReset={reset}
      errors={fieldErrors}
      onSave={() =>
        void save((rv) => accountsApi.saveVision(accountId, { ...draft, objectives: draft.objectives.map((o) => o.trim()).filter(Boolean) }, rv))
      }
    >
      <div className="stack" style={{ ['--gap' as string]: '18px' }}>
        <Field
          label="3-year vision (S3)"
          extra={
            <CopilotButton
              section="vision"
              fieldLabel="3-year vision"
              defaultInstruction="Draft a crisp 3-year vision for our relationship with this account."
              onInsert={(t) => patch({ threeYear: append(draft.threeYear, t) })}
            />
          }
        >
          {(a) => <textarea {...a} className="textarea" rows={4} readOnly={ro} value={draft.threeYear} onChange={(e) => patch({ threeYear: e.target.value })} />}
        </Field>
        <Field
          label="1-year vision"
          extra={
            <CopilotButton
              section="vision"
              fieldLabel="1-year vision"
              defaultInstruction="Draft what must be true in 12 months to stay on track for the 3-year vision."
              onInsert={(t) => patch({ oneYear: append(draft.oneYear, t) })}
            />
          }
        >
          {(a) => <textarea {...a} className="textarea" rows={3} readOnly={ro} value={draft.oneYear} onChange={(e) => patch({ oneYear: e.target.value })} />}
        </Field>
        <div className="field">
          <span className="field__label">Objectives (S4)</span>
          <ol className="objective-list">
            {draft.objectives.map((o, i) => (
              <li key={i}>
                <span className="mono xsmall muted objective-list__n">{String(i + 1).padStart(2, '0')}</span>
                <input
                  className="input"
                  aria-label={`Objective ${i + 1}`}
                  readOnly={ro}
                  value={o}
                  onChange={(e) => patch({ objectives: draft.objectives.map((x, j) => (j === i ? e.target.value : x)) })}
                />
                {canEdit && (
                  <button
                    type="button"
                    className="btn btn--ghost btn--icon btn--sm"
                    aria-label={`Remove objective ${i + 1}`}
                    onClick={() => patch({ objectives: draft.objectives.filter((_, j) => j !== i) })}
                  >
                    <Icon name="trash" />
                  </button>
                )}
              </li>
            ))}
          </ol>
          {draft.objectives.length === 0 && <p className="muted small">No objectives yet.</p>}
          {canEdit && (
            <div>
              <button type="button" className="btn btn--sm" onClick={() => patch({ objectives: [...draft.objectives, ''] })}>
                <Icon name="plus" /> Add objective
              </button>
            </div>
          )}
        </div>
      </div>
    </SectionFrame>
  );
}

export function StrategyEditor() {
  const { plan, master, canEdit, accountId } = usePlan();
  const { draft, setDraft, dirty, reset } = useDraft<string[]>(plan.strategyIds);
  const { save, saving, fieldErrors } = useSectionSave('strategy');
  const list = master.strategies.filter((s) => s.isActive || draft.includes(s.id));
  return (
    <SectionFrame
      section="strategy"
      description="The strategic plays we are running on this account, picked from Psiog's playbook."
      dirty={dirty}
      saving={saving}
      onReset={reset}
      errors={fieldErrors}
      onSave={() => void save((rv) => accountsApi.saveStrategies(accountId, draft, rv))}
    >
      <fieldset className="strategy-list">
        <legend className="sr-only">Strategies</legend>
        {list.map((s) => {
          const on = draft.includes(s.id);
          return (
            <label key={s.id} className={`strategy-item${on ? ' is-on' : ''}`}>
              <input
                type="checkbox"
                checked={on}
                disabled={!canEdit}
                onChange={() => setDraft(on ? draft.filter((x) => x !== s.id) : [...draft, s.id])}
              />
              <span>
                <span className="strong">{s.name}</span>
                {!s.isActive && <span className="muted xsmall"> (retired)</span>}
                <span className="small muted" style={{ display: 'block' }}>
                  {s.description}
                </span>
              </span>
            </label>
          );
        })}
      </fieldset>
    </SectionFrame>
  );
}
