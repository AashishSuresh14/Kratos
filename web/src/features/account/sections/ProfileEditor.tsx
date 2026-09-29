import { useMemo } from 'react';
import { accountsApi } from '../../../api/accounts';
import { useAccounts } from '../../../api/hooks';
import type { Profile, Raci, TeamMember } from '../../../api/types';
import { ChipMultiSelect, Field } from '../../../components/Field';
import { Icon } from '../../../components/Icon';
import { CopilotButton } from '../Copilot';
import { usePlan, useSectionSave } from '../planContext';
import { SectionFrame } from '../SectionFrame';
import { useDraft } from '../useDraft';

const RACI: { v: Raci; label: string }[] = [
  { v: 'R', label: 'Responsible' },
  { v: 'A', label: 'Accountable' },
  { v: 'C', label: 'Consulted' },
  { v: 'I', label: 'Informed' },
];

export function ProfileEditor() {
  const { plan, master, canEdit, accountId } = usePlan();
  const profile = useDraft<Profile>(plan.profile);
  const team = useDraft<TeamMember[]>(plan.team);
  const { save, saving, fieldErrors } = useSectionSave('profile');
  const accounts = useAccounts({}, canEdit);

  // People we can add to the team: known captains and group leads (no user directory for non-admins).
  const candidates = useMemo(() => {
    const m = new Map<string, string>();
    accounts.data?.forEach((a) => m.set(a.captainId, a.captainName));
    master.groups.forEach((g) => m.set(g.leadUserId, g.leadName));
    return [...m.entries()].map(([id, name]) => ({ id, name })).filter((c) => !team.draft.some((t) => t.userId === c.id));
  }, [accounts.data, master.groups, team.draft]);

  const offerings = master.offerings.filter(
    (o) => o.isActive || profile.draft.currentOfferingIds.includes(o.id) || profile.draft.aspirationalOfferingIds.includes(o.id),
  );
  const p = profile.draft;
  const ro = !canEdit;

  const onSave = async () => {
    let ok = true;
    if (profile.dirty) ok = await save((rv) => accountsApi.saveProfile(accountId, profile.draft, rv), 'Saved S1 profile');
    if (ok && team.dirty)
      await save(
        (rv) => accountsApi.saveTeam(accountId, team.draft.map(({ userId, raci, responsibility }) => ({ userId, raci, responsibility })), rv),
        'Saved account team',
      );
  };

  return (
    <SectionFrame
      section="profile"
      description="Who the customer is, what we sell them today, and who on our side owns the relationship."
      dirty={profile.dirty || team.dirty}
      saving={saving}
      onSave={() => void onSave()}
      onReset={() => {
        profile.reset();
        team.reset();
      }}
      errors={fieldErrors}
    >
      <div className="stack" style={{ ['--gap' as string]: '20px' }}>
        <div className="form-grid">
          <Field label="Account since">
            {(a) => (
              <input {...a} type="date" className="input" readOnly={ro} value={p.accountSince ?? ''} onChange={(e) => profile.patch({ accountSince: e.target.value || null })} />
            )}
          </Field>
          <Field label="Current run rate (USD / year)">
            {(a) => (
              <input
                {...a}
                type="number"
                min={0}
                step={1000}
                className="input mono"
                readOnly={ro}
                value={p.currentRunRate ?? ''}
                onChange={(e) => profile.patch({ currentRunRate: e.target.value === '' ? null : Number(e.target.value) })}
              />
            )}
          </Field>
          <Field label="Review cadence (days)" hint="Sections older than this are marked stale." error={fieldErrors.reviewCadenceDays?.[0]}>
            {(a) => (
              <input
                {...a}
                type="number"
                min={7}
                max={180}
                className="input mono"
                readOnly={ro}
                value={p.reviewCadenceDays}
                onChange={(e) => profile.patch({ reviewCadenceDays: Number(e.target.value) })}
              />
            )}
          </Field>
        </div>

        <Field label="CXO connect" hint="Who at CXO level we meet, and how often.">
          {(a) => <input {...a} className="input" readOnly={ro} value={p.cxoConnect} onChange={(e) => profile.patch({ cxoConnect: e.target.value })} maxLength={500} />}
        </Field>

        <Field
          label="Customer challenges"
          extra={
            <CopilotButton
              section="profile"
              fieldLabel="Customer challenges"
              defaultInstruction="Summarise the customer's key challenges in their words and what they mean for us."
              onInsert={(t) => profile.patch({ challenges: p.challenges ? `${p.challenges}\n\n${t}` : t })}
            />
          }
        >
          {(a) => <textarea {...a} className="textarea" rows={4} readOnly={ro} value={p.challenges} onChange={(e) => profile.patch({ challenges: e.target.value })} />}
        </Field>

        <div className="grid-2">
          <div className="field">
            <span className="field__label">Current offerings</span>
            <ChipMultiSelect
              label="Current offerings"
              options={offerings}
              value={p.currentOfferingIds}
              disabled={ro}
              onChange={(v) => profile.patch({ currentOfferingIds: v, aspirationalOfferingIds: p.aspirationalOfferingIds.filter((x) => !v.includes(x)) })}
            />
          </div>
          <div className="field">
            <span className="field__label">Aspirational offerings</span>
            <ChipMultiSelect
              label="Aspirational offerings"
              options={offerings.filter((o) => !p.currentOfferingIds.includes(o.id))}
              value={p.aspirationalOfferingIds}
              disabled={ro}
              onChange={(v) => profile.patch({ aspirationalOfferingIds: v })}
            />
          </div>
        </div>

        <div className="stack">
          <div className="spread">
            <h3>Account team (RACI)</h3>
            {canEdit && candidates.length > 0 && (
              <label className="cluster small">
                <span className="muted">Add member</span>
                <select
                  className="select select--sm"
                  value=""
                  style={{ width: 200 }}
                  onChange={(e) => {
                    const c = candidates.find((x) => x.id === e.target.value);
                    if (c) team.setDraft([...team.draft, { userId: c.id, displayName: c.name, raci: 'C', responsibility: '' }]);
                  }}
                >
                  <option value="">Choose a person</option>
                  {candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div className="table-wrap panel">
            <table className="table table--edit">
              <caption className="sr-only">Account team</caption>
              <thead>
                <tr>
                  <th scope="col">Member</th>
                  <th scope="col" style={{ width: 170 }}>
                    RACI
                  </th>
                  <th scope="col">Responsibility</th>
                  {canEdit && (
                    <th scope="col" style={{ width: 44 }}>
                      <span className="sr-only">Remove</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {team.draft.length === 0 && (
                  <tr>
                    <td colSpan={4} className="muted small">
                      No team members yet.
                    </td>
                  </tr>
                )}
                {team.draft.map((m, i) => (
                  <tr key={m.userId}>
                    <td className="strong small">{m.displayName}</td>
                    <td>
                      <select
                        className="select select--sm"
                        aria-label={`RACI role for ${m.displayName}`}
                        disabled={ro}
                        value={m.raci}
                        onChange={(e) => team.setDraft(team.draft.map((x, j) => (j === i ? { ...x, raci: e.target.value as Raci } : x)))}
                      >
                        {RACI.map((r) => (
                          <option key={r.v} value={r.v}>
                            {r.v} · {r.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        className="input input--sm"
                        aria-label={`Responsibility of ${m.displayName}`}
                        readOnly={ro}
                        value={m.responsibility}
                        onChange={(e) => team.setDraft(team.draft.map((x, j) => (j === i ? { ...x, responsibility: e.target.value } : x)))}
                      />
                    </td>
                    {canEdit && (
                      <td>
                        <button
                          type="button"
                          className="btn btn--ghost btn--icon btn--sm"
                          aria-label={`Remove ${m.displayName} from the team`}
                          onClick={() => team.setDraft(team.draft.filter((_, j) => j !== i))}
                        >
                          <Icon name="trash" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!team.draft.some((m) => m.raci === 'A') && team.draft.length > 0 && (
            <p className="field__error">One member should be Accountable (A).</p>
          )}
        </div>
      </div>
    </SectionFrame>
  );
}
