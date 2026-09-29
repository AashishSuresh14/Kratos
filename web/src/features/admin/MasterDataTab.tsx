import { useState } from 'react';
import { ApiError } from '../../api/client';
import { useMaster, useSaveMaster } from '../../api/hooks';
import type { MasterData, MasterItemInput, MasterKind } from '../../api/types';
import { pickError } from '../../components/Field';
import { Icon } from '../../components/Icon';
import { EmptyState, ErrorState, SkeletonTable } from '../../components/States';
import { useToast } from '../../components/Toast';

type FieldDef =
  | { key: string; label: string; kind: 'text'; wide?: boolean }
  | { key: string; label: string; kind: 'number'; min: number; max: number; step?: number }
  | { key: string; label: string; kind: 'select'; options: string[] };

const KINDS: { kind: MasterKind; label: string; single: string; fields: FieldDef[]; blank: Record<string, unknown> }[] = [
  {
    kind: 'offerings',
    label: 'Offerings',
    single: 'offering',
    fields: [
      { key: 'name', label: 'Name', kind: 'text', wide: true },
      { key: 'category', label: 'Category', kind: 'text' },
    ],
    blank: { name: '', category: '', isActive: true },
  },
  {
    kind: 'strategies',
    label: 'Strategies',
    single: 'strategy',
    fields: [
      { key: 'name', label: 'Name', kind: 'text' },
      { key: 'description', label: 'Description', kind: 'text', wide: true },
    ],
    blank: { name: '', description: '', isActive: true },
  },
  {
    kind: 'brickwallCriteria',
    label: 'Brickwall criteria',
    single: 'criterion',
    fields: [
      { key: 'name', label: 'Criterion', kind: 'text', wide: true },
      { key: 'category', label: 'Category', kind: 'select', options: ['Strategic', 'Behavioural', 'Operational'] },
      { key: 'weight', label: 'Weight', kind: 'number', min: 0, max: 5, step: 0.5 },
    ],
    blank: { name: '', category: 'Strategic', weight: 1, isActive: true },
  },
  {
    kind: 'checklistQuestions',
    label: 'Checklist questions',
    single: 'question',
    fields: [
      { key: 'text', label: 'Question', kind: 'text', wide: true },
      { key: 'weight', label: 'Weight', kind: 'select', options: ['Essential', 'Desirable', 'Useful'] },
    ],
    blank: { text: '', weight: 'Useful', isActive: true },
  },
];

type Row = Record<string, unknown> & { id?: string; isActive: boolean };

export function MasterDataTab() {
  const [kind, setKind] = useState<MasterKind>('offerings');
  const master = useMaster();
  const def = KINDS.find((k) => k.kind === kind) ?? KINDS[0];
  const [adding, setAdding] = useState(false);

  return (
    <section className="panel" aria-labelledby="md-title">
      <div className="panel__head">
        <h2 id="md-title" className="panel__title">
          Master data
        </h2>
        <div className="seg" role="radiogroup" aria-label="Master data list">
          {KINDS.map((k) => (
            <button
              key={k.kind}
              type="button"
              role="radio"
              aria-checked={kind === k.kind}
              className="seg__btn seg__btn--text"
              onClick={() => {
                setKind(k.kind);
                setAdding(false);
              }}
            >
              {k.label}
              {master.data && <span className="xsmall"> {(master.data[k.kind] as unknown[]).length}</span>}
            </button>
          ))}
        </div>
      </div>
      {master.isPending ? (
        <SkeletonTable rows={6} cols={4} />
      ) : master.isError ? (
        <ErrorState error={master.error} onRetry={() => void master.refetch()} />
      ) : (
        <div className="table-wrap">
          <table className="table table--edit">
            <caption className="sr-only">{def.label}</caption>
            <thead>
              <tr>
                {def.fields.map((f) => (
                  <th key={f.key} scope="col">
                    {f.label}
                  </th>
                ))}
                <th scope="col" style={{ width: 90 }}>
                  Active
                </th>
                <th scope="col" style={{ width: 150 }}>
                  <span className="sr-only">Row actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {(master.data[kind] as MasterData[typeof kind]).map((item) => (
                <MasterRow key={`${kind}-${item.id}`} kind={kind} fields={def.fields} initial={item as unknown as Row} />
              ))}
              {adding && <MasterRow key={`${kind}-new`} kind={kind} fields={def.fields} initial={def.blank as Row} onDone={() => setAdding(false)} />}
            </tbody>
          </table>
          {(master.data[kind] as unknown[]).length === 0 && !adding && <EmptyState title={`No ${def.label.toLowerCase()} yet`} />}
        </div>
      )}
      <div className="panel__body">
        {!adding && (
          <button type="button" className="btn btn--sm" onClick={() => setAdding(true)}>
            <Icon name="plus" /> Add {def.single}
          </button>
        )}
      </div>
    </section>
  );
}

