import { useMemo } from 'react';
import { accountsApi } from '../../../api/accounts';
import type { BrickwallCategory, BrickwallRating, ChecklistAnswer, ChecklistWeight, TacticalItem } from '../../../api/types';
import { RatingInput } from '../../../components/Field';
import { ScoreBar } from '../../../components/ScoreBar';
import { EmptyState } from '../../../components/States';
import { usePlan, useSectionSave } from '../planContext';
import { SectionFrame } from '../SectionFrame';
import { useDraft } from '../useDraft';

const CATEGORIES: { key: BrickwallCategory; blurb: string }[] = [
  { key: 'Strategic', blurb: 'Fit with where the customer is heading' },
  { key: 'Behavioural', blurb: 'How people on the customer side act towards us' },
  { key: 'Operational', blurb: 'What gets in the way of doing business' },
];

export function BrickwallEditor() {
  const { plan, master, canEdit, accountId } = usePlan();
  // Show every active criterion, even ones the plan has not rated yet.
  const initial = useMemo<BrickwallRating[]>(() => {
    const ids = new Set(plan.brickwall.map((b) => b.criterionId));
    return [
      ...plan.brickwall,
      ...master.brickwallCriteria.filter((c) => c.isActive && !ids.has(c.id)).map((c) => ({ criterionId: c.id, score: null, note: '' })),
    ];
  }, [plan.brickwall, master.brickwallCriteria]);
  const { draft, setDraft, dirty, reset } = useDraft<BrickwallRating[]>(initial);
  const { save, saving, fieldErrors } = useSectionSave('brickwall');
  const update = (id: string, p: Partial<BrickwallRating>) => setDraft(draft.map((b) => (b.criterionId === id ? { ...b, ...p } : b)));

  return (
    <SectionFrame
      section="brickwall"
      description="The walls between us and winning more. Rate each criterion 1 (a real wall) to 5 (no barrier), and note what would move it."
      dirty={dirty}
      saving={saving}
      onReset={reset}
      errors={fieldErrors}
      onSave={() => void save((rv) => accountsApi.saveBrickwall(accountId, draft, rv))}
    >
      <div className="stack" style={{ ['--gap' as string]: '18px' }}>
        {CATEGORIES.map((cat) => {
          const criteria = master.brickwallCriteria.filter((c) => c.category === cat.key && (c.isActive || draft.some((b) => b.criterionId === c.id && b.score !== null)));
          if (!criteria.length) return null;
          const rated = criteria.map((c) => draft.find((b) => b.criterionId === c.id)?.score ?? null).filter((x): x is NonNullable<typeof x> => x !== null);
          const avg = rated.length ? (rated.reduce((a, b) => a + b, 0) / rated.length) * 20 : 0;
          return (
            <div key={cat.key} className="bw-group">
              <div className="spread bw-group__head">
                <div>
                  <h3>{cat.key}</h3>
                  <p className="xsmall muted">{cat.blurb}</p>
                </div>
                <div style={{ width: 160 }}>
                  <ScoreBar value={avg} tone="auto" label={`${cat.key} average`} />
                </div>
              </div>
              <ul className="bw-list">
                {criteria.map((c) => {
                  const r = draft.find((b) => b.criterionId === c.id) ?? { criterionId: c.id, score: null, note: '' };
                  return (
                    <li key={c.id} className="bw-row">
                      <div className="bw-row__name">
                        <span>{c.name}</span>
                        <span className="xsmall muted mono">weight {c.weight}</span>
                      </div>
                      <RatingInput label={`Rating for ${c.name}`} value={r.score} disabled={!canEdit} allowClear onChange={(n) => update(c.id, { score: n })} />
                      <input
                        className="input input--sm"
                        aria-label={`Note for ${c.name}`}
                        placeholder={canEdit ? 'What would move this?' : ''}
                        readOnly={!canEdit}
                        value={r.note}
                        onChange={(e) => update(c.id, { note: e.target.value })}
                      />
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </SectionFrame>
  );
}

const WEIGHT_ORDER: ChecklistWeight[] = ['Essential', 'Desirable', 'Useful'];
const WEIGHT_PTS: Record<ChecklistWeight, number> = { Essential: 3, Desirable: 2, Useful: 1 };
const ANSWERS: ChecklistAnswer[] = ['Yes', 'Partial', 'No'];

export function TacticalEditor() {
  const { plan, master, canEdit, accountId, goToSection } = usePlan();
  const priority = plan.opportunities.filter((o) => o.isPriority);
  const questions = [...master.checklistQuestions]
    .filter((q) => q.isActive)
    .sort((a, b) => WEIGHT_ORDER.indexOf(a.weight) - WEIGHT_ORDER.indexOf(b.weight));

  const initial = useMemo<TacticalItem[]>(
    () =>
      priority.map((o) => {
        const existing = plan.tactical.find((t) => t.opportunityId === o.id);
        return {
          opportunityId: o.id,
          answers: questions.map((q) => ({ questionId: q.id, answer: existing?.answers.find((a) => a.questionId === q.id)?.answer ?? null })),
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plan.tactical, plan.opportunities, master.checklistQuestions],
  );
  const { draft, setDraft, dirty, reset } = useDraft<TacticalItem[]>(initial);
  const { save, saving, fieldErrors } = useSectionSave('tactical');

  const setAnswer = (oppId: string, qid: string, answer: ChecklistAnswer | null) =>
    setDraft(draft.map((t) => (t.opportunityId === oppId ? { ...t, answers: t.answers.map((a) => (a.questionId === qid ? { ...a, answer } : a)) } : t)));

  const readiness = (item: TacticalItem) => {
    let max = 0;
    let got = 0;
    for (const q of questions) {
      max += WEIGHT_PTS[q.weight];
      const a = item.answers.find((x) => x.questionId === q.id)?.answer;
      got += WEIGHT_PTS[q.weight] * (a === 'Yes' ? 1 : a === 'Partial' ? 0.5 : 0);
    }
    return max ? (got / max) * 100 : 0;
  };

  return (
    <SectionFrame
      section="tactical"
      description="For every priority opportunity, answer the qualification questions. Essential questions weigh three times Useful ones."
      dirty={dirty}
      saving={saving}
      onReset={reset}
      errors={fieldErrors}
      onSave={() => void save((rv) => accountsApi.saveTactical(accountId, draft, rv))}
    >
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
          Mark at least one opportunity as priority to build its checklist.
        </EmptyState>
      ) : (
        <div className="stack" style={{ ['--gap' as string]: '18px' }}>
          {draft.map((item) => {
            const opp = priority.find((o) => o.id === item.opportunityId);
            if (!opp) return null;
            return (
              <div key={item.opportunityId} className="panel">
                <div className="panel__head">
                  <div>
                    <h3>{opp.title}</h3>
                    <span className="xsmall muted">{opp.offeringName}</span>
                  </div>
                  <div style={{ width: 180 }}>
                    <ScoreBar value={readiness(item)} tone="auto" label={`Readiness for ${opp.title}`} suffix="%" />
                  </div>
                </div>
                <ul className="checklist">
                  {questions.map((q) => {
                    const a = item.answers.find((x) => x.questionId === q.id)?.answer ?? null;
                    return (
                      <li key={q.id} className="checklist__row">
                        <span className={`weight weight--${q.weight}`}>{q.weight}</span>
                        <span className="grow small">{q.text}</span>
                        <div className="seg seg--answer" role="radiogroup" aria-label={`${q.text} (${opp.title})`}>
                          {ANSWERS.map((ans) => (
                            <button
                              key={ans}
                              type="button"
                              role="radio"
                              data-v={ans}
                              aria-checked={a === ans}
                              className="seg__btn"
                              disabled={!canEdit}
                              onClick={() => setAnswer(item.opportunityId, q.id, a === ans ? null : ans)}
                            >
                              {ans}
                            </button>
                          ))}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </SectionFrame>
  );
}
