import { useSearchParams } from 'react-router-dom';
import { PageHeader, useDocumentTitle } from '../../components/PageHeader';
import { Tabs, tabPanelProps } from '../../components/Tabs';
import { AiTab, SecurityTab, UsersTab, WeightsTab } from './AdminTabs';
import { MasterDataTab } from './MasterDataTab';

const TABS = [
  { id: 'master', label: 'Master data' },
  { id: 'weights', label: 'Scoring weights' },
  { id: 'users', label: 'Users and groups' },
  { id: 'ai', label: 'AI' },
  { id: 'security', label: 'Security' },
] as const;
type TabId = (typeof TABS)[number]['id'];

export default function AdminPage() {
  useDocumentTitle('Admin');
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab: TabId = TABS.some((t) => t.id === raw) ? (raw as TabId) : 'master';
  return (
    <div className="page">
      <PageHeader
        eyebrow="Administration"
        title="Admin console"
        subtitle="Master data, scoring, people, AI and security. Admins manage the platform but do not see plan content."
      />
      <Tabs label="Admin sections" idPrefix="adm" tabs={[...TABS]} active={tab} onChange={(t) => setParams(t === 'master' ? {} : { tab: t }, { replace: true })} />
      <div {...tabPanelProps('adm', tab)} className="tab-panel">
        {tab === 'master' && <MasterDataTab />}
        {tab === 'weights' && <WeightsTab />}
        {tab === 'users' && <UsersTab />}
        {tab === 'ai' && <AiTab />}
        {tab === 'security' && <SecurityTab />}
      </div>
    </div>
  );
}
