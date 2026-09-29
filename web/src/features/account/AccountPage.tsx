import { useMemo, useState, type ComponentType } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { accountsApi } from '../../api/accounts';
import { saveBlob } from '../../api/client';
import { useAccountPlan, useMaster, useSaveVersion } from '../../api/hooks';
import { ACTION_STATUSES, SECTION_KEYS, type AccountPlan, type ActionStatus, type SectionKey } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { DataTable } from '../../components/DataTable';
import { Field } from '../../components/Field';
import { HealthGauge } from '../../components/HealthGauge';
import { Icon } from '../../components/Icon';
import { Modal } from '../../components/Modal';
import { useDocumentTitle } from '../../components/PageHeader';
import { RiskPill } from '../../components/RiskPill';
import { ScoreBar } from '../../components/ScoreBar';
import { EmptyState, ErrorState, SkeletonLines } from '../../components/States';
import { Tabs, tabPanelProps } from '../../components/Tabs';
import { useToast } from '../../components/Toast';
import { formatDate, formatRelative, SECTION_INFO, STATUS_LABEL } from '../../lib/format';
import { ActionStatusSelect, DueDate, OriginTag, StatusPill } from '../actions/ActionParts';
import { HistoryTab } from './HistoryTab';
import { NextBestActionPanel } from './NextBestAction';
import { ownersOf, PlanProvider, usePlan } from './planContext';
import { ActionPlanEditor, PriorityActionsEditor } from './sections/ActionSections';
import { OpportunitiesEditor } from './sections/OpportunitiesEditor';
import { ProfileEditor } from './sections/ProfileEditor';
import { ResourcesEditor } from './sections/ResourcesEditor';
import { BrickwallEditor, TacticalEditor } from './sections/ScoringSections';
import { StakeholdersEditor } from './sections/StakeholdersEditor';
import { InfobaseEditor, StrategyEditor, VisionEditor } from './sections/TextSections';

const EDITORS: Record<SectionKey, ComponentType> = {
  profile: ProfileEditor,
  infobase: InfobaseEditor,
  vision: VisionEditor,
  strategy: StrategyEditor,
  opportunities: OpportunitiesEditor,
  stakeholders: StakeholdersEditor,
  brickwall: BrickwallEditor,
  tactical: TacticalEditor,
  priorityActions: PriorityActionsEditor,
  actionPlan: ActionPlanEditor,
  resources: ResourcesEditor,
};

type TabId = 'plan' | 'actions' | 'history';
const isSection = (v: string | null): v is SectionKey => !!v && (SECTION_KEYS as readonly string[]).includes(v);

