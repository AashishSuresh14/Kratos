import { useState } from 'react';
import { useCopilot } from '../../api/hooks';
import type { SectionKey } from '../../api/types';
import { AiMeta, AiTag } from '../../components/AiMeta';
import { Field } from '../../components/Field';
import { Icon } from '../../components/Icon';
import { Drawer } from '../../components/Modal';
import { ErrorState } from '../../components/States';
import { usePlan } from './planContext';

/**
 * "Ask copilot" for a long text field. The draft is shown for review and only
 * inserted into the local editor on request. It is never saved automatically.
 */
export function CopilotButton({
  section,
  fieldLabel,
  defaultInstruction,
  onInsert,
}: {
  section: SectionKey;
  fieldLabel: string;
  defaultInstruction: string;
  onInsert: (text: string) => void;
}) {
  const { canSuggest, canEdit, accountId } = usePlan();
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState(defaultInstruction);
  const copilot = useCopilot(accountId);

  if (!canSuggest || !canEdit) return null;

  const close = () => {
    setOpen(false);
    copilot.reset();
  };

  return (
    <>
      <button type="button" className="btn btn--ai btn--sm" onClick={() => setOpen(true)} aria-label={`Ask copilot to draft ${fieldLabel}`}>
        <Icon name="sparkle" /> Ask copilot
      </button>
      <Drawer
        open={open}
        onClose={close}
        busy={copilot.isPending}
        title={
          <span className="cluster">
            Copilot draft <AiTag />
          </span>
        }
        subtitle={`For: ${fieldLabel}. Review before inserting. Nothing is saved until you save the section.`}
        footer={
          copilot.data ? (
            <>
              <button type="button" className="btn" onClick={close}>
                Discard
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => {
                  onInsert(copilot.data.suggestion);
                  close();
                }}
              >
                <Icon name="check" /> Insert into field
              </button>
            </>
          ) : undefined
        }
      >
        <div className="stack" style={{ ['--gap' as string]: '14px' }}>
          <Field label="What should the draft do?" hint="The copilot reads this account's plan. It drafts; you decide.">
            {(p) => (
              <textarea
                {...p}
                className="textarea"
                rows={3}
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                maxLength={500}
                data-autofocus
              />
            )}
          </Field>
          <div>
            <button
              type="button"
              className="btn btn--ai"
              disabled={copilot.isPending || !instruction.trim()}
              onClick={() => copilot.mutate({ section, instruction: instruction.trim() })}
            >
              {copilot.isPending ? <span className="spinner" aria-hidden="true" /> : <Icon name="sparkle" />}
              {copilot.isPending ? 'Drafting' : copilot.data ? 'Draft again' : 'Generate draft'}
            </button>
          </div>
          <div aria-live="polite" aria-busy={copilot.isPending}>
            {copilot.isPending && <p className="muted small">The copilot is reading the plan. This usually takes a few seconds.</p>}
            {copilot.isError && <ErrorState error={copilot.error} title="The copilot could not draft this" onRetry={() => copilot.mutate({ section, instruction })} />}
            {copilot.data && (
              <div className="stack">
                <div className="ai-draft">{copilot.data.suggestion}</div>
                <AiMeta meta={copilot.data.meta} />
              </div>
            )}
          </div>
        </div>
      </Drawer>
    </>
  );
}
