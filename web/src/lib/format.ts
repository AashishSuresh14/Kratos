import type { SectionKey } from '../api/types';

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const shortDateFmt = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' });
const dateTimeFmt = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

function parse(value: string | null | undefined): Date | null {
  if (!value) return null;
  // Plain dates (YYYY-MM-DD) are calendar dates, not UTC midnights.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const formatDate = (v: string | null | undefined) => {
  const d = parse(v);
  return d ? dateFmt.format(d) : '–';
};
export const formatShortDate = (v: string | null | undefined) => {
  const d = parse(v);
  return d ? shortDateFmt.format(d) : '–';
};
export const formatDateTime = (v: string | null | undefined) => {
  const d = parse(v);
  return d ? dateTimeFmt.format(d) : '–';
};

export function formatRelative(v: string | null | undefined): string {
  const d = parse(v);
  if (!d) return 'never';
  const days = Math.round((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.round(days / 30)}mo ago`;
  return `${Math.round(days / 365)}y ago`;
}

export function daysUntil(v: string): number {
  const d = parse(v);
  if (!d) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

export function formatMoney(n: number | null | undefined, currency = 'USD'): string {
  if (n === null || n === undefined) return '–';
  if (Math.abs(n) >= 1_000_000) return `${currency === 'USD' ? '$' : ''}${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${currency === 'USD' ? '$' : ''}${Math.round(n / 1_000)}k`;
  return `${currency === 'USD' ? '$' : ''}${n}`;
}

export const formatNumber = (n: number) => new Intl.NumberFormat('en-GB').format(n);

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

export const isoToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const isoInDays = (n: number) => {
  const d = new Date(Date.now() + n * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** For the few places where echarts needs an HTML string (tooltips). */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

/** Section code and title, used when the plan's own sections[] is not at hand. */
export const SECTION_INFO: Record<SectionKey, { code: string; title: string }> = {
  profile: { code: 'S1', title: 'Know your customer' },
  infobase: { code: 'S2', title: 'Information base' },
  vision: { code: 'S3–S4', title: 'Vision & objectives' },
  strategy: { code: 'S5', title: 'Strategic direction' },
  opportunities: { code: 'S6', title: 'Opportunity matrix' },
  stakeholders: { code: 'S7', title: 'Mapping the account' },
  brickwall: { code: 'S8', title: 'Brickwall' },
  tactical: { code: 'S9', title: 'Tactical checklist' },
  priorityActions: { code: 'S10', title: 'Priority actions' },
  actionPlan: { code: 'S11', title: 'Time-bound action plan' },
  resources: { code: 'S12', title: 'Resources needed' },
};

export const sectionLabel = (k: SectionKey) => `${SECTION_INFO[k]?.code ?? ''} ${SECTION_INFO[k]?.title ?? k}`.trim();

export const STATUS_LABEL = { Open: 'Open', InProgress: 'In progress', Done: 'Done', Blocked: 'Blocked' } as const;
export const STAKEHOLDER_ROLE_LABEL = {
  DecisionMaker: 'Decision maker',
  Influencer: 'Influencer',
  User: 'User',
  Gatekeeper: 'Gatekeeper',
} as const;
export const KNOWLEDGE_LABEL = { Unknown: 'Unknown', KnownUnconfirmed: 'Known, unconfirmed', Confirmed: 'Confirmed' } as const;
export const RESOURCE_LABEL = { Money: 'Money', Expertise: 'Expertise', ManagementTime: 'Management time', Travel: 'Travel' } as const;
export const CHANNEL_LABEL = {
  Meeting: 'Meeting',
  Email: 'Email',
  ExecutiveConnect: 'Executive connect',
  Event: 'Event',
  Call: 'Call',
  Workshop: 'Workshop',
} as const;
