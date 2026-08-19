import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * P1104 — the fail-closed guarantee's anchor point.
 *
 * `useAgentAccountIds()` outside a provider reports "nothing is an agent", so that P1104
 * is strictly additive for the many existing unit tests that render the shared card
 * components in isolation. The consequence is that the whole disclosure depends on
 * `AgentAccountsProvider` being mounted above every route in the real app.
 *
 * That dependency is invisible to every other test in the suite: each of them would keep
 * passing with the provider deleted. This file is the one that would not. It reads the
 * source rather than rendering, because rendering App.tsx pulls in the router, Sentry,
 * every lazy route and a live Supabase client — a render test here would be testing the
 * harness, not the invariant.
 */
describe('P1104: AgentAccountsProvider is mounted above the routes', () => {
  const appSource = readFileSync(
    resolve(__dirname, '../App.tsx'),
    'utf-8',
  );

  it('App.tsx imports AgentAccountsProvider', () => {
    expect(appSource).toContain('AgentAccountsProvider');
    expect(appSource).toMatch(/import \{ AgentAccountsProvider \} from ["']@\/app\/contexts\/agent-accounts-context["']/);
  });

  it('renders <AgentAccountsProvider> and closes it', () => {
    expect(appSource).toContain('<AgentAccountsProvider>');
    expect(appSource).toContain('</AgentAccountsProvider>');
  });

  it('opens the provider BEFORE the <Routes> block and closes it after — so every route is inside it', () => {
    const providerOpen = appSource.indexOf('<AgentAccountsProvider>');
    const providerClose = appSource.indexOf('</AgentAccountsProvider>');
    const routesOpen = appSource.indexOf('<Routes>');
    const routesClose = appSource.lastIndexOf('</Routes>');

    expect(providerOpen, 'AgentAccountsProvider must be present').toBeGreaterThan(-1);
    expect(routesOpen, '<Routes> must be present').toBeGreaterThan(-1);

    expect(
      providerOpen,
      'the provider must open before <Routes>, or routes render outside it and every agent account renders as a person',
    ).toBeLessThan(routesOpen);

    expect(
      providerClose,
      'the provider must close after </Routes>, or later routes fall outside it',
    ).toBeGreaterThan(routesClose);
  });

  it('sits inside the Router, so a route change does not remount the registry fetch', () => {
    const routerOpen = appSource.indexOf('<Router>');
    const providerOpen = appSource.indexOf('<AgentAccountsProvider>');

    expect(routerOpen).toBeGreaterThan(-1);
    expect(providerOpen).toBeGreaterThan(routerOpen);
  });
});
