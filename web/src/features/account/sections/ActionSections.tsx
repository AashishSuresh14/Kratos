import { useState } from 'react';
import type { Action } from '../../../api/types';
import { Icon } from '../../../components/Icon';
import { EmptyState } from '../../../components/States';
import { SECTION_INFO } from '../../../lib/format';
import { ActionStatusSelect, DueDate, NewActionForm, OriginTag, StatusPill } from '../../actions/ActionParts';
import { usePlan } from '../planContext';
import { SectionFrame } from '../SectionFrame';

const byDue = (a: Action, b: Action) => a.dueDate.localeCompare(b.dueDate);

function ActionLine({ a, depth = 0, canEdit }: { a: Action; depth?: number; canEdit: boolean }) {
  return (
    <li className={`action-line${depth ? ' action-line--child' : ''}${a.isOverdue && a.status !== 'Done' ? ' is-overdue' : ''}`}>
      <span className="action-line__title">
        {depth > 0 && <Icon name="chevronRight" className="action-line__branch" />}
        <span className="small">{a.title}</span>
        <OriginTag action={a} />
        <span className="code-badge" title={SECTION_INFO[a.sourceSection]?.title}>
          {SECTION_INFO[a.sourceSection]?.code ?? a.sourceSection}
        </span>
      </span>
      <span className="small muted action-line__owner">{a.ownerName}</span>
      <DueDate action={a} />
      <span>{canEdit ? <ActionStatusSelect action={a} /> : <StatusPill status={a.status} />}</span>
    </li>
  );
}

/** S10: top-level actions tied to a priority opportunity. */
export function PriorityActionsEditor() {
  const { plan, canEdit, accountId, owners, goToSection } = usePlan();
  const [adding, setAdding] = useState(false);
  const priority = plan.opportunities.filter((o) => o.isPriority);
  const top = plan.actions.filter((a) => a.parentId === null && (a.sourceSection === 'priorityActions' || a.opportunityId !== null));
  const groups = [
    ...priority.map((o) => ({ id: o.id, title: o.title, sub: o.offeringName, actions: top.filter((a) => a.opportunityId === o.id).sort(byDue) })),
    { id: '__none', title: 'Not linked to a priority opportunity', sub: '', actions: top.filter((a) => !priority.some((o) => o.id === a.opportunityId)).sort(byDue) },
  ].filter((g) => g.id !== '__none' || g.actions.length > 0);

  return (
    <SectionFrame
      section="priorityActions"
      description="The few actions that move each priority opportunity forward. Sub-steps and dates live in S11."
      headExtra={
        canEdit && priority.length > 0 && !adding ? (
          <button type="button" className="btn btn--sm" onClick={() => setAdding(true)}>
            <Icon name="plus" /> Add priority action
          </button>
        ) : undefined
      }
    >
      {adding && (
        <div className="panel panel--sunk" style={{ marginBottom: 14 }}>
          <div className="panel__body">
            <NewActionForm
              accountId={accountId}
              sourceSection="priorityActions"
              owners={owners}
              opportunities={priority.map((o) => ({ id: o.id, name: o.title }))}
              requireOpportunity
              onDone={() => setAdding(false)}
            />
          </div>
        </div>
      )}
      {priority.length === 0 ? (
        <EmptyState
          title="No priority opportunities"
          icon="target"
          action={
            <button type="button" className="btn btn--sm" onClick={() => goToSection('opportunities')}>
              Go to S6 Opportunity matrix
            </button>
          }
        >
          Priority actions hang off priority opportunities. Mark one as priority first.
        </EmptyState>
      ) : (
        <div className="stack" style={{ ['--gap' as string]: '14px' }}>
          {groups.map((g) => (
            <div key={g.id} className="panel">
              <div className="panel__head">
                <div>
                  <h3>{g.title}</h3>
                  {g.sub && <span className="xsmall muted">{g.sub}</span>}
                </div>
                <span className="xsmall muted mono">{g.actions.length} action{g.actions.length === 1 ? '' : 's'}</span>
              </div>
              {g.actions.length ? (
                <ul className="action-lines">
                  {g.actions.map((a) => (
                    <ActionLine key={a.id} a={a} canEdit={canEdit} />
                  ))}
                </ul>
              ) : (
                <p className="small muted" style={{ padding: '10px 16px' }}>
                  No actions yet for this opportunity.
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </SectionFrame>
  );
}

/** S11: the dated plan, parents with their sub-actions (parentId). */
export function ActionPlanEditor() {
  const { plan, canEdit, accountId, owners } = usePlan();
  const [adding, setAdding] = useState(false);
  const ids = new Set(plan.actions.map((a) => a.id));
  const roots = plan.actions.filter((a) => a.parentId === null || !ids.has(a.parentId)).sort(byDue);
  const childrenOf = (id: string) => plan.actions.filter((a) => a.parentId === id).sort(byDue);
  const open = plan.actions.filter((a) => a.status !== 'Done').length;
  const overdue = plan.actions.filter((a) => a.isOverdue && a.status !== 'Done').length;

  return (
    <SectionFrame
      section="actionPlan"
      description="Every action on this account in date order, with sub-actions under their parent. Status changes save straight away."
      headExtra={
        canEdit && !adding ? (
          <button type="button" className="btn btn--sm" onClick={() => setAdding(true)}>
            <Icon name="plus" /> Add action
          </button>
        ) : undefined
      }
    >
      <div className="cluster small muted" style={{ marginBottom: 12 }}>
        <span>
          <span className="mono strong">{plan.actions.length}</span> actions
        </span>
        <span>·</span>
        <span>
          <span className="mono strong">{open}</span> open
        </span>
        <span>·</span>
        <span className={overdue ? 'text-crit' : undefined}>
          <span className="mono strong">{overdue}</span> overdue
        </span>
      </div>
      {adding && (
        <div className="panel panel--sunk" style={{ marginBottom: 14 }}>
          <div className="panel__body">
            <NewActionForm
              accountId={accountId}
              sourceSection="actionPlan"
              owners={owners}
              opportunities={plan.opportunities.map((o) => ({ id: o.id, name: o.title }))}
              parents={roots.map((a) => ({ id: a.id, name: a.title }))}
              onDone={() => setAdding(false)}
            />
          </div>
        </div>
      )}
      {roots.length === 0 ? (
        <EmptyState title="No actions yet" icon="actions">
          Add the first dated action, or accept a next best action from the AI panel.
        </EmptyState>
      ) : (
        <div className="panel">
          <div className="action-lines__head" aria-hidden="true">
            <span>Action</span>
            <span>Owner</span>
            <span>Due</span>
            <span>Status</span>
          </div>
          <ul className="action-lines">
            {roots.map((a) => (
              <li key={a.id} className="action-tree">
                <ul className="action-lines">
                  <ActionLine a={a} canEdit={canEdit} />
                  {childrenOf(a.id).map((c) => (
                    <ActionLine key={c.id} a={c} depth={1} canEdit={canEdit} />
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}
    </SectionFrame>
  );
}
