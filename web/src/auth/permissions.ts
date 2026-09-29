import type { Role } from '../api/types';

/**
 * UI permissions derived from the role table in docs/api-contract.md.
 * These only decide what the UI shows. The API enforces access regardless.
 */
export const PERMISSIONS = {
  /** See plan content (portfolio, NBD/EBD views, account workspace). Admin sees metadata only. */
  'plan.view': ['Executive', 'GroupLead', 'AccountManager'],
  /** Edit plan content, stakeholders, opportunities on accounts in scope. */
  'plan.edit': ['GroupLead', 'AccountManager'],
  /** Save a version snapshot (a plan change). */
  'plan.version': ['GroupLead', 'AccountManager'],
  /** Create accounts (Admin; GroupLead for own group). */
  'account.create': ['Admin', 'GroupLead'],
  /** The cross-account actions page (Executive sees actions read-only inside each plan). */
  'actions.view': ['GroupLead', 'AccountManager'],
  /** Create actions and change their status. */
  'actions.manage': ['GroupLead', 'AccountManager'],
  /** Next best action and copilot drafts. */
  'ai.suggest': ['GroupLead', 'AccountManager'],
  'ai.riskScan': ['Executive', 'GroupLead'],
  'ai.brief': ['Executive'],
  'ai.usage': ['Admin', 'Executive'],
  'ai.evaluations': ['Admin'],
  /** Workbook import creates or overwrites plan content, so it follows plan.edit. */
  'import.run': ['GroupLead', 'AccountManager'],
  'export.account': ['Executive', 'GroupLead', 'AccountManager'],
  'export.bdPack': ['Executive', 'GroupLead', 'AccountManager'],
  'export.executivePack': ['Executive'],
  'admin.masterData': ['Admin'],
  'admin.users': ['Admin'],
  'admin.security': ['Admin'],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

/** Where a role lands after sign-in. */
export function homePathFor(role: Role): string {
  return role === 'Admin' ? '/admin' : '/portfolio';
}

/**
 * Where to go after sign-in. A `next` return address is honoured only if it is a same-site path
 * (no open redirect) that this role may open; otherwise the role's home page.
 * Admin works only in /admin; every other role works everywhere except /admin.
 */
export function landingPathFor(role: Role, next: string | null | undefined): string {
  const home = homePathFor(role);
  const offSite = !next || next[0] !== '/' || next[1] === '/' || next[1] === '\\';
  if (offSite || next.startsWith('/login')) return home;
  const isAdminArea = next === '/admin' || next.startsWith('/admin/') || next.startsWith('/admin?');
  return (role === 'Admin') === isAdminArea ? next : home;
}

export const ROLE_LABEL: Record<Role, string> = {
  Admin: 'Admin',
  Executive: 'Executive',
  GroupLead: 'Group lead',
  AccountManager: 'Account manager',
};
