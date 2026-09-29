import { describe, expect, it } from 'vitest';
import { landingPathFor } from '../auth/permissions';

describe('landingPathFor', () => {
  it('sends Admin to /admin even when the return address is a plan page', () => {
    expect(landingPathFor('Admin', '/portfolio')).toBe('/admin');
    expect(landingPathFor('Admin', '/accounts/123')).toBe('/admin');
  });
  it('keeps an allowed return address', () => {
    expect(landingPathFor('Admin', '/admin?tab=security')).toBe('/admin?tab=security');
    expect(landingPathFor('Executive', '/nbd')).toBe('/nbd');
  });
  it('never sends non-admins into /admin', () => {
    expect(landingPathFor('AccountManager', '/admin')).toBe('/portfolio');
  });
  it('rejects off-site and odd return addresses', () => {
    for (const bad of ['https://evil.example', '//evil.example', '/' + String.fromCharCode(92) + 'evil.example', '/login', '', null, undefined])
      expect(landingPathFor('Executive', bad)).toBe('/portfolio');
  });
});
