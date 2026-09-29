import { useEffect, useState } from 'react';
import { useAcceptRecommendation, useDismissRecommendation, useNextBestAction, useRecommendations } from '../../api/hooks';
import type { Recommendation } from '../../api/types';
import { AiMeta, AiTag } from '../../components/AiMeta';
import { Field } from '../../components/Field';
import { Icon } from '../../components/Icon';
import { AiUnavailable, ErrorState, isAiUnavailable, SkeletonLines } from '../../components/States';
import { useToast } from '../../components/Toast';
import { CHANNEL_LABEL, formatDateTime, isoInDays, SECTION_INFO } from '../../lib/format';
import { usePlan } from './planContext';

function useElapsed(running: boolean) {
  const [s, setS] = useState(0);
  useEffect(() => {
    if (!running) return;
    const started = Date.now();
    setS(0);
    const t = window.setInterval(() => setS(Math.round((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(t);
  }, [running]);
  return s;
}

/** The AI next-best-action panel: generate, review, accept into a tracked action or dismiss with a reason. */
export function NextBestActionPanel() {
  const { accountId, canEdit, canSuggest } = usePlan();
  const history = useRecommendations(accountId);
  const nba = useNextBestAction(accountId);
  const elapsed = useElapsed(nba.isPending);
  const [showHistory, setShowHistory] = useState(false);

  const list = history.data ?? [];
  // The fresh suggestion wins until the list says it was accepted or dismissed.
  const fresh = nba.data ? (list.find((r) => r.id === nba.data.id) ?? nba.data) : undefined;
  const latest = fresh?.status === 'New' ? fresh : list.find((r) => r.status === 'New');
  const past = list.filter((r) => r.id !== latest?.id);
  const allowed = canSuggest && canEdit;

  return (
    <section className="panel nba" aria-labelledby="nba-title">
      <div className="panel__head">
        <div className="section-title">
          <h2 id="nba-title" className="panel__title">
            Next best action
          </h2>
          <AiTag />
        </div>
      </div>
      <div className="panel__body stack" style={{ ['--gap' as string]: '12px' }} aria-live="polite" aria-busy={nba.isPending}>
        {allowed && (
          <button type="button" className="btn btn--ai btn--block" disabled={nba.isPending} onClick={() => nba.mutate()}>
            {nba.isPending ? <span className="spinner" aria-hidden="true" /> : <Icon name="sparkle" />}
            {nba.isPending ? `Thinking… ${elapsed}s` : latest ? 'Suggest another' : 'Suggest next best action'}
          </button>
        )}
        {nba.isPending && (
          <div className="stack" style={{ ['--gap' as string]: '8px' }}>
            <p className="small muted">
              The agent is reading all 11 sections, the stakeholder map and open actions. This usually takes 10 to 30 seconds.
            </p>
            <div className="nba-progress" aria-hidden="true">
              <span style={{ width: `${Math.min(95, (elapsed / 30) * 100)}%` }} />
            </div>
            <SkeletonLines lines={3} />
          </div>
        )}
        {nba.isError && !nba.isPending && (isAiUnavailable(nba.error) ? <AiUnavailable error={nba.error} /> : <ErrorState error={nba.error} title="No suggestion this time" onRetry={() => nba.mutate()} />)}

        {!nba.isPending &&
          (history.isPending ? (
            <SkeletonLines lines={3} />
          ) : history.isError ? (
            isAiUnavailable(history.error) ? (
              <AiUnavailable error={history.error} />
            ) : (
              <ErrorState error={history.error} onRetry={() => void history.refetch()} />
            )
          ) : latest ? (
            <RecommendationCard rec={latest} actionable={allowed} />
          ) : (
            !nba.isError && (
              <p className="small muted">
                {allowed
                  ? 'Ask the agent for one concrete next step, who can help, and why. It cites the plan sections it used.'
                  : 'No open suggestion for this account.'}
              </p>
            )
          ))}

        {past.length > 0 && (
          <div>
            <button type="button" className="link-btn small" aria-expanded={showHistory} onClick={() => setShowHistory((v) => !v)}>
              <Icon name={showHistory ? 'chevronDown' : 'chevronRight'} style={{ width: 12, height: 12 }} /> History ({past.length})
            </button>
            {showHistory && (
              <ul className="nba-history">
                {past.map((r) => (
                  <li key={r.id}>
                    <span className={`status-pill status-pill--${r.status}`}>{r.status}</span>
                    <span className="small ai-text">{r.action}</span>
                    <span className="xsmall muted">{formatDateTime(r.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function RecommendationCard({ rec, actionable }: { rec: Recommendation; actionable: boolean }) {
  const { accountId, owners, goToSection } = usePlan();
  const toast = useToast();
  const accept = useAcceptRecommendation(accountId);
  const dismiss = useDismissRecommendation(accountId);
  const [mode, setMode] = useState<'view' | 'accept' | 'dismiss'>('view');
  const [ownerId, setOwnerId] = useState(owners[0]?.id ?? '');
  const [dueDate, setDueDate] = useState(isoInDays(14));
  const [reason, setReason] = useState('');

  return (
    <article className="ai-card" aria-label="Suggested next best action">
      <div className="ai-card__body stack" style={{ ['--gap' as string]: '10px' }}>
        {rec.atRisk && (
          <div className="banner banner--warn">
            <Icon name="alert" />
            <div className="banner__body">
              <strong>Account at risk</strong>
              {rec.riskReason}
            </div>
          </div>
        )}
        <p className="nba__action ai-text">{rec.action}</p>
        <div className="cluster small">
          <span className="pill pill--ai">{CHANNEL_LABEL[rec.channel] ?? rec.channel}</span>
          <span className="xsmall muted">{formatDateTime(rec.createdAt)}</span>
        </div>
        {rec.whoseHelp.length > 0 && (
          <div>
            <div className="eyebrow">Whose help</div>
            <ul className="plain-list small">
              {rec.whoseHelp.map((h) => (
                <li key={`${h.name}-${h.type}`}>
                  <span className="strong">{h.name}</span>{' '}
                  <span className="xsmall muted">({h.type === 'Internal' ? 'Psiog' : 'customer'})</span> <span className="ai-text">{h.why}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div>
          <div className="eyebrow">Why</div>
          <p className="small ai-text pre-line">{rec.rationale}</p>
        </div>
        {rec.sourceSections.length > 0 && (
          <div className="cluster" aria-label="Sections the agent used">
            <span className="xsmall muted">Sources:</span>
            {rec.sourceSections.map((s) => (
              <button key={s} type="button" className="code-badge code-badge--link" title={SECTION_INFO[s]?.title} onClick={() => goToSection(s)}>
                {SECTION_INFO[s]?.code ?? s}
              </button>
            ))}
          </div>
        )}
        <AiMeta meta={rec.meta} />

        {actionable && mode === 'view' && (
          <div className="cluster">
            <button type="button" className="btn btn--primary btn--sm" onClick={() => setMode('accept')}>
              <Icon name="check" /> Accept
            </button>
            <button type="button" className="btn btn--sm" onClick={() => setMode('dismiss')}>
              Dismiss
            </button>
          </div>
        )}
        {mode === 'accept' && (
          <form
            className="stack"
            style={{ ['--gap' as string]: '10px' }}
            onSubmit={(e) => {
              e.preventDefault();
              accept.mutate(
                { rid: rec.id, ownerId, dueDate },
                {
                  onSuccess: (a) => {
                    toast.success(`Tracked as an action for ${a.ownerName}, due ${a.dueDate}`);
                    setMode('view');
                  },
                  onError: (err) => toast.error(err),
                },
              );
            }}
          >
            <Field label="Owner">
              {(a) => (
                <select {...a} className="select select--sm" value={ownerId} onChange={(e) => setOwnerId(e.target.value)} data-autofocus>
                  {owners.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="Due date">
              {(a) => <input {...a} type="date" className="input input--sm" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />}
            </Field>
            <div className="cluster">
              <button type="submit" className="btn btn--primary btn--sm" disabled={accept.isPending || !ownerId || !dueDate}>
                {accept.isPending && <span className="spinner" aria-hidden="true" />} Create tracked action
              </button>
              <button type="button" className="btn btn--sm" onClick={() => setMode('view')} disabled={accept.isPending}>
                Back
              </button>
            </div>
          </form>
        )}
        {mode === 'dismiss' && (
          <form
            className="stack"
            style={{ ['--gap' as string]: '10px' }}
            onSubmit={(e) => {
              e.preventDefault();
              dismiss.mutate(
                { rid: rec.id, reason: reason.trim() },
                {
                  onSuccess: () => {
                    toast.info('Suggestion dismissed. The reason helps the agent improve.');
                    setMode('view');
                  },
                  onError: (err) => toast.error(err),
                },
              );
            }}
          >
            <Field label="Why dismiss?" hint="For example: already done, wrong person, not now.">
              {(a) => <textarea {...a} className="textarea" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} data-autofocus />}
            </Field>
            <div className="cluster">
              <button type="submit" className="btn btn--sm" disabled={dismiss.isPending || !reason.trim()}>
                {dismiss.isPending && <span className="spinner" aria-hidden="true" />} Dismiss suggestion
              </button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setMode('view')} disabled={dismiss.isPending}>
                Back
              </button>
            </div>
          </form>
        )}
      </div>
    </article>
  );
}
