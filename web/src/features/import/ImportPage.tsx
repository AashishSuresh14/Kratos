import { useRef, useState, type DragEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { useAccounts, useMaster } from '../../api/hooks';
import { importsApi, MAX_IMPORT_BYTES, validateImportFile } from '../../api/imports';
import type { AccountType, FindingSeverity, ImportReport } from '../../api/types';
import { AiMeta } from '../../components/AiMeta';
import { DataTable } from '../../components/DataTable';
import { Field, pickError } from '../../components/Field';
import { Icon } from '../../components/Icon';
import { PageHeader, useDocumentTitle } from '../../components/PageHeader';
import { ScoreBar } from '../../components/ScoreBar';
import { ErrorState } from '../../components/States';
import { useToast } from '../../components/Toast';
import { SECTION_INFO } from '../../lib/format';

const SEVERITY_ORDER: Record<FindingSeverity, number> = { Error: 3, Warning: 2, Info: 1 };

export default function ImportPage() {
  useDocumentTitle('Import workbook');
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = useMutation({ mutationFn: (f: File) => importsApi.upload(f) });

  const pick = (f: File | undefined | null) => {
    upload.reset();
    if (!f) return;
    const err = validateImportFile(f);
    setFileError(err);
    setFile(err ? null : f);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    pick(e.dataTransfer.files?.[0]);
  };

  const serverFileError = upload.error instanceof ApiError && upload.error.isValidation ? (pickError(upload.error.errors, 'file') ?? upload.error.detail) : undefined;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Data"
        title="Import a KAM workbook"
        subtitle="Upload the existing Excel plan. Kratos maps each tab to S1–S12, reports what it found, and only writes when you commit."
      />

      <section className="panel" aria-labelledby="up-title">
        <div className="panel__head">
          <h2 id="up-title" className="panel__title">
            1 · Choose the workbook
          </h2>
          <span className="xsmall muted">.xlsx only, up to {MAX_IMPORT_BYTES / 1024 / 1024} MB</span>
        </div>
        <div className="panel__body stack">
          <div
            className={`dropzone${drag ? ' is-drag' : ''}${fileError || serverFileError ? ' is-error' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}
          >
            <Icon name="upload" className="dropzone__icon" />
            <div className="stack" style={{ ['--gap' as string]: '4px', alignItems: 'center' }}>
              <span className="strong">{file ? file.name : 'Drop the .xlsx here'}</span>
              <span className="xsmall muted">{file ? `${(file.size / 1024).toFixed(0)} KB` : 'or'}</span>
            </div>
            <label className="btn btn--sm">
              <Icon name="file" /> {file ? 'Choose another file' : 'Browse files'}
              <input
                ref={inputRef}
                type="file"
                className="sr-only"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                aria-describedby="file-err"
                onChange={(e) => {
                  pick(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
          <span id="file-err" className="field__error" role={fileError || serverFileError ? 'alert' : undefined}>
            {fileError ?? serverFileError ?? ''}
          </span>
          <div className="cluster">
            <button type="button" className="btn btn--primary" disabled={!file || upload.isPending} onClick={() => file && upload.mutate(file)}>
              {upload.isPending ? <span className="spinner" aria-hidden="true" /> : <Icon name="upload" />}
              {upload.isPending ? 'Reading workbook' : 'Upload and analyse'}
            </button>
            {upload.isPending && <span className="small muted">Mapping tabs to plan sections. Large workbooks can take up to 30 seconds.</span>}
          </div>
          {upload.isError && !serverFileError && <ErrorState error={upload.error} title="The workbook could not be read" onRetry={() => file && upload.mutate(file)} />}
        </div>
      </section>

      {upload.data && <ReportView report={upload.data} />}
    </div>
  );
}

function ReportView({ report }: { report: ImportReport }) {
  const counts = { Error: 0, Warning: 0, Info: 0 } as Record<FindingSeverity, number>;
  report.findings.forEach((f) => (counts[f.severity] = (counts[f.severity] ?? 0) + 1));
  return (
    <>
      <section className="panel" aria-labelledby="rep-title">
        <div className="panel__head">
          <div>
            <h2 id="rep-title" className="panel__title">
              2 · Import report
            </h2>
            <span className="xsmall muted">
              {report.fileName}
              {report.accountName ? ` · account "${report.accountName}"` : ' · no account name found'}
            </span>
          </div>
          <div className="cluster">
            <span className="sev sev--Error">{counts.Error} errors</span>
            <span className="sev sev--Warning">{counts.Warning} warnings</span>
            <span className="sev sev--Info">{counts.Info} info</span>
          </div>
        </div>
        <div className="panel__body stack" style={{ ['--gap' as string]: '18px' }}>
          <div>
            <h3>Sheets found ({report.sheetsFound.length})</h3>
            <ul className="chips" style={{ marginTop: 6, padding: 0, listStyle: 'none' }}>
              {report.sheetsFound.map((s) => (
                <li key={s} className="chip">
                  {s}
                </li>
              ))}
            </ul>
          </div>

          <div className="import-grid">
            <div>
              <h3>Mapped sections</h3>
              <ul className="mapped-list">
                {report.mapped.map((m) => (
                  <li key={m.section}>
                    <span className="code-badge">{SECTION_INFO[m.section]?.code ?? m.section}</span>
                    <span className="small grow">
                      {SECTION_INFO[m.section]?.title ?? m.section} <span className="muted xsmall">· {m.fields} fields</span>
                    </span>
                    <span style={{ width: 150 }}>
                      <ScoreBar value={m.confidence} max={1} tone="auto" suffix="%" label={`Mapping confidence for ${SECTION_INFO[m.section]?.title ?? m.section}`} />
                    </span>
                  </li>
                ))}
              </ul>
              {report.mapped.length === 0 && <p className="small muted">No sections could be mapped.</p>}
            </div>
            <div>
              <h3>Findings</h3>
              <DataTable
                caption="Import findings"
                compact
                rows={report.findings.map((f, i) => ({ ...f, i }))}
                rowKey={(f) => String(f.i)}
                initialSort={{ key: 'sev', dir: 'desc' }}
                empty={<span className="small muted">No findings. The workbook matched the template.</span>}
                columns={[
                  { key: 'sev', header: 'Severity', sortValue: (f) => SEVERITY_ORDER[f.severity] ?? 0, render: (f) => <span className={`sev sev--${f.severity}`}>{f.severity}</span> },
                  {
                    key: 'where',
                    header: 'Where',
                    sortValue: (f) => f.sheet,
                    render: (f) => (
                      <span className="small">
                        {f.sheet}
                        {f.cell && <span className="mono xsmall muted"> !{f.cell}</span>}
                      </span>
                    ),
                  },
                  { key: 'msg', header: 'Message', render: (f) => <span className="small">{f.message}</span> },
                ]}
              />
            </div>
          </div>
          {report.meta && <AiMeta meta={report.meta} />}
        </div>
      </section>
      <CommitPanel report={report} />
    </>
  );
}

function CommitPanel({ report }: { report: ImportReport }) {
  const [target, setTarget] = useState<'new' | 'existing'>('new');
  const [accountId, setAccountId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [type, setType] = useState<AccountType | ''>('');
  const master = useMaster();
  const accounts = useAccounts({}, target === 'existing');
  const toast = useToast();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const commit = useMutation({
    mutationFn: () =>
      importsApi.commit(report.importId, target === 'existing' ? { accountId } : { groupId: groupId || undefined, type: type || undefined }),
    onSuccess: (plan) => {
      void qc.invalidateQueries({ queryKey: ['accounts'] });
      void qc.invalidateQueries({ queryKey: ['views'] });
      qc.setQueryData(['account', plan.summary.id], plan);
      toast.success(`Imported into ${plan.summary.name}`);
      navigate(`/accounts/${plan.summary.id}`);
    },
  });
  const errs = commit.error instanceof ApiError && commit.error.isValidation ? commit.error.errors : undefined;

  if (!report.canCommit) {
    return (
      <section className="panel">
        <div className="panel__body">
          <div className="banner banner--crit" role="alert">
            <Icon name="alert" />
            <div className="banner__body">
              <strong>This workbook cannot be committed</strong>
              Fix the errors listed above in Excel, then upload it again.
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="panel" aria-labelledby="commit-title">
      <div className="panel__head">
        <h2 id="commit-title" className="panel__title">
          3 · Commit
        </h2>
      </div>
      <div className="panel__body stack" style={{ ['--gap' as string]: '14px' }}>
        <div className="seg" role="radiogroup" aria-label="Where to import">
          <button type="button" role="radio" aria-checked={target === 'new'} className="seg__btn seg__btn--text" onClick={() => setTarget('new')}>
            New account
          </button>
          <button type="button" role="radio" aria-checked={target === 'existing'} className="seg__btn seg__btn--text" onClick={() => setTarget('existing')}>
            Existing account
          </button>
        </div>
        {target === 'new' ? (
          <div className="form-grid">
            <Field label="Group (optional)" hint="Defaults to your own group." error={pickError(errs, 'groupId')}>
              {(a) => (
                <select {...a} className="select" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                  <option value="">Default</option>
                  {master.data?.groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="Account type (optional)" hint="NBD for a pursuit, EBD for an existing customer." error={pickError(errs, 'type')}>
              {(a) => (
                <select {...a} className="select" value={type} onChange={(e) => setType(e.target.value as AccountType | '')}>
                  <option value="">From the workbook</option>
                  <option value="NBD">NBD · new business</option>
                  <option value="EBD">EBD · existing business</option>
                </select>
              )}
            </Field>
          </div>
        ) : (
          <Field label="Account to update" hint="Imported sections replace what is in the plan today." error={pickError(errs, 'accountId')}>
            {(a) => (
              <select {...a} className="select" value={accountId} onChange={(e) => setAccountId(e.target.value)} disabled={accounts.isPending}>
                <option value="">{accounts.isPending ? 'Loading accounts' : 'Choose an account'}</option>
                {accounts.data?.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({acc.type})
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}
        {commit.isError && !errs && <ErrorState error={commit.error} title="Commit failed" />}
        <div className="cluster">
          <button type="button" className="btn btn--primary" disabled={commit.isPending || (target === 'existing' && !accountId)} onClick={() => commit.mutate()}>
            {commit.isPending ? <span className="spinner" aria-hidden="true" /> : <Icon name="check" />}
            {target === 'new' ? 'Create account from workbook' : 'Update account'}
          </button>
          <Link to="/portfolio" className="btn btn--ghost">
            Cancel
          </Link>
        </div>
      </div>
    </section>
  );
}
