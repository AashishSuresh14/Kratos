import type { ReactNode } from 'react';
import type { SectionKey } from '../../api/types';
import { Icon } from '../../components/Icon';
import { formatDateTime, formatRelative, SECTION_INFO } from '../../lib/format';
import { usePlan } from './planContext';

/** Wraps a section editor: heading, freshness, read-only notice and the save bar. */
export function SectionFrame({
  section,
  description,
  dirty,
  saving,
  onSave,
  onReset,
  children,
  headExtra,
  errors,
}: {
  section: SectionKey;
  description: ReactNode;
  dirty?: boolean;
  saving?: boolean;
  onSave?: () => void;
  onReset?: () => void;
  children: ReactNode;
  headExtra?: ReactNode;
  errors?: Record<string, string[]>;
}) {
  const { plan, canEdit } = usePlan();
  const state = plan.sections.find((s) => s.key === section);
  const info = { code: state?.code ?? SECTION_INFO[section].code, title: state?.title ?? SECTION_INFO[section].title };
  const errorList = errors ? Object.entries(errors).flatMap(([f, ms]) => ms.map((m) => `${f}: ${m}`)) : [];

  return (
    <section className="section-frame" aria-labelledby={`sec-${section}`}>
      <header className="section-frame__head">
        <div className="stack" style={{ ['--gap' as string]: '4px' }}>
          <div className="cluster">
            <span className="code-badge">{info.code}</span>
            <h2 id={`sec-${section}`}>{info.title}</h2>
            {state?.isStale && <span className="stale-badge">Stale</span>}
          </div>
          <p className="muted small">{description}</p>
        </div>
        <div className="section-frame__meta">
          {headExtra}
          <span className="xsmall muted" title={formatDateTime(state?.updatedAt)}>
            <Icon name="clock" style={{ width: 12, height: 12, verticalAlign: '-2px', marginRight: 4 }} />
            Updated {formatRelative(state?.updatedAt)}
          </span>
          <span className="xsmall mono muted">{Math.round(state?.completion ?? 0)}% complete</span>
        </div>
      </header>

      {!canEdit && (
        <div className="banner banner--info" style={{ marginBottom: 12 }}>
          <Icon name="lock" />
          <div className="banner__body">Read only. Your role can view this plan but not change it.</div>
        </div>
      )}
      {errorList.length > 0 && (
        <div className="banner banner--crit" role="alert" style={{ marginBottom: 12 }}>
          <Icon name="alert" />
          <div className="banner__body">
            <strong>Some fields need attention</strong>
            {errorList.join(' · ')}
          </div>
        </div>
      )}

      <div className="section-frame__body">{children}</div>

      {canEdit && onSave && (
        <div className={`savebar${dirty ? ' is-dirty' : ''}`}>
          <span className="small muted">{dirty ? 'You have unsaved changes in this section.' : 'All changes saved.'}</span>
          <div className="cluster">
            {onReset && (
              <button type="button" className="btn btn--sm" onClick={onReset} disabled={!dirty || saving}>
                Discard changes
              </button>
            )}
            <button type="button" className="btn btn--primary btn--sm" onClick={onSave} disabled={!dirty || saving}>
              {saving ? <span className="spinner" aria-hidden="true" /> : <Icon name="save" />}
              {saving ? 'Saving' : 'Save section'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
