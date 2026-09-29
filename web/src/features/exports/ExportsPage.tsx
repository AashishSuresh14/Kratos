import { useState } from 'react';
import { accountsApi } from '../../api/accounts';
import { saveBlob, type DownloadedFile } from '../../api/client';
import { useAccounts } from '../../api/hooks';
import { exportsApi } from '../../api/imports';
import { useAuth } from '../../auth/AuthContext';
import { Icon } from '../../components/Icon';
import { PageHeader, useDocumentTitle } from '../../components/PageHeader';
import { ErrorState, SkeletonLines } from '../../components/States';
import { useToast } from '../../components/Toast';

/** Fetch with the auth header, turn it into an object URL and save it under the server's file name. */
function useDownload() {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<DownloadedFile>) => {
    setBusy(key);
    try {
      const file = await fn();
      saveBlob(file);
      toast.success(`Downloaded ${file.fileName}`);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(null);
    }
  };
  return { busy, run };
}

export default function ExportsPage() {
  useDocumentTitle('Exports');
  const { can } = useAuth();
  const { busy, run } = useDownload();
  const accounts = useAccounts({}, can('export.account'));
  const [accountId, setAccountId] = useState('');
  const chosen = accounts.data?.find((a) => a.id === accountId);

  return (
    <div className="page">
      <PageHeader eyebrow="Data" title="Exports" subtitle="Excel packs built from live plan data, scoped to what your role can see." />
      <div className="export-grid">
        {can('export.bdPack') && (
          <ExportCard
            title="BD pack"
            body="Opportunities, stakeholders and actions across every account in your scope. For weekly BD reviews."
            busy={busy === 'bd'}
            onClick={() => void run('bd', exportsApi.bdPack)}
          />
        )}
        {can('export.executivePack') && (
          <ExportCard
            title="Executive pack"
            body="Portfolio summary, account health and risks, one sheet each. For leadership reviews."
            busy={busy === 'exec'}
            onClick={() => void run('exec', exportsApi.executivePack)}
          />
        )}
        {can('export.account') && (
          <section className="panel export-card" aria-labelledby="exp-acc">
            <div className="panel__body stack">
              <Icon name="file" className="export-card__icon" />
              <h2 id="exp-acc">Account workbook</h2>
              <p className="small muted">One account's plan in the original KAM workbook layout, tab for tab (KYC to S12).</p>
              {accounts.isPending ? (
                <SkeletonLines lines={1} />
              ) : accounts.isError ? (
                <ErrorState error={accounts.error} onRetry={() => void accounts.refetch()} />
              ) : (
                <>
                  <label className="sr-only" htmlFor="exp-account">
                    Account to export
                  </label>
                  <select id="exp-account" className="select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                    <option value="">Choose an account</option>
                    {accounts.data.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.type})
                      </option>
                    ))}
                  </select>
                  <div>
                    <button
                      type="button"
                      className="btn btn--primary"
                      disabled={!chosen || busy === 'acc'}
                      onClick={() => chosen && void run('acc', () => accountsApi.exportWorkbook(chosen.id, chosen.name))}
                    >
                      {busy === 'acc' ? <span className="spinner" aria-hidden="true" /> : <Icon name="download" />} Download .xlsx
                    </button>
                  </div>
                </>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function ExportCard({ title, body, busy, onClick }: { title: string; body: string; busy: boolean; onClick: () => void }) {
  return (
    <section className="panel export-card" aria-label={title}>
      <div className="panel__body stack">
        <Icon name="download" className="export-card__icon" />
        <h2>{title}</h2>
        <p className="small muted">{body}</p>
        <div>
          <button type="button" className="btn btn--primary" onClick={onClick} disabled={busy}>
            {busy ? <span className="spinner" aria-hidden="true" /> : <Icon name="download" />}
            {busy ? 'Preparing' : 'Download .xlsx'}
          </button>
        </div>
      </div>
    </section>
  );
}
