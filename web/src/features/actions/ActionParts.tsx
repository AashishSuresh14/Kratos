import { useState, type FormEvent } from 'react';
import { ApiError } from '../../api/client';
import { useCreateAction, useUpdateAction } from '../../api/hooks';
import { ACTION_STATUSES, type Action, type ActionStatus, type SectionKey } from '../../api/types';
import { AiTag } from '../../components/AiMeta';
import { Field, pickError } from '../../components/Field';
import { Icon } from '../../components/Icon';
import { useToast } from '../../components/Toast';
import { daysUntil, formatDate, isoInDays, STATUS_LABEL } from '../../lib/format';

/** Inline status change: PATCH /actions/{id} as soon as the value changes. */
export function ActionStatusSelect({ action, disabled }: { action: Action; disabled?: boolean }) {
  const update = useUpdateAction();
  const toast = useToast();
  const [optimistic, setOptimistic] = useState<ActionStatus | null>(null);
  const value = optimistic ?? action.status;
  return (
    <span className="cluster" style={{ ['--gap' as string]: '6px', flexWrap: 'nowrap' }}>
      <select
        className={`select select--sm status-select status-select--${value}`}
        aria-label={`Status of ${action.title}`}
        value={value}
        disabled={disabled || update.isPending}
        onChange={(e) => {
          const status = e.target.value as ActionStatus;
          setOptimistic(status);
          update.mutate(
            { id: action.id, body: { status } },
            {
              onSuccess: () => toast.success(`Marked "${action.title}" as ${STATUS_LABEL[status].toLowerCase()}`),
              onError: (err) => toast.error(err),
              onSettled: () => setOptimistic(null),
            },
          );
        }}
      >
        {ACTION_STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABEL[s]}
          </option>
        ))}
      </select>
      {update.isPending && <span className="spinner" aria-label="Saving status" />}
    </span>
  );
}

export function StatusPill({ status }: { status: ActionStatus }) {
  return <span className={`status-pill status-pill--${status}`}>{STATUS_LABEL[status]}</span>;
}

/** Due date with an overdue flag that does not rely on colour alone. */
export function DueDate({ action }: { action: Action }) {
  const d = daysUntil(action.dueDate);
  const overdue = action.isOverdue && action.status !== 'Done';
  return (
    <span className={`nowrap small${overdue ? ' text-crit strong' : ''}`} title={formatDate(action.dueDate)}>
      {overdue && <Icon name="alert" style={{ width: 12, height: 12, verticalAlign: '-2px', marginRight: 3 }} />}
      {formatDate(action.dueDate)}
      <span className="xsmall muted">
        {' '}
        · {action.status === 'Done' ? 'done' : overdue ? `${Math.abs(d)}d overdue` : d === 0 ? 'today' : `in ${d}d`}
      </span>
    </span>
  );
}

export function OriginTag({ action }: { action: Action }) {
  return action.origin === 'AiNextBestAction' ? <AiTag label="AI" /> : null;
}

export interface Option {
  id: string;
  name: string;
}

/**
 * Add an action on an account: POST /accounts/{id}/actions.
 * 422 messages are shown next to the matching fields.
 */
export function NewActionForm({
  accountId,
  sourceSection,
  owners,
  opportunities,
  requireOpportunity,
  parents,
  onDone,
}: {
  accountId: string;
  sourceSection: SectionKey;
  owners: Option[];
  opportunities?: Option[];
  requireOpportunity?: boolean;
  parents?: Option[];
  onDone?: () => void;
}) {
  const create = useCreateAction(accountId);
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [ownerId, setOwnerId] = useState(owners[0]?.id ?? '');
  const [dueDate, setDueDate] = useState(isoInDays(14));
  const [opportunityId, setOpportunityId] = useState(requireOpportunity ? (opportunities?.[0]?.id ?? '') : '');
  const [parentId, setParentId] = useState('');
  const [local, setLocal] = useState<Record<string, string>>({});

  const serverErrors = create.error instanceof ApiError && create.error.isValidation ? create.error.errors : undefined;
  const err = (f: string) => local[f] ?? pickError(serverErrors, f);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v: Record<string, string> = {};
    if (!title.trim()) v.title = 'Give the action a title.';
    if (!ownerId) v.ownerId = 'Pick an owner.';
    if (!dueDate) v.dueDate = 'Pick a due date.';
    if (requireOpportunity && !opportunityId) v.opportunityId = 'Pick the priority opportunity this action serves.';
    setLocal(v);
    if (Object.keys(v).length) return;
    create.mutate(
      {
        title: title.trim(),
        sourceSection,
        ownerId,
        dueDate,
        ...(opportunityId ? { opportunityId } : {}),
        ...(parentId ? { parentId } : {}),
      },
      {
        onSuccess: (a) => {
          toast.success(`Action added: ${a.title}`);
          setTitle('');
          setParentId('');
          create.reset();
          onDone?.();
        },
        onError: (e2) => {
          if (!(e2 instanceof ApiError && e2.isValidation)) toast.error(e2);
        },
      },
    );
  };

  return (
    <form className="action-form" onSubmit={submit} noValidate aria-label="New action">
      <div className="action-form__grid">
        <Field label="Action" error={err('title')}>
          {(a) => <input {...a} className="input input--sm" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} placeholder="What will be done" />}
        </Field>
        {opportunities && (
          <Field label={requireOpportunity ? 'Priority opportunity' : 'Opportunity (optional)'} error={err('opportunityId')}>
            {(a) => (
              <select {...a} className="select select--sm" value={opportunityId} onChange={(e) => setOpportunityId(e.target.value)}>
                {!requireOpportunity && <option value="">None</option>}
                {opportunities.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}
        {parents && (
          <Field label="Sub-action of (optional)" error={err('parentId')}>
            {(a) => (
              <select {...a} className="select select--sm" value={parentId} onChange={(e) => setParentId(e.target.value)}>
                <option value="">Top-level action</option>
                {parents.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}
        <Field label="Owner" error={err('ownerId')}>
          {(a) => (
            <select {...a} className="select select--sm" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Due date" error={err('dueDate')}>
          {(a) => <input {...a} type="date" className="input input--sm" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />}
        </Field>
      </div>
      <div className="cluster" style={{ justifyContent: 'flex-end' }}>
        {onDone && (
          <button type="button" className="btn btn--sm" onClick={onDone} disabled={create.isPending}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn btn--primary btn--sm" disabled={create.isPending}>
          {create.isPending ? <span className="spinner" aria-hidden="true" /> : <Icon name="plus" />}
          Add action
        </button>
      </div>
    </form>
  );
}