function MasterRow({ kind, fields, initial, onDone }: { kind: MasterKind; fields: FieldDef[]; initial: Row; onDone?: () => void }) {
  const isNew = !initial.id;
  const [draft, setDraft] = useState<Row>(initial);
  const save = useSaveMaster(kind);
  const toast = useToast();
  const { id, ...body } = draft;
  const dirty = isNew || JSON.stringify(draft) !== JSON.stringify(initial);
  const errors = save.error instanceof ApiError && save.error.isValidation ? save.error.errors : undefined;
  const set = (k: string, v: unknown) => setDraft((d) => ({ ...d, [k]: v }));
  const label = String(draft.name ?? draft.text ?? 'item') || 'new item';

  const submit = () =>
    save.mutate(
      { id, item: body as unknown as MasterItemInput<typeof kind> },
      {
        onSuccess: () => {
          toast.success(isNew ? 'Added' : 'Saved');
          if (isNew) onDone?.();
        },
        onError: (e) => {
          if (!(e instanceof ApiError && e.isValidation)) toast.error(e);
        },
      },
    );

  return (
    <tr className={dirty && !isNew ? 'is-dirty' : undefined}>
      {fields.map((f) => {
        const err = pickError(errors, f.key);
        return (
          <td key={f.key} style={f.kind === 'text' && f.wide ? { minWidth: 260 } : undefined}>
            {f.kind === 'select' ? (
              <select className="select select--sm" aria-label={`${f.label} for ${label}`} value={String(draft[f.key] ?? '')} onChange={(e) => set(f.key, e.target.value)}>
                {f.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : f.kind === 'number' ? (
              <input
                type="number"
                className="input input--sm mono"
                style={{ width: 80 }}
                min={f.min}
                max={f.max}
                step={f.step ?? 1}
                aria-label={`${f.label} for ${label}`}
                aria-invalid={err ? true : undefined}
                value={Number(draft[f.key] ?? 0)}
                onChange={(e) => set(f.key, Number(e.target.value))}
              />
            ) : (
              <input
                className="input input--sm"
                aria-label={`${f.label} for ${label}`}
                aria-invalid={err ? true : undefined}
                value={String(draft[f.key] ?? '')}
                onChange={(e) => set(f.key, e.target.value)}
                data-autofocus={isNew && f === fields[0] ? true : undefined}
              />
            )}
            {err && <span className="field__error">{err}</span>}
          </td>
        );
      })}
      <td>
        <label className="check small">
          <input type="checkbox" checked={draft.isActive} onChange={(e) => set('isActive', e.target.checked)} aria-label={`${label} is active`} />
          {draft.isActive ? 'Yes' : 'No'}
        </label>
      </td>
      <td className="nowrap">
        {dirty && (
          <span className="cluster" style={{ ['--gap' as string]: '4px', flexWrap: 'nowrap' }}>
            <button type="button" className="btn btn--primary btn--sm" onClick={submit} disabled={save.isPending}>
              {save.isPending ? <span className="spinner" aria-hidden="true" /> : isNew ? 'Add' : 'Save'}
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => (isNew ? onDone?.() : setDraft(initial))} disabled={save.isPending}>
              Cancel
            </button>
          </span>
        )}
      </td>
    </tr>
  );
}