export default function AccountPage() {
  const { id = '' } = useParams();
  const plan = useAccountPlan(id);
  const master = useMaster();
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  useDocumentTitle(plan.data?.summary.name ?? 'Account');

  const section: SectionKey = isSection(params.get('section')) ? (params.get('section') as SectionKey) : 'profile';
  const tabParam = params.get('tab');
  const tab: TabId = tabParam === 'actions' || tabParam === 'history' ? tabParam : 'plan';

  const setQuery = (patch: Record<string, string | null>) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        for (const [k, v] of Object.entries(patch)) {
          if (v === null) next.delete(k);
          else next.set(k, v);
        }
        return next;
      },
      { replace: true },
    );

  const ctxValue = useMemo(() => {
    if (!plan.data || !master.data) return null;
    return {
      plan: plan.data,
      master: master.data,
      accountId: id,
      canEdit: plan.data.canEdit && can('plan.edit'),
      canSuggest: can('ai.suggest'),
      owners: ownersOf(plan.data),
      goToSection: (k: SectionKey) => {
        setQuery({ section: k, tab: null });
        window.scrollTo({ top: 0, behavior: 'smooth' });
      },
    };
    // setQuery is stable enough for navigation; re-create only when data changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.data, master.data, id, can]);

  if (plan.isPending || master.isPending) {
    return (
      <div className="page" aria-busy="true">
        <SkeletonLines lines={3} />
        <div className="workspace">
          <SkeletonLines lines={11} />
          <SkeletonLines lines={10} />
        </div>
      </div>
    );
  }
  if (plan.isError || master.isError) {
    return (
      <div className="page">
        <div className="panel">
          <ErrorState error={plan.error ?? master.error} onRetry={() => void (plan.isError ? plan.refetch() : master.refetch())} title="Could not open this account" />
        </div>
      </div>
    );
  }
  if (!ctxValue) return null;

  return (
    <PlanProvider value={ctxValue}>
      <div className="page">
        <AccountHeader />
        <ConflictBanner onReload={() => void plan.refetch()} />
        <Tabs
          label="Account workspace"
          idPrefix="acct"
          active={tab}
          onChange={(t) => setQuery({ tab: t === 'plan' ? null : t })}
          tabs={[
            { id: 'plan', label: 'Plan' },
            { id: 'actions', label: 'Actions', count: plan.data.actions.filter((a) => a.status !== 'Done').length },
            { id: 'history', label: 'History', count: plan.data.summary.currentVersion },
          ]}
        />
        <div {...tabPanelProps('acct', tab)} className="tab-panel">
          {tab === 'plan' && <PlanTab section={section} onSection={(k) => setQuery({ section: k })} />}
          {tab === 'actions' && <ActionsTab />}
          {tab === 'history' && <HistoryTab />}
        </div>
      </div>
    </PlanProvider>
  );
}

function AccountHeader() {
  const { plan, canEdit, accountId } = usePlan();
  const { can } = useAuth();
  const toast = useToast();
  const [versionOpen, setVersionOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const s = plan.summary;

  const exportWorkbook = async () => {
    setExporting(true);
    try {
      saveBlob(await accountsApi.exportWorkbook(accountId, s.name));
      toast.success('Workbook downloaded');
    } catch (e) {
      toast.error(e);
    } finally {
      setExporting(false);
    }
  };

  return (
    <header className="account-head panel">
      <div className="account-head__main">
        <div className="eyebrow">
          <Link to={s.type === 'NBD' ? '/nbd' : '/ebd'}>{s.type === 'NBD' ? 'New business' : 'Existing business'}</Link> · {s.groupName}
        </div>
        <h1>{s.name}</h1>
        <p className="small muted">
          {s.industry} · {s.region} · Captain {s.captainName}
        </p>
        <div className="cluster" style={{ marginTop: 8 }}>
          <RiskPill level={plan.scores.riskLevel} reasons={plan.scores.riskReasons} />
          <span className="chip">v{s.currentVersion}</span>
          <span className="xsmall muted" title={formatDate(s.lastReviewedAt)}>
            Reviewed {formatRelative(s.lastReviewedAt)}
          </span>
          {s.overdueActions > 0 && <span className="stale-badge">{s.overdueActions} overdue</span>}
          {s.staleSections > 0 && <span className="stale-badge">{s.staleSections} stale sections</span>}
          {!canEdit && (
            <span className="chip" title="Your role can view this plan but not change it">
              <Icon name="lock" style={{ width: 12, height: 12, marginRight: 4 }} /> Read only
            </span>
          )}
        </div>
      </div>
      <div className="account-head__scores" aria-label="Plan scores">
        <HealthGauge value={plan.scores.health} size={120} />
        <dl className="score-list">
          {(
            [
              ['Opportunity', plan.scores.opportunity],
              ['Brickwall', plan.scores.brickwall],
              ['Checklist', plan.scores.checklist],
              ['Perception', plan.scores.perception],
              ['Completion', plan.scores.completion],
            ] as const
          ).map(([label, v]) => (
            <div key={label}>
              <dt className="xsmall muted">{label}</dt>
              <dd>
                <ScoreBar value={v} tone={label === 'Completion' ? 'accent' : 'auto'} label={`${label} score`} />
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="account-head__actions cluster">
        {can('export.account') && (
          <button type="button" className="btn btn--sm" onClick={() => void exportWorkbook()} disabled={exporting}>
            {exporting ? <span className="spinner" aria-hidden="true" /> : <Icon name="download" />} Export workbook
          </button>
        )}
        {canEdit && can('plan.version') && (
          <button type="button" className="btn btn--primary btn--sm" onClick={() => setVersionOpen(true)}>
            <Icon name="save" /> Save version
          </button>
        )}
      </div>
      <SaveVersionModal open={versionOpen} onClose={() => setVersionOpen(false)} />
    </header>
  );
}

function SaveVersionModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { accountId, plan } = usePlan();
  const save = useSaveVersion(accountId);
  const toast = useToast();
  const [summary, setSummary] = useState('');
  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={save.isPending}
      title="Save a version"
      subtitle={`Snapshots the plan and its scores as v${plan.summary.currentVersion + 1} and marks the account reviewed.`}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose} disabled={save.isPending}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={save.isPending || !summary.trim()}
            onClick={() =>
              save.mutate(summary.trim(), {
                onSuccess: (v) => {
                  toast.success(`Saved v${v.number}`);
                  setSummary('');
                  onClose();
                },
                onError: (e) => toast.error(e),
              })
            }
          >
            {save.isPending && <span className="spinner" aria-hidden="true" />} Save version
          </button>
        </>
      }
    >
      <Field label="What changed?" hint="One line, for example: Quarterly review with the CIO.">
        {(a) => <input {...a} className="input" value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={300} data-autofocus />}
      </Field>
    </Modal>
  );
}

function ConflictBanner({ onReload }: { onReload: () => void }) {
  const { conflict, setConflict } = usePlan();
  if (!conflict) return null;
  return (
    <div className="banner banner--warn" role="alert">
      <Icon name="alert" />
      <div className="banner__body">
        <strong>Someone else changed this plan while you were editing</strong>
        Your unsaved edits are still here. Reload to get their changes, then save again.
      </div>
      <button
        type="button"
        className="btn btn--sm"
        onClick={() => {
          onReload();
          setConflict(false);
        }}
      >
        <Icon name="refresh" /> Reload plan
      </button>
    </div>
  );
}

function PlanTab({ section, onSection }: { section: SectionKey; onSection: (k: SectionKey) => void }) {
  const { plan } = usePlan();
  // Keep visited editors mounted so unsaved drafts survive switching sections.
  const [visited, setVisited] = useState<SectionKey[]>([section]);
  if (!visited.includes(section)) setVisited([...visited, section]);

  return (
    <div className="workspace">
      <Stepper plan={plan} active={section} onPick={onSection} />
      <div className="workspace__main">
        {visited.map((k) => {
          const Editor = EDITORS[k];
          return (
            <div key={k} hidden={k !== section}>
              <Editor />
            </div>
          );
        })}
      </div>
      <aside className="workspace__side" aria-label="AI assistance">
        <NextBestActionPanel />
      </aside>
    </div>
  );
}

function Stepper({ plan, active, onPick }: { plan: AccountPlan; active: SectionKey; onPick: (k: SectionKey) => void }) {
  const sections = plan.sections.length ? plan.sections : SECTION_KEYS.map((k) => ({ key: k, ...SECTION_INFO[k], completion: 0, updatedAt: null, isStale: false }));
  return (
    <nav className="stepper" aria-label="Plan sections">
      <div className="stepper__head">
        <span className="eyebrow">Plan sections</span>
        <span className="xsmall mono muted">{Math.round(plan.scores.completion)}% complete</span>
      </div>
      <ol>
        {sections.map((s) => (
          <li key={s.key}>
            <button
              type="button"
              className={`stepper__item${s.key === active ? ' is-active' : ''}`}
              aria-current={s.key === active ? 'step' : undefined}
              onClick={() => onPick(s.key)}
            >
              <span className={`code-badge${s.completion >= 100 ? ' code-badge--done' : ''}`}>{s.code}</span>
              <span className="stepper__text">
                <span className="stepper__title">{s.title}</span>
                <span className="stepper__meta">
                  <span className="stepper__bar" aria-hidden="true">
                    <span style={{ width: `${Math.max(0, Math.min(100, s.completion))}%` }} />
                  </span>
                  <span className="mono xsmall">{Math.round(s.completion)}%</span>
                  {s.isStale && <span className="stale-badge">Stale</span>}
                </span>
              </span>
              <span className="sr-only">
                {Math.round(s.completion)} percent complete{s.isStale ? ', stale' : ''}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function ActionsTab() {
  const { plan, canEdit, goToSection } = usePlan();
  const [status, setStatus] = useState<ActionStatus | ''>('');
  const [overdue, setOverdue] = useState(false);
  const titles = new Map(plan.actions.map((a) => [a.id, a.title]));
  const rows = plan.actions.filter((a) => (!status || a.status === status) && (!overdue || (a.isOverdue && a.status !== 'Done')));
  return (
    <section className="panel" aria-labelledby="acct-actions-title">
      <div className="panel__head">
        <h2 id="acct-actions-title" className="panel__title">
          Actions on this account <span className="muted mono small">{rows.length}</span>
        </h2>
        <div className="cluster">
          <label className="sr-only" htmlFor="acct-status">
            Filter by status
          </label>
          <select id="acct-status" className="select select--sm" style={{ width: 140 }} value={status} onChange={(e) => setStatus(e.target.value as ActionStatus | '')}>
            <option value="">All statuses</option>
            {ACTION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <label className="check small">
            <input type="checkbox" checked={overdue} onChange={(e) => setOverdue(e.target.checked)} /> Overdue only
          </label>
          {canEdit && (
            <button type="button" className="btn btn--sm" onClick={() => goToSection('actionPlan')}>
              <Icon name="plus" /> Add in S11
            </button>
          )}
        </div>
      </div>
      {plan.actions.length === 0 ? (
        <EmptyState title="No actions yet" icon="actions" />
      ) : (
        <DataTable
          caption="Actions on this account"
          rows={rows}
          rowKey={(a) => a.id}
          initialSort={{ key: 'due', dir: 'asc' }}
          rowClassName={(a) => (a.isOverdue && a.status !== 'Done' ? 'is-overdue' : undefined)}
          empty={<span className="muted small">No actions match these filters.</span>}
          columns={[
            {
              key: 'title',
              header: 'Action',
              sortValue: (a) => a.title,
              render: (a) => (
                <div>
                  <span className="cluster" style={{ ['--gap' as string]: '6px' }}>
                    <span className="small strong">{a.title}</span>
                    <OriginTag action={a} />
                  </span>
                  {a.parentId && <span className="xsmall muted">Sub-action of {titles.get(a.parentId) ?? 'another action'}</span>}
                </div>
              ),
            },
            {
              key: 'src',
              header: 'Section',
              sortValue: (a) => SECTION_KEYS.indexOf(a.sourceSection),
              render: (a) => (
                <button type="button" className="code-badge code-badge--link" title={SECTION_INFO[a.sourceSection]?.title} onClick={() => goToSection(a.sourceSection)}>
                  {SECTION_INFO[a.sourceSection]?.code ?? a.sourceSection}
                </button>
              ),
            },
            { key: 'owner', header: 'Owner', sortValue: (a) => a.ownerName, render: (a) => <span className="small">{a.ownerName}</span> },
            { key: 'due', header: 'Due', sortValue: (a) => a.dueDate, render: (a) => <DueDate action={a} /> },
            {
              key: 'status',
              header: 'Status',
              sortValue: (a) => ACTION_STATUSES.indexOf(a.status),
              render: (a) => (canEdit ? <ActionStatusSelect action={a} /> : <StatusPill status={a.status} />),
            },
          ]}
        />
      )}
    </section>
  );
}
